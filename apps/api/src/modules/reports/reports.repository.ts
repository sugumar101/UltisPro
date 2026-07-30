import { sql } from 'kysely';
import { db } from '../../shared/db';

export const reportsRepository = {
  salesByDay(organizationId: string, fromDate: string, toDate: string, branchId?: string) {
    let query = db
      .selectFrom('sales_invoices')
      .select((eb) => [
        sql<string>`date_trunc('day', invoice_date)`.as('day'),
        eb.fn.countAll<string>().as('invoiceCount'),
        eb.fn.sum<string>('subtotal').as('subtotal'),
        eb.fn.sum<string>('discount_total').as('discountTotal'),
        eb.fn.sum<string>('tax_total').as('taxTotal'),
        eb.fn.sum<string>('grand_total').as('grandTotal'),
      ])
      .where('organization_id', '=', organizationId)
      .where('status', '!=', 'void')
      .where('invoice_date', '>=', new Date(fromDate))
      .where('invoice_date', '<=', new Date(toDate));

    if (branchId) query = query.where('branch_id', '=', branchId);

    return query.groupBy(sql`date_trunc('day', invoice_date)`).orderBy('day', 'asc').execute();
  },

  bestSellers(organizationId: string, fromDate: string, toDate: string, limit: number) {
    return db
      .selectFrom('sales_invoice_items as sii')
      .innerJoin('sales_invoices as si', 'si.id', 'sii.sales_invoice_id')
      .innerJoin('product_variants as pv', 'pv.id', 'sii.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .select((eb) => [
        'p.name as productName',
        'pv.sku as sku',
        eb.fn.sum<string>('sii.quantity').as('quantitySold'),
        eb.fn.sum<string>('sii.line_total').as('revenue'),
      ])
      .where('si.organization_id', '=', organizationId)
      .where('si.status', '!=', 'void')
      .where('si.invoice_date', '>=', new Date(fromDate))
      .where('si.invoice_date', '<=', new Date(toDate))
      .groupBy(['p.name', 'pv.sku'])
      .orderBy('quantitySold', 'desc')
      .limit(limit)
      .execute();
  },

  inventoryValuation(organizationId: string, branchId?: string) {
    let query = db
      .selectFrom('branch_stock as bs')
      .innerJoin('product_variants as pv', 'pv.id', 'bs.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .innerJoin('branches as b', 'b.id', 'bs.branch_id')
      .select([
        'b.name as branchName',
        'p.name as productName',
        'pv.sku as sku',
        'bs.quantity_on_hand as quantityOnHand',
        'pv.purchase_price as purchasePrice',
        'pv.reorder_level as reorderLevel',
      ])
      .where('p.organization_id', '=', organizationId);

    if (branchId) query = query.where('bs.branch_id', '=', branchId);

    return query.orderBy('b.name', 'asc').orderBy('p.name', 'asc').execute();
  },

  /** Raw sold lines with their tax rate split, for output-tax (GST) aggregation in JS. */
  gstSalesLines(organizationId: string, fromDate: string, toDate: string) {
    return db
      .selectFrom('sales_invoice_items as sii')
      .innerJoin('sales_invoices as si', 'si.id', 'sii.sales_invoice_id')
      .leftJoin('taxes as t', 't.id', 'sii.tax_id')
      .select([
        't.name as taxName',
        't.rate_percent as ratePercent',
        't.cgst_percent as cgstPercent',
        't.sgst_percent as sgstPercent',
        't.igst_percent as igstPercent',
        'sii.tax_amount as taxAmount',
        'sii.quantity as quantity',
        'sii.unit_price as unitPrice',
        'sii.discount_amount as discountAmount',
      ])
      .where('si.organization_id', '=', organizationId)
      .where('si.status', '!=', 'void')
      .where('si.invoice_date', '>=', new Date(fromDate))
      .where('si.invoice_date', '<=', new Date(toDate))
      .execute();
  },

  /** Raw received purchase lines with their tax rate split, for input-tax aggregation in JS. */
  gstPurchaseLines(organizationId: string, fromDate: string, toDate: string) {
    return db
      .selectFrom('purchase_order_items as poi')
      .innerJoin('purchase_orders as po', 'po.id', 'poi.purchase_order_id')
      .leftJoin('taxes as t', 't.id', 'poi.tax_id')
      .select([
        't.name as taxName',
        't.rate_percent as ratePercent',
        't.cgst_percent as cgstPercent',
        't.sgst_percent as sgstPercent',
        't.igst_percent as igstPercent',
        'poi.unit_cost as unitCost',
        'poi.quantity_received as quantityReceived',
      ])
      .where('po.organization_id', '=', organizationId)
      .where('po.deleted_at', 'is', null)
      .where('po.order_date', '>=', new Date(fromDate))
      .where('po.order_date', '<=', new Date(toDate))
      .execute();
  },

  cashInByMode(organizationId: string, fromDate: string, toDate: string) {
    return db
      .selectFrom('payments')
      .select((eb) => ['payment_mode', eb.fn.sum<string>('amount').as('total')])
      .where('organization_id', '=', organizationId)
      .where('paid_at', '>=', new Date(fromDate))
      .where('paid_at', '<=', new Date(toDate))
      .groupBy('payment_mode')
      .execute();
  },

  cashOutByMode(organizationId: string, fromDate: string, toDate: string) {
    return db
      .selectFrom('supplier_payments')
      .select((eb) => ['payment_mode', eb.fn.sum<string>('amount').as('total')])
      .where('organization_id', '=', organizationId)
      .where('paid_at', '>=', new Date(fromDate))
      .where('paid_at', '<=', new Date(toDate))
      .groupBy('payment_mode')
      .execute();
  },
};
