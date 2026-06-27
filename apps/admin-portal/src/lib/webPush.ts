import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging } from './firebase';
import { post, del } from './api';

// Stored in memory — same pattern as native push token (NFR-1-SEC-A)
let _registeredWebToken: string | null = null;

export async function registerWebPushToken(): Promise<'registered' | 'permission_denied' | 'unsupported' | 'error'> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'permission_denied';

    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.error('[Push] Firebase Messaging not supported in this browser');
      return 'unsupported';
    }

    if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
      console.error('[Push] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set');
      return 'error';
    }

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    });
    if (!token) {
      console.error('[Push] getToken() returned empty — check VAPID key and Firebase project config');
      return 'error';
    }

    _registeredWebToken = token;
    post<unknown>('/users/device-token', { token, platform: 'web' }).catch(() => {});
    console.log('[Push] Web push token registered successfully');
    return 'registered';
  } catch (err) {
    console.error('[Push] Registration failed:', err);
    return 'error';
  }
}

export function deregisterWebPushToken(): void {
  const token = _registeredWebToken;
  _registeredWebToken = null;
  if (token) {
    del<unknown>('/users/device-token', { token }).catch(() => {});
  }
}

// Returns an unsubscribe function — call it on component unmount.
// messageId is passed so callers can deduplicate across page refreshes.
export async function setupForegroundMessages(
  onNotification: (title: string, body: string, deepLinkUrl: string, messageId: string) => void,
): Promise<() => void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Flowtiq';
    const body = payload.notification?.body || '';
    const deepLinkUrl = (payload.data?.deepLinkUrl as string) || '/notifications';
    const messageId = payload.messageId || '';
    onNotification(title, body, deepLinkUrl, messageId);
  });
}
