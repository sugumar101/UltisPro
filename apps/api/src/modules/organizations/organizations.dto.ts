import { z } from 'zod';

export const updateOrganizationSchema = z.object({
  legalName: z.string().min(2).max(255).optional(),
  displayName: z.string().min(2).max(255).optional(),
  businessType: z
    .enum(['general', 'clothing', 'supermarket', 'electronics', 'mobile', 'grocery', 'pharmacy', 'hardware'])
    .optional(),
  defaultCurrency: z.string().length(3).optional(),
  timezone: z.string().min(1).max(64).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
