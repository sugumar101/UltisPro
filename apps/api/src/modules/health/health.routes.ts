import { Router } from 'express';
import { sendSuccess } from '../../shared/response-envelope';
import { checkDatabaseConnection } from '../../shared/db';

export const healthRouter = Router();

healthRouter.get('/healthz', (_req, res) => {
  sendSuccess(res, { status: 'ok', uptime: process.uptime() });
});

healthRouter.get('/readyz', async (_req, res) => {
  const dbOk = await checkDatabaseConnection();
  sendSuccess(res, { status: dbOk ? 'ready' : 'not_ready', database: dbOk }, dbOk ? 200 : 503);
});
