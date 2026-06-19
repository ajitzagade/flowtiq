import { isNativeApp, getPushToken, getPlatform } from './nativeBridge';
import { post, del } from './api';

// Module-level token storage — intentionally NOT in localStorage (NFR-1-SEC-A)
let _registeredPushToken: string | null = null;

export async function registerPushTokenIfNative(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const token = await getPushToken();
    const platform = getPlatform();
    if (!token || !platform) return;
    _registeredPushToken = token;
    // P17: use typed helper instead of raw api.post
    post<unknown>('/users/device-token', { token, platform }).catch(() => {});
  } catch {
    // Push token is optional — never block the login flow
  }
}

export function deregisterPushTokenIfNative(): void {
  if (!isNativeApp()) return;
  if (_registeredPushToken) {
    const token = _registeredPushToken;
    _registeredPushToken = null;
    // P17: use typed helper instead of raw api.delete
    del<unknown>('/users/device-token', { token }).catch(() => {});
    return;
  }
  // P10: Keychain-restored sessions never called registerPushTokenIfNative,
  // so _registeredPushToken is null. Fall back to fetching the current FCM token.
  getPushToken()
    .then((token) => {
      if (token) del<unknown>('/users/device-token', { token }).catch(() => {});
    })
    .catch(() => {});
}
