import { z } from 'zod';

export const registerOrganizationSchema = z.object({
  organization: z.object({
    legalName: z.string().min(2).max(255),
    displayName: z.string().min(2).max(255),
    businessType: z
      .enum(['general', 'clothing', 'supermarket', 'electronics', 'mobile', 'grocery', 'pharmacy', 'hardware'])
      .default('general'),
  }),
  owner: z.object({
    fullName: z.string().min(2).max(255),
    email: z.string().email(),
    password: z.string().min(8).max(72),
  }),
  storeName: z.string().min(2).max(255).default('Main Store'),
  branchName: z.string().min(2).max(255).default('Main Branch'),
  branchCode: z.string().min(1).max(20).default('MAIN'),
});
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
