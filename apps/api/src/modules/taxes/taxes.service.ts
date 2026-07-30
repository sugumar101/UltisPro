import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { taxesRepository } from './taxes.repository';
import { splitIsValid, type CreateTaxInput, type UpdateTaxInput } from './taxes.dto';

export const taxesService = {
  list(organizationId: string) {
    return taxesRepository.list(organizationId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateTaxInput) {
    const tax = await taxesRepository.create(organizationId, actorUserId, {
      name: input.name,
      rate_percent: input.ratePercent,
      cgst_percent: input.cgstPercent,
      sgst_percent: input.sgstPercent,
      igst_percent: input.igstPercent,
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'taxes',
      entityId: tax.id,
      after: { name: tax.name, ratePercent: tax.rate_percent },
    });

    return tax;
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateTaxInput) {
    const before = await taxesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Tax not found');

    const merged = {
      ratePercent: input.ratePercent ?? Number(before.rate_percent),
      cgstPercent: input.cgstPercent ?? Number(before.cgst_percent),
      sgstPercent: input.sgstPercent ?? Number(before.sgst_percent),
      igstPercent: input.igstPercent ?? Number(before.igst_percent),
    };

    if (!splitIsValid(merged)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'rate_percent must equal either cgst_percent + sgst_percent (intra-state) or igst_percent (inter-state)',
      );
    }

    const updated = await taxesRepository.update(organizationId, id, actorUserId, {
      ...(input.name !== undefined && { name: input.name }),
      rate_percent: merged.ratePercent,
      cgst_percent: merged.cgstPercent,
      sgst_percent: merged.sgstPercent,
      igst_percent: merged.igstPercent,
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'taxes',
      entityId: id,
      before: { ratePercent: before.rate_percent },
      after: { ratePercent: updated.rate_percent },
    });

    return updated;
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await taxesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Tax not found');

    await taxesRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'taxes',
      entityId: id,
      before: { name: before.name },
    });
  },
};
