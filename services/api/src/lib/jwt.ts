import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@flowtiq/shared-types';

const ACCESS_SECRET = process.env.JWT_SECRET || 'flowtiq-dev-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'flowtiq-refresh-dev-secret';

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
}
