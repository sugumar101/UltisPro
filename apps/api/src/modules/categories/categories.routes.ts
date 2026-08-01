import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createCategorySchema, updateCategorySchema } from './categories.dto';
import { categoriesService } from './categories.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const categoriesRouter = Router();

categoriesRouter.get('/categories', requireAuth, async (req, res) => {
  sendSuccess(res, await categoriesService.list(req.auth!.orgId));
});

categoriesRouter.post(
  '/categories',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = createCategorySchema.parse(req.body);
    const category = await categoriesService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, category, 201);
  },
);

categoriesRouter.patch(
  '/categories/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    const input = updateCategorySchema.parse(req.body);
    const category = await categoriesService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, category);
  },
);

categoriesRouter.delete(
  '/categories/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PRODUCTS_MANAGE),
  async (req, res) => {
    await categoriesService.remove(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);
