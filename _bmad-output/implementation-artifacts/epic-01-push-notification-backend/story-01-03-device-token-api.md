---
epicId: 1
storyId: '01-03'
title: 'Device Token Registration API'
status: ready
priority: high
estimate: 2
dependencies:
  - '01-01'
---

# Story 1.3 — Device Token Registration API

## Story

**As a** mobile app user,
**I want** my device's push notification token to be registered with the backend when I log in and removed when I log out,
**so that** I receive push notifications on my device and stop receiving them after logging out.

---

## Context

This story creates two new Express route handlers under `/api/users/device-token` as specified in FR-1.11. The routes require authentication (`authenticate` middleware) and tenant context (`tenantId` from JWT). Device tokens are upserted (register) or deactivated (deregister) rather than hard-deleted, to maintain audit trail. Multiple devices per user are supported.

Depends on Story 1.1 (DeviceToken model must exist).

---

## Acceptance Criteria

### AC-1: POST `/api/users/device-token` registers a device token

**Given** an authenticated user sends `POST /api/users/device-token` with body `{ token: string, platform: 'ios' | 'android' }`,
**When** the token does not already exist for this user,
**Then** a new `DeviceToken` record is created with `userId`, `tenantId` (from JWT), `token`, `platform`, `isActive: true`.
**And** the response is `{ success: true, data: { id, token, platform, isActive } }` with HTTP 201.

### AC-2: POST `/api/users/device-token` upserts on duplicate token

**Given** an authenticated user sends `POST /api/users/device-token` with a token that already exists for this user,
**When** the existing record has `isActive: false` (previously deregistered),
**Then** the existing record is updated to `isActive: true` and `updatedAt` refreshed.
**And** no duplicate record is created.
**And** the response is `{ success: true, data: { id, token, platform, isActive } }` with HTTP 200.

### AC-3: POST `/api/users/device-token` validates input

**Given** an authenticated user sends `POST /api/users/device-token` with missing or invalid body,
**When** `token` is absent or `platform` is not `'ios'` or `'android'`,
**Then** the response is `{ success: false, error: 'Invalid request body' }` with HTTP 400.

### AC-4: DELETE `/api/users/device-token` deregisters the device token

**Given** an authenticated user sends `DELETE /api/users/device-token` with body `{ token: string }`,
**When** the token exists for this user and tenant,
**Then** the `DeviceToken` record is updated to `isActive: false`.
**And** the response is `{ success: true }` with HTTP 200.

### AC-5: DELETE `/api/users/device-token` is idempotent

**Given** an authenticated user sends `DELETE /api/users/device-token` with a token that does not exist or is already inactive,
**When** the request is processed,
**Then** the response is `{ success: true }` with HTTP 200 (no error thrown).

### AC-6: Routes are protected by `authenticate` middleware

**Given** a request to either endpoint without a valid JWT,
**When** the middleware runs,
**Then** the response is `{ success: false, error: 'Unauthorized' }` with HTTP 401.

### AC-7: Routes are registered in `app.ts`

**Given** the new route file `services/api/src/routes/deviceTokens.ts`,
**When** `services/api/src/app.ts` is updated,
**Then** the router is mounted at `/api/users` so that:
- `POST /api/users/device-token` resolves to the register handler
- `DELETE /api/users/device-token` resolves to the deregister handler

### AC-8: tenantId always scoped from JWT

**Given** any request to these endpoints,
**When** the handler runs,
**Then** `tenantId` is always taken from `req.user.tenantId` (set by `authenticate` middleware) — never from the request body or query string.

---

## Implementation Notes

### File location
`services/api/src/routes/deviceTokens.ts`

### Route structure

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

// POST /api/users/device-token
router.post('/device-token', authenticate, async (req: AuthRequest, res) => {
  // upsert logic using @@unique([userId, token])
});

// DELETE /api/users/device-token
router.delete('/device-token', authenticate, async (req: AuthRequest, res) => {
  // set isActive = false
});

export default router;
```

### Prisma upsert pattern for registration

```typescript
const result = await prisma.deviceToken.upsert({
  where: { userId_token: { userId: req.user!.userId, token: body.token } },
  update: { isActive: true, platform: body.platform },
  create: {
    userId: req.user!.userId,
    tenantId: req.user!.tenantId,
    token: body.token,
    platform: body.platform,
    isActive: true,
  },
});
```

Note: Prisma generates the `userId_token` compound unique name from `@@unique([userId, token])` in the schema.

### Registration in `app.ts`

Import and mount the router. The existing `/api/users` router in `app.ts` handles user CRUD. The device-token router should be mounted at `/api/users` as a separate router (not merged into the existing users router) to keep concerns separated:

```typescript
import deviceTokenRouter from './routes/deviceTokens';
app.use('/api/users', deviceTokenRouter);
```

---

## Out of Scope

- No permission check beyond authentication (any authenticated user can register/deregister their own tokens)
- No admin endpoint to list or revoke tokens for a user (deferred)
- Hard deletion of tokens (use soft deactivation — `isActive: false`)
- Token validation with FCM/APNs (the backend stores tokens as provided; validation happens implicitly when push is attempted)

---

## Definition of Done

- [ ] `services/api/src/routes/deviceTokens.ts` created
- [ ] POST endpoint: validates body, upserts DeviceToken, returns correct status codes
- [ ] DELETE endpoint: deactivates token, idempotent
- [ ] Both endpoints protected by `authenticate` middleware
- [ ] `tenantId` sourced from JWT only
- [ ] Router mounted in `app.ts`
- [ ] `pnpm type-check` passes
- [ ] Manual test: register token → verify DB record; deregister → verify isActive=false
