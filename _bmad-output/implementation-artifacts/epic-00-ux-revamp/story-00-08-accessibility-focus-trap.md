---
epicId: 0
storyId: '00-08'
title: 'Accessibility — Focus Trap in All Modals'
status: ready
priority: medium
estimate: 2
dependencies: ['00-07']
---

# Story 0.8 — Accessibility: Focus Trap in All Modals

## Story

**As a** keyboard-only or assistive-technology user,
**I want** focus to stay inside a modal dialog while it is open,
**so that** I cannot accidentally interact with obscured page content behind the modal and the app meets WCAG 2.1 AA standards.

---

## Context

All modals across the app use `role="dialog" aria-modal="true"` but do not implement a focus trap (F-15). Tab key escapes the modal and lands on the page behind it. This is a WCAG 2.1 AA failure (Success Criterion 2.1.2 — No Keyboard Trap, inverse: focus must be contained).

Modals affected:
- `follow-ups/page.tsx` — CreateFollowUpModal, UpdateFollowUpModal
- `documents/page.tsx` — UploadModal
- `users/page.tsx` — UserModal
- `roles/page.tsx` — RoleModal
- `workflows/page.tsx` — WorkflowModal
- `projects/page.tsx` — CreateProjectModal, EditProjectModal
- `projects/[id]/page.tsx` — any inline modals
- `components/ConfirmModal.tsx` — created in Story 0.7

The fix is a single shared `useFocusTrap` hook used by all modals — not per-modal logic.

---

## Acceptance Criteria

### AC-1: `useFocusTrap` hook implemented

**Given** a new file `apps/admin-portal/src/hooks/useFocusTrap.ts`,
**When** the hook is called with a `ref` pointing to a modal container element and an `isActive` boolean,
**Then** when `isActive` is true:
- Focus is moved to the first focusable element inside the container on mount.
- Tab key cycles forward through focusable elements inside the container and wraps from last to first.
- Shift+Tab cycles backward and wraps from first to last.
- Focus never leaves the container while `isActive` is true.

**And** when `isActive` becomes false (modal closes), the hook restores focus to the element that was focused before the modal opened.
**And** the hook cleans up all event listeners on unmount or when `isActive` becomes false.

**Focusable elements selector:**
```
a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),
textarea:not([disabled]), [tabindex]:not([tabindex="-1"])
```

### AC-2: `useFocusTrap` applied to all modal components

**Given** each modal component listed in Context,
**When** the modal renders,
**Then** a `ref` is attached to the outermost `.modal-content` div,
**And** `useFocusTrap(ref, true)` is called inside the modal component.
**And** the existing `useEffect` keyboard listener for Escape key in each modal is kept as-is (it is separate from focus trapping).

### AC-3: Initial focus lands on first interactive element

**Given** a modal opens (e.g. CreateFollowUpModal),
**When** the modal mounts,
**Then** focus moves to the first focusable element inside the modal — typically the first `<input>` or `<select>`.
**And** the modal overlay background is NOT focusable (no `tabIndex` on the overlay div).

### AC-4: Escape key still closes the modal

**Given** focus is trapped inside a modal,
**When** the user presses Escape,
**Then** the modal closes (existing `onClose` behaviour is preserved).
**And** focus returns to the trigger element that opened the modal (handled by the focus-restore in AC-1).

### AC-5: `aria-modal` and `aria-labelledby` confirmed on all modals

**Given** each modal component,
**When** the modal renders,
**Then** the `.modal-content` div has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the modal's `<h3>` heading id.
**And** any modal missing an `id` on its heading gets one added (e.g. `id="modal-title"`).
**And** no new `aria-*` attributes beyond these are required for this story.

---

## Technical Notes

```typescript
// apps/admin-portal/src/hooks/useFocusTrap.ts
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
    const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
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
      previousFocus.current?.focus();
    };
  }, [isActive, ref]);
}
```

- Add `const modalRef = useRef<HTMLDivElement>(null)` inside each modal component and `useFocusTrap(modalRef, true)`.
- Attach `ref={modalRef}` to the `<div className="modal-content ...">` element.
- The `ConfirmModal` from Story 0.7 should be built with `useFocusTrap` from day one.

---

## Files to Change

- `apps/admin-portal/src/hooks/useFocusTrap.ts` — new file (AC-1)
- `apps/admin-portal/src/app/(dashboard)/follow-ups/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/documents/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/users/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/roles/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/workflows/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/projects/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/projects/[id]/page.tsx` — AC-2
- `apps/admin-portal/src/components/ConfirmModal.tsx` — AC-2

---

## Reference

- WCAG 2.1 SC 2.1.2 (No Keyboard Trap)
- `.decision-log.md` — F-15, D-08
