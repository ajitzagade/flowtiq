import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const usersRouter = Router();
usersRouter.use(authenticate);

function tenantScope(req: AuthRequest) {
  return req.user.isSuperAdmin && req.query.tenantId
    ? (req.query.tenantId as string)
    : req.user.tenantId || undefined;
}

// GET /api/users
usersRouter.get('/', requirePermission('users:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const { page = '1', pageSize = '20', search, isActive } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where: Record<string, unknown> = { tenantId };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    // Default to active users only; pass isActive=false or isActive=all to override
    if (isActive === 'false') {
      where.isActive = false;
    } else if (isActive === 'all') {
      // no filter — show all
    } else {
      // default: active only
      where.isActive = true;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          avatar: true, isActive: true, lastLoginAt: true, createdAt: true,
          userRoles: {
            include: { role: { select: { id: true, name: true, color: true } } },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: users.map((u) => ({
          ...u,
          fullName: `${u.firstName} ${u.lastName}`,
          roles: u.userRoles.map((ur) => ur.role),
        })),
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/notification-preferences
usersRouter.get('/notification-preferences', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId, tenantId } = authReq.user;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'No tenant context' });
      return;
    }

    const prefs = await prisma.userNotificationPreference.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { userId, tenantId, assignments: true, statusUpdates: true, documentUploads: true, followUpReminders: true },
      update: {},
    });

    res.json({ success: true, data: { assignments: prefs.assignments, statusUpdates: prefs.statusUpdates, documentUploads: prefs.documentUploads, followUpReminders: prefs.followUpReminders } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/notification-preferences
usersRouter.patch('/notification-preferences', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { userId, tenantId } = authReq.user;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'No tenant context' });
      return;
    }

    const schema = z.object({
      assignments: z.boolean().optional(),
      statusUpdates: z.boolean().optional(),
      documentUploads: z.boolean().optional(),
      followUpReminders: z.boolean().optional(),
    });
    const data = schema.parse(req.body);

    const prefs = await prisma.userNotificationPreference.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { userId, tenantId, assignments: true, statusUpdates: true, documentUploads: true, followUpReminders: true, ...data },
      update: data,
    });

    res.json({ success: true, data: { assignments: prefs.assignments, statusUpdates: prefs.statusUpdates, documentUploads: prefs.documentUploads, followUpReminders: prefs.followUpReminders } });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
usersRouter.get('/:id', requirePermission('users:view'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);

    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const permissions = new Set<string>();
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.code);
      }
    }

    res.json({
      success: true,
      data: {
        ...user,
        password: undefined,
        fullName: `${user.firstName} ${user.lastName}`,
        roles: user.userRoles.map((ur) => ur.role),
        permissions: Array.from(permissions),
      },
    });
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  roleIds: z.array(z.string()).min(1, 'At least one role required'),
});

// POST /api/users
usersRouter.post('/', requirePermission('users:create'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq) as string;
    const data = createUserSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already exists' });
      return;
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        password: hashed,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        userRoles: {
          create: data.roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: {
        userRoles: {
          include: { role: { select: { id: true, name: true, color: true } } },
        },
      },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'users',
      entityId: user.id,
      entityType: 'user',
      entityName: `${user.firstName} ${user.lastName}`,
      newData: { email: user.email, roles: data.roleIds },
    });

    res.status(201).json({
      success: true,
      data: {
        ...user,
        password: undefined,
        fullName: `${user.firstName} ${user.lastName}`,
        roles: user.userRoles.map((ur) => ur.role),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id
usersRouter.patch('/:id', requirePermission('users:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const { roleIds, password, ...rest } = req.body;

    const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const updateData: Record<string, unknown> = { ...rest };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
    });

    if (roleIds) {
      await prisma.userRole.deleteMany({ where: { userId: req.params.id } });
      await prisma.userRole.createMany({
        data: roleIds.map((roleId: string) => ({ userId: req.params.id, roleId })),
      });
    }

    await createAuditLog({
      req: authReq,
      action: 'UPDATED',
      module: 'users',
      entityId: user.id,
      entityType: 'user',
      entityName: `${user.firstName} ${user.lastName}`,
      previousData: { isActive: user.isActive },
      newData: rest,
    });

    res.json({ success: true, data: { ...updated, password: undefined } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
// ?hard=true → permanently delete (only allowed for already-inactive users with no owned data)
// default  → soft delete (set isActive: false)
usersRouter.delete('/:id', requirePermission('users:edit'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const tenantId = tenantScope(authReq);
    const hardDelete = req.query.hard === 'true';

    const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (!hardDelete) {
      // Soft delete
      await prisma.user.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });

      await createAuditLog({
        req: authReq,
        action: 'DELETED',
        module: 'users',
        entityId: user.id,
        entityType: 'user',
        entityName: `${user.firstName} ${user.lastName}`,
      });

      res.json({ success: true, message: 'User deactivated' });
      return;
    }

    // ── Hard delete ────────────────────────────────────────────────────────────
    // Must be already deactivated before permanent removal
    if (user.isActive) {
      res.status(400).json({
        success: false,
        error: 'User must be deactivated before permanent deletion. Deactivate first, then permanently delete.',
      });
      return;
    }

    // Check for blocking FK references that cannot be safely deleted
    const [ownedProjects, ownedFollowUps, createdFollowUps, stageHistoryCount, followUpHistoryCount] = await Promise.all([
      prisma.project.count({ where: { ownerId: req.params.id } }),
      prisma.followUp.count({ where: { ownerId: req.params.id } }),
      prisma.followUp.count({ where: { createdById: req.params.id } }),
      prisma.stageHistory.count({ where: { changedById: req.params.id } }),
      prisma.followUpHistory.count({ where: { createdById: req.params.id } }),
    ]);

    const blockers: string[] = [];
    if (ownedProjects > 0) blockers.push(`owns ${ownedProjects} project${ownedProjects !== 1 ? 's' : ''}`);
    if (ownedFollowUps > 0) blockers.push(`is assigned to ${ownedFollowUps} follow-up${ownedFollowUps !== 1 ? 's' : ''}`);
    if (createdFollowUps > 0) blockers.push(`created ${createdFollowUps} follow-up${createdFollowUps !== 1 ? 's' : ''}`);
    if (stageHistoryCount > 0) blockers.push(`has ${stageHistoryCount} stage history record${stageHistoryCount !== 1 ? 's' : ''}`);
    if (followUpHistoryCount > 0) blockers.push(`has ${followUpHistoryCount} follow-up history record${followUpHistoryCount !== 1 ? 's' : ''}`);

    if (blockers.length > 0) {
      res.status(400).json({
        success: false,
        error: `Cannot permanently delete this user: they ${blockers.join(', ')}. Reassign or archive their data before deleting.`,
      });
      return;
    }

    // All clear — hard delete (UserRole, RefreshToken, Notification cascade automatically)
    await prisma.user.delete({ where: { id: req.params.id } });

    await createAuditLog({
      req: authReq,
      action: 'DELETED',
      module: 'users',
      entityId: user.id,
      entityType: 'user',
      entityName: `${user.firstName} ${user.lastName}`,
      metadata: { permanent: true },
    });

    res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    next(err);
  }
});
