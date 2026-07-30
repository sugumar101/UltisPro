import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createPurchaseReturnSchema } from '../purchase-orders/purchase-orders.dto';
import { purchaseReturnsService } from './purchase-returns.service';
import { sendSuccess } from '../../shared/response-envelope';

export const purchaseReturnsRouter = Router();

purchaseReturnsRouter.get('/purchase-returns', requireAuth, async (req, res) => {
  sendSuccess(res, await purchaseReturnsService.list(req.auth!.orgId));
});

purchaseReturnsRouter.get('/purchase-returns/:id', requireAuth, async (req, res) => {
  sendSuccess(res, await purchaseReturnsService.getById(req.auth!.orgId, req.params.id));
});

purchaseReturnsRouter.post(
  '/purchase-returns',
  requireAuth,
  requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE),
  async (req, res) => {
    const input = createPurchaseReturnSchema.parse(req.body);
    const result = await purchaseReturnsService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, result, 201);
  },
);
