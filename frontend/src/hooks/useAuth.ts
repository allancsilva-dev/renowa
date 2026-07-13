import { useAuth as useAuthContext } from '@/context/AuthContext';
import { hasAnyRole, hasRole } from '@/lib/authorization';

export function useAuth() {
  const { user, logout } = useAuthContext();

  return {
    user,
    isAuthenticated: !!user,
    logout,
    hasRole: (role: string) => hasRole(user?.roles, role),
    hasAnyRole: (roles: string[]) => hasAnyRole(user?.roles, roles),
  };
}
