import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { inviteUserSchema, updateUserSchema, assignStoreRoleSchema } from './users.dto';
import { usersService } from './users.service';
import { sendSuccess } from '../../shared/response-envelope';

export const usersRouter = Router();

usersRouter.get('/users', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  const users = await usersService.list(req.auth!.orgId);
  sendSuccess(res, users);
});

usersRouter.post('/users', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  const input = inviteUserSchema.parse(req.body);
  const user = await usersService.invite(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, { id: user.id, email: user.email, fullName: user.full_name }, 201);
});

usersRouter.get('/users/:id', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  const result = await usersService.getById(req.auth!.orgId, req.params.id);
  sendSuccess(res, result);
});

usersRouter.patch('/users/:id', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
  const input = updateUserSchema.parse(req.body);
  const user = await usersService.update(req.auth!.orgId, req.params.id, req.auth!.sub, input);
  sendSuccess(res, user);
});

usersRouter.post(
  '/users/:id/store-roles',
  requireAuth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  async (req, res) => {
    const input = assignStoreRoleSchema.parse(req.body);
    const assignment = await usersService.assignStoreRole(req.auth!.orgId, req.params.id, req.auth!.sub, input);
    sendSuccess(res, assignment, 201);
  },
);

usersRouter.delete(
  '/users/:id/store-roles/:branchId',
  requireAuth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  async (req, res) => {
    await usersService.removeStoreRole(req.auth!.orgId, req.params.id, req.auth!.sub, req.params.branchId);
    sendSuccess(res, { removed: true });
  },
);
