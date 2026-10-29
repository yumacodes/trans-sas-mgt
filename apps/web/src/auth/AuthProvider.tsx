import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeDto, Permission } from '@tsm/shared';
import { api, onAuthFailure, type ApiError } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  me: MeDto | null;
  meError: unknown;
  retryMe: () => void;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  signOut: (notice?: string) => Promise<void>;
  /** Message shown on the sign-in page after an involuntary sign-out. */
  notice: string | null;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const SESSION_EXPIRED_NOTICE = 'Your session has expired. Sign in again to continue.';
export const ACCOUNT_INACTIVE_NOTICE =
  'Your account has been deactivated. Contact your administrator if you believe this is a mistake.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userInitiatedSignOut = useRef(false);
  const currentUserId = useRef<string | null>(null);

  const applySession = useCallback(
    (next: Session | null) => {
      const nextUserId = next?.user.id ?? null;
      // Never let one user's cached data appear in another user's session.
      if (currentUserId.current !== nextUserId) queryClient.clear();
      currentUserId.current = nextUserId;
      setSession(next);
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      applySession(data.session);
      setSessionResolved(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT' && currentUserId.current && !userInitiatedSignOut.current) {
        // Refresh failed or the session was revoked elsewhere.
        setNotice((existing) => existing ?? SESSION_EXPIRED_NOTICE);
      }
      if (event === 'SIGNED_OUT') userInitiatedSignOut.current = false;
      applySession(next);
      setSessionResolved(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = useCallback(
    async (reason?: string) => {
      userInitiatedSignOut.current = !reason;
      if (reason) setNotice(reason);
      try {
        await supabase.auth.signOut();
      } finally {
        applySession(null);
      }
    },
    [applySession],
  );

  useEffect(
    () =>
      onAuthFailure((error: ApiError) => {
        if (!currentUserId.current) return;
        void signOut(error.code === 'ACCOUNT_INACTIVE' ? ACCOUNT_INACTIVE_NOTICE : SESSION_EXPIRED_NOTICE);
      }),
    [signOut],
  );

  const meQuery = useQuery({
    queryKey: [...qk.me, session?.user.id],
    queryFn: ({ signal }) => api.get<MeDto>('/me', undefined, signal),
    enabled: Boolean(session),
    staleTime: 60_000,
    retry: (count, error) => {
      const code = (error as ApiError).code;
      if (code === 'UNAUTHENTICATED' || code === 'SESSION_INVALID' || code === 'ACCOUNT_INACTIVE')
        return false;
      return count < 2;
    },
  });

  const me = session ? (meQuery.data ?? null) : null;
  const permissions = useMemo(() => new Set<Permission>(me?.permissions ?? []), [me]);

  let status: AuthStatus;
  if (!sessionResolved) status = 'loading';
  else if (!session) status = 'signedOut';
  else if (me) status = 'signedIn';
  else if (meQuery.isError) status = 'error';
  else status = 'loading';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      me,
      meError: meQuery.error,
      retryMe: () => void meQuery.refetch(),
      can: (p) => permissions.has(p),
      canAny: (...ps) => ps.some((p) => permissions.has(p)),
      signOut,
      notice,
      clearNotice: () => setNotice(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, session, me, meQuery.error, permissions, signOut, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Returns the signed-in profile; only call inside routes guarded by RequireAuth. */
export function useMe(): MeDto {
  const { me } = useAuth();
  if (!me) throw new Error('useMe called without an authenticated user');
  return me;
}

export function useCurrency() {
  const { me } = useAuth();
  return me?.company?.defaultCurrency ?? 'USD';
}
