import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from '@/types';
import { AuthContext, type AuthContextValue } from '@/context/auth-context';
import {
  hasPermission as userHasPermission,
  isAdmin as userIsAdmin,
  normalizeRoles,
} from '@/lib/authorization';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      setError(null);
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
      const normalizedUser = authUser && Object.keys(authUser).length > 0
        ? { ...authUser, roles: normalizeRoles(authUser.roles) }
        : null;
      setUser(normalizedUser);
      setPermissions(normalizedUser?.permissions ?? []);
    } catch {
      setError('Não foi possível validar sua sessão. Verifique sua conexão.');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const hasPermission = useCallback((slug: string): boolean => {
    return userHasPermission(user?.roles, permissions, slug);
  }, [permissions, user]);

  const isAdmin = useCallback((): boolean => {
    return userIsAdmin(user?.roles);
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
    error,
    hasPermission,
    isAdmin,
    login,
    logout,
    reload: loadUser,
  }), [error, hasPermission, isAdmin, login, loadUser, loading, logout, permissions, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
