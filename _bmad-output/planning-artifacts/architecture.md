---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-Flowtiq-2026-06-19/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-Flowtiq-2026-06-19/addendum.md'
  - '_bmad-output/project-context.md'
  - 'packages/database/prisma/schema.prisma'
  - 'services/api/src/routes/stages.ts'
  - 'services/api/src/routes/notifications.ts'
  - 'services/api/src/routes/auth.ts'
  - 'services/api/src/lib/jwt.ts'
  - 'services/api/src/lib/audit.ts'
  - 'apps/admin-portal/src/app/(dashboard)/layout.tsx'
  - 'apps/admin-portal/src/components/layout/Sidebar.tsx'
  - 'apps/admin-portal/src/lib/api.ts'
  - 'apps/admin-portal/src/store/auth.ts'
  - 'packages/shared-types/src/index.ts'
workflowType: 'architecture'
project_name: 'Flowtiq'
user_name: 'Ajit'
date: '2026-06-19'
---

# Architecture Decision Document — Flowtiq Phase 2

_Push Notifications & Mobile App (React Native + WebView Hybrid)_

---

## 1. System Overview

### 1.1 Current Architecture (As-Is)

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel (CDN)                                               │
│  apps/admin-portal  ─ Next.js 14 App Router (port 3000)    │
│  - All pages 'use client'                                   │
│  - Zustand auth store (localStorage persist)               │
│  - TanStack Query + Axios (auto-refresh on 401)            │
│  - Tailwind CSS, responsive layout                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (Next.js rewrites /api/*)
┌──────────────────────▼──────────────────────────────────────┐
│  Railway (Docker)                                           │
│  services/api  ─ Express.js 4 + TypeScript (port 3001)     │
│  - authenticate middleware → JWT verify                     │
│  - requirePermission / requireAnyPermission (RBAC)         │
│  - 15 routers: auth, projects, stages, followups...        │
│  - createAuditLog() fire-and-forget after mutations        │
│  - createNotification() inline in route handlers           │
└──────────────────────┬──────────────────────────────────────┘
                       │ Prisma ORM
┌──────────────────────▼──────────────────────────────────────┐
│  PostgreSQL (Railway)                                       │
│  21 models: Tenant, User, RefreshToken, Role, Permission,  │
│  UserRole, RolePermission, WorkflowTemplate, Project,      │
│  ProjectWorkflow, ProjectStage, StageSubTask, StageHistory, │
│  FollowUp, FollowUpHistory, Document, DocumentVersion,     │
│  AuditLog, Notification                                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Target Architecture (Phase 2)

```
┌─────────────────────────────────────────────────────────────┐
│  MOBILE (Per-Tenant White-Label)                           │
│  apps/mobile  ─ React Native (iOS 15+ / Android API 26+)  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Native Shell Layer                                 │   │
│  │  - FCM/APNs push registration & routing            │   │
│  │  - Deep links (Universal Links / App Links)        │   │
│  │  - Native nav (tab bar / bottom nav)               │   │
│  │  - Splash screen                                   │   │
│  │  - Offline overlay (NetInfo)                       │   │
│  │  - Keychain/Keystore (JWT storage)                 │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │ postMessage / injectedJavaScript      │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │  WebView Bridge                                     │   │
│  │  NativeBridge.js SDK (injected at WebView init)    │   │
│  │  window.NativeBridge.postMessage(type, payload)    │   │
│  │  window.dispatchEvent(NativeBridgeResponse)        │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │ Loads tenant Vercel URL               │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │  Web App Layer (existing Next.js in WebView)       │   │
│  │  - Auth: token injected via CookieManager          │   │
│  │  - NativeBridge detection (window.NativeBridge)   │   │
│  │  - File upload → bridge → DocumentPicker/Camera   │   │
│  │  - Service Worker (app shell cache)               │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│  Railway (Docker) — Express API (extended)                  │
│  NEW: services/api/src/lib/push.ts  ─ FCM send service     │
│  NEW: /api/users/device-token  ─ token register/deregister │
│  NEW: /api/users/notification-preferences                   │
│  MODIFIED: Notification creation → also triggers push      │
└──────────────────────┬──────────────────────────────────────┘
                       │ Prisma
┌──────────────────────▼──────────────────────────────────────┐
│  PostgreSQL — 3 new models added                           │
│  + DeviceToken                                             │
│  + UserNotificationPreference                              │
│  + TenantPushCredentials                                   │
└─────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Firebase (per-tenant projects)                            │
│  FCM → Android devices                                     │
│  APNs (via FCM or direct) → iOS devices                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Monorepo Structure Changes

### 2.1 New Package: `apps/mobile`

The React Native app is added as a new Turborepo workspace package alongside the existing `apps/admin-portal`.

```
flowtiq/                          ← repo root
├── apps/
│   ├── admin-portal/             ← existing Next.js (unchanged)
│   └── mobile/                   ← NEW React Native app
│       ├── android/              ← Android native project
│       ├── ios/                  ← iOS native project
│       ├── src/
│       │   ├── bridge/           ← NativeBridge implementation
│       │   │   ├── NativeBridge.ts        ← native side handler
│       │   │   └── NativeBridge.web.js    ← SDK injected into WebView
│       │   ├── navigation/       ← React Navigation setup
│       │   │   └── AppNavigator.tsx
│       │   ├── screens/          ← Native screens (splash, offline)
│       │   │   ├── SplashScreen.tsx
│       │   │   ├── OfflineScreen.tsx
│       │   │   └── WebViewScreen.tsx      ← main screen (loads web app)
│       │   ├── services/
│       │   │   ├── push.ts               ← FCM token + notification handling
│       │   │   ├── deeplink.ts           ← Universal/App Link handling
│       │   │   ├── auth.ts               ← Keychain/Keystore token storage
│       │   │   └── cookieManager.ts      ← token injection into WebView
│       │   ├── hooks/
│       │   │   └── useNetworkStatus.ts
│       │   └── config/
│       │       └── tenant.ts             ← per-tenant build config (env vars)
│       ├── .env.vastudeep               ← tenant-specific env (gitignored)
│       ├── package.json
│       └── index.js
├── packages/
│   ├── shared-types/             ← extended with DeviceToken, NotifPref types
│   ├── database/                 ← schema extended with 3 new models
│   │   └── prisma/schema.prisma
│   ├── permissions/
│   ├── auth/
│   └── api-client/
├── services/
│   └── api/                      ← extended with push service + 2 new routes
│       └── src/
│           ├── lib/
│           │   └── push.ts       ← NEW: Firebase Admin SDK push service
│           └── routes/
│               ├── device-tokens.ts  ← NEW
│               └── notif-prefs.ts    ← NEW
├── configs/
│   └── build/
│       └── tenant-configs/       ← per-tenant build config files
│           └── vastudeep.json
├── .github/
│   └── workflows/
│       ├── ci.yml                ← existing (type-check + E2E)
│       └── mobile-release.yml    ← NEW: per-tenant build + publish
└── turbo.json                    ← extended with mobile tasks
```

### 2.2 Turborepo Pipeline Extension

Add mobile tasks to `turbo.json`:

```json
{
  "pipeline": {
    "build:android": { "dependsOn": ["^build"], "outputs": ["android/app/build/**"] },
    "build:ios": { "dependsOn": ["^build"], "outputs": ["ios/build/**"] },
    "dev:mobile": { "dependsOn": ["^build"], "cache": false }
  }
}
```

Root `package.json` additions:
```json
"dev:mobile": "turbo run dev:mobile --filter=@flowtiq/mobile",
"build:android": "turbo run build:android --filter=@flowtiq/mobile",
"build:ios": "turbo run build:ios --filter=@flowtiq/mobile"
```

---

## 3. Database Schema Changes

### 3.1 New Model: `DeviceToken`

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
```

**Rationale:** One user can have multiple devices. Unique on `[userId, token]` prevents duplicate registrations. `isActive` flag allows soft-deactivation without deletion. `tenantId` enforces isolation — push service only queries tokens scoped to the sending tenant.

### 3.2 New Model: `UserNotificationPreference`

```prisma
model UserNotificationPreference {
  id               String  @id @default(cuid())
  userId           String
  tenantId         String
  // categories
  assignments      Boolean @default(true)   // project/stage/subtask/followup assigned
  statusUpdates    Boolean @default(true)   // stage status changed on my projects
  documentUploads  Boolean @default(true)   // document uploaded on my projects
  followUpReminders Boolean @default(true)  // my followups due/overdue

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@map("user_notification_preferences")
}
```

**Rationale:** Separate model (not `Tenant.settings`) because preferences are per-user, not per-tenant. Default `true` for all categories — users opt out, not in. `@@unique([userId, tenantId])` ensures one preference row per user.

### 3.3 New Model: `TenantPushCredentials`

```prisma
model TenantPushCredentials {
  id             String   @id @default(cuid())
  tenantId       String   @unique
  // FCM
  fcmServerKey   String?  // FCM HTTP v1 service account JSON (encrypted)
  fcmProjectId   String?
  // APNs
  apnsKeyId      String?
  apnsTeamId     String?
  apnsPrivateKey String?  // PEM content (encrypted)
  apnsBundleId   String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_push_credentials")
}
```

**Rationale:** Separate model from `Tenant` to isolate sensitive credentials. `@unique` on `tenantId` — one credential set per tenant. Encrypted at rest (application-level encryption before storing). Manually inserted per tenant at onboarding (Phase 2: no UI).

### 3.4 Model Updates

**`User` model** — add relations:
```prisma
deviceTokens              DeviceToken[]
notificationPreferences   UserNotificationPreference[]
```

**`Tenant` model** — add relations:
```prisma
deviceTokens              DeviceToken[]
pushCredentials           TenantPushCredentials?
notificationPreferences   UserNotificationPreference[]
```

---

## 4. Backend Architecture Changes

### 4.1 Push Notification Service (`services/api/src/lib/push.ts`)

Central fire-and-forget push service — same pattern as `createAuditLog()`. Never throws; logs errors silently.

```typescript
// services/api/src/lib/push.ts
import { GoogleAuth } from 'google-auth-library';
import prisma from './prisma';

type PushCategory = 'assignments' | 'statusUpdates' | 'documentUploads' | 'followUpReminders';

interface PushPayload {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  category: PushCategory;
  data: {
    type: string;          // 'project' | 'stage' | 'followUp' | 'document'
    entityId: string;
    entityType: string;
    deepLink: string;      // e.g. '/projects/abc123'
  };
}

export async function sendPushNotification(payload: PushPayload): Promise<void> {
  try {
    // 1. Check user preference — skip if category disabled
    const pref = await prisma.userNotificationPreference.findUnique({
      where: { userId_tenantId: { userId: payload.userId, tenantId: payload.tenantId } },
    });
    // Default true if no preference row exists
    if (pref && !pref[payload.category]) return;

    // 2. Get active device tokens for user
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: payload.userId, tenantId: payload.tenantId, isActive: true },
    });
    if (!tokens.length) return;

    // 3. Get tenant FCM credentials
    const creds = await prisma.tenantPushCredentials.findUnique({
      where: { tenantId: payload.tenantId },
    });
    if (!creds?.fcmProjectId || !creds?.fcmServerKey) return;

    // 4. Send via FCM HTTP v1 API (one call per token)
    const accessToken = await getFcmAccessToken(creds.fcmServerKey);
    const invalidTokens: string[] = [];

    await Promise.allSettled(
      tokens.map(async (deviceToken) => {
        const response = await sendFcmMessage({
          accessToken,
          projectId: creds.fcmProjectId!,
          token: deviceToken.token,
          title: payload.title,
          body: payload.body,
          data: {
            ...payload.data,
            deepLink: payload.data.deepLink,
          },
        });
        if (response.error === 'UNREGISTERED') {
          invalidTokens.push(deviceToken.token);
        }
      })
    );

    // 5. Clean up invalid tokens
    if (invalidTokens.length) {
      await prisma.deviceToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { isActive: false },
      });
    }
  } catch (error) {
    // Push must never break the main request flow
    console.error('[push] Failed to send push notification:', error);
  }
}
```

**Integration pattern** — called alongside `createNotification()` at every mutation point:

```typescript
// Existing pattern in stages.ts (and all other routes):
await createNotification({ tenantId, userId, type, title, message, data });

// Phase 2: add push call immediately after (non-blocking, fire-and-forget):
sendPushNotification({
  tenantId,
  userId,
  title,
  body: message,
  category: 'assignments',  // or 'statusUpdates' etc.
  data: { type: 'stage', entityId: stage.id, entityType: 'ProjectStage', deepLink: `/projects/${stage.projectId}` },
});
// Note: no await — fire and forget, same pattern as createAuditLog()
```

### 4.2 New Route: `device-tokens.ts`

```
POST   /api/users/device-token   — register token on login
DELETE /api/users/device-token   — deregister on logout
```

```typescript
// POST /api/users/device-token
// Body: { token: string, platform: 'ios' | 'android' }
// Auth: authenticate middleware

// Upsert — handles re-registration of same token gracefully
await prisma.deviceToken.upsert({
  where: { userId_token: { userId, token } },
  update: { isActive: true, platform, updatedAt: new Date() },
  create: { userId, tenantId, token, platform, isActive: true },
});

// DELETE /api/users/device-token
// Body: { token: string }
// Soft-deactivate (not hard delete — preserves history, handles race conditions)
await prisma.deviceToken.updateMany({
  where: { userId, token },
  data: { isActive: false },
});
```

### 4.3 New Route: `notif-prefs.ts`

```
GET    /api/users/notification-preferences   — fetch user prefs
PATCH  /api/users/notification-preferences   — update category toggles
```

Upsert pattern — creates default row if none exists (all true).

### 4.4 Push Trigger Points (Mutation Hook Map)

Every `createNotification()` call in the existing codebase gets a paired `sendPushNotification()` call. Mapping:

| Route | Event | Category | Deep Link |
|-------|-------|----------|-----------|
| `stages.ts` PATCH /:id — assignment change | Stage assigned to user | `assignments` | `/projects/{projectId}` |
| `stages.ts` PATCH /:id — status change | Stage status updated | `statusUpdates` | `/projects/{projectId}` |
| `projects.ts` POST / — project created | Project assigned to owner | `assignments` | `/projects/{id}` |
| `projects.ts` PATCH /:id — team change | Project assigned to new member | `assignments` | `/projects/{id}` |
| `followups.ts` POST / — new followup | Follow-up assigned to owner | `assignments` | `/follow-ups` |
| `documents.ts` POST /upload | Document uploaded to project | `documentUploads` | `/projects/{projectId}` |
| Scheduled job (new) | Follow-up due today / overdue | `followUpReminders` | `/follow-ups` |

**Follow-up reminder scheduler** — new cron job in API:

```typescript
// services/api/src/jobs/followup-reminders.ts
// Run daily at 08:00 tenant timezone (or UTC for Phase 2)
// Query: FollowUp where nextFollowUp = today AND status != 'completed'
// Send push to ownerId with category 'followUpReminders'
```

Register in `app.ts` with `node-cron` or trigger via Railway cron job.

### 4.5 Settings Page Extension (Web)

The existing Settings page (`apps/admin-portal/src/app/(dashboard)/settings/page.tsx`) gains a **Notifications** tab section for push preferences. Uses `PATCH /api/users/notification-preferences`. 4 toggle switches (one per category). Reads from `GET /api/users/notification-preferences` on mount.

---

## 5. Mobile App Architecture (`apps/mobile`)

### 5.1 React Navigation Structure

```
AppNavigator (Stack)
├── SplashScreen          ← shows on cold start while auth loads
├── WebViewScreen         ← main screen (loads Vercel web app in WebView)
│   └── OfflineOverlay    ← conditionally rendered over WebView (NetInfo)
└── (future native screens via route intercept)
```

Single-screen architecture for Phase 2 — the WebView occupies the full screen after splash. Tab bar and navigation chrome are rendered by the existing web app inside the WebView (not duplicated natively).

### 5.2 WebView Configuration

```typescript
// src/screens/WebViewScreen.tsx
<WebView
  ref={webViewRef}
  source={{ uri: TENANT_WEB_URL }}               // from tenant.config.ts
  originWhitelist={[TENANT_WEB_URL, API_URL]}    // restricted allowlist
  allowFileAccess={false}                         // no local file system access
  allowFileAccessFromFileURLs={false}
  allowUniversalAccessFromFileURLs={false}
  injectedJavaScriptBeforeContentLoaded={NATIVE_BRIDGE_SDK}  // inject before page loads
  onMessage={handleBridgeMessage}                // receive messages from web
  onLoadStart={injectAuthCookie}                 // inject token on every load
  onError={handleLoadError}
  cacheEnabled={true}
  domStorageEnabled={true}
  javaScriptEnabled={true}
/>
```

### 5.3 NativeBridge Design

#### SDK injected into WebView (`src/bridge/NativeBridge.web.js`)

This JavaScript string is injected via `injectedJavaScriptBeforeContentLoaded` before the web page loads:

```javascript
(function() {
  if (window.NativeBridge) return; // prevent double-init

  const ALLOWED_TYPES = [
    'FILE_PICK', 'CAMERA_CAPTURE', 'GET_PUSH_TOKEN',
    'GET_CONNECTIVITY', 'REQUEST_PERMISSION', 'NAVIGATE',
  ];

  const pendingCallbacks = {};
  let callbackId = 0;

  window.NativeBridge = {
    postMessage: function(type, payload) {
      if (!ALLOWED_TYPES.includes(type)) {
        console.warn('[NativeBridge] Blocked unknown message type:', type);
        return Promise.reject(new Error('Unknown bridge type'));
      }
      const id = ++callbackId;
      return new Promise((resolve, reject) => {
        pendingCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({ id, type, payload }));
        // Timeout after 30s
        setTimeout(() => {
          if (pendingCallbacks[id]) {
            delete pendingCallbacks[id];
            reject(new Error('NativeBridge timeout'));
          }
        }, 30000);
      });
    },
    isNative: true,
  };

  // Listen for responses from native
  window.addEventListener('message', function(event) {
    try {
      const msg = JSON.parse(event.data);
      if (msg.bridgeResponse && pendingCallbacks[msg.id]) {
        const cb = pendingCallbacks[msg.id];
        delete pendingCallbacks[msg.id];
        if (msg.error) cb.reject(new Error(msg.error));
        else cb.resolve(msg.result);
      }
    } catch (e) {}
  });
})();
```

#### Native bridge handler (`src/bridge/NativeBridge.ts`)

```typescript
// Receives messages from WebView, dispatches to native services
const ALLOWED_MESSAGE_TYPES = new Set([
  'FILE_PICK', 'CAMERA_CAPTURE', 'GET_PUSH_TOKEN',
  'GET_CONNECTIVITY', 'REQUEST_PERMISSION', 'NAVIGATE',
]);

export async function handleBridgeMessage(
  event: WebViewMessageEvent,
  webViewRef: React.RefObject<WebView>
) {
  const { id, type, payload } = JSON.parse(event.nativeEvent.data);

  // Security: allowlist check
  if (!ALLOWED_MESSAGE_TYPES.has(type)) return;

  let result: unknown;
  let error: string | undefined;

  try {
    switch (type) {
      case 'FILE_PICK':
        result = await pickDocument(payload);
        break;
      case 'CAMERA_CAPTURE':
        result = await captureImage(payload);
        break;
      case 'GET_PUSH_TOKEN':
        result = await getPushToken();
        break;
      case 'GET_CONNECTIVITY':
        result = NetInfo.fetch();
        break;
      case 'REQUEST_PERMISSION':
        result = await requestPermission(payload.permission);
        break;
      case 'NAVIGATE':
        // Push WebView to a URL without reload
        webViewRef.current?.injectJavaScript(
          `window.location.href = '${payload.url}'; true;`
        );
        break;
    }
  } catch (e) {
    error = (e as Error).message;
  }

  // Send response back to web layer
  webViewRef.current?.postMessage(
    JSON.stringify({ bridgeResponse: true, id, result, error })
  );
}
```

#### Web app integration (`apps/admin-portal`)

Add `src/lib/nativeBridge.ts`:

```typescript
// Detects native shell and provides typed bridge API
export const isNative = typeof window !== 'undefined' && !!window.NativeBridge;

export async function nativePickFile(): Promise<File | null> {
  if (!isNative) return null; // fallback to browser file input
  return window.NativeBridge.postMessage('FILE_PICK', {});
}

export async function nativeGetPushToken(): Promise<string | null> {
  if (!isNative) return null;
  return window.NativeBridge.postMessage('GET_PUSH_TOKEN', {});
}
```

Existing file upload component detects `isNative` and delegates to bridge; otherwise uses existing `<input type="file">`.

### 5.4 Authentication Token Injection

```typescript
// src/services/auth.ts  (native side)
import Keychain from 'react-native-keychain';

const KEYCHAIN_SERVICE = 'com.flowtiq.{TENANT_SLUG}';

export async function storeTokens(accessToken: string, refreshToken: string) {
  await Keychain.setGenericPassword('tokens', JSON.stringify({ accessToken, refreshToken }), {
    service: KEYCHAIN_SERVICE,
  });
}

export async function getTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (!creds) return null;
  return JSON.parse(creds.password);
}

export async function clearTokens() {
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
}
```

```typescript
// src/services/cookieManager.ts
import CookieManager from '@react-native-cookies/cookies';

// Called on WebView onLoadStart — injects auth cookie into WebView session
export async function injectAuthCookie(webUrl: string) {
  const tokens = await getTokens();
  if (!tokens) return;

  await CookieManager.set(webUrl, {
    name: 'flowtiq_access_token',
    value: tokens.accessToken,
    domain: new URL(webUrl).hostname,
    path: '/',
    secure: true,
    httpOnly: false, // must be readable by JavaScript in WebView
  });
}
```

The web app reads `flowtiq_access_token` cookie on init and hydrates Zustand `useAuthStore` — no re-login required.

**Token refresh flow on mobile:**
1. Web app's existing axios interceptor handles 401 → calls `/api/auth/refresh`
2. On success: updates `useAuthStore` accessToken
3. Web app sends new token to native via bridge: `window.NativeBridge.postMessage('UPDATE_TOKEN', { accessToken })`
4. Native stores updated token in Keychain

### 5.5 Push Notification Handling

```typescript
// src/services/push.ts
import messaging from '@react-native-firebase/messaging';
import notifee from '@notifee/react-native';

export async function initPushNotifications(
  webViewRef: React.RefObject<WebView>,
  apiUrl: string,
  accessToken: string
) {
  // 1. Request permission
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) return;

  // 2. Get FCM token and register with backend
  const token = await messaging().getToken();
  await registerDeviceToken(token, 'android', apiUrl, accessToken); // or 'ios'

  // 3. Handle token refresh
  messaging().onTokenRefresh(async (newToken) => {
    await registerDeviceToken(newToken, platform, apiUrl, accessToken);
  });

  // 4. Foreground notifications — display as in-app banner
  messaging().onMessage(async (remoteMessage) => {
    await notifee.displayNotification({
      title: remoteMessage.notification?.title,
      body: remoteMessage.notification?.body,
      android: { channelId: 'flowtiq_default', pressAction: { id: 'default' } },
    });
  });

  // 5. Background/quit tap — navigate to deep link
  messaging().onNotificationOpenedApp((remoteMessage) => {
    const deepLink = remoteMessage.data?.deepLink as string;
    if (deepLink && webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.location.href = '${deepLink}'; true;`);
    }
  });

  // 6. Quit-state tap
  const initialNotification = await messaging().getInitialNotification();
  if (initialNotification?.data?.deepLink) {
    // Store deepLink, navigate after WebView loads
    pendingDeepLink = initialNotification.data.deepLink as string;
  }
}

async function registerDeviceToken(
  token: string, platform: 'ios' | 'android',
  apiUrl: string, accessToken: string
) {
  await fetch(`${apiUrl}/api/users/device-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ token, platform }),
  });
}
```

### 5.6 Deep Linking

```typescript
// src/services/deeplink.ts
import { Linking } from 'react-native';

// URL scheme: flowtiq-{tenant-slug}://  (custom scheme)
// Universal Links (iOS) / App Links (Android): https://{tenant-vercel-url}

export function initDeepLinking(webViewRef: React.RefObject<WebView>) {
  // Handle deep links when app is running
  const subscription = Linking.addEventListener('url', ({ url }) => {
    const path = extractPath(url); // e.g. '/projects/abc123'
    if (path && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        window.location.href = '${path}'; true;
      `);
    }
  });

  return () => subscription.remove();
}

function extractPath(url: string): string | null {
  // Both custom scheme and universal links map to web app paths
  // flowtiq-vastudeep://projects/abc → /projects/abc
  // https://flowtiq-vastudeep.vercel.app/projects/abc → /projects/abc
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return null;
  }
}
```

**iOS (`ios/{AppName}/AppDelegate.mm`):** Universal Links configured via `apple-app-site-association` file served from Vercel.

**Android (`android/app/src/main/AndroidManifest.xml`):** App Links intent filter for the tenant Vercel domain.

### 5.7 Offline Overlay

```typescript
// src/hooks/useNetworkStatus.ts
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected ?? true);
    });
    return unsubscribe;
  }, []);

  return isConnected;
}

// In WebViewScreen.tsx:
const isConnected = useNetworkStatus();
// Render OfflineScreen overlay when !isConnected
// WebView remains mounted (preserves state) — overlay renders on top
```

---

## 6. White-Label Build System

### 6.1 Per-Tenant Configuration

Each tenant gets a config file at `configs/build/tenant-configs/{tenant-slug}.json`:

```json
// configs/build/tenant-configs/vastudeep.json
{
  "tenantSlug": "vastudeep",
  "appName": "Vastudeep Associates",
  "bundleId": "com.vastudeep.flowtiq",
  "androidPackageName": "com.vastudeep.flowtiq",
  "primaryColor": "#3b82f6",
  "secondaryColor": "#64748b",
  "webUrl": "https://flowtiq-admin.vercel.app",
  "apiUrl": "https://flowtiq-api-production.up.railway.app",
  "fcmProjectId": "vastudeep-flowtiq-prod",
  "appleBundleId": "com.vastudeep.flowtiq",
  "appleTeamId": "XXXXXXXXXX"
}
```

Tenant config is loaded via `apps/mobile/src/config/tenant.ts`, populated from environment variables at build time:

```typescript
// src/config/tenant.ts
export const TENANT_CONFIG = {
  slug: process.env.TENANT_SLUG!,
  appName: process.env.APP_NAME!,
  webUrl: process.env.TENANT_WEB_URL!,
  apiUrl: process.env.API_URL!,
  primaryColor: process.env.PRIMARY_COLOR || '#3b82f6',
};
```

### 6.2 GitHub Actions — Mobile Release Pipeline

```yaml
# .github/workflows/mobile-release.yml
name: Mobile Release

on:
  push:
    tags:
      - 'mobile-vastudeep-v*'   # e.g. mobile-vastudeep-v1.0.0

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g pnpm && pnpm install
      - name: Build Android AAB
        working-directory: apps/mobile
        env:
          TENANT_SLUG: vastudeep
          APP_NAME: "Vastudeep Associates"
          TENANT_WEB_URL: ${{ secrets.VASTUDEEP_WEB_URL }}
          API_URL: ${{ secrets.API_URL }}
          KEYSTORE_FILE: ${{ secrets.VASTUDEEP_KEYSTORE_B64 }}
          KEYSTORE_PASSWORD: ${{ secrets.VASTUDEEP_KEYSTORE_PASS }}
          GOOGLE_SERVICES_JSON: ${{ secrets.VASTUDEEP_GOOGLE_SERVICES_JSON }}
        run: |
          echo $GOOGLE_SERVICES_JSON > android/app/google-services.json
          echo $KEYSTORE_FILE | base64 -d > android/app/vastudeep.keystore
          cd android && ./gradlew bundleRelease
      - name: Upload to Play Store Internal Track
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT }}
          packageName: com.vastudeep.flowtiq
          releaseFiles: apps/mobile/android/app/build/outputs/bundle/release/*.aab
          track: internal

  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g pnpm && pnpm install
      - name: Install CocoaPods
        working-directory: apps/mobile/ios
        run: pod install
      - name: Build iOS IPA
        working-directory: apps/mobile
        env:
          TENANT_SLUG: vastudeep
          GOOGLESERVICE_INFO_PLIST: ${{ secrets.VASTUDEEP_GOOGLESERVICE_PLIST }}
          CERTIFICATE_P12: ${{ secrets.IOS_DIST_CERT_P12 }}
          CERTIFICATE_PASSWORD: ${{ secrets.IOS_DIST_CERT_PASSWORD }}
          PROVISIONING_PROFILE: ${{ secrets.VASTUDEEP_PROVISIONING_PROFILE }}
        run: |
          # Install cert + profile, then xcodebuild archive + export
          xcodebuild archive -workspace ios/FlowtiqMobile.xcworkspace \
            -scheme VastudeepFlowtiq \
            -configuration Release \
            -archivePath build/VastudeepFlowtiq.xcarchive
          xcodebuild -exportArchive \
            -archivePath build/VastudeepFlowtiq.xcarchive \
            -exportPath build/ipa \
            -exportOptionsPlist ios/ExportOptions.plist
      - name: Upload to TestFlight
        uses: apple-actions/upload-testflight-build@v1
        with:
          app-path: apps/mobile/build/ipa/VastudeepFlowtiq.ipa
          issuer-id: ${{ secrets.APPLE_ISSUER_ID }}
          api-key-id: ${{ secrets.APPLE_API_KEY_ID }}
          api-private-key: ${{ secrets.APPLE_API_PRIVATE_KEY }}
```

**Tag convention for onboarding new tenants:**
- New tenant → new tag pattern: `mobile-{tenant-slug}-v*`
- New GitHub secrets group per tenant
- New CI job per tenant (copy/paste with tenant vars)

---

## 7. Web App Changes (admin-portal)

### 7.1 Service Worker

Add `apps/admin-portal/public/sw.js` — caches app shell for offline resilience:

```javascript
const CACHE_NAME = 'flowtiq-shell-v1';
const SHELL_URLS = ['/', '/dashboard', '/projects', '/follow-ups'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || caches.match('/'))
      )
    );
  }
});
```

Register in `apps/admin-portal/src/app/layout.tsx`:
```typescript
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```

### 7.2 NativeBridge Integration

Add `apps/admin-portal/src/lib/nativeBridge.ts` (described in §5.3).

Modify existing file upload in `documents/page.tsx`:
```typescript
// Existing: <input type="file" onChange={handleFileSelect} />
// New: detect native and use bridge
const file = isNative
  ? await nativePickFile()
  : await browserFileSelect();
```

### 7.3 Push Token Registration on Login

After successful login (in auth store `setAuth`), if running in native shell, call device token registration:

```typescript
// In useAuthStore setAuth action:
setAuth: (user, accessToken, refreshToken, tenant) => {
  set({ user, accessToken, refreshToken, tenant, isAuthenticated: true });
  // Register device token if running in native shell
  if (typeof window !== 'undefined' && window.NativeBridge?.isNative) {
    window.NativeBridge.postMessage('GET_PUSH_TOKEN', {})
      .then((token: string) => {
        post('/users/device-token', { token, platform: getPlatform() });
      })
      .catch(() => {}); // silent — push is optional
  }
},
```

### 7.4 Settings Page — Notification Preferences

New tab section in `settings/page.tsx` using existing `useQuery`/`useMutation` pattern:

```typescript
const { data: prefs } = useQuery({
  queryKey: ['notif-prefs'],
  queryFn: () => get<NotificationPreferences>('/users/notification-preferences'),
});

const { mutate: updatePref } = useMutation({
  mutationFn: (updates: Partial<NotificationPreferences>) =>
    patch('/users/notification-preferences', updates),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notif-prefs'] }),
});
```

4 toggle switches: Assignments, Status Updates, Document Uploads, Follow-up Reminders.

---

## 8. Security Architecture

### 8.1 Token Security

| Storage | Platform | Usage |
|---------|----------|-------|
| Keychain | iOS | JWT access + refresh tokens |
| Keystore | Android | JWT access + refresh tokens |
| CookieManager | Both | Injects token into WebView session |
| Zustand (localStorage) | Web (in WebView) | Standard web auth flow |

Tokens flow: Native Keychain/Keystore → CookieManager → WebView cookie → Zustand hydration

### 8.2 WebView Security

```typescript
// Enforced in WebViewScreen.tsx:
allowFileAccess={false}
allowFileAccessFromFileURLs={false}
allowUniversalAccessFromFileURLs={false}
originWhitelist={[TENANT_WEB_URL, API_URL]}
// No geolocation (GPS not exposed to WebView — only to native)
```

### 8.3 Bridge Security

- **Allowlist**: Only 6 message types processed; all others silently rejected
- **No eval**: Bridge never evaluates arbitrary code from web layer
- **Timeout**: 30s per bridge call; pending callbacks cleaned up
- **Origin check**: WebView `originWhitelist` ensures bridge only active on trusted domain

### 8.4 Push Credential Security

- `TenantPushCredentials.fcmServerKey` and `apnsPrivateKey` stored encrypted
- Application-level encryption: AES-256 using `CREDENTIALS_ENCRYPTION_KEY` env var on Railway
- Never logged, never returned in API responses
- Separate Railway env var group per tenant (Phase 2: manual)

### 8.5 Multi-Tenant Push Isolation

- `sendPushNotification()` always resolves `TenantPushCredentials` for the sending tenant
- `DeviceToken` always scoped by `tenantId` — cross-tenant token query impossible
- FCM project per tenant — APNs credentials per tenant bundle ID

---

## 9. API Contract Summary

### New Endpoints

```
POST   /api/users/device-token
  Auth: Bearer {accessToken}
  Body: { token: string, platform: 'ios' | 'android' }
  Response: { success: true, data: { id: string } }

DELETE /api/users/device-token
  Auth: Bearer {accessToken}
  Body: { token: string }
  Response: { success: true }

GET    /api/users/notification-preferences
  Auth: Bearer {accessToken}
  Response: { success: true, data: {
    assignments: boolean,
    statusUpdates: boolean,
    documentUploads: boolean,
    followUpReminders: boolean
  }}

PATCH  /api/users/notification-preferences
  Auth: Bearer {accessToken}
  Body: Partial<NotificationPreferences>
  Response: { success: true, data: NotificationPreferences }
```

### Notification Payload Shape (FCM data field)

```typescript
interface PushNotificationData {
  type: 'project' | 'stage' | 'followUp' | 'document';
  entityId: string;
  entityType: string;
  deepLink: string;   // relative path: '/projects/abc123'
  tenantId: string;
}
```

---

## 10. Shared Types Extension (`@flowtiq/shared-types`)

New types to add to `packages/shared-types/src/index.ts`:

```typescript
export interface DeviceToken {
  id: string;
  userId: string;
  tenantId: string;
  token: string;
  platform: 'ios' | 'android';
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
  type: 'project' | 'stage' | 'followUp' | 'document';
  entityId: string;
  entityType: string;
  deepLink: string;
  tenantId: string;
}

// Extend Window for NativeBridge detection
declare global {
  interface Window {
    NativeBridge?: {
      isNative: boolean;
      postMessage: (type: string, payload?: unknown) => Promise<unknown>;
    };
  }
}
```

---

## 11. Implementation Sequence

### Phase A — Backend Foundation (prerequisite for everything)
1. Add 3 new Prisma models (`DeviceToken`, `UserNotificationPreference`, `TenantPushCredentials`)
2. Run `pnpm db:generate && pnpm db:push`
3. Create `services/api/src/lib/push.ts` (FCM service)
4. Create `services/api/src/routes/device-tokens.ts`
5. Create `services/api/src/routes/notif-prefs.ts`
6. Register new routes in `app.ts`
7. Add `sendPushNotification()` calls alongside all `createNotification()` points
8. Add follow-up reminder cron job
9. Add notification preference toggles to Settings page

### Phase B — Web App Bridge Prep (parallel with Phase A)
1. Add `apps/admin-portal/src/lib/nativeBridge.ts`
2. Add `public/sw.js` + register in `layout.tsx`
3. Modify file upload components to use bridge when `isNative`
4. Add push token registration on login in auth store
5. Add notification preferences UI to Settings page

### Phase C — Mobile App Bootstrap
1. Initialize React Native project at `apps/mobile`
2. Install all dependencies (firebase, notifee, keychain, cookies, etc.)
3. Implement `NativeBridge.web.js` SDK and `NativeBridge.ts` handler
4. Implement `WebViewScreen.tsx` with bridge, auth injection, offline overlay
5. Implement push notification service (`push.ts`)
6. Implement deep linking (`deeplink.ts`)
7. Configure Vastudeep tenant config (`configs/build/tenant-configs/vastudeep.json`)

### Phase D — White-Label Pipeline
1. Set up Android signing (keystore, Gradle config)
2. Set up iOS signing (provisioning profiles, certificates)
3. Configure `apple-app-site-association` on Vercel for Universal Links
4. Configure Android intent filter for App Links
5. Create `.github/workflows/mobile-release.yml`
6. Test end-to-end Vastudeep build → TestFlight + Play Store internal

---

## 12. Key Architecture Decisions & Rationale

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mobile architecture | React Native + WebView hybrid | Zero web code duplication; full feature parity from day 1; gradual native migration path preserved |
| Bridge pattern | postMessage + injectedJavaScript | Standard React Native WebView pattern; bidirectional; no additional dependencies |
| Token storage | Keychain/Keystore | Security requirement (NFR-1); never AsyncStorage |
| Token injection | CookieManager | Seamless SSO between native and WebView without re-login |
| Push service | Centralized `push.ts` library (fire-and-forget) | Same pattern as `audit.ts` — never breaks main flow; single integration point |
| Notification preferences | Separate DB model | Per-user (not per-tenant); clean separation; future-proof for more categories |
| Push credentials | Separate DB model | Sensitive data isolation; per-tenant; encrypted at rest |
| White-label | Single codebase + env vars + CI config per tenant | Scales to N tenants with minimal per-tenant engineering; Vastudeep is reference build |
| Follow-up reminders | Cron job in API | No new infrastructure needed; Railway supports scheduled jobs |
| Deep link routing | URL path injection into WebView | Avoids duplicating navigation logic natively; all routing stays in web layer |
