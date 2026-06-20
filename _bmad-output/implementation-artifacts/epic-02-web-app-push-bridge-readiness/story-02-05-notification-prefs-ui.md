---
epicId: 2
storyId: '02-05'
title: 'Notification Preferences UI in Settings'
status: review
priority: medium
estimate: 3
dependencies:
  - '01-04'
baseline_commit: 528009ab878b0bc791797c1055c2a2c0d2e02673
---

# Story 2.5 — Notification Preferences UI in Settings

## Story

**As a** Flowtiq user,
**I want** to manage my push notification preferences from the Settings page,
**so that** I can control which types of notifications I receive on my devices.

---

## Context

This story adds a "Notifications" section to the existing Settings page. It uses the `GET/PATCH /api/users/notification-preferences` endpoints created in Story 1.4. The UI follows the existing Settings page patterns (TanStack Query for data, toggle switches for booleans). The section is available to all authenticated users regardless of role.

Depends on Story 1.4 (Notification Preference API).

---

## Acceptance Criteria

### AC-1: Settings page has a Notifications section

**Given** any authenticated user navigates to the Settings page,
**When** the page loads,
**Then** a "Notifications" section is visible (either as a new tab alongside existing tabs, or as a new card/section within the page — match the existing layout pattern).

**And** the section heading is "Notification Preferences" or "Notifications".
**And** the section is accessible to all roles (no permission gate).

### AC-2: Preferences loaded via TanStack Query on mount

**Given** the Notifications section renders,
**When** the component mounts,
**Then** `GET /api/users/notification-preferences` is called using `useQuery` from TanStack React Query.
**And** the query key follows the existing project convention (e.g. `['notification-preferences']`).
**And** a loading skeleton or spinner is shown while the request is in-flight (consistent with other Settings tabs).

### AC-3: Four toggle switches displayed

**Given** preferences are loaded successfully,
**When** the section renders,
**Then** four toggle switches are shown, each with a label and descriptive sub-text:

| Toggle label | Sub-text |
|---|---|
| Assignments | Project, stage, sub-task, and follow-up assignments |
| Status Updates | Stage and sub-task status changes on my projects |
| Document Uploads | Documents uploaded to my projects |
| Follow-up Reminders | Due today and overdue follow-up alerts |

**And** each toggle reflects the current value from the API response.

### AC-4: Toggle change immediately calls PATCH

**Given** the user clicks a toggle switch,
**When** the toggle changes state,
**Then** `PATCH /api/users/notification-preferences` is called immediately with the changed field.
**And** the toggle state updates optimistically (does not wait for the API response to flip the visual state).
**And** if the API call fails, the toggle reverts to its previous state and an error toast is shown.

### AC-5: Each toggle updates independently

**Given** four toggle switches,
**When** the user toggles "Assignments" to off,
**Then** only `{ assignments: false }` is sent in the PATCH body.
**And** the other three preference values are not included in the request.
**And** the API response is used to confirm the updated state.

### AC-6: Loading state on individual toggles

**Given** a PATCH request is in-flight for one preference,
**When** waiting for the response,
**Then** that specific toggle is disabled (cannot be toggled again until the request completes).
**And** the other three toggles remain interactive.

### AC-7: Error handling

**Given** the initial GET request fails,
**When** TanStack Query reports an error,
**Then** an error message is shown in the Notifications section (e.g. "Failed to load notification preferences").
**And** a retry button or automatic retry is available (use TanStack Query's default retry behavior).

### AC-8: Consistent styling with existing Settings page

**Given** the existing Settings page tabs (Branding, General, Security, etc.),
**When** the Notifications section is added,
**Then** it uses the same component patterns:
- Same card or panel container style
- Same toggle switch component (if one exists in the project — check before creating a new one)
- Same heading hierarchy
- No new design system components introduced unless the project has none

**And** the Notifications section appears in the correct tab order or position within the Settings page layout.

### AC-9: TanStack Query mutation used for PATCH

**Given** the PATCH calls,
**When** a toggle changes,
**Then** `useMutation` from TanStack React Query is used (consistent with other mutation patterns in the project).
**And** on mutation success, the `['notification-preferences']` query is invalidated to sync with server state.

### AC-10: TypeScript compiles cleanly

**Given** all new components and hooks,
**When** `pnpm type-check` runs,
**Then** zero new TypeScript errors are introduced.

---

## Implementation Notes

### Read before implementing

Read `apps/admin-portal/src/app/(dashboard)/settings/page.tsx` before implementing to understand:
- Current tab structure (which tabs exist, how they are implemented)
- Existing toggle component patterns
- TanStack Query usage patterns in Settings
- The toast/notification pattern used for save success/failure

### API client calls

Use the existing `api.get` and `api.patch` from `src/lib/api.ts`:

```typescript
// GET
const { data } = await api.get<{ success: boolean, data: NotificationPreferences }>('/users/notification-preferences');

// PATCH
await api.patch('/users/notification-preferences', { [field]: newValue });
```

### TanStack Query pattern

```typescript
const { data: prefs, isLoading, isError } = useQuery({
  queryKey: ['notification-preferences'],
  queryFn: async () => {
    const res = await api.get<{ success: boolean; data: NotificationPreferences }>('/users/notification-preferences');
    return res.data.data;
  },
});

const mutation = useMutation({
  mutationFn: async (update: Partial<NotificationPreferences>) => {
    await api.patch('/users/notification-preferences', update);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
  },
  onError: () => {
    // revert optimistic update + show toast
  },
});
```

### Optimistic update pattern

```typescript
const handleToggle = (field: keyof NotificationPreferences, currentValue: boolean) => {
  // Optimistic update
  queryClient.setQueryData(['notification-preferences'], (old: NotificationPreferences) => ({
    ...old,
    [field]: !currentValue,
  }));
  // Trigger mutation
  mutation.mutate({ [field]: !currentValue });
};
```

### Type import

Import `NotificationPreferences` from `@flowtiq/shared-types` (added in Story 1.1).

---

## Out of Scope

- Per-event-type granularity within categories (only the 4 categories from FR-1.4)
- Email notification preferences (push only)
- Admin ability to manage other users' preferences
- Notification preview / test notification button

---

## Definition of Done

- [x] Notifications section added to Settings page (matches existing tab/card pattern)
- [x] Four toggle switches rendered with labels and sub-text
- [x] `useQuery` fetches preferences on mount; loading/error states handled
- [x] `useMutation` used for PATCH on each toggle change
- [x] Optimistic update with revert on error
- [x] Toast shown on error
- [x] Each toggle updates independently (correct partial PATCH body)
- [x] Visible to all roles
- [x] `pnpm type-check` passes
- [x] Existing Settings E2E tests still pass

## Dev Agent Record

### File List
- apps/admin-portal/src/app/(dashboard)/settings/page.tsx (modified — PushNotificationPreferences component added)

### Completion Notes
Added `PushNotificationPreferences` sub-component within the existing Notifications tab (below the existing tenant-level notification settings card). Uses `useQuery` with key `['notification-preferences']`, `useMutation` for PATCH with optimistic updates that revert on error. Each toggle sends only its own field (`{ [field]: value }`) as partial PATCH body. `pendingField` state disables only the toggled switch while in-flight. `NotificationPreferences` type imported from `@flowtiq/shared-types`. `pnpm type-check` passes with zero errors.
