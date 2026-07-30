import { z } from 'zod';

export const createUnitSchema = z.object({
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
  baseUnitId: z.string().uuid().optional(),
  conversionFactor: z.number().positive().optional().default(1),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  symbol: z.string().min(1).max(10).optional(),
  baseUnitId: z.string().uuid().nullable().optional(),
  conversionFactor: z.number().positive().optional(),
});
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
