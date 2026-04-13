import { useAuth as useAuthContext } from '@/context/AuthContext';

export function useAuth() {
  const { user, logout } = useAuthContext();

  function hasRole(role: string): boolean {
    return user?.roles?.some(r => r.toLowerCase() === role.toLowerCase()) ?? false;
  }

  function hasAnyRole(roles: string[]): boolean {
    return roles.some((r) => hasRole(r));
  }

  return { user, isAuthenticated: !!user, logout, hasRole, hasAnyRole };
}
