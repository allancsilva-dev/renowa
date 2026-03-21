import { useAuth as useAuthContext } from '@/context/AuthContext';

export function useAuth() {
  const { user, logout } = useAuthContext();

  function hasRole(role: string): boolean {
    if (!user?.role) return false;
    return user.role.toLowerCase() === role.toLowerCase();
  }

  function hasAnyRole(roles: string[]): boolean {
    return roles.some((r) => hasRole(r));
  }

  return { user, isAuthenticated: !!user, logout, hasRole, hasAnyRole };
}
