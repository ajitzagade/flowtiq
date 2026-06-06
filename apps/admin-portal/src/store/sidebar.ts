import { create } from 'zustand';

interface SidebarStore {
  mobileOpen: boolean;
  collapsed: boolean;
  setMobileOpen: (open: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleMobile: () => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  mobileOpen: false,
  collapsed: false,
  setMobileOpen: (open) => set({ mobileOpen: open }),
  setCollapsed: (collapsed) => set({ collapsed }),
  toggleMobile: () => set((state) => ({ mobileOpen: !state.mobileOpen })),
}));
