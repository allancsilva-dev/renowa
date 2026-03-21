import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
const APP_AUD = import.meta.env.VITE_APP_AUD ?? 'renowa.zonadev.tech';

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
    window.location.href = `${AUTH_URL}/login?app=${APP_AUD}&redirect=${encodeURIComponent(window.location.href)}`;
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
