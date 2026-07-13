import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import LoadingState from '@/components/feedback/LoadingState';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, permission, adminOnly = false }: ProtectedRouteProps) {
  const { user, loading, hasPermission, isAdmin } = useAuth();

  if (loading) {
    return <LoadingState />;
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
