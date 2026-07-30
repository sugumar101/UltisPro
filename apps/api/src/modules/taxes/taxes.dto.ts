import { z } from 'zod';

const RATE_TOLERANCE = 0.001;

function splitIsValid(data: {
  ratePercent: number;
  cgstPercent: number;
  sgstPercent: number;
  igstPercent: number;
}): boolean {
  const intraState = Math.abs(data.ratePercent - (data.cgstPercent + data.sgstPercent)) < RATE_TOLERANCE;
  const interState = Math.abs(data.ratePercent - data.igstPercent) < RATE_TOLERANCE;
  return intraState || interState;
}

const baseTaxShape = {
  name: z.string().min(1).max(50),
  ratePercent: z.number().min(0).max(100),
  cgstPercent: z.number().min(0).max(100).default(0),
  sgstPercent: z.number().min(0).max(100).default(0),
  igstPercent: z.number().min(0).max(100).default(0),
};

export const createTaxSchema = z.object(baseTaxShape).refine(splitIsValid, {
  message:
    'rate_percent must equal either cgst_percent + sgst_percent (intra-state) or igst_percent (inter-state)',
  path: ['ratePercent'],
});
export type CreateTaxInput = z.infer<typeof createTaxSchema>;

// Partial on update — the service re-validates the split against the merged
// before/after values rather than the raw partial payload (see taxes.service.ts).
export const updateTaxSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  ratePercent: z.number().min(0).max(100).optional(),
  cgstPercent: z.number().min(0).max(100).optional(),
  sgstPercent: z.number().min(0).max(100).optional(),
  igstPercent: z.number().min(0).max(100).optional(),
});
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;

export { splitIsValid };
