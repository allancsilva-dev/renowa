import { useAuthStore } from '@/store/authStore';

export function useAuth() {
  const { user, isAuthenticated, logout } = useAuthStore();

  function hasRole(role: string): boolean {
    return user?.roles?.includes(role) ?? false;
  }

  function hasAnyRole(roles: string[]): boolean {
    return roles.some((r) => hasRole(r));
  }

  return { user, isAuthenticated, logout, hasRole, hasAnyRole };
}
