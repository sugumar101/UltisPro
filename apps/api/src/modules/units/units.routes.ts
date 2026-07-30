import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createUnitSchema, updateUnitSchema } from './units.dto';
import { unitsService } from './units.service';
import { sendSuccess } from '../../shared/response-envelope';

export const unitsRouter = Router();

unitsRouter.get('/units', requireAuth, async (req, res) => {
  sendSuccess(res, await unitsService.list(req.auth!.orgId));
});

unitsRouter.post('/units', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = createUnitSchema.parse(req.body);
  const unit = await unitsService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, unit, 201);
});

unitsRouter.patch('/units/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  const input = updateUnitSchema.parse(req.body);
  const unit = await unitsService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
  sendSuccess(res, unit);
});

unitsRouter.delete('/units/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), async (req, res) => {
  await unitsService.remove(req.auth!.orgId, req.params.id, req.auth!.sub);
  sendSuccess(res, { deleted: true });
});
