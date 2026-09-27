import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useAuth() {
  const utils = trpc.useUtils();
  const [sessionReady, setSessionReady] = useState(!supabase);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.session));
      setSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setHasSession(Boolean(nextSession));
      setSessionReady(true);
      // Supabase holds an internal auth lock while invoking this callback.
      // Defer tRPC invalidation because its headers() calls getSession().
      window.setTimeout(() => { void utils.auth.me.invalidate(); }, 0);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [utils]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: supabase ? hasSession : true,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => utils.auth.me.setData(undefined, null) });

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("إعدادات Supabase غير موجودة في Vercel.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setHasSession(Boolean(data.session));
    setSessionReady(true);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!supabase) throw new Error("إعدادات Supabase غير موجودة في Vercel.");
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    setHasSession(Boolean(data.session));
    setSessionReady(true);
  }, []);

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    try { await logoutMutation.mutateAsync(); } catch (error: unknown) {
      if (!(error instanceof TRPCClientError) || error.data?.code !== "UNAUTHORIZED") throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => ({
    user: meQuery.data ?? null,
    loading: !sessionReady || (hasSession && meQuery.isLoading) || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    sessionIssue: hasSession && !meQuery.isLoading && !meQuery.data ? "تم تسجيل الدخول في Supabase، لكن تعذر ربط الحساب بالموقع. راجع متغيرات Supabase في Vercel." : null,
    isAuthenticated: Boolean(meQuery.data),
  }), [hasSession, logoutMutation.error, logoutMutation.isPending, meQuery.data, meQuery.error, meQuery.isLoading, sessionReady]);

  return { ...state, refresh: () => meQuery.refetch(), logout, signIn, signUp, supabaseConfigured: Boolean(supabase) };
}
