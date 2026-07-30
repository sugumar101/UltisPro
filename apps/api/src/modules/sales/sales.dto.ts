import { z } from 'zod';

export const saleItemInputSchema = z.object({
  productVariantId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().optional().default(0),
  taxId: z.string().uuid().optional(),
});
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const paymentInputSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['cash', 'card', 'upi', 'wallet', 'store_credit', 'gift_voucher']),
  referenceNo: z.string().max(100).optional(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const createSaleSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  registerCode: z.string().max(20).optional(),
  items: z.array(saleItemInputSchema).min(1, 'At least one line item is required'),
  payments: z.array(paymentInputSchema).optional().default([]),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const listSalesQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

export const returnItemInputSchema = z.object({
  salesInvoiceItemId: z.string().uuid(),
  quantity: z.number().positive(),
  refundAmount: z.number().nonnegative(),
});
export type ReturnItemInput = z.infer<typeof returnItemInputSchema>;

export const createSalesReturnSchema = z.object({
  reason: z.string().max(2000).optional(),
  items: z.array(returnItemInputSchema).min(1, 'At least one line item is required'),
});
export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;
