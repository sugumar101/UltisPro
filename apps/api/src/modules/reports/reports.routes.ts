import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import { dateRangeQuerySchema, inventoryReportQuerySchema } from './reports.dto';
import { reportsService } from './reports.service';
import { sendSuccess } from '../../shared/response-envelope';
import { toCsv } from '../../shared/csv';

export const reportsRouter = Router();

function sendCsv(res: import('express').Response, filename: string, rows: Record<string, unknown>[]) {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

reportsRouter.get(
  '/reports/sales',
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req, res) => {
    const query = dateRangeQuerySchema.parse(req.query);
    const report = await reportsService.sales(req.auth!.orgId, query);
    if (query.format === 'csv') {
      sendCsv(res, 'sales-report.csv', report.byDay as unknown as Record<string, unknown>[]);
      return;
    }
    sendSuccess(res, report);
  },
);

reportsRouter.get(
  '/reports/inventory',
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req, res) => {
    const query = inventoryReportQuerySchema.parse(req.query);
    const report = await reportsService.inventory(req.auth!.orgId, query);
    if (query.format === 'csv') {
      sendCsv(res, 'inventory-report.csv', report.rows as unknown as Record<string, unknown>[]);
      return;
    }
    sendSuccess(res, report);
  },
);

reportsRouter.get('/reports/gst', requireAuth, requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
  const query = dateRangeQuerySchema.parse(req.query);
  const report = await reportsService.gst(req.auth!.orgId, query);
  if (query.format === 'csv') {
    sendCsv(res, 'gst-report.csv', [...report.outputTax, ...report.inputTax] as unknown as Record<string, unknown>[]);
    return;
  }
  sendSuccess(res, report);
});

reportsRouter.get(
  '/reports/cash-flow',
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req, res) => {
    const query = dateRangeQuerySchema.parse(req.query);
    const report = await reportsService.cashFlow(req.auth!.orgId, query);
    if (query.format === 'csv') {
      sendCsv(res, 'cash-flow-report.csv', [...report.cashIn, ...report.cashOut] as unknown as Record<string, unknown>[]);
      return;
    }
    sendSuccess(res, report);
  },
);
