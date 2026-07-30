import { z } from 'zod';

export const listStockQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  productVariantId: z.string().uuid().optional(),
});
export type ListStockQuery = z.infer<typeof listStockQuerySchema>;

export const listLedgerQuerySchema = z.object({
  branchId: z.string().uuid(),
  productVariantId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
});
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;

const adjustmentItemSchema = z.object({
  productVariantId: z.string().uuid(),
  quantityDelta: z.number().refine((v) => v !== 0, { message: 'quantityDelta cannot be zero' }),
  batchNumber: z.string().max(100).optional(),
  expiryDate: z.string().optional(),
  unitCost: z.number().nonnegative().optional(),
});
export type AdjustmentItemInput = z.infer<typeof adjustmentItemSchema>;

export const createAdjustmentSchema = z.object({
  branchId: z.string().uuid(),
  reasonCode: z.enum(['opening_stock', 'damage', 'theft', 'recount', 'expiry_writeoff', 'other']),
  notes: z.string().max(2000).optional(),
  items: z.array(adjustmentItemSchema).min(1, 'At least one item is required'),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

const transferItemSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  batchId: z.string().uuid().optional(),
});
export type TransferItemInput = z.infer<typeof transferItemSchema>;

export const createTransferSchema = z
  .object({
    fromBranchId: z.string().uuid(),
    toBranchId: z.string().uuid(),
    items: z.array(transferItemSchema).min(1, 'At least one item is required'),
  })
  .refine((data) => data.fromBranchId !== data.toBranchId, {
    message: 'fromBranchId and toBranchId must differ',
    path: ['toBranchId'],
  });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const expiringQuerySchema = z.object({
  withinDays: z.coerce.number().int().positive().max(365).optional().default(30),
});
export type ExpiringQuery = z.infer<typeof expiringQuerySchema>;
