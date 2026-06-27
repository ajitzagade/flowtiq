'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { setupForegroundMessages } from '@/lib/webPush';
import { useAuthStore } from '@/store/auth';
import { playNotificationSound } from '@/lib/sound';
import { NotificationToast } from '@/components/NotificationToast';

export function ServiceWorkerRegistrar() {
  const router = useRouter();
  const routerRef = useRef(router);
  const isAuthenticated = useAuthStore((s) => !!s.user);

  // Keep routerRef current without causing the FCM effect to re-run
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    // Only register in production — in dev the SW caches stale JS chunks and breaks HMR
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  }, []);

  // Show foreground push notifications as custom toasts while the app tab is open.
  // Effect runs once per auth session — router is accessed via ref to avoid
  // re-subscribing the FCM listener on every navigation (which would cause
  // buffered messages to re-deliver on each page change).
  useEffect(() => {
    if (!isAuthenticated) return;

    let unsub: (() => void) | null = null;

    setupForegroundMessages((title, body, deepLinkUrl, messageId) => {
      // Deduplicate: Firebase re-delivers buffered messages to new onMessage
      // listeners on every page refresh via BroadcastChannel. Skip if we've
      // already shown this messageId within the last 2 minutes.
      if (messageId) {
        try {
          const seen: Record<string, number> = JSON.parse(localStorage.getItem('fcm-shown') ?? '{}');
          if (seen[messageId] && Date.now() - seen[messageId] < 2 * 60 * 1000) return;
          // Prune old entries to keep storage small
          const keys = Object.keys(seen);
          if (keys.length > 30) delete seen[keys[0]];
          seen[messageId] = Date.now();
          localStorage.setItem('fcm-shown', JSON.stringify(seen));
        } catch {
          // localStorage unavailable — proceed without dedup
        }
      }
      playNotificationSound();
      toast.custom(
        (t) => (
          <NotificationToast
            t={t}
            title={title}
            body={body}
            onNavigate={() => routerRef.current.push(deepLinkUrl)}
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
  }, [isAuthenticated]); // intentionally excludes router — use routerRef instead

  return null;
}
