import type { Transaction } from 'kysely';
import { db, type Database } from '../../shared/db';

export const purchaseReturnsRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('purchase_returns')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('purchase_returns')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .executeTakeFirst();
  },

  listItems(purchaseReturnId: string) {
    return db.selectFrom('purchase_return_items').selectAll().where('purchase_return_id', '=', purchaseReturnId).execute();
  },

  createHeader(
    trx: Transaction<Database>,
    organizationId: string,
    actorUserId: string,
    values: { purchase_order_id: string; reason: string | null; grand_total: number },
  ) {
    return trx
      .insertInto('purchase_returns')
      .values({ organization_id: organizationId, created_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addItem(
    trx: Transaction<Database>,
    purchaseReturnId: string,
    values: { product_variant_id: string; batch_id: string | null; quantity: number; unit_cost: number },
  ) {
    return trx
      .insertInto('purchase_return_items')
      .values({ purchase_return_id: purchaseReturnId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
