import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { branchesRepository } from './branches.repository';
import { storesRepository } from '../stores/stores.repository';
import type { CreateBranchInput, UpdateBranchInput } from './branches.dto';

interface PgError extends Error {
  code?: string;
}

function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const branchesService = {
  listByStore(organizationId: string, storeId: string) {
    return branchesRepository.listByStore(organizationId, storeId);
  },

  listByOrg(organizationId: string) {
    return branchesRepository.listByOrg(organizationId);
  },

  async getById(organizationId: string, id: string) {
    const branch = await branchesRepository.findById(organizationId, id);
    if (!branch) throw new AppError('NOT_FOUND', 'Branch not found');
    return branch;
  },

  async create(organizationId: string, storeId: string, actorUserId: string, input: CreateBranchInput) {
    const store = await storesRepository.findById(organizationId, storeId);
    if (!store) throw new AppError('NOT_FOUND', 'Store not found');

    const values = {
      name: input.name,
      code: input.code,
      ...(input.addressLine1 !== undefined && { address_line1: input.addressLine1 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.postalCode !== undefined && { postal_code: input.postalCode }),
      ...(input.phone !== undefined && { phone: input.phone }),
    };

    try {
      const branch = await branchesRepository.create(organizationId, storeId, actorUserId, values);
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'branches',
        entityId: branch.id,
        after: { name: branch.name, code: branch.code },
      });
      return branch;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A branch with this code already exists for this store');
      }
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateBranchInput) {
    const before = await this.getById(organizationId, id);

    const values = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.addressLine1 !== undefined && { address_line1: input.addressLine1 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.postalCode !== undefined && { postal_code: input.postalCode }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
    };

    try {
      const updated = await branchesRepository.update(organizationId, id, actorUserId, values);
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'branches',
        entityId: id,
        before: { name: before.name, isActive: before.is_active },
        after: { name: updated.name, isActive: updated.is_active },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A branch with this code already exists for this store');
      }
      throw err;
    }
  },
};
