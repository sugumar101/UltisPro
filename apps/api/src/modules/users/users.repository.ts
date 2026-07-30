import { db } from '../../shared/db';

export const usersRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('users')
      .select(['id', 'email', 'full_name', 'phone', 'is_active', 'last_login_at', 'created_at'])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('users')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  findByEmailGlobal(email: string) {
    return db.selectFrom('users').select(['id']).where('email', '=', email).executeTakeFirst();
  },

  create(
    organizationId: string,
    actorUserId: string,
    values: { email: string; full_name: string; password_hash: string; phone?: string },
  ) {
    return db
      .insertInto('users')
      .values({
        organization_id: organizationId,
        created_by: actorUserId,
        updated_by: actorUserId,
        ...values,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<{ full_name: string; phone: string; is_active: boolean }>,
  ) {
    return db
      .updateTable('users')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getAssignments(userId: string) {
    return db
      .selectFrom('user_store_roles as usr')
      .innerJoin('roles', 'roles.id', 'usr.role_id')
      .innerJoin('branches', 'branches.id', 'usr.branch_id')
      .select([
        'usr.id as id',
        'usr.branch_id as branchId',
        'branches.name as branchName',
        'usr.role_id as roleId',
        'roles.name as roleName',
      ])
      .where('usr.user_id', '=', userId)
      .execute();
  },

  upsertAssignment(organizationId: string, userId: string, branchId: string, roleId: string) {
    return db
      .insertInto('user_store_roles')
      .values({ organization_id: organizationId, user_id: userId, branch_id: branchId, role_id: roleId })
      .onConflict((oc) => oc.columns(['user_id', 'branch_id']).doUpdateSet({ role_id: roleId }))
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async removeAssignment(userId: string, branchId: string): Promise<void> {
    await db
      .deleteFrom('user_store_roles')
      .where('user_id', '=', userId)
      .where('branch_id', '=', branchId)
      .execute();
  },
};
