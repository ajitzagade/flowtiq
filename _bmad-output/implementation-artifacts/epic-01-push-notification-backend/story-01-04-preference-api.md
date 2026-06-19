---
epicId: 1
storyId: '01-04'
title: 'Notification Preference API'
status: ready
priority: high
estimate: 2
dependencies:
  - '01-01'
---

# Story 1.4 — Notification Preference API

## Story

**As a** Flowtiq user,
**I want** to get and update my notification preferences per category from the Settings page,
**so that** I only receive push notifications for the types of events I care about.

---

## Context

This story creates two endpoints for reading and updating a user's notification preferences. Preferences are stored server-side in `UserNotificationPreference` (created in Story 1.1). The GET endpoint auto-creates a default row (all enabled) if none exists, so the UI never needs to handle a "no preferences" state. The PATCH endpoint supports partial updates. The four categories map directly to FR-1.4: Assignments, Status Updates, Document Uploads, Follow-up Reminders.

Depends on Story 1.1 (UserNotificationPreference model must exist).

---

## Acceptance Criteria

### AC-1: GET `/api/users/notification-preferences` returns current preferences

**Given** an authenticated user sends `GET /api/users/notification-preferences`,
**When** a `UserNotificationPreference` row exists for this user + tenant,
**Then** the response is `{ success: true, data: { assignments, statusUpdates, documentUploads, followUpReminders } }` with HTTP 200.

### AC-2: GET auto-creates default preferences if none exist

**Given** an authenticated user has no `UserNotificationPreference` row,
**When** they send `GET /api/users/notification-preferences`,
**Then** a new row is created with all four preferences set to `true`.
**And** the response returns the newly created defaults with HTTP 200.
**And** subsequent GETs return the same row (no duplicate creation).

### AC-3: PATCH `/api/users/notification-preferences` updates preferences

**Given** an authenticated user sends `PATCH /api/users/notification-preferences` with a partial body such as `{ assignments: false }`,
**When** the request is processed,
**Then** only the provided fields are updated; unspecified fields remain unchanged.
**And** the response is `{ success: true, data: { assignments, statusUpdates, documentUploads, followUpReminders } }` with the updated values and HTTP 200.

### AC-4: PATCH auto-creates row if none exists (upsert behavior)

**Given** an authenticated user has no preference row,
**When** they send `PATCH /api/users/notification-preferences` with `{ followUpReminders: false }`,
**Then** a new row is created with `followUpReminders: false` and all other fields `true`.
**And** the response returns the created state with HTTP 200.

### AC-5: PATCH validates input

**Given** an authenticated user sends `PATCH /api/users/notification-preferences` with invalid body,
**When** any provided preference value is not a boolean,
**Then** the response is `{ success: false, error: 'Invalid request body' }` with HTTP 400.

**And** when no valid fields are provided in the body (empty object `{}`), the response is HTTP 200 with the current unchanged preferences (no-op update is valid).

### AC-6: Both routes protected by `authenticate` middleware

**Given** a request without a valid JWT,
**When** the middleware runs,
**Then** the response is `{ success: false, error: 'Unauthorized' }` with HTTP 401.

### AC-7: tenantId always scoped from JWT

**Given** any request to these endpoints,
**When** the handler runs,
**Then** `tenantId` is always taken from `req.user.tenantId` — never from the request body.

### AC-8: Routes registered in `app.ts`

**Given** the route file `services/api/src/routes/notificationPreferences.ts`,
**When** `app.ts` is updated,
**Then**:
- `GET /api/users/notification-preferences` resolves correctly
- `PATCH /api/users/notification-preferences` resolves correctly

---

## Implementation Notes

### File location
`services/api/src/routes/notificationPreferences.ts`

### Zod validation schema

```typescript
const preferencePatchSchema = z.object({
  assignments: z.boolean().optional(),
  statusUpdates: z.boolean().optional(),
  documentUploads: z.boolean().optional(),
  followUpReminders: z.boolean().optional(),
});
```

### GET — upsert pattern for auto-create

```typescript
const prefs = await prisma.userNotificationPreference.upsert({
  where: { userId_tenantId: { userId: req.user!.userId, tenantId: req.user!.tenantId } },
  update: {},
  create: {
    userId: req.user!.userId,
    tenantId: req.user!.tenantId,
    assignments: true,
    statusUpdates: true,
    documentUploads: true,
    followUpReminders: true,
  },
});
```

Note: Prisma generates the compound unique name `userId_tenantId` from `@@unique([userId, tenantId])`.

### PATCH — partial update

```typescript
const prefs = await prisma.userNotificationPreference.upsert({
  where: { userId_tenantId: { userId: req.user!.userId, tenantId: req.user!.tenantId } },
  update: body, // only the fields present in the validated body
  create: {
    userId: req.user!.userId,
    tenantId: req.user!.tenantId,
    assignments: true,
    statusUpdates: true,
    documentUploads: true,
    followUpReminders: true,
    ...body, // override defaults with provided values
  },
});
```

### Registration in `app.ts`

```typescript
import notificationPreferencesRouter from './routes/notificationPreferences';
app.use('/api/users', notificationPreferencesRouter);
```

### Response shape

Always return only the four preference booleans — not the full DB row (no id, userId, tenantId in response):

```typescript
const { assignments, statusUpdates, documentUploads, followUpReminders } = prefs;
res.json({ success: true, data: { assignments, statusUpdates, documentUploads, followUpReminders } });
```

---

## Out of Scope

- Per-event-type granularity (categories only, as per FR-1.4)
- Admin ability to override user preferences
- Preference inheritance from tenant-level defaults

---

## Definition of Done

- [ ] `services/api/src/routes/notificationPreferences.ts` created
- [ ] GET endpoint: auto-creates defaults, returns current preferences
- [ ] PATCH endpoint: partial update, upsert behavior
- [ ] Zod validation on PATCH body
- [ ] Both endpoints protected by `authenticate` middleware
- [ ] `tenantId` sourced from JWT only
- [ ] Routers mounted in `app.ts`
- [ ] `pnpm type-check` passes
- [ ] Manual test: GET with no preferences → defaults created; PATCH one field → others unchanged
