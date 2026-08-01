import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createBrandSchema, updateBrandSchema } from './brands.dto';
import { brandsService } from './brands.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const brandsRouter = Router();

brandsRouter.get('/brands', requireAuth, async (req, res) => {
  sendSuccess(res, await brandsService.list(req.auth!.orgId));
});

brandsRouter.post('/brands', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = createBrandSchema.parse(req.body);
  const brand = await brandsService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, brand, 201);
});

brandsRouter.patch('/brands/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = updateBrandSchema.parse(req.body);
  const brand = await brandsService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
  sendSuccess(res, brand);
});

brandsRouter.delete('/brands/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  await brandsService.remove(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
  sendSuccess(res, { deleted: true });
});
