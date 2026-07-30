import { z } from 'zod';

export const createStoreSchema = z.object({
  name: z.string().min(2).max(255),
  gstin: z.string().max(15).optional(),
  invoicePrefix: z.string().max(10).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = createStoreSchema.partial();
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
