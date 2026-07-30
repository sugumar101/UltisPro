import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { storesRepository } from './stores.repository';
import type { CreateStoreInput, UpdateStoreInput } from './stores.dto';

interface PgError extends Error {
  code?: string;
}

function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const storesService = {
  list(organizationId: string) {
    return storesRepository.list(organizationId);
  },

  async getById(organizationId: string, id: string) {
    const store = await storesRepository.findById(organizationId, id);
    if (!store) throw new AppError('NOT_FOUND', 'Store not found');
    return store;
  },

  async create(organizationId: string, actorUserId: string, input: CreateStoreInput) {
    const values = {
      name: input.name,
      ...(input.gstin !== undefined && { gstin: input.gstin }),
      ...(input.invoicePrefix !== undefined && { invoice_prefix: input.invoicePrefix }),
      ...(input.addressLine1 !== undefined && { address_line1: input.addressLine1 }),
      ...(input.addressLine2 !== undefined && { address_line2: input.addressLine2 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.postalCode !== undefined && { postal_code: input.postalCode }),
      ...(input.country !== undefined && { country: input.country }),
    };

    try {
      const store = await storesRepository.create(organizationId, actorUserId, values);
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'stores',
        entityId: store.id,
        after: { name: store.name, gstin: store.gstin },
      });
      return store;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A store with this GSTIN already exists in your organization');
      }
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateStoreInput) {
    const before = await this.getById(organizationId, id);

    const values = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.gstin !== undefined && { gstin: input.gstin }),
      ...(input.invoicePrefix !== undefined && { invoice_prefix: input.invoicePrefix }),
      ...(input.addressLine1 !== undefined && { address_line1: input.addressLine1 }),
      ...(input.addressLine2 !== undefined && { address_line2: input.addressLine2 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.postalCode !== undefined && { postal_code: input.postalCode }),
      ...(input.country !== undefined && { country: input.country }),
    };

    try {
      const updated = await storesRepository.update(organizationId, id, actorUserId, values);
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'stores',
        entityId: id,
        before: { name: before.name, gstin: before.gstin },
        after: { name: updated.name, gstin: updated.gstin },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A store with this GSTIN already exists in your organization');
      }
      throw err;
    }
  },
};
