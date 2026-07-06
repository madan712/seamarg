// App-wide auth state. Loads the persisted session on mount, exposes the
// current session plus sign-in / sign-up / verify / reset / sign-out actions.
// Screens read this via useAuth(); the (app) route group guards on `session`.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  cognitoSignOut,
  confirmEmailWithCognito,
  confirmPasswordReset,
  requestPasswordReset,
  resendVerificationCode,
  signInWithCognito,
  signUpWithCognito,
} from './cognito';
import { clearSession, loadSession, saveSession } from './session';
import type { AuthSession, SignUpProfile } from './types';

type AuthContextValue = {
  session: AuthSession | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, profile: SignUpProfile) => Promise<{ confirmed: boolean }>;
  confirmEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setInitializing(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      async signIn(email, password) {
        const next = await signInWithCognito(email.toLowerCase(), password);
        await saveSession(next);
        setSession(next);
      },
      async signUp(email, password, profile) {
        const result = await signUpWithCognito(email.toLowerCase(), password, profile);
        if (result.userConfirmed) {
          const next = await signInWithCognito(email.toLowerCase(), password);
          await saveSession(next);
          setSession(next);
        }
        return { confirmed: result.userConfirmed };
      },
      async confirmEmail(email, code) {
        await confirmEmailWithCognito(email.toLowerCase(), code);
      },
      async resendCode(email) {
        await resendVerificationCode(email.toLowerCase());
      },
      async forgotPassword(email) {
        await requestPasswordReset(email.toLowerCase());
      },
      async resetPassword(email, code, newPassword) {
        await confirmPasswordReset(email.toLowerCase(), code, newPassword);
      },
      async signOut() {
        cognitoSignOut();
        await clearSession();
        setSession(null);
      },
    }),
    [session, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
