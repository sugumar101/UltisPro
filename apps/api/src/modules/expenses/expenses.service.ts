import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { branchesRepository } from '../branches/branches.repository';
import { expenseCategoriesRepository, expensesRepository } from './expenses.repository';
import type {
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
} from './expenses.dto';

interface PgError extends Error {
  code?: string;
}
function isUniqueViolation(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && (err as PgError).code === '23505';
}

export const expenseCategoriesService = {
  list(organizationId: string) {
    return expenseCategoriesRepository.list(organizationId);
  },

  async create(organizationId: string, actorUserId: string, input: CreateExpenseCategoryInput) {
    try {
      const category = await expenseCategoriesRepository.create(organizationId, actorUserId, { name: input.name });
      await recordAudit({
        organizationId,
        actorUserId,
        action: 'create',
        entityTable: 'expense_categories',
        entityId: category.id,
        after: { name: category.name },
      });
      return category;
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'An expense category with this name already exists');
      throw err;
    }
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateExpenseCategoryInput) {
    const before = await expenseCategoriesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Expense category not found');
    const updated = await expenseCategoriesRepository.update(organizationId, id, actorUserId, {
      ...(input.name !== undefined && { name: input.name }),
    });
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'expense_categories',
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
    });
    return updated;
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await expenseCategoriesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Expense category not found');
    await expenseCategoriesRepository.softDelete(organizationId, id, actorUserId);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'expense_categories',
      entityId: id,
      before: { name: before.name },
    });
  },
};

export const expensesService = {
  async list(organizationId: string, query: ListExpensesQuery) {
    const { rows, total } = await expensesRepository.list(organizationId, query);
    return { rows, total, page: query.page, pageSize: query.pageSize };
  },

  async getById(organizationId: string, id: string) {
    const expense = await expensesRepository.findById(organizationId, id);
    if (!expense) throw new AppError('NOT_FOUND', 'Expense not found');
    return expense;
  },

  async create(organizationId: string, actorUserId: string, input: CreateExpenseInput) {
    const category = await expenseCategoriesRepository.findById(organizationId, input.expenseCategoryId);
    if (!category) throw new AppError('VALIDATION_ERROR', 'Expense category not found in your organization');
    if (input.branchId) {
      const branch = await branchesRepository.findById(organizationId, input.branchId);
      if (!branch) throw new AppError('VALIDATION_ERROR', 'Branch not found in your organization');
    }

    const expense = await expensesRepository.create(organizationId, actorUserId, {
      expense_category_id: input.expenseCategoryId,
      amount: input.amount,
      payment_mode: input.paymentMode,
      ...(input.branchId !== undefined && { branch_id: input.branchId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.expenseDate !== undefined && { expense_date: input.expenseDate }),
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'expenses',
      entityId: expense.id,
      after: { amount: expense.amount, categoryId: input.expenseCategoryId },
    });

    return expense;
  },

  async update(organizationId: string, id: string, actorUserId: string, input: UpdateExpenseInput) {
    const before = await expensesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Expense not found');

    const updated = await expensesRepository.update(organizationId, id, {
      ...(input.branchId !== undefined && { branch_id: input.branchId }),
      ...(input.expenseCategoryId !== undefined && { expense_category_id: input.expenseCategoryId }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.paymentMode !== undefined && { payment_mode: input.paymentMode }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.expenseDate !== undefined && { expense_date: input.expenseDate }),
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'update',
      entityTable: 'expenses',
      entityId: id,
      before: { amount: before.amount },
      after: { amount: updated.amount },
    });

    return updated;
  },

  async remove(organizationId: string, id: string, actorUserId: string) {
    const before = await expensesRepository.findById(organizationId, id);
    if (!before) throw new AppError('NOT_FOUND', 'Expense not found');
    await expensesRepository.softDelete(organizationId, id);
    await recordAudit({
      organizationId,
      actorUserId,
      action: 'delete',
      entityTable: 'expenses',
      entityId: id,
      before: { amount: before.amount },
    });
  },
};
