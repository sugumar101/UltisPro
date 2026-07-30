import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { branchesRepository } from '../branches/branches.repository';
import { productsRepository } from '../products/products.repository';
import { taxesRepository } from '../taxes/taxes.repository';
import { suppliersRepository } from '../suppliers/suppliers.repository';
import { applyStockMovement } from '../inventory/inventory.repository';
import { purchaseOrdersRepository, generatePoNumber } from './purchase-orders.repository';
import type { CreatePurchaseOrderInput, ReceivePurchaseOrderInput } from './purchase-orders.dto';

async function assertBranchBelongsToOrg(organizationId: string, branchId: string): Promise<void> {
  const branch = await branchesRepository.findById(organizationId, branchId);
  if (!branch) throw new AppError('VALIDATION_ERROR', `Branch ${branchId} not found in your organization`);
}

async function assertSupplierBelongsToOrg(organizationId: string, supplierId: string): Promise<void> {
  const supplier = await suppliersRepository.findById(organizationId, supplierId);
  if (!supplier) throw new AppError('VALIDATION_ERROR', `Supplier ${supplierId} not found in your organization`);
}

async function assertVariantBelongsToOrg(organizationId: string, productVariantId: string): Promise<void> {
  const variant = await productsRepository.findVariantById(organizationId, productVariantId);
  if (!variant) throw new AppError('VALIDATION_ERROR', `Product variant ${productVariantId} not found in your organization`);
}

export const purchaseOrdersService = {
  list(organizationId: string) {
    return purchaseOrdersRepository.list(organizationId);
  },

  async getById(organizationId: string, id: string) {
    const order = await purchaseOrdersRepository.findById(organizationId, id);
    if (!order) throw new AppError('NOT_FOUND', 'Purchase order not found');
    const items = await purchaseOrdersRepository.listItems(id);
    return { order, items };
  },

  async create(organizationId: string, actorUserId: string, input: CreatePurchaseOrderInput) {
    await assertBranchBelongsToOrg(organizationId, input.branchId);
    await assertSupplierBelongsToOrg(organizationId, input.supplierId);
    for (const item of input.items) {
      await assertVariantBelongsToOrg(organizationId, item.productVariantId);
    }

    // Look up tax rates up front so we can compute per-line tax without a
    // query per item inside the transaction.
    const taxIds = [...new Set(input.items.map((i) => i.taxId).filter((id): id is string => Boolean(id)))];
    const taxes = new Map<string, { rate_percent: string }>();
    for (const taxId of taxIds) {
      const tax = await taxesRepository.findById(organizationId, taxId);
      if (!tax) throw new AppError('VALIDATION_ERROR', `Tax rate ${taxId} not found in your organization`);
      taxes.set(taxId, tax);
    }

    let subtotal = 0;
    let taxTotal = 0;
    const lineComputations = input.items.map((item) => {
      const lineSubtotal = item.quantityOrdered * item.unitCost;
      const rate = item.taxId ? Number(taxes.get(item.taxId)!.rate_percent) : 0;
      const lineTax = lineSubtotal * (rate / 100);
      subtotal += lineSubtotal;
      taxTotal += lineTax;
      return { ...item, lineSubtotal };
    });
    const grandTotal = subtotal + taxTotal;

    const result = await db.transaction().execute(async (trx) => {
      const header = await purchaseOrdersRepository.createHeader(trx, organizationId, actorUserId, {
        branch_id: input.branchId,
        supplier_id: input.supplierId,
        po_number: generatePoNumber(),
        ...(input.expectedDate !== undefined && { expected_date: input.expectedDate }),
        subtotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
      });

      const items = [];
      for (const line of lineComputations) {
        const item = await purchaseOrdersRepository.addItem(trx, header.id, {
          product_variant_id: line.productVariantId,
          quantity_ordered: line.quantityOrdered,
          unit_cost: line.unitCost,
          tax_id: line.taxId ?? null,
          line_total: line.lineSubtotal,
        });
        items.push(item);
      }

      return { header, items };
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'purchase_orders',
      entityId: result.header.id,
      after: { poNumber: result.header.po_number, grandTotal, itemCount: result.items.length },
    });

    return result;
  },

  async approve(organizationId: string, id: string, actorUserId: string) {
    const updated = await db.transaction().execute(async (trx) => {
      const order = await purchaseOrdersRepository.findForUpdate(trx, organizationId, id);
      if (!order) throw new AppError('NOT_FOUND', 'Purchase order not found');
      if (order.status !== 'draft') {
        throw new AppError('BUSINESS_RULE_VIOLATION', 'Only a draft purchase order can be approved');
      }
      return purchaseOrdersRepository.setStatus(trx, id, 'approved', {
        approved_by: actorUserId,
        approved_at: new Date(),
      });
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'approve',
      entityTable: 'purchase_orders',
      entityId: id,
      after: { status: 'approved' },
    });

    return updated;
  },

  async cancel(organizationId: string, id: string, actorUserId: string) {
    const updated = await db.transaction().execute(async (trx) => {
      const order = await purchaseOrdersRepository.findForUpdate(trx, organizationId, id);
      if (!order) throw new AppError('NOT_FOUND', 'Purchase order not found');
      if (order.status === 'received' || order.status === 'cancelled') {
        throw new AppError('BUSINESS_RULE_VIOLATION', `A ${order.status} purchase order cannot be cancelled`);
      }
      return purchaseOrdersRepository.setStatus(trx, id, 'cancelled');
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'purchase_orders',
      entityId: id,
      after: { status: 'cancelled' },
    });

    return updated;
  },

  async receive(organizationId: string, id: string, actorUserId: string, input: ReceivePurchaseOrderInput) {
    const result = await db.transaction().execute(async (trx) => {
      const order = await purchaseOrdersRepository.findForUpdate(trx, organizationId, id);
      if (!order) throw new AppError('NOT_FOUND', 'Purchase order not found');
      if (order.status === 'draft') {
        throw new AppError('BUSINESS_RULE_VIOLATION', 'Approve this purchase order before receiving against it');
      }
      if (order.status === 'received' || order.status === 'cancelled') {
        throw new AppError('BUSINESS_RULE_VIOLATION', `A ${order.status} purchase order cannot be received against`);
      }

      let receivedValue = 0;
      for (const receipt of input.items) {
        const item = await purchaseOrdersRepository.findItemForUpdate(trx, receipt.purchaseOrderItemId);
        if (!item || item.purchase_order_id !== id) {
          throw new AppError('VALIDATION_ERROR', `Line item ${receipt.purchaseOrderItemId} does not belong to this purchase order`);
        }
        const alreadyReceived = Number(item.quantity_received);
        const ordered = Number(item.quantity_ordered);
        if (alreadyReceived + receipt.quantityReceived > ordered) {
          throw new AppError(
            'BUSINESS_RULE_VIOLATION',
            `Cannot receive ${receipt.quantityReceived}: only ${ordered - alreadyReceived} remain outstanding for this line`,
          );
        }

        await purchaseOrdersRepository.incrementItemReceived(trx, item.id, receipt.quantityReceived);

        // MVP simplification: goods received via a PO land in unbatched
        // stock (batchId: null) even for batch-tracked products. Batch
        // capture on receipt is left for a later pass — see
        // docs/05-development-roadmap.md Phase 3 notes.
        await applyStockMovement(trx, {
          organizationId,
          branchId: order.branch_id,
          productVariantId: item.product_variant_id,
          batchId: null,
          movementType: 'purchase',
          referenceTable: 'purchase_orders',
          referenceId: id,
          quantityDelta: receipt.quantityReceived,
          unitCost: Number(item.unit_cost),
          actorUserId,
        });

        receivedValue += receipt.quantityReceived * Number(item.unit_cost);
      }

      // Recompute status from the full item set (not just the ones touched
      // in this call) so partial receiving across multiple calls converges
      // correctly to 'received' once every line is fully satisfied.
      const allItems = await purchaseOrdersRepository.listItemsTrx(trx, id);
      const fullyReceived = allItems.every((i) => Number(i.quantity_received) >= Number(i.quantity_ordered));
      const newStatus = fullyReceived ? 'received' : 'partially_received';
      const updatedOrder = await purchaseOrdersRepository.setStatus(trx, id, newStatus);

      // Goods received become a liability owed to the supplier.
      await suppliersRepository.adjustOutstandingBalance(trx, organizationId, order.supplier_id, receivedValue);

      return updatedOrder;
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'purchase_orders',
      entityId: id,
      after: { status: result.status },
    });

    return result;
  },
};
