import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@quro/shared';
import { api } from './api';

type SignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age?: number;
  retirementAge?: number;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
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
    api
      .get('/api/auth/me')
      .then((res) => replaceUser(res.data.data ?? null))
      .catch(() => replaceUser(null))
      .finally(() => setLoading(false));
  }, [replaceUser]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.post('/api/auth/signin', { email, password });
      replaceUser(res.data.data);
    },
    [replaceUser],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const res = await api.post('/api/auth/signup', input);
      replaceUser(res.data.data);
    },
    [replaceUser],
  );

  const signOut = useCallback(async () => {
    await api.post('/api/auth/signout');
    replaceUser(null);
  }, [replaceUser]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, replaceUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
