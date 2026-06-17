import { Request } from 'express';
import prisma from './prisma';
import type { AuditAction } from '@flowtiq/shared-types';

interface AuditLogParams {
  req: Request;
  action: AuditAction;
  module: string;
  entityId?: string;
  entityType?: string;
  entityName?: string;
  previousData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(params: AuditLogParams): Promise<void> {
  const { req, action, module, entityId, entityType, entityName, previousData, newData, metadata } = params;
  const user = (req as Request & { user?: { userId: string; tenantId: string | null; email: string; isSuperAdmin: boolean; firstName?: string; lastName?: string; roles: string[] } }).user;

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : undefined;

  const mergedMetadata = {
    ...(metadata || {}),
    ...(userName && !(metadata as Record<string, unknown>)?.userName ? { userName } : {}),
  };

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: user?.tenantId ?? undefined,
        userId: user?.userId,
        userEmail: user?.email,
        userRole: user?.roles?.[0],
        action,
        module,
        entityId,
        entityType,
        entityName,
        previousData: previousData as object,
        newData: newData as object,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        metadata: mergedMetadata as object,
      },
    });
  } catch (error) {
    // Audit logging should never break the main flow
    console.error('Failed to create audit log:', error);
  }
}
