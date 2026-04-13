import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
const API_URL = import.meta.env.VITE_API_URL ?? '/api';
const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';

export interface AuthUser {
  sub: string;
  email: string;
  roles: string[];
  tenantId: string;
  plan: string;
  defaultRole: string;
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

// Authentication is handled via backend OIDC flow; frontend does not redirect here.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });

      if (res.status === 401) {
        setUser(null);
        setPermissions([]);
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load user: ${res.status}`);
      }

      const data = await res.json();
      setUser(data ?? null);
      setPermissions([]);
    } catch {
      setUser(null);
      setPermissions([]);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const hasPermission = useCallback((slug: string): boolean => {
    if (user?.roles?.includes('ADMIN')) return true;
    return permissions.includes(slug);
  }, [permissions, user]);

  const isAdmin = useCallback((): boolean => {
    return user?.roles?.includes('ADMIN') ?? false;
  }, [user]);

  const logout = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/oidc/logout`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(null);
        setPermissions([]);
        window.location.href = data.redirect;
        return;
      }
    } catch {
      // fallback
    }

    // fallback: direct to auth
    window.location.href = `${AUTH_URL}`;
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
