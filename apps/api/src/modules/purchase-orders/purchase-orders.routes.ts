import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createPurchaseOrderSchema, receivePurchaseOrderSchema } from './purchase-orders.dto';
import { purchaseOrdersService } from './purchase-orders.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.get('/purchase-orders', requireAuth, async (req, res) => {
  sendSuccess(res, await purchaseOrdersService.list(req.auth!.orgId));
});

purchaseOrdersRouter.get('/purchase-orders/:id', requireAuth, async (req, res) => {
  sendSuccess(res, await purchaseOrdersService.getById(req.auth!.orgId, param(req, 'id')));
});

purchaseOrdersRouter.post(
  '/purchase-orders',
  requireAuth,
  requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE),
  async (req, res) => {
    const input = createPurchaseOrderSchema.parse(req.body);
    const result = await purchaseOrdersService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, result, 201);
  },
);

purchaseOrdersRouter.post(
  '/purchase-orders/:id/approve',
  requireAuth,
  requirePermission(PERMISSIONS.PURCHASE_ORDERS_APPROVE),
  async (req, res) => {
    const order = await purchaseOrdersService.approve(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, order);
  },
);

purchaseOrdersRouter.post(
  '/purchase-orders/:id/receive',
  requireAuth,
  requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE),
  async (req, res) => {
    const input = receivePurchaseOrderSchema.parse(req.body);
    const order = await purchaseOrdersService.receive(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, order);
  },
);

purchaseOrdersRouter.post(
  '/purchase-orders/:id/cancel',
  requireAuth,
  requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE),
  async (req, res) => {
    const order = await purchaseOrdersService.cancel(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, order);
  },
);
