import { db } from '../../shared/db';
import type { ListAuditLogsQuery } from './audit-logs.dto';

export const auditLogsRepository = {
  async list(organizationId: string, query: ListAuditLogsQuery) {
    let listQuery = db.selectFrom('audit_logs').selectAll().where('organization_id', '=', organizationId);
    let countQuery = db
      .selectFrom('audit_logs')
      .select(({ fn }) => [fn.countAll<string>().as('count')])
      .where('organization_id', '=', organizationId);

    if (query.entityTable) {
      listQuery = listQuery.where('entity_table', '=', query.entityTable);
      countQuery = countQuery.where('entity_table', '=', query.entityTable);
    }
    if (query.entityId) {
      listQuery = listQuery.where('entity_id', '=', query.entityId);
      countQuery = countQuery.where('entity_id', '=', query.entityId);
    }
    if (query.actorUserId) {
      listQuery = listQuery.where('actor_user_id', '=', query.actorUserId);
      countQuery = countQuery.where('actor_user_id', '=', query.actorUserId);
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderBy('created_at', 'desc')
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { rows, total: Number(countRow?.count ?? 0) };
  },
};
