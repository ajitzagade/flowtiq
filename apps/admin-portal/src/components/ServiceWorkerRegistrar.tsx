'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Only register in production — in dev the SW caches stale JS chunks and breaks HMR
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }
  }, []);

  return null;
}
