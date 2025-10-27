import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  completeNewPassword,
  type NewPasswordRequiredChallenge,
  refreshSession as refreshAdminSession,
  signIn as signInWithCognito,
  signOut as signOutFromCognito,
  type AdminSession
} from '@/lib/admin-auth';

const STORAGE_KEY = 'icebox.admin.session';
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'challenge';

type AdminAuthContextValue = {
  status: AuthStatus;
  session: AdminSession | null;
  challenge: NewPasswordRequiredChallenge | null;
  signIn: (username: string, password: string) => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  signOut: () => void;
  getValidSession: () => Promise<AdminSession | null>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

const hasWindow = () => typeof window !== 'undefined';

const persistSession = (session: AdminSession | null) => {
  if (!hasWindow()) {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [challenge, setChallenge] = useState<NewPasswordRequiredChallenge | null>(null);
  const refreshPromiseRef = useRef<Promise<AdminSession | null> | null>(null);
  const refreshRef = useRef<typeof refresh | null>(null);

  const applySession = useCallback((value: AdminSession | null) => {
    setSession(value);
    setChallenge(null);
    persistSession(value);
    setStatus(value ? 'authenticated' : 'unauthenticated');
  }, []);

  const refresh = useCallback(
    async (baseSession?: AdminSession | null): Promise<AdminSession | null> => {
      const active = baseSession ?? session;
      if (!active) {
        return null;
      }
      if (refreshPromiseRef.current) {
        return refreshPromiseRef.current;
      }

      const promise = refreshAdminSession(active.username, active.refreshToken)
        .then((result) => {
          applySession(result.session);
          return result.session;
        })
        .catch((error) => {
          console.error('Failed to refresh admin session', { error: (error as Error).message });
          applySession(null);
          return null;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });

      refreshPromiseRef.current = promise;
      return promise;
    },
    [applySession, session]
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!hasWindow()) {
      setStatus('unauthenticated');
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setStatus('unauthenticated');
      return;
    }

    try {
      const parsed = JSON.parse(stored) as AdminSession;
      if (!parsed?.username || !parsed?.refreshToken || !parsed?.idToken || !parsed?.accessToken) {
        window.localStorage.removeItem(STORAGE_KEY);
        setStatus('unauthenticated');
        return;
      }
      applySession(parsed);
      const shouldRefresh = parsed.expiresAt - Date.now() <= REFRESH_MARGIN_MS;
      if (shouldRefresh) {
        void refreshRef.current?.(parsed);
      }
    } catch (error) {
      console.error('Failed to parse stored admin session', { error });
      window.localStorage.removeItem(STORAGE_KEY);
      setStatus('unauthenticated');
    }
  }, [applySession]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const timeUntilRefresh = session.expiresAt - Date.now() - REFRESH_MARGIN_MS;
    if (!hasWindow()) {
      return;
    }
    if (timeUntilRefresh <= 0) {
      void refresh(session);
      return;
    }
    const timer = window.setTimeout(() => {
      void refresh(session);
    }, timeUntilRefresh);
    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh, session]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      setStatus('loading');
      setChallenge(null);
      try {
        const result = await signInWithCognito(username, password);
        if (result.type === 'SUCCESS') {
          applySession(result.session);
        } else {
          setChallenge(result);
          setStatus('challenge');
        }
      } catch (error) {
        applySession(null);
        throw error;
      }
    },
    [applySession]
  );

  const completeChallenge = useCallback(
    async (newPassword: string) => {
      if (!challenge) {
        throw new Error('No pending challenge to complete');
      }
      setStatus('loading');
      try {
        const result = await completeNewPassword(challenge, newPassword);
        applySession(result.session);
      } catch (error) {
        setStatus('challenge');
        throw error;
      }
    },
    [applySession, challenge]
  );

  const signOut = useCallback(() => {
    if (session) {
      try {
        signOutFromCognito(session.username);
      } catch (error) {
        console.warn('Failed to sign out from Cognito', { error });
      }
    }
    applySession(null);
  }, [applySession, session]);

  const getValidSession = useCallback(async (): Promise<AdminSession | null> => {
    if (!session) {
      return null;
    }
    const expiresIn = session.expiresAt - Date.now();
    if (expiresIn <= REFRESH_MARGIN_MS) {
      return await refresh(session);
    }
    return session;
  }, [refresh, session]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      status,
      session,
      challenge,
      signIn,
      completeNewPassword: completeChallenge,
      signOut,
      getValidSession
    }),
    [challenge, completeChallenge, getValidSession, session, signIn, signOut, status]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
