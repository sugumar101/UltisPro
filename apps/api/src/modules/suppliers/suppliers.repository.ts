import type { Transaction } from 'kysely';
import { db, type Database } from '../../shared/db';

interface SupplierWritableFields {
  name?: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  payment_terms_days?: number;
  is_active?: boolean;
}

export const suppliersRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('suppliers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('suppliers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: SupplierWritableFields & { name: string }) {
    return db
      .insertInto('suppliers')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, actorUserId: string, values: SupplierWritableFields) {
    return db
      .updateTable('suppliers')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('suppliers')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  /**
   * Positive delta increases what we owe the supplier (goods received);
   * negative delta decreases it (return or payment). Row-locked so
   * concurrent receipts/payments/returns against the same supplier don't
   * race — mirrors the applyStockMovement locking pattern in
   * inventory.repository.ts.
   */
  async adjustOutstandingBalance(trx: Transaction<Database>, organizationId: string, supplierId: string, delta: number) {
    const supplier = await trx
      .selectFrom('suppliers')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', supplierId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const newBalance = Number(supplier.outstanding_balance) + delta;

    return trx
      .updateTable('suppliers')
      .set({ outstanding_balance: newBalance })
      .where('id', '=', supplierId)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  listPayments(organizationId: string, supplierId: string) {
    return db
      .selectFrom('supplier_payments')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('supplier_id', '=', supplierId)
      .orderBy('paid_at', 'desc')
      .execute();
  },

  createPayment(
    trx: Transaction<Database>,
    organizationId: string,
    supplierId: string,
    actorUserId: string,
    values: { amount: number; payment_mode: string; purchase_order_id: string | null },
  ) {
    return trx
      .insertInto('supplier_payments')
      .values({ organization_id: organizationId, supplier_id: supplierId, created_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};
