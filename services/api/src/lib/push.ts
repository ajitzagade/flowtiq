import { initializeApp, getApp, cert, App } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import prisma from './prisma';
import type { PushNotificationPayload, NotificationPreferences } from '@flowtiq/shared-types';

function getFirebaseApp(tenantId: string, projectId: string, clientEmail: string, privateKey: string): App {
  const appName = `firebase-app-${tenantId}`;
  try {
    return getApp(appName);
  } catch (e: unknown) {
    // Only swallow "app not found" — re-throw everything else
    const code = (e as { errorInfo?: { code: string } })?.errorInfo?.code;
    if (code !== 'app/no-app') throw e;
    return initializeApp(
      {
        credential: cert({ projectId, clientEmail, privateKey }),
      },
      appName
    );
  }
}

export async function sendPushNotification(
  userId: string,
  tenantId: string,
  payload: PushNotificationPayload,
  preferenceCategory: keyof NotificationPreferences
): Promise<void> {
  try {
    // Check user notification preferences
    const prefs = await prisma.userNotificationPreference.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });

    // If preferences exist and the category is disabled, return early
    if (prefs && !prefs[preferenceCategory]) {
      return;
    }

    // Fetch active device tokens for this user
    const tokens = await prisma.deviceToken.findMany({
      where: { userId, tenantId, isActive: true },
    });

    if (tokens.length === 0) {
      return;
    }

    // Resolve FCM credentials: tenant DB row first, then global env vars as fallback
    const creds = await prisma.tenantPushCredentials.findUnique({
      where: { tenantId },
    });

    let fcmProjectId: string;
    let fcmClientEmail: string;
    let fcmPrivateKey: string;

    const hasDbCreds =
      creds?.isActive &&
      !!creds.fcmProjectId?.trim() &&
      !!creds.serviceAccountEmail?.trim() &&
      !!creds.serviceAccountKey?.trim();

    if (hasDbCreds) {
      fcmProjectId = creds!.fcmProjectId!;
      fcmClientEmail = creds!.serviceAccountEmail!;
      fcmPrivateKey = creds!.serviceAccountKey!.replace(/\\n/g, '\n');
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      fcmProjectId = process.env.FIREBASE_PROJECT_ID;
      fcmClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      fcmPrivateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    } else {
      console.warn(`Push: no FCM credentials for tenant ${tenantId} and no env-var fallback`);
      return;
    }

    const app = getFirebaseApp(tenantId, fcmProjectId, fcmClientEmail, fcmPrivateKey);
    const messaging = getMessaging(app);

    // Send to each token individually to enable per-token error handling
    await Promise.all(
      tokens.map(async (deviceToken) => {
        try {
          const message: Message = {
            token: deviceToken.token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              eventType: payload.eventType,
              entityType: payload.entityType,
              entityId: payload.entityId,
              deepLinkUrl: payload.deepLinkUrl,
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                vibrateTimingsMillis: [0, 300, 100, 300],
                defaultVibrateTimings: false,
                defaultSound: true,
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                },
              },
            },
            webpush: {
              notification: {
                title: payload.title,
                body: payload.body,
                icon: '/favicon.ico',
              },
              fcmOptions: {
                link: payload.deepLinkUrl || 'https://flowtiq-admin.vercel.app/notifications',
              },
            },
          };

          await messaging.send(message);
        } catch (err: unknown) {
          const errorCode = (err as { code?: string })?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            // Deactivate stale token
            await prisma.deviceToken.updateMany({
              where: { userId, token: deviceToken.token },
              data: { isActive: false },
            });
          } else {
            console.error('Push: FCM send error for token:', errorCode || err);
          }
        }
      })
    );
  } catch (error) {
    console.error('Push notification error:', error);
  }
}
