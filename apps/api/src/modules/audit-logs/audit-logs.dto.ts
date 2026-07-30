import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  entityTable: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
