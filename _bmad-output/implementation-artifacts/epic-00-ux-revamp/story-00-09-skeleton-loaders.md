---
epicId: 0
storyId: '00-09'
title: 'Skeleton Loaders — Replace Spinners on All Async Surfaces'
status: ready
priority: low
estimate: 4
dependencies: []
---

# Story 0.9 — Skeleton Loaders App-Wide

## Story

**As a** user loading any data-heavy page,
**I want** to see a skeleton preview of the layout while data loads,
**so that** the page feels fast and I can orient myself before content arrives.

---

## Context

DESIGN.md specifies: "Show a skeleton loader for every async surface with more than 2 fields." The entire app currently uses a single animated SVG spinner (`animate-spin`) for all loading states. This is a systematic gap across all 10 data pages (F-25).

Skeleton loaders replace spinners with placeholder shapes that match the real content layout — they reduce perceived load time and eliminate layout shift on content arrival.

This story is the largest in Epic 0 (estimate: 4 points). It can be deferred post-Phase 2 but is included here for completeness. Implement after all other Epic 0 stories are done.

---

## Acceptance Criteria

### AC-1: Shared skeleton primitive components created

**Given** a new file `apps/admin-portal/src/components/Skeleton.tsx`,
**When** the components are created,
**Then** the file exports:
- `<SkeletonLine width?: string height?: string className?: string />` — a single shimmer bar
- `<SkeletonAvatar size?: number />` — a circular shimmer disc
- `<SkeletonCard rows?: number />` — a card-shaped block with N shimmer lines
- `<SkeletonTable rows?: number cols?: number />` — a table-shaped block with a header row and N data rows

**And** all skeleton elements use the shimmer animation:
```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
```
**And** this animation is added to `globals.css` under the `@layer components` block.

### AC-2: Dashboard skeleton

**Given** the dashboard page is loading (`isLoading === true` from TanStack Query),
**When** the loading skeleton renders,
**Then** 4 `<SkeletonCard>` stat cards appear in the top grid.
**And** a `<SkeletonTable rows={5} cols={5} />` appears in the Active Projects section.
**And** a `<SkeletonCard rows={4} />` appears in the Upcoming Follow-ups panel.
**And** the animated spinner `<svg className="animate-spin ...">` is removed from this page.

### AC-3: Table pages skeletons (Follow-ups, Users, Audit Logs)

**Given** any of these table pages is loading,
**When** `isLoading === true`,
**Then** the `<tr><td colSpan={N}><svg animate-spin /></td></tr>` pattern is replaced with `<SkeletonTable rows={8} cols={N} />` rendered inside the `<tbody>`.
**And** the table header (`<thead>`) remains visible during loading — only the body is replaced.
**And** after data loads, the skeleton is replaced by real rows with no layout shift.

### AC-4: Cards pages skeletons (Roles, Workflows)

**Given** the Roles or Workflows page is loading,
**When** `isLoading === true`,
**Then** 6 `<SkeletonCard rows={3} />` elements render in the grid (matching the expected card layout).
**And** the centered `<svg animate-spin />` is removed.

### AC-5: Project detail skeleton

**Given** the project detail page is loading,
**When** `isLoading === true`,
**Then** the page shows:
- A skeleton for the project header (one wide `<SkeletonLine>` for title, two narrow lines for meta)
- 4 `<SkeletonCard rows={1} />` for the info grid
- 4 `<SkeletonCard rows={2} />` stacked for stage cards

### AC-6: Documents page skeleton

**Given** the documents page is loading,
**When** `isLoading === true`,
**Then** 3 `<SkeletonCard rows={3} />` appear (representing collapsed project groups).
**And** the `animate-spin` spinner in the card is removed.

### AC-7: Notifications page skeleton

**Given** the notifications page is loading,
**When** `isLoading === true`,
**Then** 5 skeleton rows appear inside the `.card.divide-y` container, each with a circular `<SkeletonAvatar size={18} />` and two `<SkeletonLine>` elements.

### AC-8: Reports page skeleton

**Given** the reports page is loading,
**When** `isLoading === true`,
**Then** 8 `<SkeletonCard rows={1} />` appear in the KPI grid, and two `<SkeletonCard rows={8} />` appear in the charts area.

---

## Technical Notes

- The shimmer CSS can go in `globals.css` as a utility class `.skeleton-shimmer`. Apply it via `className` on each skeleton element — no separate CSS module needed.
- `<SkeletonLine>` default: `height: 14px`, `width: 100%`, `rounded: 4px`. Accept `width` as a Tailwind width class or a `style` prop for precise widths (e.g. `width="60%"`).
- `<SkeletonTable>`: renders a `<tbody>` fragment only (caller provides `<table>` + `<thead>`). Each row has `cols` cells with `<SkeletonLine>` elements of varying widths for realism.
- Keep the animated spinner in exactly one place: the initial full-page auth check in `(dashboard)/layout.tsx` (the `<Spinner>` component) — that spinner is correct because the layout itself hasn't mounted yet.
- Do NOT skeleton the filter/toolbar bars — those render from local state, not from async data.

---

## Files to Change

- `apps/admin-portal/src/components/Skeleton.tsx` — new file (AC-1)
- `apps/admin-portal/src/app/globals.css` — shimmer keyframe + `.skeleton-shimmer` class (AC-1)
- `apps/admin-portal/src/app/(dashboard)/dashboard/page.tsx` — AC-2
- `apps/admin-portal/src/app/(dashboard)/follow-ups/page.tsx` — AC-3
- `apps/admin-portal/src/app/(dashboard)/users/page.tsx` — AC-3
- `apps/admin-portal/src/app/(dashboard)/audit-logs/page.tsx` — AC-3
- `apps/admin-portal/src/app/(dashboard)/roles/page.tsx` — AC-4
- `apps/admin-portal/src/app/(dashboard)/workflows/page.tsx` — AC-4
- `apps/admin-portal/src/app/(dashboard)/projects/[id]/page.tsx` — AC-5
- `apps/admin-portal/src/app/(dashboard)/documents/page.tsx` — AC-6
- `apps/admin-portal/src/app/(dashboard)/notifications/page.tsx` — AC-7
- `apps/admin-portal/src/app/(dashboard)/reports/page.tsx` — AC-8

---

## Reference

- DESIGN.md — "Show a skeleton loader for every async surface with more than 2 fields"
- `.decision-log.md` — F-25, D-16
