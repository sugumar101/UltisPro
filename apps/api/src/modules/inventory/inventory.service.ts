import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { branchesRepository } from '../branches/branches.repository';
import { productsRepository } from '../products/products.repository';
import { inventoryRepository, applyStockMovement } from './inventory.repository';
import type {
  ListStockQuery,
  ListLedgerQuery,
  CreateAdjustmentInput,
  CreateTransferInput,
} from './inventory.dto';

async function assertBranchBelongsToOrg(organizationId: string, branchId: string): Promise<void> {
  const branch = await branchesRepository.findById(organizationId, branchId);
  if (!branch) throw new AppError('VALIDATION_ERROR', `Branch ${branchId} not found in your organization`);
}

async function assertVariantBelongsToOrg(organizationId: string, productVariantId: string): Promise<void> {
  const variant = await productsRepository.findVariantById(organizationId, productVariantId);
  if (!variant) throw new AppError('VALIDATION_ERROR', `Product variant ${productVariantId} not found in your organization`);
}

export const inventoryService = {
  getStock(organizationId: string, query: ListStockQuery) {
    return inventoryRepository.getStock(organizationId, query);
  },

  getLowStock(organizationId: string, branchId?: string) {
    return inventoryRepository.getLowStock(organizationId, branchId);
  },

  getExpiringBatches(organizationId: string, withinDays: number) {
    return inventoryRepository.getExpiringBatches(organizationId, withinDays);
  },

  async getLedger(organizationId: string, query: ListLedgerQuery) {
    await assertBranchBelongsToOrg(organizationId, query.branchId);
    const { rows, total } = await inventoryRepository.getLedger(organizationId, query);
    return { rows, total, page: query.page, pageSize: query.pageSize };
  },

  listTransfers(organizationId: string) {
    return inventoryRepository.listTransfers(organizationId);
  },

  async createAdjustment(organizationId: string, actorUserId: string, input: CreateAdjustmentInput) {
    await assertBranchBelongsToOrg(organizationId, input.branchId);
    for (const item of input.items) {
      await assertVariantBelongsToOrg(organizationId, item.productVariantId);
    }

    const result = await db.transaction().execute(async (trx) => {
      const adjustment = await inventoryRepository.createAdjustmentHeader(
        trx,
        organizationId,
        input.branchId,
        actorUserId,
        input.reasonCode,
        input.notes,
      );

      const ledgerEntries = [];
      for (const item of input.items) {
        let batchId: string | null = null;
        if (item.batchNumber) {
          const batch = await inventoryRepository.findOrCreateBatch(
            trx,
            organizationId,
            item.productVariantId,
            item.batchNumber,
            item.expiryDate,
            item.unitCost,
          );
          batchId = batch.id;
        }

        await inventoryRepository.addAdjustmentItem(
          trx,
          adjustment.id,
          item.productVariantId,
          batchId,
          item.quantityDelta,
        );

        const ledgerRow = await applyStockMovement(trx, {
          organizationId,
          branchId: input.branchId,
          productVariantId: item.productVariantId,
          batchId,
          movementType: item.quantityDelta >= 0 ? 'adjustment_in' : 'adjustment_out',
          referenceTable: 'stock_adjustments',
          referenceId: adjustment.id,
          quantityDelta: item.quantityDelta,
          unitCost: item.unitCost,
          actorUserId,
        });
        ledgerEntries.push(ledgerRow);
      }

      return { adjustment, ledgerEntries };
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'stock_adjustments',
      entityId: result.adjustment.id,
      after: { reasonCode: input.reasonCode, itemCount: input.items.length },
    });

    return result;
  },

  async initiateTransfer(organizationId: string, actorUserId: string, input: CreateTransferInput) {
    await assertBranchBelongsToOrg(organizationId, input.fromBranchId);
    await assertBranchBelongsToOrg(organizationId, input.toBranchId);
    for (const item of input.items) {
      await assertVariantBelongsToOrg(organizationId, item.productVariantId);
    }

    const transfer = await db.transaction().execute(async (trx) => {
      const header = await inventoryRepository.createTransferHeader(
        trx,
        organizationId,
        input.fromBranchId,
        input.toBranchId,
        actorUserId,
      );

      for (const item of input.items) {
        await inventoryRepository.addTransferItem(
          trx,
          header.id,
          item.productVariantId,
          item.batchId ?? null,
          item.quantity,
        );

        // Stock leaves the source branch immediately on dispatch; it lands
        // at the destination only once receiveTransfer() is called.
        await applyStockMovement(trx, {
          organizationId,
          branchId: input.fromBranchId,
          productVariantId: item.productVariantId,
          batchId: item.batchId ?? null,
          movementType: 'transfer_out',
          referenceTable: 'stock_transfers',
          referenceId: header.id,
          quantityDelta: -item.quantity,
          actorUserId,
        });
      }

      return header;
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'stock_transfers',
      entityId: transfer.id,
      after: { fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, itemCount: input.items.length },
    });

    return transfer;
  },

  async receiveTransfer(organizationId: string, transferId: string, actorUserId: string) {
    const updated = await db.transaction().execute(async (trx) => {
      const transfer = await inventoryRepository.findTransferForUpdate(trx, organizationId, transferId);
      if (!transfer) throw new AppError('NOT_FOUND', 'Transfer not found');
      if (transfer.status === 'completed') {
        throw new AppError('BUSINESS_RULE_VIOLATION', 'This transfer has already been received');
      }
      if (transfer.status === 'cancelled') {
        throw new AppError('BUSINESS_RULE_VIOLATION', 'This transfer was cancelled');
      }

      const items = await inventoryRepository.findTransferItems(trx, transferId);
      for (const item of items) {
        await applyStockMovement(trx, {
          organizationId,
          branchId: transfer.to_branch_id,
          productVariantId: item.product_variant_id,
          batchId: item.batch_id,
          movementType: 'transfer_in',
          referenceTable: 'stock_transfers',
          referenceId: transferId,
          quantityDelta: Number(item.quantity),
          actorUserId,
        });
      }

      return inventoryRepository.completeTransfer(trx, transferId);
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'stock_transfers',
      entityId: transferId,
      after: { status: 'completed' },
    });

    return updated;
  },
};
