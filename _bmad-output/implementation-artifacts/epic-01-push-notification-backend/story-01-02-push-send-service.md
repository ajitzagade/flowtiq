---
epicId: 1
storyId: '01-02'
title: 'Firebase Push Send Service'
status: review
priority: high
estimate: 3
dependencies:
  - '01-01'
---

# Story 1.2 — Firebase Push Send Service

## Story

**As a** backend service,
**I want** a centralized, fire-and-forget push notification library,
**so that** any route that triggers events can send push notifications without risking main flow errors or blocking the response.

---

## Context

This story creates `services/api/src/lib/push.ts` — the single entry point for all push notification delivery. It follows the exact same fire-and-forget pattern as the existing `services/api/src/lib/audit.ts`: never throws, never awaits in callers, always resolves. FCM HTTP v1 API is used for both Android and iOS (via Firebase Admin SDK). Per-tenant credentials are fetched from `TenantPushCredentials`. User preferences are checked before sending.

Depends on Story 1.1 (database models must exist).

---

## Acceptance Criteria

### AC-1: `push.ts` library file created

**Given** the path `services/api/src/lib/push.ts`,
**When** the file is created,
**Then** it exports a single primary function `sendPushNotification` with the signature:

```typescript
export async function sendPushNotification(
  userId: string,
  tenantId: string,
  payload: PushNotificationPayload,
  preferenceCategory: keyof NotificationPreferences
): Promise<void>
```

**And** the function is fire-and-forget: it never throws an error to the caller, catches all internal errors and logs them with `console.error`.

### AC-2: Preference check before sending

**Given** a call to `sendPushNotification` with `preferenceCategory: 'assignments'`,
**When** the user's `UserNotificationPreference.assignments` is `false`,
**Then** the function returns early without sending any notification.

**And** when no `UserNotificationPreference` row exists for the user, the function treats all preferences as `true` (default enabled per FR-1.4).

### AC-3: Active device tokens fetched per user

**Given** a user with multiple registered devices,
**When** `sendPushNotification` is called,
**Then** the function queries `DeviceToken` where `userId = userId AND tenantId = tenantId AND isActive = true`.
**And** if no active tokens exist, the function returns early without attempting FCM calls.

### AC-4: Tenant FCM credentials fetched and validated

**Given** a tenant with a `TenantPushCredentials` row where `isActive = true`,
**When** `sendPushNotification` runs,
**Then** the function uses that tenant's `fcmServerKey` / `fcmProjectId` to initialize the Firebase Admin SDK.

**And** if no credentials exist, or `isActive = false`, the function logs a warning and returns early without error.

### AC-5: FCM HTTP v1 API used for delivery

**Given** valid credentials and active device tokens,
**When** the function sends notifications,
**Then** it uses the Firebase Admin SDK (`firebase-admin` package) initialized with per-tenant credentials.
**And** it sends to each device token individually using `admin.messaging().send(message)`.
**And** the FCM message includes: `notification.title`, `notification.body`, and `data` fields for all `PushNotificationPayload` fields (eventType, entityType, entityId, deepLinkUrl) as string values.

### AC-6: Invalid token cleanup

**Given** FCM returns an error indicating a token is invalid or unregistered (`messaging/invalid-registration-token` or `messaging/registration-token-not-registered`),
**When** sending to that token fails,
**Then** the function sets `isActive = false` on that `DeviceToken` record in the database.
**And** the failure for one token does not prevent delivery to other tokens for the same user.

### AC-7: Per-tenant Firebase Admin SDK instance management

**Given** multiple tenants with different FCM credentials,
**When** `sendPushNotification` is called for different tenants in the same process,
**Then** each tenant's SDK instance is initialized separately (using named apps: `firebase-app-{tenantId}`).
**And** already-initialized apps are reused rather than re-initialized on every call.

### AC-8: Error isolation — never throws

**Given** any error during the push flow (DB error, FCM error, network error),
**When** the error occurs inside `sendPushNotification`,
**Then** the error is caught, logged via `console.error('Push notification error:', error)`, and the function returns without re-throwing.
**And** the calling route's main flow (e.g. stage update, project assignment) is never affected.

---

## Implementation Notes

### Package to install

```bash
pnpm add firebase-admin --filter @flowtiq/api
```

### File location
`services/api/src/lib/push.ts`

### Pattern reference
Mirror the structure of `services/api/src/lib/audit.ts` — wrap the entire body in try/catch, log errors, never re-throw.

### Firebase Admin SDK initialization pattern

```typescript
import admin from 'firebase-admin';

function getFirebaseApp(tenantId: string, credentials: TenantPushCredentials): admin.app.App {
  const appName = `firebase-app-${tenantId}`;
  try {
    return admin.app(appName);
  } catch {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: credentials.fcmProjectId!,
        clientEmail: credentials.fcmServerKey!, // adjust field mapping per actual FCM service account format
        privateKey: credentials.apnsPrivateKey!,
      }),
    }, appName);
  }
}
```

Note: The exact Firebase Admin credential fields depend on the service account JSON format. The `TenantPushCredentials` fields `fcmServerKey` and `fcmProjectId` are used for Android/FCM. For iOS, APNs credentials (`apnsKeyId`, `apnsTeamId`, `apnsPrivateKey`, `apnsBundleId`) are configured as an additional APNs configuration in Firebase.

### FCM message format

```typescript
const message: admin.messaging.Message = {
  token: deviceToken.token,
  notification: {
    title: payload.title,
    body: payload.body,
  },
  data: {
    eventType: payload.eventType,
    entityType: payload.entityType,
    entityId: payload.entityId,
    deepLinkUrl: payload.deepLinkUrl,
  },
  android: {
    priority: 'high',
  },
  apns: {
    payload: {
      aps: {
        sound: 'default',
      },
    },
  },
};
```

### Preference category mapping

| `preferenceCategory` | Controls |
|---|---|
| `'assignments'` | project assigned, stage assigned, sub-task assigned, follow-up assigned |
| `'statusUpdates'` | stage status updated, sub-task status changed |
| `'documentUploads'` | document uploaded |
| `'followUpReminders'` | follow-up due today, overdue |

---

## Out of Scope

- APNs direct integration (FCM handles iOS delivery via Firebase; direct APNs connection is not needed)
- Batch FCM sends (send individually per token to enable per-token error handling)
- Retry logic (fire-and-forget; failed deliveries are not retried in Phase 2)
- Push analytics or delivery tracking beyond token cleanup

---

## Definition of Done

- [x] `firebase-admin` package added to `services/api`
- [x] `services/api/src/lib/push.ts` created with `sendPushNotification` export
- [x] Preference check implemented (early return if disabled)
- [x] Active token fetch implemented
- [x] Tenant credential fetch and Firebase SDK initialization implemented
- [x] Per-token send with invalid-token cleanup implemented
- [x] All errors caught — function never throws
- [x] `pnpm type-check` passes
- [x] Manual test: calling `sendPushNotification` with a non-existent userId returns without error
