---
epicId: 0
storyId: '00-07'
title: 'Design System Compliance — Palette, Date Columns, Confirm Dialogs'
status: ready
priority: medium
estimate: 3
dependencies: []
---

# Story 0.7 — Design System Compliance

## Story

**As a** developer maintaining the codebase,
**I want** all colour usage, table date formatting, and destructive confirmation patterns to follow the DESIGN.md specification,
**so that** the app is visually coherent and consistent across all pages.

---

## Context

Systematic violations found across multiple files in the full audit. No single violation is severe in isolation, but together they create an incoherent palette and inconsistent UX patterns. Groups:

- **F-23**: `violet-*`, `indigo-*`, `teal-*`, `sky-*`, `rose-*`, `cyan-*` used outside design system semantics across 5 files
- **F-27**: Table date columns missing `text-right font-mono` across 4 table pages
- **F-26**: `window.confirm()` used for destructive actions in 5 pages — should be styled confirmation modal
- **F-34**: `text-violet-500` on Documents workflow icon (subset of F-23, isolated here for clarity)

---

## Acceptance Criteria

### AC-1: `getAvatarColor` uses only design-system palette colours

**Given** `apps/admin-portal/src/lib/utils.ts` `getAvatarColor` function,
**When** the function is updated,
**Then** the colour pool contains only Tailwind classes that map to the design system semantic colours:
`['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-slate-500', 'bg-blue-700', 'bg-emerald-700', 'bg-amber-700']`.
**And** `bg-violet-500`, `bg-rose-500`, `bg-cyan-500`, `bg-indigo-500`, `bg-teal-500` are removed from the pool.
**And** the hash function and modulo logic are unchanged — only the colour array values change.

### AC-2: Reports page KPI icon colours use semantic palette

**Given** `apps/admin-portal/src/app/(dashboard)/reports/page.tsx` KPI card grid,
**When** the cards render,
**Then** the icon background colours use only:
- Total Projects → `bg-blue-500`
- Completed → `bg-emerald-500`
- Active → `bg-blue-600` (not `bg-violet-500`)
- Overdue → `bg-red-500`
- Started in Period → `bg-blue-400`
- Completed in Period → `bg-emerald-600`
- On Hold → `bg-amber-500`
- Cancelled → `bg-slate-400`

**And** `bg-violet-500`, `bg-sky-500`, `bg-teal-500` are removed from this file.

### AC-3: Stage/workflow colour palettes remove violet and indigo

**Given** the `STAGE_COLORS` constant in `workflows/page.tsx` and the `PALETTE` constant in `projects/page.tsx`,
**When** the arrays are updated,
**Then** `#8b5cf6` (violet-500), `#6366f1` (indigo-500), `ec4899` (pink-500) are replaced with:
- `#3b82f6` (blue-500) — already present, keep
- `#10b981` (emerald-500)
- `#f59e0b` (amber-500)
- `#ef4444` (red-500)
- `#64748b` (slate-500)
- `#0ea5e9` (sky-500 — acceptable for charts/stage colours where there is no semantic meaning collision)

**And** in `workflows/page.tsx`, the stage colour fallback `#6366f1` in the stage flow visualisation is replaced with `#3b82f6`.

### AC-4: Documents page workflow icon colour changed

**Given** `apps/admin-portal/src/app/(dashboard)/documents/page.tsx` line 439,
**When** the file is updated,
**Then** `<GitBranch size={15} className="text-violet-500 flex-shrink-0" />` becomes `className="text-indigo-500 flex-shrink-0"` OR `text-blue-600` — pick one and apply it consistently to the workflow hierarchy level across the document tree.
**And** the three hierarchy levels use distinct colours from the palette: project = `text-blue-500`, workflow = `text-indigo-500`, stage = `text-amber-500`.

### AC-5: Table date columns are right-aligned with monospace font

**Given** the following table pages: Follow-ups, Audit Logs, Users, Documents,
**When** date or datetime values render in `<td>` cells,
**Then** those cells have `className` including `text-right font-mono text-sm`.
**And** specifically:
- `follow-ups/page.tsx`: "Next Follow-up" and "Last Follow-up" columns
- `audit-logs/page.tsx`: "Timestamp" column
- `users/page.tsx`: "Last Login" and "Joined" columns
- `documents/page.tsx`: upload date in the `DocRow` component

### AC-6: Destructive actions use a styled confirmation modal

**Given** any of the 5 destructive actions that currently use `window.confirm()`:
- Delete document (`documents/page.tsx:195`)
- Hard-delete user (`users/page.tsx:190`)
- Delete role (`roles/page.tsx:226`)
- Delete workflow (`workflows/page.tsx:349`)
- Delete project (`projects/page.tsx`)

**When** the user triggers any delete action,
**Then** a styled confirmation modal appears using `.modal-overlay` + `.modal-content` classes.
**And** the modal contains: a warning icon (`AlertTriangle` from lucide), a heading ("Delete {entity name}?"), a brief description of the consequence ("This cannot be undone."), a red "Delete" button (`btn-danger` class), and a "Cancel" button (`btn-secondary`).
**And** `window.confirm()` is removed from all 5 locations.
**And** a single reusable `ConfirmModal` component is created at `apps/admin-portal/src/components/ConfirmModal.tsx` and used in all 5 locations to avoid duplication.

---

## Technical Notes

- `ConfirmModal` props: `{ isOpen: boolean; title: string; description: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }`. Use the existing `role="dialog" aria-modal="true"` pattern from other modals. Escape key closes via `useEffect` keydown listener.
- For AC-5: these are `<td>` elements — add `text-right font-mono` directly on the `<td className="...">`. Do not modify the `<th>` header alignment separately unless the header also warrants right-alignment.
- For AC-3 chart `STAGE_COLORS` in reports/page.tsx, those are hex values for Recharts Cell fills — use hex equivalents: blue `#3b82f6`, emerald `#10b981`, amber `#f59e0b`, red `#ef4444`, slate `#64748b`, sky `#0ea5e9`, violet replacement `#3b82f6` (duplicate blue is fine for charts).

---

## Files to Change

- `apps/admin-portal/src/lib/utils.ts` — AC-1
- `apps/admin-portal/src/app/(dashboard)/reports/page.tsx` — AC-2, AC-3 (STAGE_COLORS)
- `apps/admin-portal/src/app/(dashboard)/workflows/page.tsx` — AC-3
- `apps/admin-portal/src/app/(dashboard)/projects/page.tsx` — AC-3
- `apps/admin-portal/src/app/(dashboard)/documents/page.tsx` — AC-4, AC-5
- `apps/admin-portal/src/app/(dashboard)/follow-ups/page.tsx` — AC-5
- `apps/admin-portal/src/app/(dashboard)/audit-logs/page.tsx` — AC-5
- `apps/admin-portal/src/app/(dashboard)/users/page.tsx` — AC-5, AC-6
- `apps/admin-portal/src/app/(dashboard)/roles/page.tsx` — AC-6
- `apps/admin-portal/src/app/(dashboard)/workflows/page.tsx` — AC-6
- `apps/admin-portal/src/app/(dashboard)/documents/page.tsx` — AC-6
- `apps/admin-portal/src/app/(dashboard)/projects/page.tsx` — AC-6
- `apps/admin-portal/src/components/ConfirmModal.tsx` — AC-6 (new file)

---

## Reference

- `globals.css` — badge and component token definitions
- DESIGN.md — Do's and Don'ts section
- `.decision-log.md` — F-23, F-24, F-26, F-27, F-34, D-15, D-17, D-18
