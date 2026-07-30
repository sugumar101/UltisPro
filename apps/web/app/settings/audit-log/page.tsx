'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { SettingsTabs } from '../../../components/layout/settings-tabs';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { listAuditLogs, type AuditLogEntry } from '../../../lib/audit-api';
import { ApiError } from '../../../lib/api-client';

export default function AuditLogPage() {
  const { ready, accessToken } = useRequireAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [entityTable, setEntityTable] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load(token: string) {
    try {
      const result = await listAuditLogs(token, { entityTable: entityTable || undefined });
      setEntries(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit log');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    load(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
      <SettingsTabs active="audit-log" />

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 flex gap-2">
        <Input
          placeholder="Filter by table (e.g. sales_invoices)"
          value={entityTable}
          onChange={(e) => setEntityTable(e.target.value)}
        />
        <Button variant="secondary" onClick={() => accessToken && load(accessToken)}>
          Filter
        </Button>
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Action</th>
                <th className="p-3">Table</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Before</th>
                <th className="p-3">After</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-outline-variant last:border-0 align-top">
                  <td className="p-3 text-on-surface-variant">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="p-3 capitalize font-semibold">{e.action}</td>
                  <td className="p-3 font-mono-data">{e.entity_table}</td>
                  <td className="p-3 font-mono-data text-xs text-on-surface-variant">{e.entity_id.slice(0, 8)}…</td>
                  <td className="p-3 max-w-xs truncate text-xs text-on-surface-variant">
                    {e.before_data ? JSON.stringify(e.before_data) : '—'}
                  </td>
                  <td className="p-3 max-w-xs truncate text-xs text-on-surface-variant">
                    {e.after_data ? JSON.stringify(e.after_data) : '—'}
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                    No audit entries match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
