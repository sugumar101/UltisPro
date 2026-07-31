import { z } from 'zod';

/**
 * Passwords people actually pick when a form only enforces a length. These
 * all clear "8 characters" and are in the first handful of guesses any
 * credential-stuffing list tries, so length alone is not a policy.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'welcome1',
  'welcome123',
  'letmein1',
  'abc12345',
  'football',
  'monkey123',
  'sunshine',
  'princess',
  'trustno1',
  'changeme',
  'secret123',
]);

/**
 * Deliberately favours *length* over character-class gymnastics, following
 * current NIST guidance: forcing a symbol mostly produces `Password1!`,
 * whereas a longer passphrase is both stronger and easier to remember.
 *
 * 72 bytes is bcrypt's hard input limit — anything beyond it is silently
 * ignored by the algorithm, so accepting longer would give a false sense of
 * security.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters — a short phrase works well')
  .max(72, 'Passwords are limited to 72 characters')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'That password is among the most commonly used — please pick something else',
  })
  .refine((value) => !/^(.)\1+$/.test(value), {
    message: 'A password cannot be a single repeated character',
  })
  .refine((value) => new Set(value).size >= 5, {
    message: 'Please use a more varied password',
  });

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
    password: passwordSchema,
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
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
