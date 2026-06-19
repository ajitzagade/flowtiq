import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useFocusTrap(ref: React.RefObject<HTMLElement>, isActive: boolean) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !ref.current) return;
    previousFocus.current = document.activeElement as HTMLElement;
    // Focus the first focusable element in the trap
    const initial = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    initial[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return;
      // Re-query on every keydown so the list is never stale (dynamic modal content)
      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that was active before the trap opened,
      // but only if it's still in the DOM (avoids silent no-op on removed elements)
      if (previousFocus.current && document.contains(previousFocus.current)) {
        previousFocus.current.focus();
      }
    };
  }, [isActive, ref]);
}
