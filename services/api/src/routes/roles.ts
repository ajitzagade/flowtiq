import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createAuditLog } from '../lib/audit';

export const rolesRouter = Router();
rolesRouter.use(authenticate);

// GET /api/roles
rolesRouter.get('/', async (req, res, next) => {
  try {
    const { tenantId } = (req as AuthRequest).user;

    const roles = await prisma.role.findMany({
      where: { tenantId: tenantId as string },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: roles.map((r) => ({
        ...r,
        permissions: r.rolePermissions.map((rp) => rp.permission),
        userCount: r._count.userRoles,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/permissions - all available permissions
rolesRouter.get('/permissions/all', async (_req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    res.json({ success: true, data: permissions });
  } catch (err) {
    next(err);
  }
});

// GET /api/roles/:id
rolesRouter.get('/:id', async (req, res, next) => {
  try {
    const { tenantId } = (req as AuthRequest).user;

    const role = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    });

    if (!role) {
      res.status(404).json({ success: false, error: 'Role not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        ...role,
        permissions: role.rolePermissions.map((rp) => rp.permission),
        userCount: role._count.userRoles,
      },
    });
  } catch (err) {
    next(err);
  }
});

const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  color: z.string().optional(),
  permissionIds: z.array(z.string()),
});

// POST /api/roles
rolesRouter.post('/', requirePermission('roles:manage'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;
    const data = createRoleSchema.parse(req.body);

    const existing = await prisma.role.findFirst({
      where: { tenantId: tenantId as string, name: data.name },
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Role name already exists' });
      return;
    }

    const role = await prisma.role.create({
      data: {
        tenantId: tenantId as string,
        name: data.name,
        description: data.description,
        color: data.color,
        rolePermissions: {
          create: data.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });

    await createAuditLog({
      req: authReq,
      action: 'CREATED',
      module: 'roles',
      entityId: role.id,
      entityType: 'role',
      entityName: role.name,
    });

    res.status(201).json({
      success: true,
      data: { ...role, permissions: role.rolePermissions.map((rp) => rp.permission) },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/roles/:id
rolesRouter.patch('/:id', requirePermission('roles:manage'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;
    const { permissionIds, ...rest } = req.body;

    const role = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!role) {
      res.status(404).json({ success: false, error: 'Role not found' });
      return;
    }

    if (role.isSystem && rest.name) {
      res.status(400).json({ success: false, error: 'Cannot rename system roles' });
      return;
    }

    const updated = await prisma.role.update({
      where: { id: req.params.id },
      data: rest,
    });

    if (permissionIds) {
      await prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } });
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId: string) => ({
          roleId: req.params.id,
          permissionId,
        })),
      });
    }

    await createAuditLog({
      req: authReq,
      action: 'UPDATED',
      module: 'roles',
      entityId: role.id,
      entityType: 'role',
      entityName: role.name,
      newData: req.body,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/roles/:id
rolesRouter.delete('/:id', requirePermission('roles:manage'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { tenantId } = authReq.user;

    const role = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: tenantId as string },
    });

    if (!role) {
      res.status(404).json({ success: false, error: 'Role not found' });
      return;
    }

    if (role.isSystem) {
      res.status(400).json({ success: false, error: 'Cannot delete system roles' });
      return;
    }

    await prisma.role.delete({ where: { id: req.params.id } });

    await createAuditLog({
      req: authReq,
      action: 'DELETED',
      module: 'roles',
      entityId: role.id,
      entityType: 'role',
      entityName: role.name,
    });

    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    next(err);
  }
});
