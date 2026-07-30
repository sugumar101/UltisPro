import { db } from '../../shared/db';

export const posRepository = {
  /** Type-ahead search by product name, SKU, or barcode, with stock at the given branch. */
  search(organizationId: string, branchId: string, q: string) {
    return db
      .selectFrom('product_variants as pv')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .leftJoin('branch_stock as bs', (join) =>
        join.onRef('bs.product_variant_id', '=', 'pv.id').on('bs.branch_id', '=', branchId),
      )
      .select([
        'pv.id as productVariantId',
        'pv.sku as sku',
        'pv.barcode as barcode',
        'pv.selling_price as sellingPrice',
        'pv.mrp as mrp',
        'p.name as productName',
        'p.tax_id as taxId',
        'bs.quantity_on_hand as quantityOnHand',
      ])
      .where('p.organization_id', '=', organizationId)
      .where('p.deleted_at', 'is', null)
      .where('pv.deleted_at', 'is', null)
      .where('pv.is_active', '=', true)
      .where((eb) => eb.or([eb('p.name', 'ilike', `%${q}%`), eb('pv.sku', 'ilike', `%${q}%`), eb('pv.barcode', '=', q)]))
      .orderBy('p.name', 'asc')
      .limit(20)
      .execute();
  },

  listHeld(organizationId: string, branchId: string) {
    return db
      .selectFrom('held_bills')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('branch_id', '=', branchId)
      .orderBy('created_at', 'desc')
      .execute();
  },

  findHeld(organizationId: string, id: string) {
    return db
      .selectFrom('held_bills')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
  },

  createHeld(
    organizationId: string,
    actorUserId: string,
    values: { branch_id: string; register_code: string; customer_id: string | null; cart_snapshot: string },
  ) {
    return db
      .insertInto('held_bills')
      .values({ organization_id: organizationId, created_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  deleteHeld(organizationId: string, id: string) {
    return db.deleteFrom('held_bills').where('organization_id', '=', organizationId).where('id', '=', id).execute();
  },
};
