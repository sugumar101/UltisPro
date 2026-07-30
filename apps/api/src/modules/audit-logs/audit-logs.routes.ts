import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { listAuditLogsQuerySchema } from './audit-logs.dto';
import { auditLogsRepository } from './audit-logs.repository';
import { sendSuccess } from '../../shared/response-envelope';

export const auditLogsRouter = Router();

auditLogsRouter.get(
  '/audit-logs',
  requireAuth,
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  async (req, res) => {
    const query = listAuditLogsQuerySchema.parse(req.query);
    const result = await auditLogsRepository.list(req.auth!.orgId, query);
    sendSuccess(res, result.rows, 200, { page: query.page, pageSize: query.pageSize, total: result.total });
  },
);
