'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tenant } from '@flowtiq/shared-types';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string, tenant?: Tenant) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken, tenant) => {
        set({ user, accessToken, refreshToken, tenant: tenant ?? null, isAuthenticated: true });
      },

      setAccessToken: (accessToken) => {
        set({ accessToken });
      },

      setUser: (user) => {
        set({ user });
      },

      logout: () => {
        set({ user: null, tenant: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'flowtiq-auth',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
