import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../lib/push';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

// GET /api/notifications
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId, tenantId } = authReq.user;
    const { page = '1', pageSize = '20', isRead } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where: Record<string, unknown> = {
      userId,
      tenantId: tenantId as string,
    };
    if (isRead !== undefined) where.isRead = isRead === 'true';

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, tenantId: tenantId as string, isRead: false } }),
    ]);

    res.json({
      success: true,
      data: {
        items: notifications,
        total,
        unreadCount,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const { userId } = authReq.user;

    await prisma.notification.updateMany({
      where: { id: req.params.id, userId },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/test-push — sends a test push to the logged-in user's devices
notificationsRouter.post('/test-push', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId, tenantId } = authReq.user;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'No tenant context' });
      return;
    }

    await sendPushNotification(
      userId,
      tenantId,
      {
        title: 'Test Notification',
        body: 'Push notifications are working correctly on Flowtiq!',
        eventType: 'test',
        entityType: 'notification',
        entityId: userId,
        deepLinkUrl: '/notifications',
      },
      'assignments',
    );

    res.json({ success: true, message: 'Test push sent' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all
notificationsRouter.patch('/read-all', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId, tenantId } = authReq.user;

    await prisma.notification.updateMany({
      where: { userId, tenantId: tenantId as string, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});
