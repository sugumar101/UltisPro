import { db } from '../../shared/db';

interface BranchWritableFields {
  name: string;
  code: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  phone?: string;
}

export const branchesRepository = {
  listByStore(organizationId: string, storeId: string) {
    return db
      .selectFrom('branches')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('store_id', '=', storeId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();
  },

  listByOrg(organizationId: string) {
    return db
      .selectFrom('branches')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('branches')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, storeId: string, actorUserId: string, values: BranchWritableFields) {
    return db
      .insertInto('branches')
      .values({
        organization_id: organizationId,
        store_id: storeId,
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
    values: Partial<BranchWritableFields & { is_active: boolean }>,
  ) {
    return db
      .updateTable('branches')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
