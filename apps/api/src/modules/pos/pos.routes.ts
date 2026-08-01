import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { posSearchQuerySchema, holdBillSchema } from './pos.dto';
import { posService } from './pos.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const posRouter = Router();

posRouter.get('/pos/search', requireAuth, requirePermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
  const query = posSearchQuerySchema.parse(req.query);
  sendSuccess(res, await posService.search(req.auth!.orgId, query.branchId, query.q));
});

posRouter.get('/pos/hold', requireAuth, requirePermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  if (!branchId) {
    sendSuccess(res, []);
    return;
  }
  sendSuccess(res, await posService.listHeld(req.auth!.orgId, branchId));
});

posRouter.post('/pos/hold', requireAuth, requirePermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
  const input = holdBillSchema.parse(req.body);
  const held = await posService.hold(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, held, 201);
});

posRouter.post(
  '/pos/hold/:id/resume',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CREATE),
  async (req, res) => {
    const held = await posService.resume(req.auth!.orgId, param(req, 'id'));
    sendSuccess(res, held);
  },
);
