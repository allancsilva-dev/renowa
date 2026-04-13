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

      const data = (await res.json()) as MeResponse;
      setUser(data.user ?? null);
      setPermissions(data.permissions ?? []);
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
    if (!user) return false;
    if (user.role?.toLowerCase() === 'admin') return true;
    return permissions.includes(slug);
  }, [permissions, user]);

  const isAdmin = useCallback((): boolean => {
    return user?.role?.toLowerCase() === 'admin';
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
