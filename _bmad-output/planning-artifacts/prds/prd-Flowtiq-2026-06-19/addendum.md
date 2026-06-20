# Addendum — Flowtiq Phase 2 PRD

_Content that belongs in downstream documents (architecture, solution design) or earned a place but does not fit the PRD itself._

---

## Mobile App — Technical Architecture (Pre-decided)

### Architecture: React Native + WebView Hybrid

**Approach:** Native Shell + WebView hybrid. React Native acts as native container; existing React web app runs inside WebView. Two layers communicate via bidirectional JS bridge (postMessage).

**Layer breakdown:**
- **Native shell (React Native):** Push notifications (FCM/APNs), Deep links (Universal Links / App Links), Native UI (splash, nav, tabs), Device APIs (Camera, GPS, files)
- **WebView bridge:** postMessage / injectedJavaScript — bidirectional channel carrying auth tokens, nav events, permission results, notification payloads
- **Web app layer (existing React app in WebView):** Screens/routing, Auth/state (token passthrough), NativeBridge.js (SDK injected at init), Offline cache (Service Worker)
- **Backend:** Existing REST API + CDN; add FCM/APNs push infrastructure

### Key Technical Decisions

| Concern | Decision |
|---|---|
| Platform | iOS + Android (React Native) |
| Architecture | Native shell + WebView hybrid |
| Bridge | postMessage / injectedJavaScript — NativeBridge.js SDK injected at WebView init |
| Auth | Token injection via CookieManager; tokens stored in Keychain (iOS) / Keystore (Android) |
| Deep linking | Universal Links (iOS) + App Links (Android) |
| Push notifications | FCM (Android) + APNs (iOS) via @react-native-firebase/messaging + @notifee/react-native |
| File operations | DocumentPicker + RNFS; exposed to web via bridge |
| Offline | Service Worker (web shell cache) + native NetInfo overlay |
| Security | Restricted originWhitelist, disabled file access APIs, bridge message type allowlist, tokens in Keychain not AsyncStorage |
| Analytics/Crash | Firebase Analytics + Crashlytics (native); web events forwarded via bridge |
| Android build | Signed AAB → Google Play |
| iOS build | Xcode archive + export → App Store / TestFlight |
| CI/CD | GitHub Actions — Android AAB to Play Store internal track + iOS IPA to TestFlight on version tag |

### Migration Path

Navigator intercept pattern: individual routes can be swapped from WebView to fully native React Native screens one at a time without rewriting the full app. Priority matrix to determine which screens migrate first.

### Proposed Implementation Phases (8 weeks, 4 phases)
_Detailed timeline to be defined in architecture/implementation doc._

### White-Label Distribution Model

Each tenant receives a separately branded mobile app:
- Separate app store listings (Google Play + App Store) per tenant
- Tenant branding already stored in `Tenant.branding` JSON (`primaryColor`, `secondaryColor`, `theme`, logo)
- Build pipeline must support per-tenant build configs (app name, bundle ID, colors, logo, FCM config)
- Likely approach: single codebase + tenant-specific `.env` / build flavor per tenant
- Each tenant's FCM project is separate (own push notification credentials)

### Required Packages (to be finalized in architecture doc)
- @react-native-firebase/messaging, @react-native-firebase/analytics, @notifee/react-native
- @react-native-community/netinfo, react-native-permissions
- react-native-document-picker, react-native-fs
- @react-native-cookies/cookies (CookieManager)
- react-native-keychain
