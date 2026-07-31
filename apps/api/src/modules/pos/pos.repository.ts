import { db } from '../../shared/db';

export const posRepository = {
  /**
   * Type-ahead search by product name, SKU, or barcode, with stock at the
   * given branch.
   *
   * The query is tokenised on whitespace and every token must match *some*
   * field (an AND of ORs). Matching the raw string as one `%...%` substring
   * instead — which is what this did originally — meant "classic oversized"
   * only matched if those words appeared adjacent and in that exact order,
   * so a cashier typing the words in a different order, or with a stray
   * double space, got nothing back. Tokenising makes partial, reordered and
   * sloppily-spaced searches all work, which is the normal way someone
   * actually types at a till.
   *
   * Barcode uses `ilike` too so a partially-typed or hand-keyed barcode
   * still finds the item; exact-match scanning is handled client-side by
   * comparing the scanned value against the returned `barcode`.
   */
  search(organizationId: string, branchId: string, q: string) {
    const terms = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);

    let query = db
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
        'pv.attributes as attributes',
        'p.name as productName',
        'p.tax_id as taxId',
        'bs.quantity_on_hand as quantityOnHand',
      ])
      .where('p.organization_id', '=', organizationId)
      .where('p.deleted_at', 'is', null)
      .where('pv.deleted_at', 'is', null)
      .where('pv.is_active', '=', true);

    for (const term of terms) {
      query = query.where((eb) =>
        eb.or([
          eb('p.name', 'ilike', `%${term}%`),
          eb('pv.sku', 'ilike', `%${term}%`),
          eb('pv.barcode', 'ilike', `%${term}%`),
        ]),
      );
    }

    return query.orderBy('p.name', 'asc').orderBy('pv.sku', 'asc').limit(20).execute();
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
