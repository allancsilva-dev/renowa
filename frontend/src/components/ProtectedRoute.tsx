import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import LoadingState from '@/components/feedback/LoadingState';
import ErrorState from '@/components/feedback/ErrorState';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, permission, adminOnly = false }: ProtectedRouteProps) {
  const { user, loading, error, reload, hasPermission, isAdmin } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState title='Não foi possível validar sua sessão' description={error} onRetry={() => void reload()} />;
  }

  if (!user) {
    return <Navigate to='/login' replace />;
  }

  if (adminOnly && !isAdmin()) {
    return <Navigate to='/' replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to='/' replace />;
  }

  return <>{children}</>;
}
