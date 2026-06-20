import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(['ios', 'android']),
});

const deregisterSchema = z.object({
  token: z.string().min(1).max(4096),
});

// POST /api/users/device-token — register or reactivate a device token
router.post('/device-token', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid request body' });
    return;
  }

  const { token, platform } = parsed.data;
  const userId = req.user.userId;
  const tenantId = req.user.tenantId;

  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context required' });
    return;
  }

  // Deactivate the same physical token if it belongs to another user (device transfer / re-login)
  await prisma.deviceToken.updateMany({
    where: { token, userId: { not: userId } },
    data: { isActive: false },
  });

  const existing = await prisma.deviceToken.findUnique({
    where: { userId_token: { userId, token } },
  });

  if (existing) {
    const updated = await prisma.deviceToken.update({
      where: { userId_token: { userId, token } },
      data: { isActive: true, platform },
      select: { id: true, token: true, platform: true, isActive: true },
    });
    res.status(200).json({ success: true, data: updated });
    return;
  }

  const created = await prisma.deviceToken.create({
    data: { userId, tenantId, token, platform, isActive: true },
    select: { id: true, token: true, platform: true, isActive: true },
  });
  res.status(201).json({ success: true, data: created });
});

// DELETE /api/users/device-token — deregister (soft-deactivate) a device token
// Note: send { token } in the request body. Some HTTP clients strip DELETE bodies —
// use POST /api/users/device-token/deregister as an alternative.
router.delete('/device-token', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = deregisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'token is required in the request body' });
    return;
  }

  const { token } = parsed.data;
  const userId = req.user.userId;

  // Idempotent: updateMany silently no-ops if no matching record
  await prisma.deviceToken.updateMany({
    where: { userId, token },
    data: { isActive: false },
  });

  res.status(200).json({ success: true });
});

// POST /api/users/device-token/deregister — alternative for clients that strip DELETE bodies
router.post('/device-token/deregister', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = deregisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'token is required in the request body' });
    return;
  }
  const { token } = parsed.data;
  const userId = req.user.userId;
  await prisma.deviceToken.updateMany({
    where: { userId, token },
    data: { isActive: false },
  });
  res.status(200).json({ success: true });
});

export const deviceTokenRouter = router;
