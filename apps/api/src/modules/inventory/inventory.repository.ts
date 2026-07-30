import type { Transaction } from 'kysely';
import { db, type Database } from '../../shared/db';
import { AppError } from '../../shared/app-error';

export type MovementType =
  | 'purchase'
  | 'purchase_return'
  | 'sale'
  | 'sale_return'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'transfer_in'
  | 'transfer_out';

export interface ApplyMovementParams {
  organizationId: string;
  branchId: string;
  productVariantId: string;
  batchId: string | null;
  movementType: MovementType;
  referenceTable: string;
  referenceId: string;
  quantityDelta: number;
  unitCost?: number;
  actorUserId: string | null;
}

/**
 * The single choke point every stock-affecting write goes through. Locks the
 * (branch, variant, batch) row with SELECT ... FOR UPDATE before reading it,
 * so concurrent writers on the same row serialize instead of racing, then
 * writes stock_ledger and rolls branch_stock forward in the same
 * transaction. This is what makes the reconciliation invariant
 * (SUM(quantity_delta) == quantity_on_hand) hold by construction rather
 * than by convention — see docs/03-database-design.md §10.
 */
export async function applyStockMovement(trx: Transaction<Database>, params: ApplyMovementParams) {
  let stockQuery = trx
    .selectFrom('branch_stock')
    .selectAll()
    .where('branch_id', '=', params.branchId)
    .where('product_variant_id', '=', params.productVariantId);
  stockQuery = params.batchId
    ? stockQuery.where('batch_id', '=', params.batchId)
    : stockQuery.where('batch_id', 'is', null);

  const existing = await stockQuery.forUpdate().executeTakeFirst();

  const currentQty = existing ? Number(existing.quantity_on_hand) : 0;
  const newQty = currentQty + params.quantityDelta;

  if (newQty < 0) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      `Resulting stock cannot be negative (current: ${currentQty}, change: ${params.quantityDelta})`,
    );
  }

  if (existing) {
    await trx.updateTable('branch_stock').set({ quantity_on_hand: newQty }).where('id', '=', existing.id).execute();
  } else {
    await trx
      .insertInto('branch_stock')
      .values({
        organization_id: params.organizationId,
        branch_id: params.branchId,
        product_variant_id: params.productVariantId,
        batch_id: params.batchId,
        quantity_on_hand: newQty,
      })
      .execute();
  }

  return trx
    .insertInto('stock_ledger')
    .values({
      organization_id: params.organizationId,
      branch_id: params.branchId,
      product_variant_id: params.productVariantId,
      batch_id: params.batchId,
      movement_type: params.movementType,
      reference_table: params.referenceTable,
      reference_id: params.referenceId,
      quantity_delta: params.quantityDelta,
      balance_after: newQty,
      unit_cost: params.unitCost ?? null,
      created_by: params.actorUserId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export const inventoryRepository = {
  async getStock(organizationId: string, filters: { branchId?: string; productVariantId?: string }) {
    let query = db
      .selectFrom('branch_stock as bs')
      .innerJoin('product_variants as pv', 'pv.id', 'bs.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .leftJoin('batches as b', 'b.id', 'bs.batch_id')
      .select([
        'bs.id as id',
        'bs.branch_id as branchId',
        'bs.product_variant_id as productVariantId',
        'bs.batch_id as batchId',
        'bs.quantity_on_hand as quantityOnHand',
        'bs.quantity_reserved as quantityReserved',
        'pv.sku as sku',
        'pv.reorder_level as reorderLevel',
        'p.name as productName',
        'b.batch_number as batchNumber',
        'b.expiry_date as expiryDate',
      ])
      .where('p.organization_id', '=', organizationId);

    if (filters.branchId) query = query.where('bs.branch_id', '=', filters.branchId);
    if (filters.productVariantId) query = query.where('bs.product_variant_id', '=', filters.productVariantId);

    return query.orderBy('p.name', 'asc').execute();
  },

  async getLowStock(organizationId: string, branchId?: string) {
    let query = db
      .selectFrom('branch_stock as bs')
      .innerJoin('product_variants as pv', 'pv.id', 'bs.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .select([
        'bs.branch_id as branchId',
        'bs.product_variant_id as productVariantId',
        'bs.quantity_on_hand as quantityOnHand',
        'pv.sku as sku',
        'pv.reorder_level as reorderLevel',
        'p.name as productName',
      ])
      .where('p.organization_id', '=', organizationId)
      .whereRef('bs.quantity_on_hand', '<=', 'pv.reorder_level');

    if (branchId) query = query.where('bs.branch_id', '=', branchId);

    return query.orderBy('p.name', 'asc').execute();
  },

  async getExpiringBatches(organizationId: string, withinDays: number) {
    return db
      .selectFrom('batches as b')
      .innerJoin('product_variants as pv', 'pv.id', 'b.product_variant_id')
      .innerJoin('products as p', 'p.id', 'pv.product_id')
      .select([
        'b.id as batchId',
        'b.batch_number as batchNumber',
        'b.expiry_date as expiryDate',
        'pv.id as productVariantId',
        'pv.sku as sku',
        'p.name as productName',
      ])
      .where('p.organization_id', '=', organizationId)
      .where('b.expiry_date', 'is not', null)
      .where('b.expiry_date', '<=', new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000))
      .orderBy('b.expiry_date', 'asc')
      .execute();
  },

  async getLedger(
    organizationId: string,
    filters: { branchId: string; productVariantId?: string; page: number; pageSize: number },
  ) {
    let query = db
      .selectFrom('stock_ledger')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('branch_id', '=', filters.branchId);
    let countQuery = db
      .selectFrom('stock_ledger')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('branch_id', '=', filters.branchId);

    if (filters.productVariantId) {
      query = query.where('product_variant_id', '=', filters.productVariantId);
      countQuery = countQuery.where('product_variant_id', '=', filters.productVariantId);
    }

    const [rows, countRow] = await Promise.all([
      query
        .orderBy('created_at', 'desc')
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(countRow?.count ?? 0) };
  },

  findOrCreateBatch(
    trx: Transaction<Database>,
    organizationId: string,
    productVariantId: string,
    batchNumber: string,
    expiryDate: string | undefined,
    purchasePrice: number | undefined,
  ) {
    return trx
      .selectFrom('batches')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('product_variant_id', '=', productVariantId)
      .where('batch_number', '=', batchNumber)
      .executeTakeFirst()
      .then((existing) => {
        if (existing) return existing;
        return trx
          .insertInto('batches')
          .values({
            organization_id: organizationId,
            product_variant_id: productVariantId,
            batch_number: batchNumber,
            ...(expiryDate !== undefined && { expiry_date: expiryDate }),
            ...(purchasePrice !== undefined && { purchase_price: purchasePrice }),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      });
  },

  createAdjustmentHeader(
    trx: Transaction<Database>,
    organizationId: string,
    branchId: string,
    actorUserId: string,
    reasonCode: string,
    notes: string | undefined,
  ) {
    return trx
      .insertInto('stock_adjustments')
      .values({
        organization_id: organizationId,
        branch_id: branchId,
        reason_code: reasonCode,
        notes: notes ?? null,
        created_by: actorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addAdjustmentItem(
    trx: Transaction<Database>,
    adjustmentId: string,
    productVariantId: string,
    batchId: string | null,
    quantityDelta: number,
  ) {
    return trx
      .insertInto('stock_adjustment_items')
      .values({
        stock_adjustment_id: adjustmentId,
        product_variant_id: productVariantId,
        batch_id: batchId,
        quantity_delta: quantityDelta,
      })
      .execute();
  },

  createTransferHeader(
    trx: Transaction<Database>,
    organizationId: string,
    fromBranchId: string,
    toBranchId: string,
    actorUserId: string,
  ) {
    return trx
      .insertInto('stock_transfers')
      .values({
        organization_id: organizationId,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        status: 'in_transit',
        created_by: actorUserId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  addTransferItem(
    trx: Transaction<Database>,
    transferId: string,
    productVariantId: string,
    batchId: string | null,
    quantity: number,
  ) {
    return trx
      .insertInto('stock_transfer_items')
      .values({ stock_transfer_id: transferId, product_variant_id: productVariantId, batch_id: batchId, quantity })
      .execute();
  },

  findTransferForUpdate(trx: Transaction<Database>, organizationId: string, id: string) {
    return trx
      .selectFrom('stock_transfers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  },

  findTransferItems(trx: Transaction<Database>, transferId: string) {
    return trx.selectFrom('stock_transfer_items').selectAll().where('stock_transfer_id', '=', transferId).execute();
  },

  completeTransfer(trx: Transaction<Database>, id: string) {
    return trx
      .updateTable('stock_transfers')
      .set({ status: 'completed', completed_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  listTransfers(organizationId: string) {
    return db
      .selectFrom('stock_transfers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .execute();
  },
};
