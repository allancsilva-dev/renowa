import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types';
import { clearToken } from '@/lib/auth';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  clearAuth: () => void;
  logout: () => Promise<void>;
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

      logout: async () => {
        const authUrl = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
        const aud = import.meta.env.VITE_EXPECTED_AUD ?? 'renowa.zonadev.tech';

        clearToken();
        set({ user: null, isAuthenticated: false });

        try {
          await fetch(`${authUrl}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
          });
        } finally {
          window.location.href = `${authUrl}/login?app=${aud}`;
        }
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
