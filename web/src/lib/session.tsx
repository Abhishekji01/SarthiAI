import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, loadClientState, markSessionActive, sessionEvents, setToken, usesCookieSession } from './api';
import type { User } from './types';
import { syncReminders } from './reminders';

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: string; networkError?: boolean }
  | { status: 'signedIn'; user: User };

interface SessionValue {
  state: SessionState;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Signs in with a token the server just issued (e.g. after a password reset). */
  adoptSession: (token: string | null, user: User) => Promise<void>;
  setUser: (u: User) => void;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const { hasToken, legacyToken } = await loadClientState();
      if (!hasToken) return setState({ status: 'signedOut' });
      try {
        if (legacyToken) {
          // Older versions kept the token in localStorage: move it into the httpOnly cookie.
          await api.upgradeSession().catch(() => {});
          await setToken(null);
        }
        const user = await api.me();
        markSessionActive(true);
        setState({ status: 'signedIn', user });
        syncReminders(user).catch(() => {});
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await setToken(null);
          // With cookies, "no session" is the normal state for a new visitor: no notice.
          setState({ status: 'signedOut', notice: usesCookieSession() && !legacyToken ? undefined : 'Your session expired. Please sign in again.' });
        } else {
          // Offline or server unreachable: keep the token, show the error on sign-in screen.
          setState({ status: 'signedOut', notice: e instanceof Error ? e.message : 'Could not restore your session.', networkError: e instanceof ApiError && e.code === 'NETWORK' });
        }
      }
    })();
  }, []);

  useEffect(() => {
    const onExpired = async () => {
      markSessionActive(false);
      await setToken(null);
      setState({ status: 'signedOut', notice: 'Your session expired. Please sign in again.' });
    };
    sessionEvents.addEventListener('expired', onExpired);
    return () => sessionEvents.removeEventListener('expired', onExpired);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login({ email, password });
    await setToken(token);
    markSessionActive(true);
    setState({ status: 'signedIn', user });
    syncReminders(user).catch(() => {});
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { token, user } = await api.register({ name, email, password });
    await setToken(token);
    markSessionActive(true);
    setState({ status: 'signedIn', user });
  }, []);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* sign out locally regardless */ }
    markSessionActive(false);
    await setToken(null);
    setState({ status: 'signedOut' });
  }, []);

  const adoptSession = useCallback(async (token: string | null, user: User) => {
    await setToken(token);
    markSessionActive(true);
    setState({ status: 'signedIn', user });
    syncReminders(user).catch(() => {});
  }, []);

  const setUser = useCallback((user: User) => setState({ status: 'signedIn', user }), []);
  const refreshUser = useCallback(async () => setUser(await api.me()), [setUser]);

  const value = useMemo<SessionValue>(() => ({
    state, user: state.status === 'signedIn' ? state.user : null, signIn, register, signOut, adoptSession, setUser, refreshUser,
  }), [state, signIn, register, signOut, adoptSession, setUser, refreshUser]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error('useUser requires a signed-in user');
  return user;
}
