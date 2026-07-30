import { AppError } from '../../shared/app-error';
import { logger } from '../../shared/logger';
import { recordAudit } from '../../shared/audit-log.service';
import { hashPassword } from '../auth/password.util';
import { usersRepository } from './users.repository';
import { branchesRepository } from '../branches/branches.repository';
import { rolesRepository } from '../roles/roles.repository';
import type { InviteUserInput, UpdateUserInput, AssignStoreRoleInput } from './users.dto';

async function assertBranchAndRoleBelongToOrg(organizationId: string, branchId: string, roleId: string): Promise<void> {
  const branch = await branchesRepository.findById(organizationId, branchId);
  if (!branch) {
    throw new AppError('VALIDATION_ERROR', `Branch ${branchId} was not found in your organization`);
  }

  const role = await rolesRepository.findById(roleId);
  if (!role || (role.organization_id !== null && role.organization_id !== organizationId)) {
    throw new AppError('VALIDATION_ERROR', `Role ${roleId} is not available to your organization`);
  }
}

export const usersService = {
  list(organizationId: string) {
    return usersRepository.list(organizationId);
  },

  async getById(organizationId: string, id: string) {
    const user = await usersRepository.findById(organizationId, id);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    const assignments = await usersRepository.getAssignments(id);
    return { user, assignments };
  },

  async invite(organizationId: string, actorUserId: string, input: InviteUserInput) {
    const existing = await usersRepository.findByEmailGlobal(input.email);
    if (existing) {
      throw new AppError('CONFLICT', 'An account with this email already exists');
    }

    // Validate every branch/role belongs to this organization before writing anything.
    for (const assignment of input.assignments) {
      await assertBranchAndRoleBelongToOrg(organizationId, assignment.branchId, assignment.roleId);
    }

    const passwordHash = await hashPassword(input.initialPassword);
    const user = await usersRepository.create(organizationId, actorUserId, {
      email: input.email,
      full_name: input.fullName,
      password_hash: passwordHash,
      ...(input.phone !== undefined && { phone: input.phone }),
    });

    for (const assignment of input.assignments) {
      await usersRepository.upsertAssignment(organizationId, user.id, assignment.branchId, assignment.roleId);
    }

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'users',
      entityId: user.id,
      after: { email: user.email, fullName: user.full_name },
    });

    // Credential delivery is stubbed the same way as password-reset emails
    // (see auth.service.ts) until the Notifications module's SES-backed
    // workers exist: the admin who invited this user is responsible for
    // relaying the initial password out of band for now.
    logger.info({ email: user.email }, 'User invited — credential delivery not yet wired to email');

    return user;
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateUserInput) {
    const before = await usersRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'User not found');

    const updated = await usersRepository.update(organizationId, id, actorUserId, {
      ...(input.fullName !== undefined && { full_name: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'users',
      entityId: id,
      before: { fullName: before.full_name, isActive: before.is_active },
      after: { fullName: updated.full_name, isActive: updated.is_active },
    });

    return updated;
  },

  async assignStoreRole(organizationId: string, userId: string, actorUserId: string, input: AssignStoreRoleInput) {
    const user = await usersRepository.findById(organizationId, userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');

    await assertBranchAndRoleBelongToOrg(organizationId, input.branchId, input.roleId);

    const assignment = await usersRepository.upsertAssignment(organizationId, userId, input.branchId, input.roleId);

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'user_store_roles',
      entityId: assignment.id,
      after: { userId, branchId: input.branchId, roleId: input.roleId },
    });

    return assignment;
  },

  async removeStoreRole(organizationId: string, userId: string, actorUserId: string, branchId: string): Promise<void> {
    const user = await usersRepository.findById(organizationId, userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');

    await usersRepository.removeAssignment(userId, branchId);

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'user_store_roles',
      entityId: userId,
      before: { branchId },
    });
  },
};
