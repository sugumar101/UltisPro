import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createSupplierSchema, updateSupplierSchema, createSupplierPaymentSchema } from './suppliers.dto';
import { suppliersService } from './suppliers.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const suppliersRouter = Router();

suppliersRouter.get('/suppliers', requireAuth, async (req, res) => {
  sendSuccess(res, await suppliersService.list(req.auth!.orgId));
});

suppliersRouter.get('/suppliers/:id', requireAuth, async (req, res) => {
  sendSuccess(res, await suppliersService.getById(req.auth!.orgId, param(req, 'id')));
});

suppliersRouter.post(
  '/suppliers',
  requireAuth,
  requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
  async (req, res) => {
    const input = createSupplierSchema.parse(req.body);
    const supplier = await suppliersService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, supplier, 201);
  },
);

suppliersRouter.patch(
  '/suppliers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
  async (req, res) => {
    const input = updateSupplierSchema.parse(req.body);
    const supplier = await suppliersService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, supplier);
  },
);

suppliersRouter.delete(
  '/suppliers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
  async (req, res) => {
    await suppliersService.remove(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);

suppliersRouter.post(
  '/suppliers/:id/payments',
  requireAuth,
  requirePermission(PERMISSIONS.SUPPLIERS_MANAGE),
  async (req, res) => {
    const input = createSupplierPaymentSchema.parse(req.body);
    const payment = await suppliersService.recordPayment(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, payment, 201);
  },
);
