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
  _hasHydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string, tenant?: Tenant) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: User) => void;
  setTenant: (tenant: Tenant) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: (user, accessToken, refreshToken, tenant) => {
        set({ user, accessToken, refreshToken, tenant: tenant ?? null, isAuthenticated: true });
      },

      setAccessToken: (accessToken) => {
        set({ accessToken });
      },

      setUser: (user) => {
        set({ user });
      },

      setTenant: (tenant) => {
        set({ tenant });
      },

      logout: () => {
        set({ user: null, tenant: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'flowtiq-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
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
