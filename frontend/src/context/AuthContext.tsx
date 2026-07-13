import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/types';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

function rolesInclude(roles: string[] | undefined, target: string): boolean {
  // Roles nativas são minúsculas ('admin'); comparação case-insensitive.
  return roles?.some((r) => r.toLowerCase() === target.toLowerCase()) ?? false;
}

interface AuthContextValue {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  hasPermission: (slug: string) => boolean;
  isAdmin: () => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

      // Backend envolve toda resposta de sucesso em { data: ... } (ResponseInterceptor global).
      // Desembrulha antes de usar, senão user.roles fica undefined e isAdmin() sempre falso.
      const body = await res.json() as { data?: AuthUser } | AuthUser | null;
      const authUser =
        body && typeof body === 'object' && 'data' in body
          ? (body as { data?: AuthUser }).data ?? null
          : (body as AuthUser | null);
      setUser(authUser && Object.keys(authUser).length > 0 ? authUser : null);
      setPermissions(authUser?.permissions ?? []);
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
    if (rolesInclude(user?.roles, 'admin')) return true;
    return permissions.includes(slug);
  }, [permissions, user]);

  const isAdmin = useCallback((): boolean => {
    return rolesInclude(user?.roles, 'admin');
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: password }),
    });
    if (!res.ok) throw new Error('credenciais inválidas');
    await loadUser();
  }, [loadUser]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      setUser(null);
      setPermissions([]);
      window.location.href = '/login';
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    permissions,
    loading,
    hasPermission,
    isAdmin,
    login,
    logout,
    reload: loadUser,
  }), [hasPermission, isAdmin, login, loadUser, loading, logout, permissions, user]);

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
