import { z } from 'zod';

export const posSearchQuerySchema = z.object({
  branchId: z.string().uuid(),
  q: z.string().min(1),
});
export type PosSearchQuery = z.infer<typeof posSearchQuerySchema>;

export const holdBillSchema = z.object({
  branchId: z.string().uuid(),
  registerCode: z.string().max(20),
  customerId: z.string().uuid().optional(),
  cartSnapshot: z.array(
    z.object({
      productVariantId: z.string().uuid(),
      sku: z.string(),
      productName: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      discountAmount: z.number().nonnegative().optional().default(0),
      taxId: z.string().uuid().optional(),
    }),
  ),
});
export type HoldBillInput = z.infer<typeof holdBillSchema>;
