import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import type { PermissionCode } from '@flowtiq/shared-types';

export function requirePermission(permissionCode: PermissionCode) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (user.isSuperAdmin) {
      next();
      return;
    }
    if (!user.permissions.includes(permissionCode)) {
      res.status(403).json({
        success: false,
        error: `Permission denied. Required: ${permissionCode}`,
      });
      return;
    }
    next();
  };
}

export function requireAnyPermission(permissionCodes: PermissionCode[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (user.isSuperAdmin) {
      next();
      return;
    }
    const hasPermission = permissionCodes.some((code) => user.permissions.includes(code));
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: `Permission denied. Required one of: ${permissionCodes.join(', ')}`,
      });
      return;
    }
    next();
  };
}
