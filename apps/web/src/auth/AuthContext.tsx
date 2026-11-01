import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, setToken } from '../api/client';

export type Role = 'ADMIN' | 'MARKETING' | 'SALES_MANAGER' | 'SALES_REP' | 'SUPPORT';

export interface User {
  id: string | number;
  name: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const value = useMemo<AuthState>(
    () => ({
      user,
      async login(email, password) {
        const res = await api<{ token: string; user: User }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setToken(res.token);
        setUser(res.user);
      },
      logout() {
        setToken(null);
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Like useAuth, but returns null outside <AuthProvider> instead of throwing. */
export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}
