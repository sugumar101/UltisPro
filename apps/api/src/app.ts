import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './shared/logger';
import { requestContext } from './shared/request-context.middleware';
import { errorHandler, notFoundHandler } from './shared/error-middleware';
import { healthRouter } from './modules/health/health.routes';
import { authRouter } from './modules/auth/auth.routes';
import { organizationsRouter } from './modules/organizations/organizations.routes';
import { storesRouter } from './modules/stores/stores.routes';
import { branchesRouter } from './modules/branches/branches.routes';
import { usersRouter } from './modules/users/users.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { brandsRouter } from './modules/brands/brands.routes';
import { unitsRouter } from './modules/units/units.routes';
import { taxesRouter } from './modules/taxes/taxes.routes';
import { productsRouter } from './modules/products/products.routes';
import { productTypesRouter } from './modules/product-types/product-types.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { purchaseOrdersRouter } from './modules/purchase-orders/purchase-orders.routes';
import { purchaseReturnsRouter } from './modules/purchase-returns/purchase-returns.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { salesRouter } from './modules/sales/sales.routes';
import { posRouter } from './modules/pos/pos.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { auditLogsRouter } from './modules/audit-logs/audit-logs.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      // pino-http's default serializers dump the entire request and response
      // header blocks (cookies, user-agent, every CSP/security header helmet
      // sets) on *every* request, which buries anything useful in the dev
      // terminal. Reduce to the fields that actually help while developing;
      // the full error object is still logged separately by errorHandler.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      // Route noise control: successful requests log at debug (hidden in
      // production, which runs at info), 4xx at warn, 5xx at error. Health
      // checks are silenced entirely — they fire constantly under a load
      // balancer and say nothing.
      customLogLevel: (req, res, err) => {
        if (req.url?.startsWith('/healthz') || req.url?.startsWith('/readyz')) return 'silent';
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'debug';
      },
      customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    }),
  );

  app.use(healthRouter);
  app.use('/api/v1', authRouter);
  app.use('/api/v1', organizationsRouter);
  app.use('/api/v1', storesRouter);
  app.use('/api/v1', branchesRouter);
  app.use('/api/v1', usersRouter);
  app.use('/api/v1', rolesRouter);
  app.use('/api/v1', categoriesRouter);
  app.use('/api/v1', brandsRouter);
  app.use('/api/v1', unitsRouter);
  app.use('/api/v1', taxesRouter);
  app.use('/api/v1', productsRouter);
  app.use('/api/v1', productTypesRouter);
  app.use('/api/v1', inventoryRouter);
  app.use('/api/v1', suppliersRouter);
  app.use('/api/v1', purchaseOrdersRouter);
  app.use('/api/v1', purchaseReturnsRouter);
  app.use('/api/v1', customersRouter);
  app.use('/api/v1', salesRouter);
  app.use('/api/v1', posRouter);
  app.use('/api/v1', dashboardRouter);
  app.use('/api/v1', reportsRouter);
  app.use('/api/v1', expensesRouter);
  app.use('/api/v1', notificationsRouter);
  app.use('/api/v1', auditLogsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
