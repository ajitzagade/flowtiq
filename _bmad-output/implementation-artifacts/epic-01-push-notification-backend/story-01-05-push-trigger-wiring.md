---
epicId: 1
storyId: '01-05'
title: 'Push Trigger Wiring & Follow-Up Reminder Job'
status: review
priority: high
estimate: 5
dependencies:
  - '01-01'
  - '01-02'
---

# Story 1.5 — Push Trigger Wiring & Follow-Up Reminder Job

## Story

**As a** Flowtiq user,
**I want** to receive push notifications when events I care about happen (assignments, stage updates, document uploads, follow-up reminders),
**so that** I stay informed without having to actively check the portal.

---

## Context

This story wires the `sendPushNotification` function from Story 1.2 into all existing event-generating routes. The pattern is: call `sendPushNotification(...)` immediately after the existing `createNotification(...)` call in each route — same recipients, fire-and-forget, no await. Additionally, a daily cron job is created for follow-up reminders (due today and overdue) since these are time-based, not event-driven.

Key constraint: the existing route behavior must be completely unchanged. Push is additive only.

Depends on Stories 1.1 and 1.2.

---

## Acceptance Criteria

### AC-1: Stage assignment push notification (stages.ts)

**Given** a PATCH to `/api/stages/:id` that adds new users to `assignedToIds`,
**When** the stage is successfully updated,
**Then** `sendPushNotification` is called for each newly added assignee with:
- `payload.title`: `'Stage Assigned'`
- `payload.body`: `'You have been assigned to [stage name] on [project name]'`
- `payload.eventType`: `'stage_assigned'`
- `payload.entityType`: `'stage'`
- `payload.entityId`: the stage's ID
- `payload.deepLinkUrl`: `/projects/[projectId]`
- `preferenceCategory`: `'assignments'`

**And** the call is fire-and-forget (no `await`, no try/catch needed in the route).
**And** the existing `createNotification` calls are not removed or modified.

### AC-2: Stage status update push notification (stages.ts)

**Given** a PATCH to `/api/stages/:id` that changes `status`,
**When** the stage is successfully updated,
**Then** `sendPushNotification` is called for all members of the parent project (the same set that receives the existing in-app notification) with:
- `payload.title`: `'Stage Updated'`
- `payload.body`: `'[stage name] status changed to [new status] on [project name]'`
- `payload.eventType`: `'stage_status_updated'`
- `payload.entityType`: `'stage'`
- `payload.entityId`: the stage's ID
- `payload.deepLinkUrl`: `/projects/[projectId]`
- `preferenceCategory`: `'statusUpdates'`

### AC-3: Project assignment push notification (projects.ts)

**Given** a POST to `/api/projects` or PATCH to `/api/projects/:id` that sets or changes `assignedToId`,
**When** the project is successfully created/updated with an assignee,
**Then** `sendPushNotification` is called for the assigned user with:
- `payload.title`: `'Project Assigned'`
- `payload.body`: `'You have been assigned to project [project name]'`
- `payload.eventType`: `'project_assigned'`
- `payload.entityType`: `'project'`
- `payload.entityId`: the project's ID
- `payload.deepLinkUrl`: `/projects/[projectId]`
- `preferenceCategory`: `'assignments'`

### AC-4: Follow-up assignment push notification (followups.ts)

**Given** a POST to `/api/followups` or PATCH to `/api/followups/:id` that sets or changes `assignedToId`,
**When** the follow-up is successfully created/updated with an assignee,
**Then** `sendPushNotification` is called for the assigned user with:
- `payload.title`: `'Follow-up Assigned'`
- `payload.body`: `'You have a new follow-up: [follow-up title]'`
- `payload.eventType`: `'followup_assigned'`
- `payload.entityType`: `'followup'`
- `payload.entityId`: the follow-up's ID
- `payload.deepLinkUrl`: `/follow-ups`
- `preferenceCategory`: `'assignments'`

### AC-5: Sub-task assignment push notification (stages.ts)

**Given** a POST or PATCH to a sub-task endpoint that sets `assignedTo`,
**When** the sub-task is successfully created/updated with an assignee,
**Then** `sendPushNotification` is called for the assigned user with:
- `payload.title`: `'Sub-task Assigned'`
- `payload.body`: `'You have been assigned to a sub-task on [stage name]'`
- `payload.eventType`: `'subtask_assigned'`
- `payload.entityType`: `'subtask'`
- `payload.entityId`: the sub-task's ID
- `payload.deepLinkUrl`: `/projects/[projectId]`
- `preferenceCategory`: `'assignments'`

### AC-6: Document upload push notification (documents.ts)

**Given** a successful document upload via `POST /api/documents`,
**When** the document is saved,
**Then** `sendPushNotification` is called for all project members with:
- `payload.title`: `'Document Uploaded'`
- `payload.body`: `'A new document was uploaded to [project name]'`
- `payload.eventType`: `'document_uploaded'`
- `payload.entityType`: `'document'`
- `payload.entityId`: the document's ID
- `payload.deepLinkUrl`: `/documents`
- `preferenceCategory`: `'documentUploads'`

### AC-7: In-app notification push (notifications.ts)

**Given** any code path that calls the in-app `createNotification` function,
**When** a notification is created,
**Then** `sendPushNotification` is called for the notification's recipient user with:
- `payload.title`: `'New Notification'`
- `payload.body`: the notification's `message` field
- `payload.eventType`: `'notification_created'`
- `payload.entityType`: `'notification'`
- `payload.entityId`: the notification's ID
- `payload.deepLinkUrl`: `/notifications`
- `preferenceCategory`: based on the notification type (map to the closest category; default `'assignments'` if unknown)

Note: The `createNotification` function is currently inline in routes. This push call should be co-located in the same location.

### AC-8: Follow-up due-today cron job

**Given** a daily cron job runs at 08:00 UTC,
**When** it queries for follow-ups with `dueDate = today` and `status != 'completed'`,
**Then** `sendPushNotification` is called for each follow-up's `assignedToId` user with:
- `payload.title`: `'Follow-up Due Today'`
- `payload.body`: `'[follow-up title] is due today'`
- `payload.eventType`: `'followup_due_today'`
- `payload.entityType`: `'followup'`
- `payload.entityId`: the follow-up's ID
- `payload.deepLinkUrl`: `/follow-ups`
- `preferenceCategory`: `'followUpReminders'`

**And** the job is scoped to tenantId (queries all tenants' follow-ups, sending with correct tenantId per follow-up's `assignedToId` user's tenant).

### AC-9: Follow-up overdue cron job

**Given** the same daily cron job,
**When** it queries for follow-ups with `dueDate < today` (past due by 1+ days) and `status != 'completed'`,
**Then** `sendPushNotification` is called for each follow-up's `assignedToId` user with:
- `payload.title`: `'Follow-up Overdue'`
- `payload.body`: `'[follow-up title] is overdue'`
- `payload.eventType`: `'followup_overdue'`
- `payload.entityType`: `'followup'`
- `payload.entityId`: the follow-up's ID
- `payload.deepLinkUrl`: `/follow-ups`
- `preferenceCategory`: `'followUpReminders'`

### AC-10: Cron job is fire-and-forget per notification

**Given** the cron job sends notifications to multiple users,
**When** one user's push fails,
**Then** the job continues to process remaining follow-ups.
**And** all errors are caught and logged; the job never throws an unhandled rejection.

### AC-11: Existing route behavior unchanged

**Given** all modified routes (stages.ts, projects.ts, followups.ts, documents.ts),
**When** `sendPushNotification` is added,
**Then** the HTTP response timing, response shape, and error behavior of each route are identical to before this change.
**And** no existing tests fail.

---

## Implementation Notes

### Calling pattern in routes (no await)

```typescript
// After existing createNotification call:
createNotification(/* existing args */); // existing, unchanged

// New — fire-and-forget, no await, no try/catch needed:
sendPushNotification(userId, tenantId, payload, 'assignments');
```

### Cron job file location
`services/api/src/jobs/followup-reminders.ts`

### Cron job schedule

Use the `node-cron` package (or `cron` — check if already installed; if not, add `node-cron`):

```typescript
import cron from 'node-cron';

// Schedule: 08:00 UTC daily
cron.schedule('0 8 * * *', async () => {
  // query due today and overdue
  // call sendPushNotification for each
});
```

Register the cron job in `services/api/src/app.ts` or `services/api/src/index.ts` (wherever the server starts).

### Date boundary for "due today"

```typescript
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

// Due today: dueDate >= today AND dueDate < tomorrow
const dueToday = await prisma.followUp.findMany({
  where: {
    dueDate: { gte: today, lt: tomorrow },
    status: { not: 'completed' },
    assignedToId: { not: null },
  },
  include: { user: { select: { tenantId: true } } },
});
```

### Checking which recipients to notify (for broadcast events)

For stage status updates and document uploads, the recipients are "all project team members." Use the existing `project.teamMembers` array (which is already populated for project-level events in the existing routes). Iterate over each member and call `sendPushNotification` for each.

### tenantId source in routes

Always use the tenantId from the authenticated request (`req.user.tenantId`) when calling `sendPushNotification` in routes. For the cron job, use the tenantId from the follow-up's associated user.

---

## Out of Scope

- Push notification for in-app notification bell updates (the polling mechanism remains unchanged)
- Analytics tracking of push delivery rates
- Retry logic for failed push sends
- User timezone support for cron job (08:00 UTC for all in Phase 2)

---

## Definition of Done

- [x] `sendPushNotification` called in `stages.ts` for stage assignment (AC-1)
- [x] `sendPushNotification` called in `stages.ts` for stage status update (AC-2)
- [x] `sendPushNotification` called in `projects.ts` for project assignment (AC-3)
- [x] `sendPushNotification` called in `followups.ts` for follow-up assignment (AC-4)
- [x] `sendPushNotification` called in `stages.ts` for sub-task assignment (AC-5)
- [x] `sendPushNotification` called in `documents.ts` for document upload (AC-6)
- [x] `services/api/src/jobs/followup-reminders.ts` created with due-today and overdue queries (AC-8, AC-9)
- [x] Cron job registered in app startup
- [x] All calls are fire-and-forget (no `await`)
- [x] All existing route tests still pass
- [x] `pnpm type-check` passes
