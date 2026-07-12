import { create } from 'zustand';
import type { AuthUser } from '@/types';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  clearAuth: () => void;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
}
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  clearAuth: () => set({ user: null, isAuthenticated: false }),

  logout: async () => {
    const apiUrl = import.meta.env.VITE_API_URL ?? '/api';
    try {
      await fetch(`${apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      set({ user: null, isAuthenticated: false });
      window.location.href = '/login';
    }
  },

  // CHANGELOG #7: roles é string[] — sempre iterar o array
  hasRole: (role) => get().user?.roles.includes(role) ?? false,
  hasAnyRole: (roles) => roles.some((r) => get().user?.roles.includes(r) ?? false),
}));
