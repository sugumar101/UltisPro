import { db } from './db';
import { logger } from './logger';

export interface RecordAuditInput {
  organizationId: string;
  actorUserId: string | null;
  action: 'create' | 'update' | 'delete' | 'approve' | 'login' | 'login_failed' | 'logout';
  entityTable: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

/**
 * The one place every mutating service writes to `audit_logs` from.
 * Brought forward into Phase 1 (not deferred) per docs/04-module-breakdown.md
 * M13 — audit logging is a non-negotiable, cross-cutting concern from M1 on.
 *
 * Deliberately fire-and-forget-safe: a failure to write an audit row must
 * never fail the business operation it's describing, so errors are logged,
 * not thrown.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await db
      .insertInto('audit_logs')
      .values({
        organization_id: input.organizationId,
        actor_user_id: input.actorUserId,
        action: input.action,
        entity_table: input.entityTable,
        entity_id: input.entityId,
        before_data: input.before ? JSON.stringify(input.before) : null,
        after_data: input.after ? JSON.stringify(input.after) : null,
        ip_address: input.ipAddress ?? null,
      })
      .execute();
  } catch (err) {
    logger.error({ err, input }, 'Failed to write audit log entry');
  }
}
