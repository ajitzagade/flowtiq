'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { setupForegroundMessages } from '@/lib/webPush';
import { useAuthStore } from '@/store/auth';
import { playNotificationSound } from '@/lib/sound';
import { NotificationToast } from '@/components/NotificationToast';

export function ServiceWorkerRegistrar() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => !!s.user);

  useEffect(() => {
    // Only register in production — in dev the SW caches stale JS chunks and breaks HMR
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  }, []);

  // Show foreground push notifications as custom toasts while the app tab is open
  useEffect(() => {
    if (!isAuthenticated) return;

    let unsub: (() => void) | null = null;

    setupForegroundMessages((title, body, deepLinkUrl) => {
      playNotificationSound();
      toast.custom(
        (t) => (
          <NotificationToast
            t={t}
            title={title}
            body={body}
            onNavigate={() => router.push(deepLinkUrl)}
          />
        ),
        { duration: 7000 },
      );
    }).then((fn) => {
      unsub = fn;
    });

    return () => {
      unsub?.();
    };
  }, [isAuthenticated, router]);

  return null;
}
