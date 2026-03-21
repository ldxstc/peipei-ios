import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  type AuthUser,
  getSession,
  signInWithEmail,
  signUpWithEmail,
} from '../lib/api';
import {
  deleteStoredSessionCookie,
  getStoredSessionCookie,
  setStoredSessionCookie,
} from '../lib/auth-storage';
import {
  getOnboardingPending,
  setOnboardingPending,
} from '../lib/onboarding-storage';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type OnboardingStatus = 'loading' | 'pending' | 'complete';

type AuthContextValue = {
  completeOnboarding: () => Promise<void>;
  onboardingStatus: OnboardingStatus;
  refreshSession: () => Promise<void>;
  sessionCookie: string | null;
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus>('loading');
  const [sessionCookie, setSessionCookie] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const [storedCookie, onboardingPending] = await Promise.all([
          getStoredSessionCookie(),
          getOnboardingPending(),
        ]);

        if (isMounted) {
          setOnboardingStatus(onboardingPending ? 'pending' : 'complete');
        }

        if (!storedCookie) {
          if (isMounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        const session = await getSession(storedCookie);

        if (!session.user) {
          throw new Error('Session expired');
        }

        if (isMounted) {
          setSessionCookie(storedCookie);
          setUser(session.user);
          setStatus('authenticated');
        }
      } catch {
        await deleteStoredSessionCookie();

        if (isMounted) {
          setOnboardingStatus('complete');
          setSessionCookie(null);
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function finalizeAuth(
    cookie: string,
    nextOnboardingStatus?: Exclude<OnboardingStatus, 'loading'>,
  ) {
    const session = await getSession(cookie);

    if (!session.user) {
      throw new Error('The account session could not be loaded.');
    }

    const resolvedOnboardingStatus =
      nextOnboardingStatus ?? ((await getOnboardingPending()) ? 'pending' : 'complete');

    await setStoredSessionCookie(cookie);
    await setOnboardingPending(resolvedOnboardingStatus === 'pending');
    queryClient.clear();
    setSessionCookie(cookie);
    setUser(session.user);
    setOnboardingStatus(resolvedOnboardingStatus);
    setStatus('authenticated');
  }

  async function signIn(email: string, password: string) {
    const cookie = await signInWithEmail(email, password);
    await finalizeAuth(cookie);
  }

  async function signUp(name: string, email: string, password: string) {
    const cookie = await signUpWithEmail(name, email, password);
    await finalizeAuth(cookie, 'pending');
  }

  async function signOut() {
    await deleteStoredSessionCookie();
    queryClient.clear();
    setSessionCookie(null);
    setUser(null);
    setStatus('unauthenticated');
  }

  async function refreshSession() {
    if (!sessionCookie) {
      return;
    }

    const session = await getSession(sessionCookie);

    if (!session.user) {
      await signOut();
      return;
    }

    setUser(session.user);
    setStatus('authenticated');
  }

  async function completeOnboarding() {
    await setOnboardingPending(false);
    setOnboardingStatus('complete');
  }

  return (
    <AuthContext.Provider
      value={{
        completeOnboarding,
        onboardingStatus,
        refreshSession,
        sessionCookie,
        status,
        user,
        signIn,
        signOut,
        signUp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
