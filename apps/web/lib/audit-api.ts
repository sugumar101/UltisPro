import { apiFetch, apiFetchEnvelope } from './api-client';

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_table: string;
  entity_id: string;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
}

export interface ListAuditLogsResult {
  data: AuditLogEntry[];
  meta: { page: number; pageSize: number; total: number };
}

export async function listAuditLogs(
  token: string,
  params: { entityTable?: string; page?: number } = {},
): Promise<ListAuditLogsResult> {
  const search = new URLSearchParams();
  if (params.entityTable) search.set('entityTable', params.entityTable);
  if (params.page) search.set('page', String(params.page));

  const envelope = await apiFetchEnvelope<AuditLogEntry[]>(`/api/v1/audit-logs?${search.toString()}`, {}, token);
  return {
    data: envelope.data,
    meta: {
      page: envelope.meta?.page ?? 1,
      pageSize: envelope.meta?.pageSize ?? 50,
      total: envelope.meta?.total ?? envelope.data.length,
    },
  };
}
