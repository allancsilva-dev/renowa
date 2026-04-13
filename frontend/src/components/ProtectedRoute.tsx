import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, permission, adminOnly = false }: ProtectedRouteProps) {
  const { user, loading, hasPermission, isAdmin } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    window.location.href = `${API_URL}/auth/oidc/start?return_to=${encodeURIComponent(window.location.href)}`;
    return null;
  }

  if (adminOnly && !isAdmin()) {
    return <Navigate to='/' replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to='/' replace />;
  }

  return <>{children}</>;
}
