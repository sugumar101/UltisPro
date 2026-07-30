import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/rbac.middleware';
import { dashboardService } from './dashboard.service';
import { sendSuccess } from '../../shared/response-envelope';

export const dashboardRouter = Router();

const chartsQuerySchema = z.object({ days: z.coerce.number().int().positive().max(365).optional().default(30) });
const recentQuerySchema = z.object({ limit: z.coerce.number().int().positive().max(50).optional().default(10) });

dashboardRouter.get('/dashboard/summary', requireAuth, async (req, res) => {
  sendSuccess(res, await dashboardService.summary(req.auth!.orgId));
});

dashboardRouter.get('/dashboard/charts', requireAuth, async (req, res) => {
  const query = chartsQuerySchema.parse(req.query);
  sendSuccess(res, await dashboardService.charts(req.auth!.orgId, query.days));
});

dashboardRouter.get('/dashboard/recent-activity', requireAuth, async (req, res) => {
  const query = recentQuerySchema.parse(req.query);
  sendSuccess(res, await dashboardService.recentActivity(req.auth!.orgId, query.limit));
});
