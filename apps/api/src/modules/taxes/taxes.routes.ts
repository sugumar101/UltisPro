import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createTaxSchema, updateTaxSchema } from './taxes.dto';
import { taxesService } from './taxes.service';
import { sendSuccess } from '../../shared/response-envelope';

export const taxesRouter = Router();

taxesRouter.get('/taxes', requireAuth, async (req, res) => {
  sendSuccess(res, await taxesService.list(req.auth!.orgId));
});

taxesRouter.post('/taxes', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = createTaxSchema.parse(req.body);
  const tax = await taxesService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, tax, 201);
});

taxesRouter.patch('/taxes/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = updateTaxSchema.parse(req.body);
  const tax = await taxesService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
  sendSuccess(res, tax);
});

taxesRouter.delete('/taxes/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  await taxesService.remove(req.auth!.orgId, req.params.id, req.auth!.sub);
  sendSuccess(res, { deleted: true });
});
