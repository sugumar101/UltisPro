import { Router } from 'express';
import { requireAuth } from '../auth/rbac.middleware';
import { rolesRepository } from './roles.repository';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const rolesRouter = Router();

// Read-only for MVP: every authenticated user can see the role/permission
// catalog (needed to populate "assign role" dropdowns); only users:manage
// can actually assign a role to someone (enforced in users.routes.ts).
rolesRouter.get('/roles', requireAuth, async (req, res) => {
  const roles = await rolesRepository.listAvailable(req.auth!.orgId);
  sendSuccess(res, roles);
});

rolesRouter.get('/roles/:id/permissions', requireAuth, async (req, res) => {
  const permissions = await rolesRepository.listPermissionsForRole(param(req, 'id'));
  sendSuccess(res, permissions);
});

rolesRouter.get('/permissions', requireAuth, async (_req, res) => {
  const permissions = await rolesRepository.listAllPermissions();
  sendSuccess(res, permissions);
});
