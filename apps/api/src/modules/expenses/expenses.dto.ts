import { z } from 'zod';

export const createExpenseCategorySchema = z.object({ name: z.string().min(1).max(100) });
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

export const createExpenseSchema = z.object({
  branchId: z.string().uuid().optional(),
  expenseCategoryId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMode: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'cheque']),
  notes: z.string().max(2000).optional(),
  expenseDate: z.string().optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  expenseCategoryId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
