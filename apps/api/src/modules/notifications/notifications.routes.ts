import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/rbac.middleware';
import { notificationsService } from './notifications.service';
import { sendSuccess } from '../../shared/response-envelope';

export const notificationsRouter = Router();

const listQuerySchema = z.object({ limit: z.coerce.number().int().positive().max(100).optional().default(30) });

notificationsRouter.get('/notifications', requireAuth, async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  sendSuccess(res, await notificationsService.list(req.auth!.orgId, req.auth!.sub, query.limit));
});

notificationsRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const notification = await notificationsService.markRead(req.auth!.orgId, req.params.id, req.auth!.sub);
  sendSuccess(res, notification);
});
