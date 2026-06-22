'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/store/auth';
import { BrandingApplicator } from '@/components/BrandingApplicator';
import { useSidebarStore } from '@/store/sidebar';
import { cn } from '@/lib/utils';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const { mobileOpen, collapsed, setMobileOpen } = useSidebarStore();

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, _hasHydrated, router]);

  // Listen for foreground push notifications dispatched by the native mobile app
  useEffect(() => {
    const handler = (e: Event) => {
      const { title, body } = (e as CustomEvent<{ title: string; body: string }>).detail;
      new Audio('/flowtiq_sound.mp3').play().catch(() => {});
      toast(body || title, {
        duration: 5000,
        position: 'top-right',
        icon: '🔔',
        style: { maxWidth: 360 },
      });
    };
    window.addEventListener('flowtiqNotification', handler);
    return () => window.removeEventListener('flowtiqNotification', handler);
  }, []);

  if (!_hasHydrated) return <Spinner />;
  if (!isAuthenticated) return <Spinner />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <BrandingApplicator />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar />

      {/* Main content — no left margin on mobile (sidebar is overlay); margin on desktop */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 transition-all duration-300',
          collapsed ? 'md:ml-16' : 'md:ml-60',
        )}
      >
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
