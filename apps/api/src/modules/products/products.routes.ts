import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  listProductsQuerySchema,
  attachImageSchema,
  createClothingProductSchema,
} from './products.dto';
import { productsService } from './products.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const productsRouter = Router();

productsRouter.get('/products', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_VIEW), async (req, res) => {
  const query = listProductsQuerySchema.parse(req.query);
  const result = await productsService.list(req.auth!.orgId, query);
  sendSuccess(res, result.rows, 200, { page: result.page, pageSize: result.pageSize, total: result.total });
});

productsRouter.post('/products', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = createProductSchema.parse(req.body);
  const result = await productsService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, result, 201);
});

productsRouter.post(
  '/products/clothing',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = createClothingProductSchema.parse(req.body);
    const result = await productsService.createClothing(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, result, 201);
  },
);

productsRouter.get('/products/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_VIEW), async (req, res) => {
  const result = await productsService.getById(req.auth!.orgId, param(req, 'id'));
  sendSuccess(res, result);
});

productsRouter.patch(
  '/products/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = updateProductSchema.parse(req.body);
    const product = await productsService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, product);
  },
);

productsRouter.delete(
  '/products/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    await productsService.remove(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);

productsRouter.post(
  '/products/:id/variants',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = createVariantSchema.parse(req.body);
    const variant = await productsService.addVariant(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, variant, 201);
  },
);

productsRouter.patch(
  '/products/:id/variants/:variantId',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = updateVariantSchema.parse(req.body);
    const variant = await productsService.updateVariant(req.auth!.orgId, param(req, 'variantId'), req.auth!.sub, input);
    sendSuccess(res, variant);
  },
);

productsRouter.delete(
  '/products/:id/variants/:variantId',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    await productsService.removeVariant(req.auth!.orgId, param(req, 'id'), param(req, 'variantId'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);

productsRouter.post(
  '/products/:id/images',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = attachImageSchema.parse(req.body);
    const image = await productsService.addImage(
      req.auth!.orgId,
      param(req, 'id'),
      req.auth!.sub,
      input.s3Key,
      input.sortOrder,
    );
    sendSuccess(res, image, 201);
  },
);

productsRouter.delete(
  '/products/:id/images/:imageId',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    await productsService.removeImage(req.auth!.orgId, param(req, 'id'), param(req, 'imageId'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);
