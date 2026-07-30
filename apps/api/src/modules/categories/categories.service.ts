import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { categoriesRepository } from './categories.repository';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const categoriesService = {
  list(organizationId: string) {
    return categoriesRepository.list(organizationId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateCategoryInput) {
    if (input.parentId) {
      const parent = await categoriesRepository.findById(organizationId, input.parentId);
      if (!parent) throw new AppError('VALIDATION_ERROR', 'Parent category not found');
    }

    try {
      const category = await categoriesRepository.create(organizationId, actorUserId, {
        name: input.name,
        ...(input.parentId !== undefined && { parent_id: input.parentId }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'categories',
        entityId: category.id,
        after: { name: category.name },
      });
      return category;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A category with this name already exists under the same parent');
      }
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateCategoryInput) {
    const before = await categoriesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Category not found');

    if (input.parentId) {
      if (input.parentId === id) throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent');
      const parent = await categoriesRepository.findById(organizationId, input.parentId);
      if (!parent) throw new AppError('VALIDATION_ERROR', 'Parent category not found');
    }

    try {
      const updated = await categoriesRepository.update(organizationId, id, actorUserId, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.parentId !== undefined && { parent_id: input.parentId }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'categories',
        entityId: id,
        before: { name: before.name },
        after: { name: updated.name },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A category with this name already exists under the same parent');
      }
      throw err;
    }
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await categoriesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Category not found');

    await categoriesRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'categories',
      entityId: id,
      before: { name: before.name },
    });
  },
};
