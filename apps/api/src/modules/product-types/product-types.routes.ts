import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import {
  createProductTypeSchema,
  updateProductTypeSchema,
  createProductCategorySchema,
  updateProductCategorySchema,
  listProductCategoriesQuerySchema,
} from './product-types.dto';
import { productTypesService, productCategoriesService } from './product-types.service';
import { sendSuccess } from '../../shared/response-envelope';

export const productTypesRouter = Router();

productTypesRouter.get('/product-types', requireAuth, async (req, res) => {
  sendSuccess(res, await productTypesService.list(req.auth!.orgId));
});

productTypesRouter.post(
  '/product-types',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = createProductTypeSchema.parse(req.body);
    const type = await productTypesService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, type, 201);
  },
);

productTypesRouter.patch(
  '/product-types/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = updateProductTypeSchema.parse(req.body);
    const type = await productTypesService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, type);
  },
);

productTypesRouter.delete(
  '/product-types/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    await productTypesService.remove(req.auth!.orgId, req.params.id, req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);

productTypesRouter.get('/product-categories', requireAuth, async (req, res) => {
  const query = listProductCategoriesQuerySchema.parse(req.query);
  sendSuccess(res, await productCategoriesService.list(req.auth!.orgId, query.productTypeId));
});

productTypesRouter.post(
  '/product-categories',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = createProductCategorySchema.parse(req.body);
    const category = await productCategoriesService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, category, 201);
  },
);

productTypesRouter.patch(
  '/product-categories/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = updateProductCategorySchema.parse(req.body);
    const category = await productCategoriesService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, category);
  },
);

productTypesRouter.delete(
  '/product-categories/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    await productCategoriesService.remove(req.auth!.orgId, req.params.id, req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);
