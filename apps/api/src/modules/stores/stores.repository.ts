import { db } from '../../shared/db';

interface StoreWritableFields {
  name: string;
  gstin?: string;
  invoice_prefix?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export const storesRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('stores')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('stores')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: StoreWritableFields) {
    return db
      .insertInto('stores')
      .values({
        organization_id: organizationId,
        created_by: actorUserId,
        updated_by: actorUserId,
        ...values,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, actorUserId: string, values: Partial<StoreWritableFields>) {
    return db
      .updateTable('stores')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
