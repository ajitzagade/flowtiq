---
epicId: 1
storyId: '01-01'
title: 'Push Infrastructure Database Schema'
status: ready
priority: high
estimate: 3
---

# Story 1.1 — Push Infrastructure Database Schema

## Story

**As a** backend developer,
**I want** the database to store device tokens, per-user notification preferences, and per-tenant FCM/APNs credentials,
**so that** the push notification system has a reliable, isolated, multi-tenant data foundation.

---

## Context

This is the foundational story for Epic 1. All subsequent push stories depend on these models. No existing models are modified — three new models are added to the Prisma schema. The existing `Notification` model and in-app notification flow remain untouched.

---

## Acceptance Criteria

### AC-1: DeviceToken model added to Prisma schema

**Given** the schema at `packages/database/prisma/schema.prisma`,
**When** the migration runs,
**Then** a `device_tokens` table exists with columns: `id` (cuid), `userId`, `tenantId`, `token`, `platform` (string, 'ios' | 'android'), `isActive` (boolean, default true), `createdAt`, `updatedAt`.

**And** a unique constraint exists on `[userId, token]` (prevents duplicate token registrations for the same user).
**And** indexes exist on `userId` and `tenantId` for query performance.
**And** cascade deletes are configured: deleting a `User` or `Tenant` removes their device tokens.

### AC-2: UserNotificationPreference model added to Prisma schema

**Given** the schema at `packages/database/prisma/schema.prisma`,
**When** the migration runs,
**Then** a `user_notification_preferences` table exists with columns: `id` (cuid), `userId`, `tenantId`, `assignments` (boolean, default true), `statusUpdates` (boolean, default true), `documentUploads` (boolean, default true), `followUpReminders` (boolean, default true).

**And** a unique constraint exists on `[userId, tenantId]` (one preference row per user per tenant).
**And** cascade deletes are configured for User and Tenant relations.

### AC-3: TenantPushCredentials model added to Prisma schema

**Given** the schema at `packages/database/prisma/schema.prisma`,
**When** the migration runs,
**Then** a `tenant_push_credentials` table exists with columns: `id` (cuid), `tenantId` (unique), `fcmServerKey` (nullable), `fcmProjectId` (nullable), `apnsKeyId` (nullable), `apnsTeamId` (nullable), `apnsPrivateKey` (nullable), `apnsBundleId` (nullable), `isActive` (boolean, default true), `createdAt`, `updatedAt`.

**And** the `tenantId` field has a `@unique` constraint (one credential set per tenant).
**And** cascade delete is configured for the Tenant relation.

### AC-4: Tenant and User models updated with reverse relations

**Given** the existing `Tenant` model in schema.prisma,
**When** the new models are added,
**Then** the `Tenant` model includes reverse relation fields: `deviceTokens DeviceToken[]`, `notificationPreferences UserNotificationPreference[]`, `pushCredentials TenantPushCredentials?`.

**And** the `User` model includes reverse relation fields: `deviceTokens DeviceToken[]`, `notificationPreferences UserNotificationPreference[]`.

### AC-5: Shared types package updated

**Given** the `packages/shared-types/src/index.ts` file,
**When** the story is complete,
**Then** the following TypeScript interfaces are exported:
- `DeviceToken` — matches the Prisma model shape (id, userId, tenantId, token, platform, isActive, createdAt, updatedAt)
- `NotificationPreferences` — shape: `{ assignments: boolean, statusUpdates: boolean, documentUploads: boolean, followUpReminders: boolean }`
- `PushNotificationPayload` — shape: `{ title: string, body: string, eventType: string, entityType: string, entityId: string, deepLinkUrl: string }`
- `DevicePlatform` — type alias: `'ios' | 'android'`

### AC-6: Prisma client regenerated and database pushed

**Given** the updated schema,
**When** `pnpm db:generate` and `pnpm db:push` are run from the project root,
**Then** the commands complete without error.
**And** the Prisma client in `packages/database/node_modules/.prisma/client` reflects the three new models.
**And** TypeScript compilation (`pnpm type-check`) passes with zero errors.

---

## Implementation Notes

### Schema additions (append to `packages/database/prisma/schema.prisma`)

```prisma
model DeviceToken {
  id        String   @id @default(cuid())
  userId    String
  tenantId  String
  token     String
  platform  String   // 'ios' | 'android'
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, token])
  @@index([userId])
  @@index([tenantId])
  @@map("device_tokens")
}

model UserNotificationPreference {
  id                String  @id @default(cuid())
  userId            String
  tenantId          String
  assignments       Boolean @default(true)
  statusUpdates     Boolean @default(true)
  documentUploads   Boolean @default(true)
  followUpReminders Boolean @default(true)

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@map("user_notification_preferences")
}

model TenantPushCredentials {
  id             String   @id @default(cuid())
  tenantId       String   @unique
  fcmServerKey   String?
  fcmProjectId   String?
  apnsKeyId      String?
  apnsTeamId     String?
  apnsPrivateKey String?
  apnsBundleId   String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_push_credentials")
}
```

### Reverse relation fields to add in existing models

In the `Tenant` model, add:
```prisma
deviceTokens           DeviceToken[]
notificationPreferences UserNotificationPreference[]
pushCredentials        TenantPushCredentials?
```

In the `User` model, add:
```prisma
deviceTokens           DeviceToken[]
notificationPreferences UserNotificationPreference[]
```

### Shared types additions (`packages/shared-types/src/index.ts`)

Append these exports. Do not remove or modify any existing exports.

```typescript
export type DevicePlatform = 'ios' | 'android';

export interface DeviceToken {
  id: string;
  userId: string;
  tenantId: string;
  token: string;
  platform: DevicePlatform;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  assignments: boolean;
  statusUpdates: boolean;
  documentUploads: boolean;
  followUpReminders: boolean;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  eventType: string;
  entityType: string;
  entityId: string;
  deepLinkUrl: string;
}
```

---

## Out of Scope

- No seed data for the new models (credentials are set manually by a Flowtiq engineer)
- No admin UI for managing TenantPushCredentials (deferred to future phase per FR-1.5 / Decision #8)
- No migration file needed — `pnpm db:push` is used for local and Railway deploys (matching existing project pattern)
- Do NOT modify the existing `Notification` model or any existing relations

---

## Definition of Done

- [ ] All three Prisma models added to schema.prisma
- [ ] Tenant and User models have correct reverse relations
- [ ] `pnpm db:generate` passes
- [ ] `pnpm db:push` passes
- [ ] `pnpm type-check` passes
- [ ] Four new interfaces exported from `packages/shared-types/src/index.ts`
- [ ] No existing tests broken
