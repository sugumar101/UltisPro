import { z } from 'zod';

export const inviteUserSchema = z.object({
  fullName: z.string().min(2).max(255),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  initialPassword: z.string().min(8).max(72),
  assignments: z
    .array(
      z.object({
        branchId: z.string().uuid(),
        roleId: z.string().uuid(),
      }),
    )
    .min(1, 'At least one branch/role assignment is required'),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const assignStoreRoleSchema = z.object({
  branchId: z.string().uuid(),
  roleId: z.string().uuid(),
});
export type AssignStoreRoleInput = z.infer<typeof assignStoreRoleSchema>;
