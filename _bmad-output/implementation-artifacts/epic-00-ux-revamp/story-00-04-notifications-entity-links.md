---
epicId: 0
storyId: '00-04'
title: 'Notifications Page — Entity Links + Navigate on Click'
status: ready
priority: high
estimate: 2
dependencies: ['00-01']
---

# Story 0.4 — Notifications: Entity Links + Navigate on Click

## Story

**As a** user on the notifications page,
**I want** each notification to link directly to the entity it references,
**so that** I can act on a notification without manually searching for the related project or follow-up.

---

## Context

The notifications page (`notifications/page.tsx`) currently shows type icon + title + message + relative time. Clicking an item only marks it read — there is no navigation. This breaks the core value proposition of notifications (F-14, F-33).

The `Notification` model in the database already has an `entityType` and `entityId` field. The backend notification creation code in `services/api/src/routes/notifications.ts` (called from stages.ts, projects.ts etc.) populates these. A `link` or derived URL field may or may not be returned by the API — check the response shape. If `link` is not returned, construct the URL client-side from `entityType` + `entityId`.

The `key-notifications.html` mockup shows the "View stage →" / "View project →" pill pattern.

---

## Acceptance Criteria

### AC-1: Each notification item shows an entity link pill

**Given** the notifications page renders a list of notifications,
**When** a notification has `entityType` and `entityId` populated,
**Then** a tinted pill link appears in the notification row alongside the timestamp.
**And** the pill text follows the pattern: `View {entityType}` (e.g. "View project", "View stage", "View follow-up").
**And** the pill is styled: `bg-blue-50 text-blue-600 text-xs font-medium px-2 py-0.5 rounded-md hover:bg-blue-100` for read notifications; same but brighter for unread.
**And** overdue notifications (`type === 'overdue'`) use `bg-red-50 text-red-600` for their pill.
**And** if `entityType` or `entityId` is null/undefined, no pill renders (graceful degradation).

### AC-2: Entity link URL mapping

**Given** a notification with `entityType` and `entityId`,
**When** the link pill is clicked,
**Then** the user navigates to the correct page:

| entityType | URL |
|---|---|
| `project` | `/projects/{entityId}` |
| `stage` | `/projects/{projectId}` (use `metadata.projectId` if available, else `/projects`) |
| `follow_up` | `/follow-ups?id={entityId}` |
| `document` | `/documents?projectId={metadata.projectId}` |
| `user` | `/users` |
| (unknown) | `/notifications` (fallback) |

**And** clicking the pill also marks the notification as read (same `PATCH /notifications/:id/read` call).

### AC-3: Clicking the notification row (outside the pill) marks read only

**Given** a notification item,
**When** the user clicks anywhere on the row that is NOT the entity link pill,
**Then** the notification is marked as read (existing behaviour preserved).
**And** no navigation happens from the row click (pill is the only navigation trigger).
**And** this prevents accidental navigation when the user just wants to dismiss the unread indicator.

### AC-4: Empty state has illustrated icon

**Given** the notifications list is empty (no items match the current filter),
**When** the empty state renders,
**Then** the existing `<Bell size={48} className="text-slate-200 mb-3" />` + text renders (already has an icon — confirm it is present and styled correctly).
**And** if the user is on the "Unread" tab and has no unread notifications, the message is "You're all caught up." rather than "No notifications".

---

## Technical Notes

- Check the API response for `Notification` — look for `entityType`, `entityId`, `metadata`, and `link` fields. The `@flowtiq/shared-types` Notification interface is the source of truth.
- If a `link` field exists (pre-computed URL string), use it directly. Otherwise build the URL from `entityType` + `entityId` + `metadata?.projectId` using a `buildNotificationLink(notif)` helper function.
- The pill is a separate `<a>` or `<Link>` with `onClick={(e) => e.stopPropagation()}` to prevent the row's `onClick` from also firing.
- Use `useRouter().push(url)` inside the pill onClick after calling `markReadMutation.mutate(notif.id)`.

---

## Files to Change

- `apps/admin-portal/src/app/(dashboard)/notifications/page.tsx` — all ACs

---

## Reference

- `key-notifications.html` mockup — pill styling and placement
- `.decision-log.md` — F-14, F-33, D-05
