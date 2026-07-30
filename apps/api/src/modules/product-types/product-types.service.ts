import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { suggestHsnCode } from '../../shared/hsn';
import { productTypesRepository, productCategoriesRepository } from './product-types.repository';
import type {
  CreateProductTypeInput,
  UpdateProductTypeInput,
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
} from './product-types.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const productTypesService = {
  list(organizationId: string) {
    return productTypesRepository.list(organizationId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateProductTypeInput) {
    // A type named "T-Shirts" gets HSN 6109 pre-filled so the admin only has
    // to confirm rather than look it up. Falls back to null when the name
    // matches nothing known — better a blank HSN than a wrong one.
    const defaultHsnCode = input.defaultHsnCode?.trim() || suggestHsnCode(input.name);

    try {
      const type = await productTypesRepository.create(organizationId, actorUserId, {
        name: input.name,
        size_options: input.sizeOptions,
        default_hsn_code: defaultHsnCode,
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'product_types',
        entityId: type.id,
        after: { name: type.name, sizeOptions: type.size_options },
      });
      return type;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A product type with this name already exists');
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateProductTypeInput) {
    const before = await productTypesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Product type not found');

    try {
      const updated = await productTypesRepository.update(organizationId, id, actorUserId, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.sizeOptions !== undefined && { size_options: input.sizeOptions }),
        ...(input.defaultHsnCode !== undefined && { default_hsn_code: input.defaultHsnCode }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'product_types',
        entityId: id,
        before: { name: before.name },
        after: { name: updated.name },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'A product type with this name already exists');
      throw err;
    }
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await productTypesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Product type not found');

    await productTypesRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'product_types',
      entityId: id,
      before: { name: before.name },
    });
  },
};

export const productCategoriesService = {
  list(organizationId: string, productTypeId?: string) {
    return productCategoriesRepository.list(organizationId, productTypeId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateProductCategoryInput) {
    const type = await productTypesRepository.findById(organizationId, input.productTypeId);
    if (!type) throw new AppError('VALIDATION_ERROR', 'Product type not found');

    try {
      const category = await productCategoriesRepository.create(organizationId, actorUserId, {
        product_type_id: input.productTypeId,
        name: input.name,
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'product_categories',
        entityId: category.id,
        after: { name: category.name, productTypeId: input.productTypeId },
      });
      return category;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A category with this name already exists under this product type');
      }
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateProductCategoryInput) {
    const before = await productCategoriesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Product category not found');

    try {
      const updated = await productCategoriesRepository.update(organizationId, id, actorUserId, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
      });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'update',
        entityTable: 'product_categories',
        entityId: id,
        before: { name: before.name },
        after: { name: updated.name },
      });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', 'A category with this name already exists under this product type');
      }
      throw err;
    }
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await productCategoriesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Product category not found');

    await productCategoriesRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'product_categories',
      entityId: id,
      before: { name: before.name },
    });
  },
};
