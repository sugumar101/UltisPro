import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { unitsRepository } from './units.repository';
import type { CreateUnitInput, UpdateUnitInput } from './units.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

async function assertBaseUnitExists(organizationId: string, baseUnitId: string | undefined): Promise<void> {
  if (!baseUnitId) return;
  const base = await unitsRepository.findById(organizationId, baseUnitId);
  if (!base) throw new AppError('VALIDATION_ERROR', 'Base unit not found');
}

export const unitsService = {
  list(organizationId: string) {
    return unitsRepository.list(organizationId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateUnitInput) {
    await assertBaseUnitExists(organizationId, input.baseUnitId);

    try {
      const unit = await unitsRepository.create(organizationId, actorUserId, {
        name: input.name,
        symbol: input.symbol,
        ...(input.baseUnitId !== undefined && { base_unit_id: input.baseUnitId }),
        conversion_factor: input.conversionFactor,
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'units',
        entityId: unit.id,
        after: { name: unit.name, symbol: unit.symbol },
      });
      return unit;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A unit with this symbol already exists');
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateUnitInput) {
    const before = await unitsRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Unit not found');

    if (input.baseUnitId) {
      if (input.baseUnitId === id) throw new AppError('VALIDATION_ERROR', 'A unit cannot be its own base unit');
      await assertBaseUnitExists(organizationId, input.baseUnitId);
    }

    try {
      const updated = await unitsRepository.update(organizationId, id, actorUserId, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.symbol !== undefined && { symbol: input.symbol }),
        ...(input.baseUnitId !== undefined && { base_unit_id: input.baseUnitId }),
        ...(input.conversionFactor !== undefined && { conversion_factor: input.conversionFactor }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'units',
        entityId: id,
        before: { name: before.name, symbol: before.symbol },
        after: { name: updated.name, symbol: updated.symbol },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A unit with this symbol already exists');
      throw err;
    }
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await unitsRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Unit not found');

    await unitsRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'units',
      entityId: id,
      before: { name: before.name },
    });
  },
};
