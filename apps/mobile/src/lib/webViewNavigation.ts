import Config from 'react-native-config';
import { webViewRef } from './webViewRef';

const TRUSTED_BASE = Config.TENANT_WEBVIEW_URL ?? 'https://flowtiq-admin.vercel.app';

// Shared utility for navigating the WebView to any path.
// Used by: deep link handler, NAVIGATE bridge, push tap handlers.
// P1: Validates the destination before injection — rejects external origins and javascript: URIs.
export function navigateWebView(path: string): void {
  let url: string;
  if (path.startsWith('https://') || path.startsWith('http://')) {
    try {
      const pathOrigin = new URL(path).origin;
      const baseOrigin = new URL(TRUSTED_BASE).origin;
      if (pathOrigin !== baseOrigin) return; // reject external origins
      url = path;
    } catch {
      return;
    }
  } else if (path.startsWith('/')) {
    url = `${TRUSTED_BASE}${path}`;
  } else {
    return; // reject javascript:, data:, relative paths without leading slash
  }
  // P1: JSON.stringify prevents any embedded quotes or special chars from breaking the JS context
  webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
}

// Extracts the path+search+hash from a full URL string.
export function extractPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return url.startsWith('/') ? url : '/'; // fallback: must be a valid path
  }
}
