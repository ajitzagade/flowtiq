'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { setupForegroundMessages } from '@/lib/webPush';
import { useAuthStore } from '@/store/auth';

export function ServiceWorkerRegistrar() {
  const isAuthenticated = useAuthStore((s) => !!s.user);

  useEffect(() => {
    // Only register in production — in dev the SW caches stale JS chunks and breaks HMR
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  }, []);

  // Show foreground push notifications as toasts while the app tab is open
  useEffect(() => {
    if (!isAuthenticated) return;

    let unsub: (() => void) | null = null;

    setupForegroundMessages((title, body) => {
      toast(`${title} — ${body}`, { duration: 6000 });
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      unsub?.();
    };
  }, [isAuthenticated]);

  return null;
}
