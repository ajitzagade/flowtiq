// Tenant configuration — edit these values to white-label the app.
// Values mirror the .env file; no native bridge needed.
export const Config = {
  TENANT_WEBVIEW_URL: 'https://flowtiq-admin.vercel.app',
  TENANT_SLUG: 'flowtiq',
  TENANT_NAME: 'Flowtiq Mobile',
  TENANT_DOMAIN: 'flowtiq-admin.vercel.app',
} as const;
