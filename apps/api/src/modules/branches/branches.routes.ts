import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { createBranchSchema, updateBranchSchema } from './branches.dto';
import { branchesService } from './branches.service';
import { sendSuccess } from '../../shared/response-envelope';

export const branchesRouter = Router();

branchesRouter.get('/branches', requireAuth, async (req, res) => {
  const branches = await branchesService.listByOrg(req.auth!.orgId);
  sendSuccess(res, branches);
});

branchesRouter.get('/stores/:storeId/branches', requireAuth, async (req, res) => {
  const branches = await branchesService.listByStore(req.auth!.orgId, req.params.storeId);
  sendSuccess(res, branches);
});

branchesRouter.post(
  '/stores/:storeId/branches',
  requireAuth,
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  async (req, res) => {
    const input = createBranchSchema.parse(req.body);
    const branch = await branchesService.create(req.auth!.orgId, req.params.storeId, req.auth!.sub, input);
    sendSuccess(res, branch, 201);
  },
);

branchesRouter.get('/branches/:id', requireAuth, async (req, res) => {
  const branch = await branchesService.getById(req.auth!.orgId, req.params.id);
  sendSuccess(res, branch);
});

branchesRouter.patch(
  '/branches/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  async (req, res) => {
    const input = updateBranchSchema.parse(req.body);
    const branch = await branchesService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, branch);
  },
);
