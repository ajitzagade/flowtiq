---
epicId: 0
storyId: '00-02'
title: 'Dashboard Fixes — Follow-ups Clickable, Row Striping, Bottom Row, Reports Permission'
status: ready
priority: high
estimate: 2
dependencies: []
---

# Story 0.2 — Dashboard Fixes

## Story

**As a** project manager using the dashboard,
**I want** follow-up items to be clickable, the active projects list to have consistent row colours, and the bottom summary row to show unique information,
**so that** the dashboard is immediately actionable and visually coherent.

---

## Context

Four independent fixes in `apps/admin-portal/src/app/(dashboard)/dashboard/page.tsx`. None require API changes.

- **F-03**: Upcoming Follow-ups items are plain `<div>` elements — not clickable (lines 413–423)
- **F-05**: Active Projects list uses `bg-white / bg-violet-50` alternating rows with mismatched hover states — DESIGN.md mandates `#ffffff / #f2f5ff` with `#e6edff` hover (lines 354–363)
- **F-02**: Bottom row duplicates top stat cards (Completed Projects, On Hold, Total Follow-ups) — replace with information that adds value
- **F-10**: Sidebar has Reports gated behind `roles:manage` — should be `reports:view` (in Sidebar.tsx, not dashboard, but bundled here as small config change)

---

## Acceptance Criteria

### AC-1: Upcoming Follow-ups items are clickable links

**Given** the Upcoming Follow-ups panel on the dashboard,
**When** the panel renders follow-up items,
**Then** each item is wrapped in `<Link href={'/follow-ups?id=' + fu.id}>` (Next.js Link).
**And** the item shows a hover state: `hover:bg-slate-50 cursor-pointer`.
**And** clicking navigates to the follow-ups page filtered/highlighted to that follow-up.
**And** the link wraps the entire row (project name, date, assignee) — not just the title text.

### AC-2: Active Projects list uses consistent row striping

**Given** the Active Projects list on the dashboard,
**When** rows render,
**Then** odd rows have `background-color: #ffffff`, even rows have `background-color: #f2f5ff`.
**And** all rows have `hover:bg-[#e6edff]` on hover — no separate odd/even hover classes.
**And** the current `bg-white / bg-violet-50 / hover:bg-indigo-50 / hover:bg-violet-100` classes are removed.
**And** the pattern matches the `.table tbody tr` striping already defined in `globals.css`.

### AC-3: Bottom summary row replaced with actionable information

**Given** the bottom row of stat cards on the dashboard (lines 471–499),
**When** the page renders,
**Then** the three cards show: **Overdue Follow-ups** (count of follow-ups with status 'overdue' or past-due pending), **Stages Overdue** (count of project stages where dueDate < today and status != 'completed'), and **Documents This Week** (count of documents uploaded in last 7 days).
**And** each card links to the relevant page (`/follow-ups?status=overdue`, `/projects`, `/documents`).
**And** the data comes from the existing `dashboardData` API response — if the backend doesn't return these fields yet, use 0 with a `// TODO: wire backend` comment rather than faking data.

### AC-4: Reports sidebar permission changed to `reports:view`

**Given** `apps/admin-portal/src/components/layout/Sidebar.tsx`,
**When** the sidebar nav items are rendered,
**Then** the Reports nav item permission check uses `'reports:view'` instead of `'roles:manage'`.
**And** Project Managers with `reports:view` permission can now see the Reports link.
**And** no other nav item permissions are changed.

---

## Technical Notes

- Wrap follow-up items: replace `<div className="...">` with `<Link href={...} className="... hover:bg-slate-50">` — import `Link` from `'next/link'`.
- Row striping: remove inline `className` ternary on `bg-violet-50 / bg-white`; use `className="group"` + CSS or rely on the table's nth-child CSS in globals.css if the list is rendered as a `<table>`. If it's a `<div>` list, apply manually with the index.
- Bottom row: keep the card structure, just update labels, values, and `href` props.
- Sidebar permission: single string change in the nav config array in `Sidebar.tsx`.

---

## Files to Change

- `apps/admin-portal/src/app/(dashboard)/dashboard/page.tsx` — AC-1, AC-2, AC-3
- `apps/admin-portal/src/components/layout/Sidebar.tsx` — AC-4

---

## Reference

- `key-dashboard.html` mockup — visual reference for row striping and follow-up links
- `.decision-log.md` — F-02, F-03, F-05, F-10, D-04, D-10, D-11, D-12
