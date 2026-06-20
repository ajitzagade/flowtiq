import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const preferencePatchSchema = z.object({
  assignments: z.boolean().optional(),
  statusUpdates: z.boolean().optional(),
  documentUploads: z.boolean().optional(),
  followUpReminders: z.boolean().optional(),
});

function pickPrefs(p: { assignments: boolean; statusUpdates: boolean; documentUploads: boolean; followUpReminders: boolean }) {
  return {
    assignments: p.assignments,
    statusUpdates: p.statusUpdates,
    documentUploads: p.documentUploads,
    followUpReminders: p.followUpReminders,
  };
}

// GET /api/users/notification-preferences — return (auto-creating) current preferences
router.get('/notification-preferences', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.user.userId;
  const tenantId = req.user.tenantId;

  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context required' });
    return;
  }

  const prefs = await prisma.userNotificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: {},
    create: { userId, tenantId, assignments: true, statusUpdates: true, documentUploads: true, followUpReminders: true },
  });

  res.status(200).json({ success: true, data: pickPrefs(prefs) });
});

// PATCH /api/users/notification-preferences — partial update (upsert)
router.patch('/notification-preferences', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = preferencePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  const userId = req.user.userId;
  const tenantId = req.user.tenantId;

  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context required' });
    return;
  }

  const body = parsed.data;

  const prefs = await prisma.userNotificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: body,
    create: {
      userId,
      tenantId,
      assignments: true,
      statusUpdates: true,
      documentUploads: true,
      followUpReminders: true,
      ...body,
    },
  });

  res.status(200).json({ success: true, data: pickPrefs(prefs) });
});

export const notificationPreferencesRouter = router;
