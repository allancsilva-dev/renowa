import { useAuth as useAuthContext } from '@/context/auth-context';
import { hasAnyRole, hasRole } from '@/lib/authorization';

export function useAuth() {
  const { user, logout, hasPermission, isAdmin } = useAuthContext();

  return {
    user,
    isAuthenticated: !!user,
    logout,
    hasPermission,
    isAdmin,
    hasRole: (role: string) => hasRole(user?.roles, role),
    hasAnyRole: (roles: string[]) => hasAnyRole(user?.roles, roles),
  };
}
