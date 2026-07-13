import { createContext, useContext } from 'react';
import type { AuthUser } from '@/types';

export interface AuthContextValue {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  hasPermission: (slug: string) => boolean;
  isAdmin: () => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  reload: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
