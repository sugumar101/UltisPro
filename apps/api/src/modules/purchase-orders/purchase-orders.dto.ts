import { z } from 'zod';

export const purchaseOrderItemInputSchema = z.object({
  productVariantId: z.string().uuid(),
  quantityOrdered: z.number().positive(),
  unitCost: z.number().nonnegative(),
  taxId: z.string().uuid().optional(),
});
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;

export const createPurchaseOrderSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  expectedDate: z.string().optional(),
  items: z.array(purchaseOrderItemInputSchema).min(1, 'At least one line item is required'),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const receiveItemInputSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  quantityReceived: z.number().positive(),
});
export type ReceiveItemInput = z.infer<typeof receiveItemInputSchema>;

export const receivePurchaseOrderSchema = z.object({
  items: z.array(receiveItemInputSchema).min(1, 'At least one line item is required'),
});
export type ReceivePurchaseOrderInput = z.infer<typeof receivePurchaseOrderSchema>;

export const createPurchaseReturnSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative(),
        batchId: z.string().uuid().optional(),
      }),
    )
    .min(1, 'At least one line item is required'),
});
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
