'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

export function FaviconUpdater() {
  const logo = useAuthStore((s) => s.tenant?.logo);

  useEffect(() => {
    if (!logo) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = logo;
  }, [logo]);

  return null;
}
