import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../shared/app-error';
import { verifyAccessToken, type AccessTokenPayload } from './token.service';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessTokenPayload;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('UNAUTHENTICATED', 'Missing or malformed Authorization header');
  }

  try {
    req.auth = verifyAccessToken(header.slice('Bearer '.length));
    next();
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token');
  }
}

/**
 * Org-wide permission gate for MVP. Grants access if ANY of the user's
 * branch-role assignments include the permission; branch-specific
 * enforcement (e.g. "only at branches you're assigned to") is left to each
 * service, which has req.auth.assignments available for that check.
 * See token.service.ts for why assignments/permissions live directly on the
 * token rather than behind a permissions-hash cache.
 */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required');
    }
    const hasPermission = req.auth.assignments.some((a) => a.permissions.includes(permission));
    if (!hasPermission) {
      throw new AppError('UNAUTHORIZED', `Missing required permission: ${permission}`);
    }
    next();
  };
}
