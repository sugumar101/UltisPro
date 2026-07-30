import { db } from '../../shared/db';
import type { ListExpensesQuery } from './expenses.dto';

export const expenseCategoriesRepository = {
  list(organizationId: string) {
    return db
      .selectFrom('expense_categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('name', 'asc')
      .execute();
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('expense_categories')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: { name: string }) {
    return db
      .insertInto('expense_categories')
      .values({ organization_id: organizationId, created_by: actorUserId, updated_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, actorUserId: string, values: Partial<{ name: string }>) {
    return db
      .updateTable('expense_categories')
      .set({ ...values, updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string, actorUserId: string) {
    return db
      .updateTable('expense_categories')
      .set({ deleted_at: new Date(), updated_by: actorUserId })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },
};

interface ExpenseWritableFields {
  branch_id?: string | null;
  expense_category_id?: string;
  amount?: number;
  payment_mode?: string;
  notes?: string | null;
  expense_date?: string;
}

export const expensesRepository = {
  async list(organizationId: string, query: ListExpensesQuery) {
    let listQuery = db
      .selectFrom('expenses')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);
    let countQuery = db
      .selectFrom('expenses')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null);

    if (query.branchId) {
      listQuery = listQuery.where('branch_id', '=', query.branchId);
      countQuery = countQuery.where('branch_id', '=', query.branchId);
    }
    if (query.expenseCategoryId) {
      listQuery = listQuery.where('expense_category_id', '=', query.expenseCategoryId);
      countQuery = countQuery.where('expense_category_id', '=', query.expenseCategoryId);
    }
    if (query.fromDate) {
      listQuery = listQuery.where('expense_date', '>=', query.fromDate);
      countQuery = countQuery.where('expense_date', '>=', query.fromDate);
    }
    if (query.toDate) {
      listQuery = listQuery.where('expense_date', '<=', query.toDate);
      countQuery = countQuery.where('expense_date', '<=', query.toDate);
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderBy('expense_date', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(countRow?.count ?? 0) };
  },

  findById(organizationId: string, id: string) {
    return db
      .selectFrom('expenses')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  },

  create(organizationId: string, actorUserId: string, values: ExpenseWritableFields & { expense_category_id: string; amount: number; payment_mode: string }) {
    return db
      .insertInto('expenses')
      .values({ organization_id: organizationId, created_by: actorUserId, ...values })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  update(organizationId: string, id: string, values: ExpenseWritableFields) {
    return db
      .updateTable('expenses')
      .set(values)
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  softDelete(organizationId: string, id: string) {
    return db
      .updateTable('expenses')
      .set({ deleted_at: new Date() })
      .where('organization_id', '=', organizationId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async totalForRange(organizationId: string, fromDate: string, toDate: string) {
    const row = await db
      .selectFrom('expenses')
      .select(({ fn }) => [fn.sum<string>('amount').as('total')])
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .where('expense_date', '>=', fromDate)
      .where('expense_date', '<=', toDate)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  },
};
