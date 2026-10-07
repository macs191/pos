import { firebaseAuth, firebaseConfigured, firebaseDatabase } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User as FirebaseUser } from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useAuth() {
  const utils = trpc.useUtils();
  const [sessionReady, setSessionReady] = useState(!firebaseAuth);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profileReady, setProfileReady] = useState(!firebaseAuth);

  const ensureUidProfile = useCallback(async (user: FirebaseUser) => {
    if (!firebaseDatabase) return;
    const profileRef = ref(firebaseDatabase, `profiles/${user.uid}`);
    const existing = await get(profileRef);
    if (existing.exists()) return;
    const now = new Date().toISOString();
    await set(profileRef, {
      uid: user.uid,
      email: user.email ?? null,
      name: user.displayName ?? null,
      businessName: user.displayName ? `متجر ${user.displayName}` : "متجري",
      phone: null,
      address: null,
      subscription: { status: "ACTIVE", plan: "FREE", startDate: now, endDate: new Date(Date.now() + 15 * 86400000).toISOString() },
      createdAt: now,
      updatedAt: now,
    });
  }, []);

  useEffect(() => {
    if (!firebaseAuth) return;
    return onAuthStateChanged(firebaseAuth, nextUser => {
      setFirebaseUser(nextUser);
      setSessionReady(true);
      setProfileReady(!nextUser);
      if (nextUser) {
        void ensureUidProfile(nextUser)
          .then(() => setProfileReady(true))
          .catch(error => {
            console.error("[Firebase profile]", error);
            setProfileReady(true);
          });
      }
    });
  }, [ensureUidProfile, utils]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: firebaseConfigured ? Boolean(firebaseUser) && profileReady : false,
    retry: 3,
    retryDelay: 700,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => utils.auth.me.setData(undefined, null) });

  const signIn = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) throw new Error("إعدادات Firebase غير موجودة في Vercel.");
    await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!firebaseAuth) throw new Error("إعدادات Firebase غير موجودة في Vercel.");
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    if (fullName.trim()) await updateProfile(credential.user, { displayName: fullName.trim() });
  }, []);

  const logout = useCallback(async () => {
    if (firebaseAuth) await signOut(firebaseAuth);
    try { await logoutMutation.mutateAsync(); } catch (error: unknown) {
      if (!(error instanceof TRPCClientError) || error.data?.code !== "UNAUTHORIZED") throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => ({
    user: meQuery.data ?? null,
    loading: !sessionReady || (Boolean(firebaseUser) && (!profileReady || meQuery.isLoading)) || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    sessionIssue: Boolean(firebaseUser) && profileReady && !meQuery.isLoading && !meQuery.data ? `تم تسجيل الدخول في Firebase، لكن تعذر ربط الحساب بالموقع. ${meQuery.error?.message ?? "تحقق من أن API وقواعد Realtime Database منشورة."}` : null,
    isAuthenticated: Boolean(meQuery.data),
  }), [firebaseUser, logoutMutation.error, logoutMutation.isPending, meQuery.data, meQuery.error, meQuery.isLoading, profileReady, sessionReady]);

  return { ...state, refresh: () => meQuery.refetch(), logout, signIn, signUp, firebaseConfigured };
}
