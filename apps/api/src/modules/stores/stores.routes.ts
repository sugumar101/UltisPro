import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createStoreSchema, updateStoreSchema } from './stores.dto';
import { storesService } from './stores.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const storesRouter = Router();

storesRouter.get('/stores', requireAuth, async (req, res) => {
  const stores = await storesService.list(req.auth!.orgId);
  sendSuccess(res, stores);
});

storesRouter.post('/stores', requireAuth, requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const input = createStoreSchema.parse(req.body);
  const store = await storesService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, store, 201);
});

storesRouter.get('/stores/:id', requireAuth, async (req, res) => {
  const store = await storesService.getById(req.auth!.orgId, param(req, 'id'));
  sendSuccess(res, store);
});

storesRouter.patch('/stores/:id', requireAuth, requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  const input = updateStoreSchema.parse(req.body);
  const store = await storesService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
  sendSuccess(res, store);
});
