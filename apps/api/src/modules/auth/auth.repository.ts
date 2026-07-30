import { db } from '../../shared/db';

export interface AssignmentRow {
  branchId: string;
  storeId: string;
  roleId: string;
  roleName: string;
  permissionCode: string | null;
}

export const authRepository = {
  findUserByEmail(email: string) {
    return db.selectFrom('users').selectAll().where('email', '=', email).where('deleted_at', 'is', null).executeTakeFirst();
  },

  findUserById(id: string) {
    return db.selectFrom('users').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
  },

  async getUserAssignments(userId: string): Promise<AssignmentRow[]> {
    const rows = await db
      .selectFrom('user_store_roles as usr')
      .innerJoin('roles', 'roles.id', 'usr.role_id')
      .innerJoin('branches', 'branches.id', 'usr.branch_id')
      .leftJoin('role_permissions', 'role_permissions.role_id', 'roles.id')
      .leftJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
      .select([
        'usr.branch_id as branchId',
        'branches.store_id as storeId',
        'usr.role_id as roleId',
        'roles.name as roleName',
        'permissions.code as permissionCode',
      ])
      .where('usr.user_id', '=', userId)
      .execute();

    return rows;
  },

  async recordFailedLogin(userId: string): Promise<void> {
    const current = await db
      .selectFrom('users')
      .select(['failed_login_count'])
      .where('id', '=', userId)
      .executeTakeFirst();

    const newCount = (current?.failed_login_count ?? 0) + 1;
    const lockedUntil = newCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await db
      .updateTable('users')
      .set({ failed_login_count: newCount, locked_until: lockedUntil })
      .where('id', '=', userId)
      .execute();
  },

  async recordLoginSuccess(userId: string): Promise<void> {
    await db
      .updateTable('users')
      .set({ last_login_at: new Date(), failed_login_count: 0, locked_until: null })
      .where('id', '=', userId)
      .execute();
  },

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db.updateTable('users').set({ password_hash: passwordHash }).where('id', '=', userId).execute();
  },

  createRefreshToken(params: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) {
    return db
      .insertInto('refresh_tokens')
      .values({
        user_id: params.userId,
        token_hash: params.tokenHash,
        family_id: params.familyId,
        expires_at: params.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  findRefreshTokenByHash(tokenHash: string) {
    return db.selectFrom('refresh_tokens').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst();
  },

  async revokeRefreshToken(id: string): Promise<void> {
    await db.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', id).execute();
  },

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('family_id', '=', familyId)
      .where('revoked_at', 'is', null)
      .execute();
  },

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await db
      .updateTable('refresh_tokens')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  },

  createPasswordResetToken(params: { userId: string; tokenHash: string; expiresAt: Date }) {
    return db
      .insertInto('password_reset_tokens')
      .values({ user_id: params.userId, token_hash: params.tokenHash, expires_at: params.expiresAt })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  findPasswordResetTokenByHash(tokenHash: string) {
    return db
      .selectFrom('password_reset_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
  },

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await db.updateTable('password_reset_tokens').set({ used_at: new Date() }).where('id', '=', id).execute();
  },
};
