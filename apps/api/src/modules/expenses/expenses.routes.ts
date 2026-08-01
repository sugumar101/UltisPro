import { Router } from 'express';
import { PERMISSIONS } from '@ultispro/shared-types';
import { requireAuth, requirePermission } from '../auth/rbac.middleware';
import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} from './expenses.dto';
import { expenseCategoriesService, expensesService } from './expenses.service';
import { sendSuccess } from '../../shared/response-envelope';
import { param } from '../../shared/route-params';

export const expensesRouter = Router();

expensesRouter.get('/expense-categories', requireAuth, async (req, res) => {
  sendSuccess(res, await expenseCategoriesService.list(req.auth!.orgId));
});

expensesRouter.post(
  '/expense-categories',
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  async (req, res) => {
    const input = createExpenseCategorySchema.parse(req.body);
    const category = await expenseCategoriesService.create(req.auth!.orgId, req.auth!.sub, input);
    sendSuccess(res, category, 201);
  },
);

expensesRouter.patch(
  '/expense-categories/:id',
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  async (req, res) => {
    const input = updateExpenseCategorySchema.parse(req.body);
    const category = await expenseCategoriesService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, category);
  },
);

expensesRouter.delete(
  '/expense-categories/:id',
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  async (req, res) => {
    await expenseCategoriesService.remove(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);

expensesRouter.get('/expenses', requireAuth, async (req, res) => {
  const query = listExpensesQuerySchema.parse(req.query);
  const result = await expensesService.list(req.auth!.orgId, query);
  sendSuccess(res, result.rows, 200, { page: result.page, pageSize: result.pageSize, total: result.total });
});

expensesRouter.get('/expenses/:id', requireAuth, async (req, res) => {
  sendSuccess(res, await expensesService.getById(req.auth!.orgId, param(req, 'id')));
});

expensesRouter.post('/expenses', requireAuth, requirePermission(PERMISSIONS.EXPENSES_MANAGE), async (req, res) => {
  const input = createExpenseSchema.parse(req.body);
  const expense = await expensesService.create(req.auth!.orgId, req.auth!.sub, input);
  sendSuccess(res, expense, 201);
});

expensesRouter.patch(
  '/expenses/:id',
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  async (req, res) => {
    const input = updateExpenseSchema.parse(req.body);
    const expense = await expensesService.update(req.auth!.orgId, param(req, 'id'), req.auth!.sub, input);
    sendSuccess(res, expense);
  },
);

expensesRouter.delete(
  '/expenses/:id',
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  async (req, res) => {
    await expensesService.remove(req.auth!.orgId, param(req, 'id'), req.auth!.sub);
    sendSuccess(res, { deleted: true });
  },
);
