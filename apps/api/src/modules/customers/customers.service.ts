import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { customersRepository } from './customers.repository';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
  CreateAddressInput,
  UpdateAddressInput,
  ChargeCustomerInput,
  PayCustomerInput,
} from './customers.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const customersService = {
  async list(organizationId: string, query: ListCustomersQuery) {
    const { rows, total } = await customersRepository.list(organizationId, query);
    return { rows, total, page: query.page, pageSize: query.pageSize };
  },

  async getById(organizationId: string, id: string) {
    const customer = await customersRepository.findById(organizationId, id);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');
    const addresses = await customersRepository.listAddresses(id);
    return { customer, addresses };
  },

  async create(organizationId: string, actorUserId: string, input: CreateCustomerInput) {
    try {
      const customer = await customersRepository.create(organizationId, actorUserId, {
        full_name: input.fullName,
        credit_limit: input.creditLimit,
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.gstin !== undefined && { gstin: input.gstin }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'customers',
        entityId: customer.id,
        after: { fullName: customer.full_name },
      });
      return customer;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A customer with this phone number already exists');
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateCustomerInput) {
    const before = await customersRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Customer not found');

    try {
      const updated = await customersRepository.update(organizationId, id, actorUserId, {
        ...(input.fullName !== undefined && { full_name: input.fullName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.gstin !== undefined && { gstin: input.gstin }),
        ...(input.creditLimit !== undefined && { credit_limit: input.creditLimit }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'customers',
        entityId: id,
        before: { fullName: before.full_name },
        after: { fullName: updated.full_name },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A customer with this phone number already exists');
      throw err;
    }
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await customersRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Customer not found');
    if (before.is_walkin) throw new AppError('BUSINESS_RULE_VIOLATION', 'The default walk-in customer cannot be deleted');

    await customersRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'customers',
      entityId: id,
      before: { fullName: before.full_name },
    });
  },

  /**
   * Charges a sale amount to the customer's running account. Rejects if it
   * would push outstanding_balance past credit_limit — the "credit-limit
   * checks work" exit criterion from docs/05-development-roadmap.md Phase 4.
   * A credit_limit of 0 (the default) means no on-account selling at all;
   * every charge is rejected until the org raises it.
   */
  async charge(organizationId: string, id: string, actorUserId: string, input: ChargeCustomerInput) {
    const customer = await customersRepository.findById(organizationId, id);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');

    const projectedBalance = Number(customer.outstanding_balance) + input.amount;
    if (projectedBalance > Number(customer.credit_limit)) {
      throw new AppError(
        'BUSINESS_RULE_VIOLATION',
        `Charging ${input.amount} would exceed this customer's credit limit of ${customer.credit_limit} (current balance: ${customer.outstanding_balance})`,
      );
    }

    const updated = await db
      .transaction()
      .execute((trx) => customersRepository.adjustOutstandingBalance(trx, organizationId, id, input.amount));

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'customers',
      entityId: id,
      before: { outstandingBalance: customer.outstanding_balance },
      after: { outstandingBalance: updated.outstanding_balance, note: input.referenceNote },
    });

    return updated;
  },

  async recordPayment(organizationId: string, id: string, actorUserId: string, input: PayCustomerInput) {
    const customer = await customersRepository.findById(organizationId, id);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');

    const updated = await db
      .transaction()
      .execute((trx) => customersRepository.adjustOutstandingBalance(trx, organizationId, id, -input.amount));

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'customers',
      entityId: id,
      before: { outstandingBalance: customer.outstanding_balance },
      after: { outstandingBalance: updated.outstanding_balance },
    });

    return updated;
  },

  async addAddress(organizationId: string, customerId: string, input: CreateAddressInput) {
    const customer = await customersRepository.findById(organizationId, customerId);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');

    return customersRepository.createAddress(customerId, {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.line1 !== undefined && { line1: input.line1 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.postalCode !== undefined && { postal_code: input.postalCode }),
      is_default: input.isDefault,
    });
  },

  async updateAddress(organizationId: string, customerId: string, addressId: string, input: UpdateAddressInput) {
    const customer = await customersRepository.findById(organizationId, customerId);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');
    const existing = await customersRepository.findAddressById(customerId, addressId);
    if (!existing) throw new AppError('NOT_FOUND', 'Address not found');

    return customersRepository.updateAddress(customerId, addressId, {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.line1 !== undefined && { line1: input.line1 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.postalCode !== undefined && { postal_code: input.postalCode }),
      ...(input.isDefault !== undefined && { is_default: input.isDefault }),
    });
  },

  async removeAddress(organizationId: string, customerId: string, addressId: string): Promise<void> {
    const customer = await customersRepository.findById(organizationId, customerId);
    if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');
    const existing = await customersRepository.findAddressById(customerId, addressId);
    if (!existing) throw new AppError('NOT_FOUND', 'Address not found');

    await customersRepository.removeAddress(customerId, addressId);
  },
};
