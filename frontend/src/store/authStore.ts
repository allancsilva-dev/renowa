import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  clearAuth: () => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      clearAuth: () => set({ user: null, isAuthenticated: false }),

      logout: () => {
        set({ user: null, isAuthenticated: false });
        // Cookie HTTP-only é limpo pelo backend — não há como remover via JS
        window.location.href = `${import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech'}/logout`;
      },

      // CHANGELOG #7: roles é string[] — sempre iterar o array
      hasRole: (role) => get().user?.roles.includes(role) ?? false,
      hasAnyRole: (roles) => roles.some((r) => get().user?.roles.includes(r) ?? false),
    }),
    {
      name: 'renowa-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
