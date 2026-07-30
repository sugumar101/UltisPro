import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { updateOrganizationSchema } from './organizations.dto';
import { organizationsService } from './organizations.service';
import { sendSuccess } from '../../shared/response-envelope';

export const organizationsRouter = Router();

organizationsRouter.get('/organizations/me', requireAuth, async (req, res) => {
  const org = await organizationsService.getMine(req.auth!.orgId);
  sendSuccess(res, org);
});

organizationsRouter.patch(
  '/organizations/me',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_MANAGE),
  async (req, res) => {
    const input = updateOrganizationSchema.parse(req.body);
    const org = await organizationsService.updateMine(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, org);
  },
);
