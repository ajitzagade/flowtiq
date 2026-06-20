import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging } from './firebase';
import { post, del } from './api';

// Stored in memory — same pattern as native push token (NFR-1-SEC-A)
let _registeredWebToken: string | null = null;

export async function registerWebPushToken(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const messaging = await getFirebaseMessaging();
    if (!messaging) return;

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });
    if (!token) return;

    _registeredWebToken = token;
    post<unknown>('/users/device-token', { token, platform: 'web' }).catch(() => {});
  } catch {
    // Non-blocking — never interrupt login flow
  }
}

export function deregisterWebPushToken(): void {
  const token = _registeredWebToken;
  _registeredWebToken = null;
  if (token) {
    del<unknown>('/users/device-token', { token }).catch(() => {});
  }
}

// Returns an unsubscribe function — call it on component unmount
export async function setupForegroundMessages(
  onNotification: (title: string, body: string, deepLinkUrl: string) => void,
): Promise<() => void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Flowtiq';
    const body = payload.notification?.body || '';
    const deepLinkUrl = (payload.data?.deepLinkUrl as string) || '/notifications';
    onNotification(title, body, deepLinkUrl);
  });
}
