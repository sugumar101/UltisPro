import { apiFetch, apiFetchEnvelope } from './api-client';

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  branch_id: string | null;
  expense_category_id: string;
  amount: string;
  payment_mode: string;
  notes: string | null;
  expense_date: string;
}

export const listExpenseCategories = (token: string) => apiFetch<ExpenseCategory[]>('/api/v1/expense-categories', {}, token);

export const createExpenseCategory = (token: string, name: string) =>
  apiFetch<ExpenseCategory>('/api/v1/expense-categories', { method: 'POST', body: JSON.stringify({ name }) }, token);

export interface ListExpensesResult {
  data: Expense[];
  meta: { page: number; pageSize: number; total: number };
}

export async function listExpenses(
  token: string,
  params: { branchId?: string; expenseCategoryId?: string; page?: number } = {},
): Promise<ListExpensesResult> {
  const search = new URLSearchParams();
  if (params.branchId) search.set('branchId', params.branchId);
  if (params.expenseCategoryId) search.set('expenseCategoryId', params.expenseCategoryId);
  if (params.page) search.set('page', String(params.page));

  const envelope = await apiFetchEnvelope<Expense[]>(`/api/v1/expenses?${search.toString()}`, {}, token);
  return {
    data: envelope.data,
    meta: {
      page: envelope.meta?.page ?? 1,
      pageSize: envelope.meta?.pageSize ?? 20,
      total: envelope.meta?.total ?? envelope.data.length,
    },
  };
}

export const createExpense = (
  token: string,
  input: { expenseCategoryId: string; amount: number; paymentMode: string; branchId?: string; notes?: string; expenseDate?: string },
) => apiFetch<Expense>('/api/v1/expenses', { method: 'POST', body: JSON.stringify(input) }, token);
