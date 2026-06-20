# Deferred Work

## Deferred from: code review of Epic 4 (2026-06-20)

- `android:release` script doesn't invoke `apply-tenant-config` first — by design per AC-5 spec; README documents the prerequisite. Low risk: developer must run manually.
- Xcode `CODE_SIGN_STYLE = Manual` and `IPHONEOS_DEPLOYMENT_TARGET = 15.0` not set in `project.pbxproj` — requires actual Xcode project file (no `project.pbxproj` in repo from Story 3.1 scaffold). Must be set via Xcode GUI or xcconfig when the real project is generated.
- `.well-known` files deployed with placeholder team ID and SHA-256 fingerprint — known gap; real values require Apple credentials and keystore (Story 4.6 dependency).
- `fcmServerKey` stored as plain text in DB — architectural decision predating Epic 4; not introduced by these changes.
