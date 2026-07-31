import type { ExpressionBuilder, Transaction } from 'kysely';
import { db, type Database } from '../../shared/db';
import type { ListSalesQuery } from './sales.dto';

export const salesRepository = {
  /**
   * Row-locks the store so `next_invoice_seq` can be read and incremented
   * without a race — the mechanism docs/03-database-design.md §10 requires
   * for gapless, no-duplicate invoice numbers under concurrent POS
   * registers. Must be called inside the same transaction that inserts the
   * invoice row.
   */
  async nextInvoiceNumber(trx: Transaction<Database>, storeId: string): Promise<string> {
    const store = await trx.selectFrom('stores').selectAll().where('id', '=', storeId).forUpdate().executeTakeFirstOrThrow();

    const seq = Number(store.next_invoice_seq);
    await trx
      .updateTable('stores')
      .set({ next_invoice_seq: seq + 1 })
      .where('id', '=', storeId)
      .execute();

    return `${store.invoice_prefix}-${String(seq).padStart(6, '0')}`;
  },

  createInvoice(
    trx: Transaction<Database>,
    organizationId: string,
    values: {
      store_id: string;
      branch_id: string;
      customer_id: string | null;
      invoice_number: string;
      subtotal: number;
      discount_total: number;
      tax_total: number;
      grand_total: number;
      amount_paid: number;
      register_code: string | null;
      cashier_id: string;
    },
  ) {
    return trx
      .insertInto('sales_invoices')
      .values({ organization_id: organizationId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addInvoiceItem(
    trx: Transaction<Database>,
    invoiceId: string,
    values: {
      product_variant_id: string;
      batch_id: string | null;
      quantity: number;
      unit_price: number;
      discount_amount: number;
      tax_id: string | null;
      tax_amount: number;
      line_total: number;
    },
  ) {
    return trx
      .insertInto('sales_invoice_items')
      .values({ sales_invoice_id: invoiceId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addPayment(
    trx: Transaction<Database>,
    organizationId: string,
    values: {
      sales_invoice_id: string;
      customer_id: string | null;
      amount: number;
      payment_mode: string;
      reference_no: string | null;
      created_by: string;
    },
  ) {
    return trx
      .insertInto('payments')
      .values({ organization_id: organizationId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Invoice list, joined out to the customer so the table can show who each
   * sale was to rather than a bare `customer_id`.
   *
   * Joining directly into the paginated query is safe here because an
   * invoice has at most one customer — a many-to-one join can't multiply
   * rows, so `LIMIT` and the count stay correct. (Contrast
   * `productsRepository.stockForProducts`, where the one-to-many shape
   * forced a separate query.)
   */
  async list(organizationId: string, query: ListSalesQuery) {
    let listQuery = db
      .selectFrom('sales_invoices as si')
      .leftJoin('customers as c', 'c.id', 'si.customer_id')
      .selectAll('si')
      .select(['c.full_name as customerName', 'c.phone as customerPhone', 'c.is_walkin as customerIsWalkin'])
      .where('si.organization_id', '=', organizationId)
      .where('si.deleted_at', 'is', null);

    // The count query carries the same join and the same filters — otherwise
    // a search would return 3 rows while the pager insisted there were 200.
    let countQuery = db
      .selectFrom('sales_invoices as si')
      .leftJoin('customers as c', 'c.id', 'si.customer_id')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('si.organization_id', '=', organizationId)
      .where('si.deleted_at', 'is', null);

    if (query.branchId) {
      listQuery = listQuery.where('si.branch_id', '=', query.branchId);
      countQuery = countQuery.where('si.branch_id', '=', query.branchId);
    }
    if (query.customerId) {
      listQuery = listQuery.where('si.customer_id', '=', query.customerId);
      countQuery = countQuery.where('si.customer_id', '=', query.customerId);
    }
    if (query.q) {
      // Lets the sales list be searched the way staff actually look a bill
      // up — by the customer's name or phone, or the invoice number.
      const term = `%${query.q.trim()}%`;
      const matches = (eb: ExpressionBuilder<Database, 'si' | 'c'>) =>
        eb.or([eb('c.full_name', 'ilike', term), eb('c.phone', 'ilike', term), eb('si.invoice_number', 'ilike', term)]);

      listQuery = listQuery.where(matches);
      countQuery = countQuery.where(matches);
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderBy('si.invoice_date', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(countRow?.count ?? 0) };
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('sales_invoices')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  findForUpdate(trx: Transaction<Database>, organizationId: string, id: string) {
    return trx
      .selectFrom('sales_invoices')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
  },

  listItems(invoiceId: string) {
    return db.selectFrom('sales_invoice_items').selectAll().where('sales_invoice_id', '=', invoiceId).execute();
  },

  listItemsTrx(trx: Transaction<Database>, invoiceId: string) {
    return trx.selectFrom('sales_invoice_items').selectAll().where('sales_invoice_id', '=', invoiceId).execute();
  },

  findItemForUpdate(trx: Transaction<Database>, id: string) {
    return trx.selectFrom('sales_invoice_items').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
  },

  listPayments(invoiceId: string) {
    return db.selectFrom('payments').selectAll().where('sales_invoice_id', '=', invoiceId).execute();
  },

  // --- Receipt / tax-invoice printing (M8 POS-08, M9 SAL-02) ---

  /**
   * Line items joined out to everything a printed tax invoice needs that
   * `sales_invoice_items` doesn't itself store: the product name and SKU
   * (the raw table only keeps `product_variant_id`), the HSN code, and the
   * tax rate's own CGST/SGST/IGST split percentages so the GST summary
   * block can be reconstructed per rate.
   *
   * Reads the *current* product name rather than a snapshot taken at sale
   * time — the schema has no historical name column, so a product renamed
   * after a sale reprints under its new name. Acceptable for a reprint
   * (quantities, prices and tax on the invoice are all snapshotted and
   * therefore immutable), but worth knowing before treating an old reprint
   * as byte-identical to the original.
   */
  listItemsForReceipt(invoiceId: string) {
    return db
      .selectFrom('sales_invoice_items as sii')
      .innerJoin('product_variants as pv', 'pv.id', 'sii.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .leftJoin('taxes as t', 't.id', 'sii.tax_id')
      .select([
        'sii.id as id',
        'sii.quantity as quantity',
        'sii.unit_price as unitPrice',
        'sii.discount_amount as discountAmount',
        'sii.tax_amount as taxAmount',
        'sii.line_total as lineTotal',
        'pv.sku as sku',
        'pv.attributes as attributes',
        'p.name as productName',
        'p.hsn_code as hsnCode',
        't.name as taxName',
        't.rate_percent as ratePercent',
        't.cgst_percent as cgstPercent',
        't.sgst_percent as sgstPercent',
        't.igst_percent as igstPercent',
      ])
      .where('sii.sales_invoice_id', '=', invoiceId)
      .execute();
  },

  /** Store + branch + organization + cashier header block for the invoice letterhead. */
  findInvoiceContext(organizationId: string, storeId: string, branchId: string, cashierId: string | null) {
    return Promise.all([
      db.selectFrom('stores').selectAll().where('id', '=', storeId).executeTakeFirst(),
      db.selectFrom('branches').selectAll().where('id', '=', branchId).executeTakeFirst(),
      db.selectFrom('organizations').selectAll().where('id', '=', organizationId).executeTakeFirst(),
      cashierId
        ? db.selectFrom('users').select(['id', 'full_name']).where('id', '=', cashierId).executeTakeFirst()
        : Promise.resolve(undefined),
    ]);
  },

  setStatus(trx: Transaction<Database>, id: string, status: string) {
    return trx.updateTable('sales_invoices').set({ status }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  },

  /**
   * Cumulative quantity already returned for a given invoice item, summed
   * across all sales_returns raised against the parent invoice. Used to
   * validate a new return doesn't refund more than was originally sold.
   */
  async alreadyReturnedQuantity(trx: Transaction<Database>, salesInvoiceItemId: string): Promise<number> {
    const row = await trx
      .selectFrom('sales_return_items')
      .select(({ fn }) => [fn.sum<string>('quantity').as('total')])
      .where('sales_invoice_item_id', '=', salesInvoiceItemId)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  },

  createReturnHeader(
    trx: Transaction<Database>,
    organizationId: string,
    actorUserId: string,
    values: { sales_invoice_id: string; credit_note_number: string; reason: string | null; grand_total: number },
  ) {
    return trx
      .insertInto('sales_returns')
      .values({ organization_id: organizationId, created_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addReturnItem(
    trx: Transaction<Database>,
    returnId: string,
    values: { sales_invoice_item_id: string; quantity: number; refund_amount: number },
  ) {
    return trx
      .insertInto('sales_return_items')
      .values({ sales_return_id: returnId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};

export function generateCreditNoteNumber(): string {
  // Same documented simplification as PO numbers (docs/03-database-design.md
  // §13): a short random code rather than a gapless per-org sequence.
  // Proper GST credit-note sequencing is a P1 follow-up.
  return `CN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
