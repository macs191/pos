import { firebaseAuth, firebaseConfigured } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useAuth() {
  const utils = trpc.useUtils();
  const [sessionReady, setSessionReady] = useState(!firebaseAuth);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    if (!firebaseAuth) return;
    return onAuthStateChanged(firebaseAuth, nextUser => {
      setFirebaseUser(nextUser);
      setSessionReady(true);
      window.setTimeout(() => { void utils.auth.me.invalidate(); }, 0);
    });
  }, [utils]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: firebaseConfigured ? Boolean(firebaseUser) : false,
    retry: false,
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
    loading: !sessionReady || (Boolean(firebaseUser) && meQuery.isLoading) || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    sessionIssue: Boolean(firebaseUser) && !meQuery.isLoading && !meQuery.data ? "تم تسجيل الدخول في Firebase، لكن تعذر إنشاء ملف UID في قاعدة البيانات. تحقق من قواعد Realtime Database وإعدادات Firebase Web." : null,
    isAuthenticated: Boolean(meQuery.data),
  }), [firebaseUser, logoutMutation.error, logoutMutation.isPending, meQuery.data, meQuery.error, meQuery.isLoading, sessionReady]);

  return { ...state, refresh: () => meQuery.refetch(), logout, signIn, signUp, firebaseConfigured };
}
