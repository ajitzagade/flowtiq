// Tenant configuration — values are sourced from .env via react-native-config.
// The .env file is written by scripts/apply-tenant-config.js at build time.
import RNConfig from 'react-native-config';

export const Config = {
  TENANT_WEBVIEW_URL: RNConfig.TENANT_WEBVIEW_URL ?? 'https://flowtiq-admin.vercel.app',
  TENANT_SLUG: RNConfig.TENANT_SLUG ?? 'flowtiq',
  TENANT_NAME: RNConfig.TENANT_NAME ?? 'Flowtiq Mobile',
  TENANT_DOMAIN: RNConfig.TENANT_DOMAIN ?? 'flowtiq-admin.vercel.app',
};
