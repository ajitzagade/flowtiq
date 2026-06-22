'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Bell, X } from 'lucide-react';
import { setupForegroundMessages } from '@/lib/webPush';
import { useAuthStore } from '@/store/auth';
import { playNotificationSound } from '@/lib/sound';

function NotificationToast({
  t,
  title,
  body,
  onNavigate,
}: {
  t: { id: string; visible: boolean };
  title: string;
  body: string;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 bg-white rounded-xl shadow-lg border border-slate-100 p-4 max-w-sm w-full cursor-pointer transition-all ${
        t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      onClick={() => {
        toast.dismiss(t.id);
        onNavigate();
      }}
    >
      <div className="flex-shrink-0 w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center">
        <Bell size={16} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{body}</p>
        <p className="text-xs text-blue-500 mt-1 font-medium">Tap to view</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.dismiss(t.id);
        }}
        className="flex-shrink-0 text-slate-300 hover:text-slate-500 transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

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
