import { sql } from 'kysely';
import { db } from '../../shared/db';

export const dashboardRepository = {
  async todaySales(organizationId: string) {
    const row = await db
      .selectFrom('sales_invoices')
      .select(({ fn }) => [fn.sum<string>('grand_total').as('total'), fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('status', '!=', 'void')
      .where('invoice_date', '>=', sql<Date>`date_trunc('day', now())`)
      .executeTakeFirst();
    return { total: Number(row?.total ?? 0), count: Number(row?.count ?? 0) };
  },

  async lowStockCount(organizationId: string) {
    const row = await db
      .selectFrom('branch_stock as bs')
      .innerJoin('product_variants as pv', 'pv.id', 'bs.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('p.organization_id', '=', organizationId)
      .whereRef('bs.quantity_on_hand', '<=', 'pv.reorder_level')
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  },

  async receivables(organizationId: string) {
    const row = await db
      .selectFrom('customers')
      .select(({ fn }) => [fn.sum<string>('outstanding_balance').as('total')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  },

  async payables(organizationId: string) {
    const row = await db
      .selectFrom('suppliers')
      .select(({ fn }) => [fn.sum<string>('outstanding_balance').as('total')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  },

  async activeProductCount(organizationId: string) {
    const row = await db
      .selectFrom('products')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .where('is_active', '=', true)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  },

  async pendingPurchaseOrderCount(organizationId: string) {
    const row = await db
      .selectFrom('purchase_orders')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .where('status', 'in', ['draft', 'approved', 'partially_received'])
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  },

  /** Daily sales totals for the trailing `days` days, oldest first. */
  salesTrend(organizationId: string, days: number) {
    return db
      .selectFrom('sales_invoices')
      .select((eb) => [
        sql<string>`date_trunc('day', invoice_date)`.as('day'),
        eb.fn.sum<string>('grand_total').as('total'),
        eb.fn.countAll<string>().as('count'),
      ])
      .where('organization_id', '=', organizationId)
      .where('status', '!=', 'void')
      .where('invoice_date', '>=', sql<Date>`now() - (${`${days} days`})::interval`)
      .groupBy(sql`date_trunc('day', invoice_date)`)
      .orderBy('day', 'asc')
      .execute();
  },

  recentSales(organizationId: string, limit: number) {
    return db
      .selectFrom('sales_invoices')
      .select(['id', 'invoice_number', 'grand_total', 'invoice_date', 'status'])
      .where('organization_id', '=', organizationId)
      .orderBy('invoice_date', 'desc')
      .limit(limit)
      .execute();
  },

  recentPurchaseOrders(organizationId: string, limit: number) {
    return db
      .selectFrom('purchase_orders')
      .select(['id', 'po_number', 'grand_total', 'status', 'created_at'])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
  },
};
