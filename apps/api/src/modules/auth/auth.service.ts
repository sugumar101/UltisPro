import { randomUUID, randomBytes, createHash } from 'crypto';
import { db } from '../../shared/db';
import { env } from '../../config/env';
import { AppError } from '../../shared/app-error';
import { logger } from '../../shared/logger';
import { recordAudit } from '../../shared/audit-log.service';
import { hashPassword, verifyPassword } from './password.util';
import { signAccessToken, type AuthAssignment } from './token.service';
import { authRepository } from './auth.repository';
import { customersRepository } from '../customers/customers.repository';
import type { RegisterOrganizationInput, LoginInput } from './auth.dto';

/** Well-known system role id seeded in migrations/0003_seed_system_rbac.sql. */
const OWNER_ROLE_ID = '00000000-0000-0000-0000-000000000001';

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Minimal duration parser for env-configured TTLs like "15m", "30d", "1h". */
function parseDurationMs(ttl: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(ttl.trim());
  if (!match) return 15 * 60 * 1000;
  const unitMs: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * unitMs[match[2]];
}

async function loadAssignments(userId: string): Promise<AuthAssignment[]> {
  const rows = await authRepository.getUserAssignments(userId);
  const byBranch = new Map<string, AuthAssignment>();

  for (const row of rows) {
    const existing = byBranch.get(row.branchId);
    if (existing) {
      if (row.permissionCode && !existing.permissions.includes(row.permissionCode)) {
        existing.permissions.push(row.permissionCode);
      }
    } else {
      byBranch.set(row.branchId, {
        branchId: row.branchId,
        storeId: row.storeId,
        roleId: row.roleId,
        roleName: row.roleName,
        permissions: row.permissionCode ? [row.permissionCode] : [],
      });
    }
  }

  return Array.from(byBranch.values());
}

async function issueTokenPair(userId: string, orgId: string, email: string, assignments: AuthAssignment[]) {
  const accessToken = signAccessToken({ sub: userId, orgId, email, assignments });

  const refreshTokenPlain = randomBytes(48).toString('hex');
  const familyId = randomUUID();
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_TTL));

  await authRepository.createRefreshToken({
    userId,
    tokenHash: hashOpaqueToken(refreshTokenPlain),
    familyId,
    expiresAt,
  });

  return { accessToken, refreshToken: refreshTokenPlain, refreshTokenExpiresAt: expiresAt };
}

export const authService = {
  async registerOrganization(input: RegisterOrganizationInput, ipAddress: string | null) {
    const existing = await authRepository.findUserByEmail(input.owner.email);
    if (existing) {
      throw new AppError('CONFLICT', 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.owner.password);

    const result = await db.transaction().execute(async (trx) => {
      const organization = await trx
        .insertInto('organizations')
        .values({
          legal_name: input.organization.legalName,
          display_name: input.organization.displayName,
          business_type: input.organization.businessType,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const store = await trx
        .insertInto('stores')
        .values({ organization_id: organization.id, name: input.storeName })
        .returningAll()
        .executeTakeFirstOrThrow();

      const branch = await trx
        .insertInto('branches')
        .values({
          organization_id: organization.id,
          store_id: store.id,
          name: input.branchName,
          code: input.branchCode,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const user = await trx
        .insertInto('users')
        .values({
          organization_id: organization.id,
          email: input.owner.email,
          full_name: input.owner.fullName,
          password_hash: passwordHash,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('user_store_roles')
        .values({
          organization_id: organization.id,
          user_id: user.id,
          branch_id: branch.id,
          role_id: OWNER_ROLE_ID,
        })
        .execute();

      // Seed a default "Piece" unit so a brand-new org can create its first
      // product immediately, without a detour through Settings > Units
      // first (products.unit_id is NOT NULL — see docs/03-database-design.md §5).
      const defaultUnit = await trx
        .insertInto('units')
        .values({
          organization_id: organization.id,
          name: 'Piece',
          symbol: 'pcs',
          created_by: user.id,
          updated_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Seed a default walk-in customer so POS/checkout (Phase 5) always has
      // a fallback customer record to attach a sale to when no specific
      // customer is selected — see docs/03-database-design.md §14.
      const walkinCustomer = await customersRepository.createWalkin(trx, organization.id, user.id);

      return { organization, store, branch, user, defaultUnit, walkinCustomer };
    });

    await recordAudit({
      organizationId: result.organization.id,
      actorUserId: result.user.id,
      action: 'create',
      entityTable: 'organizations',
      entityId: result.organization.id,
      after: { legalName: result.organization.legal_name, displayName: result.organization.display_name },
      ipAddress,
    });

    const assignments = await loadAssignments(result.user.id);
    const tokens = await issueTokenPair(result.user.id, result.organization.id, result.user.email, assignments);

    return { ...tokens, user: result.user, organization: result.organization };
  },

  async login(input: LoginInput, ipAddress: string | null) {
    const user = await authRepository.findUserByEmail(input.email);

    if (!user || !user.is_active) {
      throw new AppError('UNAUTHENTICATED', 'Invalid email or password');
    }

    if (user.locked_until && user.locked_until > new Date()) {
      throw new AppError('UNAUTHENTICATED', 'Account temporarily locked due to repeated failed logins');
    }

    const passwordMatches = await verifyPassword(input.password, user.password_hash);
    if (!passwordMatches) {
      await authRepository.recordFailedLogin(user.id);
      await recordAudit({
        organizationId: user.organization_id,
        actorUserId: user.id,
        action: 'login_failed',
        entityTable: 'users',
        entityId: user.id,
        ipAddress,
      });
      throw new AppError('UNAUTHENTICATED', 'Invalid email or password');
    }

    await authRepository.recordLoginSuccess(user.id);
    await recordAudit({
      organizationId: user.organization_id,
      actorUserId: user.id,
      action: 'login',
      entityTable: 'users',
      entityId: user.id,
      ipAddress,
    });

    const assignments = await loadAssignments(user.id);
    const tokens = await issueTokenPair(user.id, user.organization_id, user.email, assignments);
    return { ...tokens, user };
  },

  async refresh(refreshTokenPlain: string | undefined) {
    if (!refreshTokenPlain) {
      throw new AppError('UNAUTHENTICATED', 'Missing refresh token');
    }

    const tokenHash = hashOpaqueToken(refreshTokenPlain);
    const existing = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!existing) {
      throw new AppError('UNAUTHENTICATED', 'Invalid refresh token');
    }

    if (existing.revoked_at || existing.expires_at < new Date()) {
      // Reuse of an already-revoked/expired token is a strong signal of theft:
      // revoke the whole rotation family, not just this one token.
      await authRepository.revokeRefreshTokenFamily(existing.family_id);
      throw new AppError('UNAUTHENTICATED', 'Refresh token has been revoked; please log in again');
    }

    await authRepository.revokeRefreshToken(existing.id);

    const user = await authRepository.findUserById(existing.user_id);
    if (!user || !user.is_active) {
      throw new AppError('UNAUTHENTICATED', 'Account is no longer active');
    }

    const assignments = await loadAssignments(user.id);
    const tokens = await issueTokenPairWithFamily(user.id, user.organization_id, user.email, assignments, existing.family_id);

    return { ...tokens, user };
  },

  async logout(refreshTokenPlain: string | undefined): Promise<void> {
    if (!refreshTokenPlain) return;
    const existing = await authRepository.findRefreshTokenByHash(hashOpaqueToken(refreshTokenPlain));
    if (existing) {
      await authRepository.revokeRefreshTokenFamily(existing.family_id);
    }
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await authRepository.findUserByEmail(email);
    // Behave identically whether or not the account exists, to avoid leaking
    // which emails are registered.
    if (!user) return;

    const resetTokenPlain = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(resetTokenPlain),
      expiresAt,
    });

    // Email delivery isn't wired yet (SES + background workers arrive with
    // the Notifications module, docs/04-module-breakdown.md M13). Logging
    // the token keeps this flow fully testable end-to-end in the meantime.
    logger.info(
      { email, resetTokenPlain },
      'Password reset requested — email delivery not yet wired, token logged for now',
    );
  },

  async resetPassword(tokenPlain: string, newPassword: string): Promise<void> {
    const record = await authRepository.findPasswordResetTokenByHash(hashOpaqueToken(tokenPlain));

    if (!record || record.used_at || record.expires_at < new Date()) {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Reset link is invalid or has expired');
    }

    const passwordHash = await hashPassword(newPassword);
    await authRepository.updateUserPassword(record.user_id, passwordHash);
    await authRepository.markPasswordResetTokenUsed(record.id);
    // A password reset invalidates every existing session, not just future ones.
    await authRepository.revokeAllRefreshTokensForUser(record.user_id);

    const user = await authRepository.findUserById(record.user_id);
    if (user) {
      await recordAudit({
        organizationId: user.organization_id,
        actorUserId: user.id,
        action: 'update',
        entityTable: 'users',
        entityId: user.id,
        after: { passwordReset: true },
      });
    }
  },

  async me(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const assignments = await loadAssignments(user.id);
    return { user, assignments };
  },
};

/** Same as issueTokenPair but preserves the existing rotation family id. */
async function issueTokenPairWithFamily(
  userId: string,
  orgId: string,
  email: string,
  assignments: AuthAssignment[],
  familyId: string,
) {
  const accessToken = signAccessToken({ sub: userId, orgId, email, assignments });
  const refreshTokenPlain = randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_TTL));

  await authRepository.createRefreshToken({
    userId,
    tokenHash: hashOpaqueToken(refreshTokenPlain),
    familyId,
    expiresAt,
  });

  return { accessToken, refreshToken: refreshTokenPlain, refreshTokenExpiresAt: expiresAt };
}
