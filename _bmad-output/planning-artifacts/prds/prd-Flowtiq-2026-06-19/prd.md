---
title: 'Flowtiq — Phase 2: Push Notifications & Mobile App'
status: final
created: '2026-06-19'
updated: '2026-06-19'
---

# Flowtiq — Phase 2 PRD: Push Notifications & Mobile App

---

## 1. Product Overview

### Existing Platform

Flowtiq is a multi-tenant, white-label workflow management SaaS platform. The current web portal (Next.js 14 + Express API + PostgreSQL) enables tenants to manage projects through configurable stage-based workflows. Key capabilities today:

- Project management with kanban board and configurable stage workflows
- Stage assignment, sub-tasks, and progress tracking
- Follow-up scheduling and tracking
- Document management (upload/download via Cloudinary)
- In-app notifications, audit logs, and role-based access control (RBAC)
- Multi-tenancy with per-tenant branding, users, roles, and workflows

### Phase 2 Objective

Extend Flowtiq with real-time push notifications and a white-labeled mobile app (iOS + Android) to bring the full platform experience to mobile devices — enabling all users to stay informed and take action on the go. The immediate target is a successful rollout to the first commercial customer, Vastudeep Associates.

---

## Glossary

| Term | Definition |
|------|------------|
| Tenant | A client organisation using Flowtiq (e.g., Vastudeep Associates). Each tenant has isolated data, users, branding, and workflows. |
| White-label build | A separately branded mobile app produced from the Flowtiq React Native codebase, configured with a tenant's name, colours, logo, and FCM credentials. Each tenant gets their own App Store and Google Play listing. |
| NativeBridge | A JavaScript SDK (`NativeBridge.js`) injected into the WebView by the React Native shell at initialisation. Exposes native device capabilities (camera, files, push token, connectivity) to the web app via `window.NativeBridge.postMessage(...)`. |
| Device token | A unique identifier issued by FCM (Android) or APNs (iOS) to a specific app installation on a device. Used by the backend to target push notifications to the correct device. |
| WebView | A native component inside the React Native app that renders the existing Flowtiq web portal (Next.js). All 16 web pages run inside this WebView, providing full feature parity without code duplication. |
| Stage | A step in a project's workflow (e.g., File Creation, Scrutiny, Approval). Managed via the `ProjectStage` model. Users can be assigned to stages and receive notifications on stage updates. |
| FCM | Firebase Cloud Messaging — Google's push notification service used for Android and as a cross-platform fallback. |
| APNs | Apple Push Notification service — Apple's push notification delivery system for iOS devices. |

---

## 2. Problem Statement

**For tenant users (project managers, file executives, follow-up executives):**
- Users must actively log into the web portal to discover updates, assignments, or overdue follow-ups — no real-time alerting exists
- Time-sensitive tasks (approvals, stage updates, follow-up reminders) are missed or delayed without push alerts
- Field-facing and mobile-first users have no native mobile experience; the web portal is not optimized for mobile browsers

**For Flowtiq as a product:**
- Absence of a mobile app limits commercial viability against competitors in the workflow management space
- White-label mobile app per tenant is a key differentiator for SaaS sales to firms managing their own branded tooling
- Vastudeep Associates, the first paying customer, requires mobile access for their team to fully adopt the platform

---

## 3. Goals & Success Metrics

### Goals

| ID | Goal |
|----|------|
| G1 | All users receive real-time push notifications for events relevant to them |
| G2 | All users can access the full Flowtiq feature set from iOS and Android devices |
| G3 | Each tenant can distribute a distinctly branded mobile app to their users |
| G4 | Vastudeep Associates is successfully onboarded on mobile |

### Success Metrics

| Metric | Target |
|--------|--------|
| Push notification delivery rate | ≥ 95% within 30 seconds of triggering event |
| Mobile app crash-free session rate | ≥ 99% |
| Web portal feature parity in WebView | All 16 pages accessible and functional |
| Vastudeep app live on both stores | Within Phase 2 timeline |
| Vastudeep user mobile adoption | ≥ 70% of active users logging in via mobile within 30 days of launch |

### Counter-Metrics

- Push opt-out rate > 30% signals over-notification — triggers frequency and targeting review
- Mobile session duration significantly lower than web — triggers UX adaptation assessment

---

## 4. Users & Roles

No new user types are introduced in Phase 2. All existing roles apply on mobile with identical permissions.

| Role | Scope |
|------|-------|
| Super Admin | Cross-tenant management (web portal only; not in mobile app) |
| Tenant Admin | Full tenant management, user management, settings |
| Project Manager | Project CRUD, workflow management, stage updates, assignments |
| File Executive | Stage updates, document management |
| Follow-up Executive | Follow-up creation, tracking, status updates |

All roles receive push notifications scoped to their assignments and existing RBAC permissions.

---

## 5. Feature Requirements

### F1 — Push Notifications

**FR-1.1** The system shall deliver push notifications via Firebase Cloud Messaging (FCM) for Android and Apple Push Notification Service (APNs) for iOS.

**FR-1.2** Push notifications shall be triggered for the following events:

| Event | Recipient |
|-------|-----------|
| Project assigned to user | Assignee |
| Stage assigned to user (assignedToIds updated) | New assignee(s) |
| Sub-task assigned to user | Assignee |
| Follow-up assigned to user | Assignee |
| Stage status updated on a project the user is a member of | All project team members |
| Document uploaded to a project the user is a member of | All project team members |
| Follow-up due today | Follow-up owner |
| Follow-up overdue (1 day past due date) | Follow-up owner |
| Any notification created in the existing in-app notification system | Notification recipient |

**FR-1.3** Each push notification payload shall include: title, body, event type, entity type, entity ID, and a deep-link URL for direct navigation to the relevant screen.

**FR-1.4** Users shall be able to manage notification preferences (enable/disable per category) from the Settings page on both web and mobile. Notification categories are:
- **Assignments** — project assigned, stage assigned, sub-task assigned, follow-up assigned
- **Status updates** — stage or sub-task status changed on a project I am a member of
- **Document uploads** — document uploaded to a project I am a member of
- **Follow-up reminders** — follow-up due today or overdue

Preferences are stored server-side per user (see A-4).

**FR-1.5** Each tenant shall have its own FCM project and APNs credentials, configured and isolated per tenant. The super admin configures tenant push credentials via the Flowtiq admin panel.

**FR-1.6** The backend shall store FCM/APNs device tokens per user per device. Tokens shall be registered on app install/login and deregistered on explicit logout. Multiple devices per user shall be supported.

**FR-1.7** Push notifications shall be delivered within 30 seconds of the triggering event under normal network conditions.

**FR-1.8** When the user is active in the app at the time a notification fires, it shall appear as an in-app banner (not a system notification tray alert), with a tap target linking to the relevant entity.

**FR-1.9** Tapping a push notification from the system tray shall deep-link the user directly to the relevant screen (project detail, stage, follow-up, or document).

**FR-1.10** The existing in-app notification bell and notification centre (web portal) shall continue to function independently and in parallel with push notifications.

**FR-1.11** The backend shall expose two new endpoints for device token lifecycle management:
- `POST /api/users/device-token` — register a device token (payload: `{ token, platform: 'ios' | 'android' }`)
- `DELETE /api/users/device-token` — deregister the current device token on logout

---

### F2 — Mobile Application

#### F2.1 — White-Label Build System

**FR-2.1.1** A single React Native codebase shall support per-tenant build configurations, producing a distinct mobile app per tenant.

**FR-2.1.2** Each tenant app build shall be independently configurable with: app name, bundle ID / application ID, primary and secondary brand colors, logo, splash screen, FCM project configuration, and App Store / Google Play store metadata.

**FR-2.1.3** Tenant branding values shall be sourced from the existing `Tenant.branding` JSON field (primaryColor, secondaryColor) and supplemented with tenant-specific static assets (logo, splash image) provided at build time.

**FR-2.1.4** The CI/CD pipeline (GitHub Actions) shall support building and publishing a tenant-specific app on a version tag: signed Android AAB to the tenant's Google Play internal track, and signed iOS IPA to the tenant's TestFlight / App Store Connect.

**FR-2.1.5** The Vastudeep Associates build shall serve as the reference tenant — used to validate and document the white-label pipeline before onboarding additional tenants.

#### F2.2 — Native Shell

**FR-2.2.1** The native shell (React Native) shall handle all platform-specific capabilities: push notification registration and routing, deep link interception, device permission management (camera, files, location), and offline detection.

**FR-2.2.2** The native shell shall support deep links via Universal Links (iOS) and App Links (Android), opening the app and navigating to the correct screen when a URL is invoked from outside the app.

**FR-2.2.3** The native shell shall inject a NativeBridge.js SDK into the WebView before the web app loads. The web app communicates with the native shell via `window.NativeBridge.postMessage(...)` and receives responses via `window.dispatchEvent`. Supported bridge operations: file pick, camera capture, push token retrieval, connectivity status, permission requests.

**FR-2.2.4** When the device has no network connectivity, the app shall display a native offline overlay screen. It shall dismiss automatically when connectivity is restored.

**FR-2.2.5** Auth tokens (JWT access + refresh) shall be stored in the device's secure storage (Keychain on iOS, Keystore on Android) and injected into the WebView session via CookieManager on launch, so users do not need to re-authenticate in the web layer after native login.

**FR-2.2.6** The app shall include a native splash screen displayed during initial load, and a platform-appropriate navigation structure (tab bar on iOS, bottom navigation on Android).

#### F2.3 — WebView (Feature Parity)

**FR-2.3.1** The mobile app shall embed the existing Flowtiq web admin portal in a WebView, making all 16 pages and all user actions available on mobile without duplication of web code.

**FR-2.3.2** The WebView shall load the tenant-specific Flowtiq web portal URL (Vercel deployment for that tenant's configuration).

**FR-2.3.3** File upload actions triggered from the WebView shall route through the NativeBridge to the device's document picker or camera, then upload to the existing Cloudinary-backed API endpoint — without requiring browser-native file input support.

**FR-2.3.4** The web app shall detect when running inside the native shell (via presence of `window.NativeBridge`) and adjust its behavior: suppress browser-native file pickers, delegate to the bridge for device operations, and suppress web-only navigation chrome.

**FR-2.3.5** The web app's Service Worker shall cache the application shell to provide resilience during brief connectivity drops.

#### F2.4 — Push Notifications on Mobile

**FR-2.4.1** On first launch after login, the app shall request push notification permission from the user with a clear explanation of why notifications are needed. Users who deny can be re-prompted only from Settings.

**FR-2.4.2** Upon permission grant, the FCM device token shall be registered with the Flowtiq API (`POST /api/users/device-token`). On logout, the token shall be deregistered (`DELETE /api/users/device-token`).

**FR-2.4.3** Foreground notifications shall display as in-app banners using @notifee/react-native, with a tap action that navigates the WebView to the relevant URL.

**FR-2.4.4** Background and quit-state notifications shall appear in the system notification tray. Tapping shall launch the app and navigate directly to the relevant entity via deep link.

---

## 6. Non-Functional Requirements

**NFR-1 — Security**
- Device tokens stored in Keychain (iOS) / Keystore (Android) — never in AsyncStorage
- WebView `originWhitelist` restricted to the tenant's Vercel domain and Flowtiq API domain
- WebView file system access APIs disabled (no local file access via WebView)
- NativeBridge message type allowlist enforced — the shell rejects unrecognised message types silently
- Per-tenant FCM project isolation — no cross-tenant notification routing possible

**NFR-2 — Performance**
- App cold start to interactive: ≤ 3 seconds on a mid-range Android device (2022 or newer)
- WebView initial page load: ≤ 2 seconds on 4G connection
- Push notification delivery latency: ≤ 30 seconds from event trigger to device receipt

**NFR-3 — Reliability**
- Crash-free session rate: ≥ 99%
- Push delivery rate: ≥ 95%
- Graceful degradation: if the NativeBridge is unavailable, the web layer falls back to browser-native behaviors without breaking

**NFR-4 — Multi-Tenancy**
- All mobile API requests carry tenant context via the auth token (tenantId in JWT payload)
- Per-tenant app builds have separate bundle IDs, signing identities, and store listings
- Tenant FCM credentials are stored and used in complete isolation

**NFR-5 — Platform Compatibility**
- iOS: minimum iOS 15
- Android: minimum API level 26 (Android 8.0 Oreo)
- Target form factor: smartphones (phones only; tablet optimization is out of scope for Phase 2)

**NFR-6 — Compliance**
- App Store Review Guidelines and Google Play Developer Policy compliant
- Push notification permission obtained via explicit opt-in (GDPR and platform policy compliant)
- No push notifications sent to users who have not granted permission

---

## 7. Out of Scope — Phase 2

The following are planned for future phases, contingent on successful Vastudeep onboarding:

- Analytics dashboard and reporting
- Billing and subscription management
- Tenant self-signup and self-serve onboarding portal
- Tablet-optimized UI
- Fully native React Native screens (migration path is architected but not executed in Phase 2)
- Client-facing portal (separate from the operator/user portal)
- Offline-first data mutation (Phase 2 supports offline display only; no local write-and-sync)
- Biometric authentication (Face ID / fingerprint unlock)
- Super admin functions on mobile

---

## 8. Open Questions & Assumptions

### Open Questions

All open questions resolved.

### Decisions & Resolutions

| # | Question | Resolution |
|---|----------|------------|
| OQ-1 | Tenant FCM/APNs credential configuration | **Manual per-tenant setup** for now — super admin configures credentials at deployment time, not via admin UI. Admin UI configuration is deferred to a future phase. |
| OQ-2 | Mobile WebView UI adaptation needed? | **No adaptation required for Phase 2.** Code review confirmed the existing web portal is already mobile-responsive: sidebar is a full-width drawer on mobile, all dashboard grids use `grid-cols-1` base with responsive breakpoints, tables wrapped in `overflow-x-auto`. Verified 52+ responsive breakpoint usages across pages. |
| OQ-3 | Biometric authentication requirement | **Deferred to a future phase.** Not required for Vastudeep onboarding. |
| OQ-4 | App store account ownership | **Flowtiq manages Apple Developer and Google Play Console accounts** for all tenant app distributions. Flowtiq submits apps on behalf of tenants under its developer accounts. |

### Assumptions

| # | Assumption |
|---|------------|
| A-1 | The existing Flowtiq web portal (Vercel deployment) is fully accessible from the mobile WebView without changes to the web auth flow — token injection via CookieManager is sufficient for seamless login |
| A-2 | Flowtiq manages Apple Developer and Google Play Console accounts; tenant apps are distributed under Flowtiq's developer accounts |
| A-3 | The Vastudeep Associates build is the reference build used to validate and document the entire white-label pipeline before onboarding additional tenants |
| A-4 | User notification preferences (enable/disable by event type) will be stored server-side, either in the existing `Tenant.settings` JSON or a new `UserNotificationPreference` model in the database |
| A-5 | Push notification volume for Phase 2 (single tenant, ~10–50 users) is well within FCM/APNs free tiers — no paid push infrastructure costs anticipated initially |
| A-6 | Tenant FCM project credentials (server key, APNs certificate) are provisioned manually by a Flowtiq engineer at the time of tenant mobile onboarding |
