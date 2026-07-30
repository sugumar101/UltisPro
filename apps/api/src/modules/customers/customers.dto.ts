import { z } from 'zod';

export const createCustomerSchema = z.object({
  fullName: z.string().min(1).max(255),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(255).optional(),
  gstin: z.string().max(15).optional(),
  creditLimit: z.number().nonnegative().optional().default(0),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  creditLimit: z.number().nonnegative().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  line1: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  isDefault: z.boolean().optional().default(false),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const chargeCustomerSchema = z.object({
  amount: z.number().positive(),
  referenceNote: z.string().max(255).optional(),
});
export type ChargeCustomerInput = z.infer<typeof chargeCustomerSchema>;

export const payCustomerSchema = z.object({
  amount: z.number().positive(),
});
export type PayCustomerInput = z.infer<typeof payCustomerSchema>;
