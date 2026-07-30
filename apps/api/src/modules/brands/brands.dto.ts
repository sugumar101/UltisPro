import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().min(1).max(150),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = createBrandSchema.partial();
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
