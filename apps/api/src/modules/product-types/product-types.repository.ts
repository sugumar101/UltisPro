import { db } from '../../shared/db';

interface ProductTypeWritableFields {
  name: string;
  size_options?: string[];
  default_hsn_code?: string | null;
}

export const productTypesRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('product_types')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('product_types')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: ProductTypeWritableFields) {
    return db
      .insertInto('product_types')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<ProductTypeWritableFields & { is_active: boolean }>,
  ) {
    return db
      .updateTable('product_types')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('product_types')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};

export const productCategoriesRepository = {
  list(organizationId: string, productTypeId?: string) {
    let query = db
      .selectFrom('product_categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);
    if (productTypeId) query = query.where('product_type_id', '=', productTypeId);
    return query.orderBy('name', 'asc').execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('product_categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: { product_type_id: string; name: string }) {
    return db
      .insertInto('product_categories')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(
    organizationId: string,
    id: string,
    actorUserId: string,
    values: Partial<{ name: string; is_active: boolean }>,
  ) {
    return db
      .updateTable('product_categories')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('product_categories')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
