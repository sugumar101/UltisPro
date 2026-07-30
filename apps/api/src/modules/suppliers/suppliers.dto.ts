import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  gstin: z.string().max(15).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  paymentTermsDays: z.number().int().nonnegative().optional().default(0),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  gstin: z.string().max(15).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  paymentTermsDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const createSupplierPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(['cash', 'bank_transfer', 'cheque', 'upi', 'card']),
  purchaseOrderId: z.string().uuid().optional(),
});
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
