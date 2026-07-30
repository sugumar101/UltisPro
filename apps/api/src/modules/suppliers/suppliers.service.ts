import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { suppliersRepository } from './suppliers.repository';
import type { CreateSupplierInput, UpdateSupplierInput, CreateSupplierPaymentInput } from './suppliers.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const suppliersService = {
  list(organizationId: string) {
    return suppliersRepository.list(organizationId);
  },

  async getById(organizationId: string, id: string) {
    const supplier = await suppliersRepository.findById(organizationId, id);
    if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found');
    const payments = await suppliersRepository.listPayments(organizationId, id);
    return { supplier, payments };
  },

  async create(organizationId: string, actorUserId: string, input: CreateSupplierInput) {
    try {
      const supplier = await suppliersRepository.create(organizationId, actorUserId, {
        name: input.name,
        payment_terms_days: input.paymentTermsDays,
        ...(input.gstin !== undefined && { gstin: input.gstin }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'suppliers',
        entityId: supplier.id,
        after: { name: supplier.name },
      });
      return supplier;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A supplier with this GSTIN already exists');
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateSupplierInput) {
    const before = await suppliersRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Supplier not found');

    const updated = await suppliersRepository.update(organizationId, id, actorUserId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.gstin !== undefined && { gstin: input.gstin }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.paymentTermsDays !== undefined && { payment_terms_days: input.paymentTermsDays }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'suppliers',
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
    });
    return updated;
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await suppliersRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Supplier not found');

    await suppliersRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'suppliers',
      entityId: id,
      before: { name: before.name },
    });
  },

  async recordPayment(organizationId: string, supplierId: string, actorUserId: string, input: CreateSupplierPaymentInput) {
    const supplier = await suppliersRepository.findById(organizationId, supplierId);
    if (!supplier) throw new AppError('NOT_FOUND', 'Supplier not found');

    const payment = await db.transaction().execute(async (trx) => {
      const created = await suppliersRepository.createPayment(trx, organizationId, supplierId, actorUserId, {
        amount: input.amount,
        payment_mode: input.paymentMode,
        purchase_order_id: input.purchaseOrderId ?? null,
      });
      // A payment reduces what we owe the supplier.
      await suppliersRepository.adjustOutstandingBalance(trx, organizationId, supplierId, -input.amount);
      return created;
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'supplier_payments',
      entityId: payment.id,
      after: { amount: input.amount, paymentMode: input.paymentMode },
    });

    return payment;
  },
};
