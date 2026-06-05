import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import type { JwtPayload } from '@flowtiq/shared-types';

export interface AuthRequest extends Request {
  user: JwtPayload;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthRequest).user;
  if (!user?.isSuperAdmin) {
    res.status(403).json({ success: false, error: 'Super admin access required' });
    return;
  }
  next();
}
