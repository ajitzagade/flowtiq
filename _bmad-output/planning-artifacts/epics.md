---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-Flowtiq-2026-06-19/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/project-context.md'
outputStructure: 'separate-epic-folders'
---

# Flowtiq Phase 2 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Flowtiq Phase 2 (Push Notifications & Mobile App), decomposing requirements from the PRD and Architecture into implementable stories.

Story files are organized as: `_bmad-output/implementation-artifacts/epic-NN-{slug}/story-NN-MM-{slug}.md`

---

## Requirements Inventory

### Functional Requirements

FR-1.1: System shall deliver push notifications via FCM (Android) and APNs (iOS)
FR-1.2: Push notifications shall be triggered for 9 event types: project assigned, stage assigned, sub-task assigned, follow-up assigned, stage status updated (project members), document uploaded (project members), follow-up due today, follow-up overdue, in-app notification created
FR-1.3: Each push payload shall include: title, body, event type, entity type, entity ID, and deep-link URL (relative path)
FR-1.4: Users shall manage notification preferences per category (Assignments, Status Updates, Document Uploads, Follow-up Reminders) from Settings page; stored server-side; default all enabled
FR-1.5: Each tenant shall have isolated FCM project and APNs credentials; configured manually by Flowtiq engineer at tenant onboarding
FR-1.6: Backend shall store FCM/APNs device tokens per user per device; register on login, deregister on logout; multi-device supported
FR-1.7: Push notifications shall be delivered within 30 seconds of triggering event
FR-1.8: Foreground notifications (app active) shall display as in-app banner (not system tray alert) with tap linking to entity
FR-1.9: Background/quit-state notification tap shall deep-link user directly to relevant screen
FR-1.10: Existing in-app notification bell and notification centre shall continue functioning independently of push
FR-1.11: Backend shall expose POST /api/users/device-token (register) and DELETE /api/users/device-token (deregister)
FR-2.1.1: Single React Native codebase shall support per-tenant build configurations producing distinct apps per tenant
FR-2.1.2: Each tenant build shall be configurable with: app name, bundle ID, brand colors, logo, splash screen, FCM config, store metadata
FR-2.1.3: Tenant branding sourced from existing Tenant.branding JSON (primaryColor, secondaryColor) plus build-time static assets
FR-2.1.4: CI/CD pipeline (GitHub Actions) shall build and publish tenant app on version tag: Android AAB to Google Play internal, iOS IPA to TestFlight
FR-2.1.5: Vastudeep Associates build shall be the reference build used to validate and document the white-label pipeline
FR-2.2.1: Native shell shall handle push notification registration, receipt, foreground display, and tap routing
FR-2.2.2: Native shell shall support deep links via Universal Links (iOS) and App Links (Android)
FR-2.2.3: Native shell shall inject NativeBridge.js SDK into WebView before page load; supported bridge operations: FILE_PICK, CAMERA_CAPTURE, GET_PUSH_TOKEN, GET_CONNECTIVITY, REQUEST_PERMISSION, NAVIGATE
FR-2.2.4: App shall display native offline overlay when device has no connectivity; auto-dismiss on reconnect
FR-2.2.5: JWT tokens shall be stored in Keychain (iOS) / Keystore (Android) and injected into WebView via CookieManager — no re-authentication required
FR-2.2.6: App shall include native splash screen and platform-appropriate navigation (tab bar iOS, bottom nav Android)
FR-2.3.1: Mobile app shall embed existing Flowtiq web portal in WebView providing access to all 16 pages and all user actions
FR-2.3.2: WebView shall load tenant-specific Vercel deployment URL
FR-2.3.3: File upload actions in WebView shall route through NativeBridge to DocumentPicker or Camera, then upload to existing Cloudinary endpoint
FR-2.3.4: Web app shall detect native shell via window.NativeBridge presence and adjust behavior (delegate file ops to bridge, suppress browser-native chrome)
FR-2.3.5: Service Worker shall cache app shell for offline resilience
FR-2.4.1: App shall request push notification permission on first launch after login with clear explanation; re-prompt only from Settings
FR-2.4.2: FCM token shall be registered via POST /api/users/device-token on permission grant; deregistered via DELETE on logout
FR-2.4.3: Foreground notifications shall display as in-app banners via @notifee/react-native with tap navigation
FR-2.4.4: Background/quit notifications shall appear in system tray; tap shall launch app and navigate to entity via deep link

### NonFunctional Requirements

NFR-1-SEC-A: JWT tokens stored in Keychain (iOS) / Keystore (Android) — never in AsyncStorage
NFR-1-SEC-B: WebView originWhitelist restricted to tenant Vercel domain and Flowtiq API domain only
NFR-1-SEC-C: WebView file system access APIs disabled (allowFileAccess=false, allowFileAccessFromFileURLs=false)
NFR-1-SEC-D: NativeBridge message type allowlist enforced — unrecognized types silently rejected
NFR-1-SEC-E: Per-tenant FCM project isolation — no cross-tenant notification routing possible
NFR-1-SEC-F: TenantPushCredentials stored encrypted at rest (application-level AES-256)
NFR-2-PERF-A: App cold start to interactive ≤ 3 seconds on mid-range Android (2022+)
NFR-2-PERF-B: WebView initial page load ≤ 2 seconds on 4G connection
NFR-2-PERF-C: Push notification delivery latency ≤ 30 seconds from event trigger to device
NFR-3-REL-A: Crash-free session rate ≥ 99%
NFR-3-REL-B: Push delivery rate ≥ 95%
NFR-3-REL-C: Graceful degradation — if NativeBridge unavailable, web layer falls back to browser-native behaviors
NFR-4-MT-A: All mobile API requests carry tenant context via JWT (tenantId in payload)
NFR-4-MT-B: Per-tenant app builds have separate bundle IDs, signing identities, store listings
NFR-5-COMPAT-A: iOS minimum iOS 15
NFR-5-COMPAT-B: Android minimum API level 26 (Android 8.0 Oreo)
NFR-5-COMPAT-C: Target form factor: smartphones only (no tablet optimization in Phase 2)
NFR-6-COMP-A: App Store Review Guidelines and Google Play Developer Policy compliant
NFR-6-COMP-B: Push notification permission via explicit GDPR-compliant opt-in
NFR-6-COMP-C: No push notifications sent to users who have not granted permission

### Additional Requirements (from Architecture)

- New Prisma model: DeviceToken (userId, tenantId, token, platform, isActive) with @@unique([userId, token])
- New Prisma model: UserNotificationPreference (userId, tenantId, assignments, statusUpdates, documentUploads, followUpReminders) with @@unique([userId, tenantId])
- New Prisma model: TenantPushCredentials (tenantId @unique, fcmServerKey, fcmProjectId, apnsKeyId, apnsTeamId, apnsPrivateKey, apnsBundleId)
- New library: services/api/src/lib/push.ts — centralized fire-and-forget push service (same pattern as audit.ts — never throws, never blocks main flow)
- sendPushNotification() calls added alongside ALL existing createNotification() calls in routes: stages.ts (assignment + status), projects.ts (assignment), followups.ts (assignment), documents.ts (upload)
- New cron job: services/api/src/jobs/followup-reminders.ts — daily follow-up due/overdue push notifications
- New routes registered in app.ts: /api/users/device-token, /api/users/notification-preferences
- New notification preferences UI in Settings page (4 toggle switches using existing TanStack Query pattern)
- apps/mobile package added to Turborepo workspace with React Native project structure
- NativeBridge.web.js SDK (injected JS string) + NativeBridge.ts native handler
- Keychain/Keystore token storage + CookieManager injection into WebView
- Service Worker at apps/admin-portal/public/sw.js + registration in layout.tsx
- NativeBridge detection + file upload delegation in admin-portal
- Per-tenant build config JSON at configs/build/tenant-configs/{slug}.json
- GitHub Actions workflow: .github/workflows/mobile-release.yml (Android AAB + iOS IPA per tenant tag)
- New types in @flowtiq/shared-types: DeviceToken, NotificationPreferences, PushNotificationPayload, Window.NativeBridge declaration
- Vastudeep Associates reference config: configs/build/tenant-configs/vastudeep.json
- apple-app-site-association file on Vercel for Universal Links (iOS)
- Android intent filter in AndroidManifest.xml for App Links
- FCM + APNs integration: @react-native-firebase/messaging, @notifee/react-native, react-native-keychain, @react-native-cookies/cookies

### UX Design Requirements

No UX design document provided. Mobile UI uses existing responsive web app via WebView (confirmed: no adaptation needed for Phase 2). Native UI limited to splash screen, offline overlay, and platform navigation chrome.

---

### FR Coverage Map

| Requirement | Epic | Stories |
|-------------|------|---------|
| FR-1.1 to FR-1.11 (Push backend) | Epic 1 | 1.1–1.5 |
| FR-2.1.1 to FR-2.1.5 (White-label build) | Epic 4 | 4.1–4.3 |
| FR-2.2.1 to FR-2.2.6 (Native shell) | Epic 3 | 3.2–3.5 |
| FR-2.3.1 to FR-2.3.5 (WebView parity) | Epic 2 + 3 | 2.1–2.3, 3.1 |
| FR-2.4.1 to FR-2.4.4 (Push on mobile) | Epic 3 | 3.4–3.5 |
| NFR-1 (Security) | All epics | Cross-cutting |
| NFR-2/3 (Perf/Reliability) | Epic 3, 4 | 3.1, 4.3 |
| NFR-4 (Multi-tenancy) | Epic 1, 4 | 1.1, 4.1 |
| NFR-5/6 (Compat/Compliance) | Epic 3, 4 | 3.1, 4.2 |

---

## Epic List

### Epic 1: Real-Time Push Notification Backend
Users and the system can reliably send real-time push alerts to any Flowtiq user's registered devices when project events, assignments, and follow-ups occur — scoped to what each user cares about.
**FRs covered:** FR-1.1, FR-1.2, FR-1.3, FR-1.4, FR-1.5, FR-1.6, FR-1.7, FR-1.10, FR-1.11
**Stories:** 1.1 DB schema · 1.2 Push send service · 1.3 Device token API · 1.4 Preference API · 1.5 Push trigger wiring + cron job

### Epic 2: Web App Push & Bridge Readiness
The Flowtiq web app works correctly inside a native mobile shell — file uploads delegate to the device, notification preferences are manageable from Settings, push token registers at login, and the app shell caches for offline resilience.
**FRs covered:** FR-1.8, FR-2.3.3, FR-2.3.4, FR-2.3.5, FR-2.4.2
**Stories:** 2.1 NativeBridge SDK · 2.2 Service Worker · 2.3 File upload bridge · 2.4 Push token on login · 2.5 Notification prefs UI

### Epic 3: React Native Mobile App
Users can download and use the complete Flowtiq platform from iOS or Android — with secure login, push notifications, file operations, deep link navigation, and offline handling — all running through the native shell wrapping the existing web app.
**FRs covered:** FR-2.2.1–FR-2.2.6, FR-2.3.1, FR-2.3.2, FR-2.4.1, FR-2.4.3, FR-2.4.4
**Stories:** 3.1 RN bootstrap · 3.2 WebView + bridge handler · 3.3 Auth (Keychain + CookieManager) · 3.4 Push native · 3.5 Deep linking · 3.6 Offline overlay · 3.7 Native UI

### Epic 4: White-Label Build & Release Pipeline
Vastudeep Associates can distribute their own branded Flowtiq app from the App Store and Google Play. Flowtiq can onboard any future tenant on the same reproducible pipeline with minimal engineering effort.
**FRs covered:** FR-2.1.1–FR-2.1.5, NFR-4-MT-B, NFR-5, NFR-6
**Stories:** 4.1 Tenant config system · 4.2 Android signing + build · 4.3 iOS signing + build · 4.4 Deep link domain config · 4.5 GitHub Actions pipeline · 4.6 Vastudeep reference build + store submission

**Dependency chain:** E1 → E3; E2 → E3; E3 → E4. E1 and E2 can be developed in parallel.
