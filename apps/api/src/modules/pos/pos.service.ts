import { AppError } from '../../shared/app-error';
import { branchesRepository } from '../branches/branches.repository';
import { posRepository } from './pos.repository';
import type { HoldBillInput } from './pos.dto';

export const posService = {
  async search(organizationId: string, branchId: string, q: string) {
    const branch = await branchesRepository.findById(organizationId, branchId);
    if (!branch) throw new AppError('VALIDATION_ERROR', `Branch ${branchId} not found in your organization`);
    return posRepository.search(organizationId, branchId, q);
  },

  listHeld(organizationId: string, branchId: string) {
    return posRepository.listHeld(organizationId, branchId);
  },

  async hold(organizationId: string, actorUserId: string, input: HoldBillInput) {
    const branch = await branchesRepository.findById(organizationId, input.branchId);
    if (!branch) throw new AppError('VALIDATION_ERROR', `Branch ${input.branchId} not found in your organization`);

    return posRepository.createHeld(organizationId, actorUserId, {
      branch_id: input.branchId,
      register_code: input.registerCode,
      customer_id: input.customerId ?? null,
      cart_snapshot: JSON.stringify(input.cartSnapshot),
    });
  },

  async resume(organizationId: string, id: string) {
    const held = await posRepository.findHeld(organizationId, id);
    if (!held) throw new AppError('NOT_FOUND', 'Held bill not found');
    // Resuming consumes the hold — the cart moves back into the active POS
    // screen and shouldn't be resumable a second time.
    await posRepository.deleteHeld(organizationId, id);
    return held;
  },
};
