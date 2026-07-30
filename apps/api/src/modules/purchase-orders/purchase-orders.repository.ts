import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { randomBytes } from 'crypto';
import { db, type Database } from '../../shared/db';

export function generatePoNumber(): string {
  // Not a gapless legal sequence like sales_invoices.invoice_number (which
  // has a GST compliance requirement, see docs/03-database-design.md §10)
  // — POs have no equivalent requirement, so a short random suffix is
  // sufficient and avoids adding a new per-org counter column just for this.
  return `PO-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export const purchaseOrdersRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('purchase_orders')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  findForUpdate(trx: Transaction<Database>, organizationId: string, id: string) {
    return trx
      .selectFrom('purchase_orders')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
  },

  listItems(purchaseOrderId: string) {
    return db.selectFrom('purchase_order_items').selectAll().where('purchase_order_id', '=', purchaseOrderId).execute();
  },

  listItemsTrx(trx: Transaction<Database>, purchaseOrderId: string) {
    return trx.selectFrom('purchase_order_items').selectAll().where('purchase_order_id', '=', purchaseOrderId).execute();
  },

  findItemForUpdate(trx: Transaction<Database>, id: string) {
    return trx.selectFrom('purchase_order_items').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  },

  createHeader(
    trx: Transaction<Database>,
    organizationId: string,
    actorUserId: string,
    values: {
      branch_id: string;
      supplier_id: string;
      po_number: string;
      expected_date?: string;
      subtotal: number;
      tax_total: number;
      grand_total: number;
    },
  ) {
    return trx
      .insertInto('purchase_orders')
      .values({ organization_id: organizationId, created_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addItem(
    trx: Transaction<Database>,
    purchaseOrderId: string,
    values: {
      product_variant_id: string;
      quantity_ordered: number;
      unit_cost: number;
      tax_id: string | null;
      line_total: number;
    },
  ) {
    return trx
      .insertInto('purchase_order_items')
      .values({ purchase_order_id: purchaseOrderId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  setStatus(
    trx: Transaction<Database>,
    id: string,
    status: string,
    extra: { approved_by?: string; approved_at?: Date } = {},
  ) {
    return trx
      .updateTable('purchase_orders')
      .set({ status, ...extra })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  incrementItemReceived(trx: Transaction<Database>, itemId: string, quantityReceived: number) {
    return trx
      .updateTable('purchase_order_items')
      .set({
        quantity_received: sql`quantity_received + ${quantityReceived}`,
      })
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string) {
    return db
      .updateTable('purchase_orders')
      .set({ deleted_at: new Date() })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
