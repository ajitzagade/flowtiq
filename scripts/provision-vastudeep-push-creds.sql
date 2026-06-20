-- provision-vastudeep-push-creds.sql
-- One-time script to insert Vastudeep TenantPushCredentials in production.
--
-- Prerequisites:
--   1. Firebase project created for Vastudeep (package name: com.vastudeep.flowtiq)
--   2. FCM Server Key obtained from Firebase Console > Project Settings > Cloud Messaging
--   3. Vastudeep tenant ID known (query: SELECT id FROM "Tenant" WHERE slug = 'vastudeep')
--
-- Replace ALL placeholder values before running.
-- Run via Railway console or psql against the production DATABASE_URL.

INSERT INTO "TenantPushCredential" (
  id,
  "tenantId",
  "fcmProjectId",
  "fcmServerKey",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  gen_random_uuid(),
  '<VASTUDEEP_TENANT_ID>',       -- Replace: SELECT id FROM "Tenant" WHERE slug = 'vastudeep'
  '<FCM_PROJECT_ID>',            -- Replace: Firebase Project ID (e.g. vastudeep-flowtiq-12345)
  '<FCM_SERVER_KEY>',            -- Replace: Firebase Server Key (legacy key or v1 service account)
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("tenantId") DO UPDATE SET
  "fcmProjectId" = EXCLUDED."fcmProjectId",
  "fcmServerKey" = EXCLUDED."fcmServerKey",
  "isActive" = true,
  "updatedAt" = NOW();
