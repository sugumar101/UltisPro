import { z } from 'zod';

export const dateRangeQuerySchema = z.object({
  fromDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid fromDate'),
  toDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid toDate'),
  branchId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const inventoryReportQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;
