import { db } from '../../shared/db';

export const categoriesRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  /**
   * Case-insensitive lookup of a **top-level** category by name, backing the
   * type-to-create Category field on the product forms so typing "Shirts"
   * twice reuses the first one instead of silently creating a duplicate.
   *
   * Scoped to `parent_id IS NULL` deliberately: the table's
   * `UNIQUE (organization_id, parent_id, name)` constraint does not actually
   * prevent duplicate top-level names, because Postgres treats NULLs as
   * distinct in unique indexes. So uniqueness for root categories is
   * enforced here, in code, at the one place that creates them by name.
   */
  findByName(organizationId: string, name: string) {
    return db
      .selectFrom('categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('parent_id', 'is', null)
      .where((eb) => eb(eb.fn('lower', ['name']), '=', name.trim().toLowerCase()))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: { name: string; parent_id?: string }) {
    return db
      .insertInto('categories')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<{ name: string; parent_id: string | null }>,
  ) {
    return db
      .updateTable('categories')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('categories')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
