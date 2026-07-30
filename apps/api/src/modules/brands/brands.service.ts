import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { brandsRepository } from './brands.repository';
import type { CreateBrandInput, UpdateBrandInput } from './brands.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const brandsService = {
  list(organizationId: string) {
    return brandsRepository.list(organizationId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateBrandInput) {
    try {
      const brand = await brandsRepository.create(organizationId, actorUserId, { name: input.name });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'brands',
        entityId: brand.id,
        after: { name: brand.name },
      });
      return brand;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A brand with this name already exists');
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateBrandInput) {
    const before = await brandsRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Brand not found');

    try {
      const updated = await brandsRepository.update(organizationId, id, actorUserId, {
        ...(input.name !== undefined && { name: input.name }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'brands',
        entityId: id,
        before: { name: before.name },
        after: { name: updated.name },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A brand with this name already exists');
      throw err;
    }
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await brandsRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Brand not found');

    await brandsRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'brands',
      entityId: id,
      before: { name: before.name },
    });
  },
};
