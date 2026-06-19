'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

/** Expand 3-digit shorthand hex (#rgb) to 6-digit (#rrggbb) and ensure # prefix. */
function normalizeHex(hex: string): string {
  const stripped = hex.replace(/^#/, '');
  if (stripped.length === 3) {
    return '#' + stripped.split('').map((c) => c + c).join('');
  }
  return `#${stripped}`;
}

function hexToRgb(hex: string): string | null {
  const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizeHex(hex));
  if (!result) return null;
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

function adjustHex(hex: string, amount: number): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizeHex(hex));
  if (!r) return hex;
  return `#${[r[1], r[2], r[3]]
    .map((c) => clamp(parseInt(c, 16) + amount).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function BrandingApplicator() {
  const tenant = useAuthStore((s) => s.tenant);

  useEffect(() => {
    const branding = tenant?.branding as
      | { primaryColor?: string; secondaryColor?: string }
      | undefined;

    const primary = branding?.primaryColor;
    const secondary = branding?.secondaryColor;

    const root = document.documentElement;

    if (primary) {
      const p = normalizeHex(primary);
      root.style.setProperty('--brand-primary', p);
      root.style.setProperty('--brand-primary-hover', adjustHex(p, -20));
      root.style.setProperty('--sidebar-active', p);
      root.style.setProperty('--sidebar-active-bg', `${p}28`);
      root.style.setProperty('--sidebar-active-border', p);
      const rgb = hexToRgb(p);
      if (rgb) root.style.setProperty('--color-primary-500', rgb);
    }

    // Apply secondary color as sidebar background
    if (secondary) {
      root.style.setProperty('--sidebar-bg', normalizeHex(secondary));
    }
  }, [tenant]);

  return null;
}
