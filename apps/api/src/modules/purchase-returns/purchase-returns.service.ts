import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { productsRepository } from '../products/products.repository';
import { purchaseOrdersRepository } from '../purchase-orders/purchase-orders.repository';
import { suppliersRepository } from '../suppliers/suppliers.repository';
import { applyStockMovement } from '../inventory/inventory.repository';
import { purchaseReturnsRepository } from './purchase-returns.repository';
import type { CreatePurchaseReturnInput } from '../purchase-orders/purchase-orders.dto';

export const purchaseReturnsService = {
  list(organizationId: string) {
    return purchaseReturnsRepository.list(organizationId);
  },

  async getById(organizationId: string, id: string) {
    const purchaseReturn = await purchaseReturnsRepository.findById(organizationId, id);
    if (!purchaseReturn) throw new AppError('NOT_FOUND', 'Purchase return not found');
    const items = await purchaseReturnsRepository.listItems(id);
    return { purchaseReturn, items };
  },

  async create(organizationId: string, actorUserId: string, input: CreatePurchaseReturnInput) {
    const order = await purchaseOrdersRepository.findById(organizationId, input.purchaseOrderId);
    if (!order) throw new AppError('VALIDATION_ERROR', 'Purchase order not found in your organization');
    if (order.status !== 'received' && order.status !== 'partially_received') {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Only received goods can be returned to a supplier');
    }

    const poItems = await purchaseOrdersRepository.listItems(input.purchaseOrderId);

    for (const item of input.items) {
      await assertVariantBelongsToOrg(organizationId, item.productVariantId);
      // MVP simplification: validated against total received quantity for
      // this variant on the PO, not netted against prior returns — see
      // docs/05-development-roadmap.md Phase 3 notes.
      const receivedForVariant = poItems
        .filter((poItem) => poItem.product_variant_id === item.productVariantId)
        .reduce((sum, poItem) => sum + Number(poItem.quantity_received), 0);
      if (item.quantity > receivedForVariant) {
        throw new AppError(
          'BUSINESS_RULE_VIOLATION',
          `Cannot return ${item.quantity} of variant ${item.productVariantId}: only ${receivedForVariant} was received on this PO`,
        );
      }
    }

    const grandTotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    const result = await db.transaction().execute(async (trx) => {
      const header = await purchaseReturnsRepository.createHeader(trx, organizationId, actorUserId, {
        purchase_order_id: input.purchaseOrderId,
        reason: input.reason ?? null,
        grand_total: grandTotal,
      });

      const items = [];
      for (const item of input.items) {
        const created = await purchaseReturnsRepository.addItem(trx, header.id, {
          product_variant_id: item.productVariantId,
          batch_id: item.batchId ?? null,
          quantity: item.quantity,
          unit_cost: item.unitCost,
        });
        items.push(created);

        await applyStockMovement(trx, {
          organizationId,
          branchId: order.branch_id,
          productVariantId: item.productVariantId,
          batchId: item.batchId ?? null,
          movementType: 'purchase_return',
          referenceTable: 'purchase_returns',
          referenceId: header.id,
          quantityDelta: -item.quantity,
          unitCost: item.unitCost,
          actorUserId,
        });
      }

      // Returning goods reduces what we owe the supplier.
      await suppliersRepository.adjustOutstandingBalance(trx, organizationId, order.supplier_id, -grandTotal);

      return { header, items };
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'purchase_returns',
      entityId: result.header.id,
      after: { purchaseOrderId: input.purchaseOrderId, grandTotal, itemCount: result.items.length },
    });

    return result;
  },
};

async function assertVariantBelongsToOrg(organizationId: string, productVariantId: string): Promise<void> {
  const variant = await productsRepository.findVariantById(organizationId, productVariantId);
  if (!variant) throw new AppError('VALIDATION_ERROR', `Product variant ${productVariantId} not found in your organization`);
}
