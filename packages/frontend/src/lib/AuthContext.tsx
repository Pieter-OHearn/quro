import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { ResetPasswordInput, User } from '@quro/shared';
import { api, apiGet, apiPost, registerUnauthorizedHandler } from './api';
import { clearAuthQueryCache, invalidateAuthSession } from './authCache';

type SignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age?: number;
  retirementAge?: number;
  /** Operator-issued code; required unless the instance allows open registration. */
  inviteCode?: string;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  /** Redeems an operator-issued reset code; on success the user is signed in. */
  resetPassword: (input: ResetPasswordInput) => Promise<void>;
  signOut: () => Promise<void>;
  replaceUser: (nextUser: User | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const replaceUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
  }, []);

  useEffect(() => {
    apiGet<User | null>('/api/auth/me')
      .then((user) => replaceUser(user ?? null))
      .catch(() => {
        clearAuthQueryCache();
        replaceUser(null);
      })
      .finally(() => setLoading(false));
  }, [replaceUser]);

  useEffect(
    () => registerUnauthorizedHandler(() => invalidateAuthSession(replaceUser)),
    [replaceUser],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiPost<User>('/api/auth/signin', { email, password });
      clearAuthQueryCache();
      replaceUser(res);
    },
    [replaceUser],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const res = await apiPost<User>('/api/auth/signup', input);
      clearAuthQueryCache();
      replaceUser(res);
    },
    [replaceUser],
  );

  const resetPassword = useCallback(
    async (input: ResetPasswordInput) => {
      const res = await apiPost<User>('/api/auth/password-reset', input);
      clearAuthQueryCache();
      replaceUser(res);
    },
    [replaceUser],
  );

  const signOut = useCallback(async () => {
    await api.post('/api/auth/signout');
    clearAuthQueryCache();
    replaceUser(null);
  }, [replaceUser]);

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, resetPassword, signOut, replaceUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
