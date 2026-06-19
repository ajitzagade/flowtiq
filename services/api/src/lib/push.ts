import { initializeApp, getApp, cert, App } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';
import prisma from './prisma';
import type { PushNotificationPayload, NotificationPreferences } from '@flowtiq/shared-types';

function getFirebaseApp(tenantId: string, projectId: string, clientEmail: string, privateKey: string): App {
  const appName = `firebase-app-${tenantId}`;
  try {
    return getApp(appName);
  } catch {
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

    // Fetch tenant FCM credentials
    const creds = await prisma.tenantPushCredentials.findUnique({
      where: { tenantId },
    });

    if (!creds || !creds.isActive || !creds.fcmProjectId || !creds.fcmServerKey || !creds.apnsPrivateKey) {
      console.warn(`Push: no active FCM credentials for tenant ${tenantId}`);
      return;
    }

    const app = getFirebaseApp(tenantId, creds.fcmProjectId, creds.fcmServerKey, creds.apnsPrivateKey);
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
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                },
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
