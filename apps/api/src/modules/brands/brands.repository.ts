import { db } from '../../shared/db';

export const brandsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('brands')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('brands')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  /** Case-insensitive name lookup, backing the type-to-create Brand field on the product forms. */
  findByName(organizationId: string, name: string) {
    return db
      .selectFrom('brands')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where((eb) => eb(eb.fn('lower', ['name']), '=', name.trim().toLowerCase()))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: { name: string }) {
    return db
      .insertInto('brands')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, actorUserId: string, values: Partial<{ name: string }>) {
    return db
      .updateTable('brands')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('brands')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
