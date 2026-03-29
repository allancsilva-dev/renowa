import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { authFetch, clearToken } from '@/lib/auth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';
const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
const APP_AUD = import.meta.env.VITE_APP_AUD ?? 'renowa.zonadev.tech';

export interface AuthUser {
  id: string;
  authUserId: string;
  email: string;
  role: string;
  tenantId: string;
  active: boolean;
}

interface MeResponse {
  user: AuthUser;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  hasPermission: (slug: string) => boolean;
  isAdmin: () => boolean;
  logout: () => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function redirectToLogin(): never {
  window.location.href = `${AUTH_URL}/login?app=${APP_AUD}&redirect=${encodeURIComponent(window.location.href)}`;
  throw new Error('Redirecting to login');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/users/me`);

      if (res.status === 401) {
        clearToken();
        redirectToLogin();
      }

      if (!res.ok) {
        throw new Error(`Failed to load user: ${res.status}`);
      }

      const data = (await res.json()) as MeResponse;

      if (!data?.user || !Array.isArray(data.permissions)) {
        throw new Error('Invalid /users/me response format');
      }

      setUser(data.user);
      setPermissions(data.permissions);
    } catch {
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const hasPermission = useCallback((slug: string): boolean => {
    if (!user) return false;
    if (user.role?.toLowerCase() === 'admin') return true;
    return permissions.includes(slug);
  }, [permissions, user]);

  const isAdmin = useCallback((): boolean => {
    return user?.role?.toLowerCase() === 'admin';
  }, [user]);

  const logout = useCallback(() => {
    clearToken();
    window.location.href = `${AUTH_URL}/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    permissions,
    loading,
    hasPermission,
    isAdmin,
    logout,
    reload: loadUser,
  }), [hasPermission, isAdmin, loadUser, loading, logout, permissions, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
