---
epicId: 0
storyId: '00-01'
title: 'Header Revamp — Notification Popover + User Menu Dropdown'
status: ready
priority: high
estimate: 3
dependencies: []
---

# Story 0.1 — Header Revamp: Notification Popover + User Menu Dropdown

## Story

**As a** logged-in user,
**I want** the notification bell to open a dropdown preview and the avatar to open a user menu with a logout option,
**so that** I can check recent notifications and sign out without leaving my current page.

---

## Context

Two related header issues: F-06 (bell navigates full-page to `/notifications` — loses workflow context) and F-07 (avatar links directly to `/settings` — no logout shortcut). Both are in `apps/admin-portal/src/components/layout/Header.tsx` (71 lines total).

The EXPERIENCE.md specifies both components in detail (Notification Popover section, User Menu Dropdown section). The DESIGN.md tokens for the popover are: width `380px`, max-height `480px`, border-radius `12px`, shadow `0 10px 40px rgba(0,0,0,0.12)`. The `key-dashboard.html` mockup shows the popover open state as visual reference.

The notification data is already available via the existing TanStack Query key `['notifications']` — just needs to be fetched with `pageSize: 5` and `isRead: false` for the preview.

---

## Acceptance Criteria

### AC-1: Notification popover appears on bell click

**Given** the user is on any dashboard page,
**When** they click the bell icon in the header,
**Then** a popover appears anchored below-right of the bell, showing up to 5 most recent notifications (all statuses, sorted by `createdAt` desc).

**And** each item shows: type icon (coloured per `TYPE_ICONS` map in notifications/page.tsx) + title + message truncated to 2 lines + relative time + unread dot if `isRead === false`.
**And** a footer row shows "Mark all read" button and "View all notifications" link → `/notifications`.
**And** clicking outside the popover or pressing `Escape` closes it.
**And** the bell does NOT navigate to `/notifications` anymore — it only toggles the popover.

### AC-2: Notification item click marks read and navigates to entity

**Given** the popover is open,
**When** the user clicks a notification item,
**Then** `PATCH /notifications/:id/read` is called,
**And** the popover closes,
**And** the user is navigated to the entity. Use `notif.link` if present; fall back to `/notifications` if no link exists.

**And** the unread badge count on the bell updates immediately (optimistic update via query invalidation).

### AC-3: Bell badge shows unread count

**Given** the user has unread notifications,
**When** they view any page,
**Then** the bell icon displays a red badge (bg `#ef4444`, white text, `rounded-full`) with the unread count.
**And** the badge disappears (or shows 0) when all notifications are read.
**And** the unread count is fetched via the existing `refetchInterval: 15000` pattern from notifications/page.tsx.

### AC-4: User menu dropdown on avatar click

**Given** the user is on any dashboard page,
**When** they click their avatar in the header,
**Then** a dropdown appears below-right of the avatar, containing:
- User display name (`user.firstName user.lastName`) — non-interactive
- User email — non-interactive, `text-slate-400`
- Divider
- "Settings" link → `/settings`
- "Sign out" button — calls the existing `logout()` from `useAuthStore` then redirects to `/login`

**And** the dropdown text for "Sign out" is `text-red-600`.
**And** clicking outside or pressing `Escape` closes the dropdown.
**And** the avatar no longer links directly to `/settings`.

### AC-5: Only one popover/dropdown open at a time

**Given** the notification popover is open,
**When** the user clicks the avatar,
**Then** the popover closes and the user menu opens (and vice versa).

---

## Technical Notes

- Use a single `activePanel: 'bell' | 'avatar' | null` state in Header to enforce mutual exclusion.
- Popover/dropdown positioning: `absolute right-0 top-full mt-2` relative to a `relative` wrapper on each button.
- Close-on-outside-click: `useEffect` with `mousedown` listener on `document`, check `!ref.current?.contains(e.target)`.
- Close-on-Escape: `keydown` listener, same pattern already used in modal components.
- The popover fetches `get('/notifications', { pageSize: 5 })` — reuse existing `get` helper from `@/lib/api`.
- Do not implement focus trap for the popover (lightweight dropdown, not a modal). Tab should close it.

---

## Files to Change

- `apps/admin-portal/src/components/layout/Header.tsx` — primary file
- No new files required; styles use existing Tailwind utilities and `cn()`.

---

## Reference

- `key-dashboard.html` mockup — popover open state visual
- EXPERIENCE.md — Notification Popover section, User Menu Dropdown section
- DESIGN.md — `components.notification-popover` tokens
- `.decision-log.md` — F-06, F-07, D-02, D-03
