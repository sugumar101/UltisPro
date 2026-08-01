import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import {
  listStockQuerySchema,
  listLedgerQuerySchema,
  createAdjustmentSchema,
  createTransferSchema,
  expiringQuerySchema,
} from './inventory.dto';
import { inventoryService } from './inventory.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const inventoryRouter = Router();

inventoryRouter.get(
  '/inventory/stock',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  async (req, res) => {
    const query = listStockQuerySchema.parse(req.query);
    sendSuccess(res, await inventoryService.getStock(req.auth!.orgId, query));
  },
);

inventoryRouter.get(
  '/inventory/low-stock',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  async (req, res) => {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    sendSuccess(res, await inventoryService.getLowStock(req.auth!.orgId, branchId));
  },
);

inventoryRouter.get(
  '/inventory/expiring',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  async (req, res) => {
    const query = expiringQuerySchema.parse(req.query);
    sendSuccess(res, await inventoryService.getExpiringBatches(req.auth!.orgId, query.withinDays));
  },
);

inventoryRouter.get(
  '/inventory/ledger',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  async (req, res) => {
    const query = listLedgerQuerySchema.parse(req.query);
    const result = await inventoryService.getLedger(req.auth!.orgId, query);
    sendSuccess(res, result.rows, 200, { page: result.page, pageSize: result.pageSize, total: result.total });
  },
);

inventoryRouter.post(
  '/inventory/adjustments',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_ADJUST),
  async (req, res) => {
    const input = createAdjustmentSchema.parse(req.body);
    const result = await inventoryService.createAdjustment(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, result, 201);
  },
);

inventoryRouter.get(
  '/inventory/transfers',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
  async (req, res) => {
    sendSuccess(res, await inventoryService.listTransfers(req.auth!.orgId));
  },
);

inventoryRouter.post(
  '/inventory/transfers',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
  async (req, res) => {
    const input = createTransferSchema.parse(req.body);
    const transfer = await inventoryService.initiateTransfer(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, transfer, 201);
  },
);

inventoryRouter.post(
  '/inventory/transfers/:id/receive',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_TRANSFER),
  async (req, res) => {
    const transfer = await inventoryService.receiveTransfer(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, transfer);
  },
);
