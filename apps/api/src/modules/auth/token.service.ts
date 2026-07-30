import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

/**
 * One branch-role assignment, embedded directly in the access token.
 *
 * Deviation from docs/02-system-architecture.md §4 (which described a
 * "permissions hash version" looked up against a cache): with only
 * system roles in MVP (custom roles are FR USR-03, P1), embedding the
 * resolved permission codes directly avoids needing a Redis permissions
 * cache that doesn't exist yet, at the cost of a slightly larger token.
 * Revisit when custom, frequently-edited roles ship.
 */
export interface AuthAssignment {
  branchId: string;
  storeId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: string;
  orgId: string;
  email: string;
  assignments: AuthAssignment[];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}
