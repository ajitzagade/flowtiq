'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

export function FaviconUpdater() {
  const logoUrl = useAuthStore((s) => (s.tenant?.branding as { logoUrl?: string } | undefined)?.logoUrl);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = logoUrl || '/vastudeep_logo.png';
  }, [logoUrl]);

  return null;
}
