import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { organizationsRepository } from './organizations.repository';
import type { UpdateOrganizationInput } from './organizations.dto';

export const organizationsService = {
  async getMine(orgId: string) {
    const org = await organizationsRepository.findById(orgId);
    if (!org) throw new AppError('NOT_FOUND', 'Organization not found');
    return org;
  },

  async updateMine(orgId: string, actorUserId: string, input: UpdateOrganizationInput) {
    const before = await this.getMine(orgId);

    const updated = await organizationsRepository.update(orgId, {
      ...(input.legalName !== undefined && { legal_name: input.legalName }),
      ...(input.displayName !== undefined && { display_name: input.displayName }),
      ...(input.businessType !== undefined && { business_type: input.businessType }),
      ...(input.defaultCurrency !== undefined && { default_currency: input.defaultCurrency }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
    });

    await recordAudit({
      organizationId: orgId,
      actorUserId,
      action: 'update',
      entityTable: 'organizations',
      entityId: orgId,
      before: { legalName: before.legal_name, displayName: before.display_name, businessType: before.business_type },
      after: { legalName: updated.legal_name, displayName: updated.display_name, businessType: updated.business_type },
    });

    return updated;
  },
};
