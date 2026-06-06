import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { createAuditLog } from '../lib/audit';
import { upload, uploadToCloudinary } from '../lib/storage';
import type { AuthRequest } from '../middleware/auth';

export const tenantsRouter = Router();

// BigInt fields (maxStorageBytes, usedStorageBytes) can't be JSON.stringify'd natively
function serializeTenant(t: Record<string, unknown>) {
  return {
    ...t,
    maxStorageBytes: t.maxStorageBytes !== undefined ? Number(t.maxStorageBytes) : t.maxStorageBytes,
    usedStorageBytes: t.usedStorageBytes !== undefined ? Number(t.usedStorageBytes) : t.usedStorageBytes,
  };
}

tenantsRouter.use(authenticate);

// ── Logo upload (own-tenant admin OR super admin) ────────────────────────────
const imageUpload = upload;

tenantsRouter.post('/:id/logo', imageUpload.single('logo'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const user = authReq.user!;

    // Allow super admin or user updating their own tenant
    if (!user.isSuperAdmin && user.tenantId !== req.params.id) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    // Upload logo to Cloudinary
    const { url: logoUrl } = await uploadToCloudinary(
      req.file.buffer,
      `flowtiq/logos/${req.params.id}`,
      req.file.originalname,
    );

    // Update branding.logoUrl
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found' });
      return;
    }

    await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        branding: {
          ...(tenant.branding as object),
          logoUrl,
        },
      },
    });

    res.json({ success: true, data: { logoUrl } });
  } catch (err) {
    next(err);
  }
});

// ── Own-tenant branding/name patch (tenant admin OR super admin) ─────────────
tenantsRouter.patch('/:id/branding', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const user = authReq.user!;

    if (!user.isSuperAdmin && user.tenantId !== req.params.id) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found' });
      return;
    }

    const { name, branding } = req.body as { name?: string; branding?: object };
    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        ...(name ? { name } : {}),
        ...(branding ? { branding: { ...(tenant.branding as object), ...branding } } : {}),
      },
    });

    res.json({ success: true, data: serializeTenant(updated as unknown as Record<string, unknown>) });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id — super admin OR own-tenant admin
tenantsRouter.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthRequest;
    const user = authReq.user!;

    if (!user.isSuperAdmin && user.tenantId !== req.params.id) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { users: true, projects: true, documents: true } },
      },
    });

    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found' });
      return;
    }

    res.json({
      success: true,
      data: serializeTenant({
        ...tenant,
        userCount: tenant._count.users,
        projectCount: tenant._count.projects,
        documentCount: tenant._count.documents,
      } as Record<string, unknown>),
    });
  } catch (err) {
    next(err);
  }
});

tenantsRouter.use(requireSuperAdmin);

// GET /api/tenants — super admin only (list all tenants)
tenantsRouter.get('/', async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20', search } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, projects: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: tenants.map((t) => serializeTenant({
          ...t,
          userCount: t._count.users,
          projectCount: t._count.projects,
        } as Record<string, unknown>)),
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


const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  domain: z.string().optional(),
  subscriptionPlan: z.enum(['trial', 'starter', 'professional', 'enterprise']).default('starter'),
  maxUsers: z.number().int().min(1).default(10),
  branding: z.object({
    primaryColor: z.string().default('#3b82f6'),
    secondaryColor: z.string().default('#64748b'),
    theme: z.enum(['light', 'dark', 'system']).default('light'),
  }).default({}),
});

// POST /api/tenants
tenantsRouter.post('/', async (req, res, next) => {
  try {
    const data = createTenantSchema.parse(req.body);

    const existing = await prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) {
      res.status(409).json({ success: false, error: 'Tenant slug already exists' });
      return;
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        domain: data.domain,
        subscriptionPlan: data.subscriptionPlan,
        maxUsers: data.maxUsers,
        branding: data.branding,
        settings: {
          features: {
            workflows: true,
            documents: true,
            followUps: true,
            auditLogs: true,
            notifications: true,
            apiAccess: false,
            whiteLabel: false,
          },
          notificationSettings: { emailEnabled: true, inAppEnabled: true, whatsappEnabled: false },
          timezone: 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
        },
      },
    });

    await createAuditLog({
      req: req as unknown as AuthRequest,
      action: 'CREATED',
      module: 'tenants',
      entityId: tenant.id,
      entityType: 'tenant',
      entityName: tenant.name,
      newData: { name: tenant.name, slug: tenant.slug },
    });

    res.status(201).json({ success: true, data: serializeTenant(tenant as unknown as Record<string, unknown>) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tenants/:id
tenantsRouter.patch('/:id', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found' });
      return;
    }

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await createAuditLog({
      req: req as unknown as AuthRequest,
      action: 'UPDATED',
      module: 'tenants',
      entityId: tenant.id,
      entityType: 'tenant',
      entityName: tenant.name,
      previousData: { name: tenant.name, isActive: tenant.isActive },
      newData: req.body,
    });

    res.json({ success: true, data: serializeTenant(updated as unknown as Record<string, unknown>) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tenants/:id
tenantsRouter.delete('/:id', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found' });
      return;
    }

    // Soft delete by deactivating
    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await createAuditLog({
      req: req as unknown as AuthRequest,
      action: 'DELETED',
      module: 'tenants',
      entityId: tenant.id,
      entityType: 'tenant',
      entityName: tenant.name,
    });

    res.json({ success: true, message: 'Tenant deactivated' });
  } catch (err) {
    next(err);
  }
});
