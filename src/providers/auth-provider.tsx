import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  type AuthResult,
  type AuthUser,
  signInWithEmail,
  signUpWithEmail,
} from '../lib/api';
import {
  deleteStoredSessionToken,
  deleteStoredSessionUser,
  getStoredSessionToken,
  getStoredSessionUser,
  setStoredSessionToken,
  setStoredSessionUser,
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
  refreshSession: (nextUser?: Partial<AuthUser>) => Promise<void>;
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
        const [storedToken, storedUser, onboardingPending] = await Promise.all([
          getStoredSessionToken(),
          getStoredSessionUser(),
          getOnboardingPending(),
        ]);

        if (isMounted) {
          setOnboardingStatus(onboardingPending ? 'pending' : 'complete');
        }

        if (!storedToken || !storedUser) {
          await Promise.all([
            deleteStoredSessionToken(),
            deleteStoredSessionUser(),
          ]);

          if (isMounted) {
            setStatus('unauthenticated');
          }

          return;
        }

        if (isMounted) {
          setSessionCookie(storedToken);
          setUser(storedUser);
          setStatus('authenticated');
        }
      } catch {
        await Promise.all([
          deleteStoredSessionToken(),
          deleteStoredSessionUser(),
        ]);

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
    authResult: AuthResult,
    nextOnboardingStatus?: Exclude<OnboardingStatus, 'loading'>,
  ) {
    const resolvedOnboardingStatus =
      nextOnboardingStatus ?? ((await getOnboardingPending()) ? 'pending' : 'complete');

    await Promise.all([
      setStoredSessionToken(authResult.sessionToken),
      setStoredSessionUser(authResult.user),
      setOnboardingPending(resolvedOnboardingStatus === 'pending'),
    ]);
    queryClient.clear();
    setSessionCookie(authResult.sessionToken);
    setUser(authResult.user);
    setOnboardingStatus(resolvedOnboardingStatus);
    setStatus('authenticated');
  }

  async function signIn(email: string, password: string) {
    const authResult = await signInWithEmail(email, password);
    await finalizeAuth(authResult);
  }

  async function signUp(name: string, email: string, password: string) {
    const authResult = await signUpWithEmail(name, email, password);
    await finalizeAuth(authResult, 'pending');
  }

  async function signOut() {
    await Promise.all([
      deleteStoredSessionToken(),
      deleteStoredSessionUser(),
    ]);
    queryClient.clear();
    setSessionCookie(null);
    setUser(null);
    setStatus('unauthenticated');
  }

  async function refreshSession(nextUser?: Partial<AuthUser>) {
    if (!sessionCookie || !user) {
      return;
    }

    const mergedUser: AuthUser = {
      email: typeof nextUser?.email === 'string' ? nextUser.email : user.email,
      id: typeof nextUser?.id === 'string' ? nextUser.id : user.id,
      name:
        typeof nextUser?.name === 'string' || nextUser?.name === null
          ? nextUser.name
          : user.name,
    };

    await setStoredSessionUser(mergedUser);
    setUser(mergedUser);
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
