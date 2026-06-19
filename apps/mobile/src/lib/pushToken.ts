// Module-level FCM token storage.
// Intentionally NOT in AsyncStorage (per NFR-1-SEC-A — push tokens are ephemeral session data).
// The GET_PUSH_TOKEN bridge handler (Story 3.2) reads this value.
let _fcmToken: string | null = null;

export const setPushToken = (token: string | null): void => {
  _fcmToken = token;
};

export const getPushTokenValue = (): string | null => _fcmToken;
