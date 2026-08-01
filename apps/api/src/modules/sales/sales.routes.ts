import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createSaleSchema, listSalesQuerySchema, createSalesReturnSchema } from './sales.dto';
import { salesService } from './sales.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const salesRouter = Router();

salesRouter.get('/sales', requireAuth, async (req, res) => {
  const query = listSalesQuerySchema.parse(req.query);
  const result = await salesService.list(req.auth!.orgId, query);
  sendSuccess(res, result.rows, 200, { page: result.page, pageSize: result.pageSize, total: result.total });
});

salesRouter.get('/sales/:id', requireAuth, async (req, res) => {
  sendSuccess(res, await salesService.getById(req.auth!.orgId, param(req, 'id')));
});

// Everything needed to render a printed receipt / GST tax invoice. Read-only
// and gated the same way GET /sales/:id is (any authenticated org member) —
// a cashier who can ring up a sale must be able to reprint its receipt.
salesRouter.get('/sales/:id/receipt', requireAuth, async (req, res) => {
  sendSuccess(res, await salesService.getReceipt(req.auth!.orgId, param(req, 'id')));
});

salesRouter.post('/sales', requireAuth, requirePermission(PERMISSIONS.SALES_CREATE), async (req, res) => {
  const input = createSaleSchema.parse(req.body);
  const result = await salesService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, result, 201);
});

salesRouter.post(
  '/sales/:id/return',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_RETURN),
  async (req, res) => {
    const input = createSalesReturnSchema.parse(req.body);
    const result = await salesService.createReturn(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, result, 201);
  },
);
