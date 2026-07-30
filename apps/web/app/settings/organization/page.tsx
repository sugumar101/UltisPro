'use client';

import { useEffect, useState } from 'react';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { SettingsTabs } from '../../../components/layout/settings-tabs';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { hasPermission } from '../../../lib/stores/auth-store';
import { getOrganization, updateOrganization, type Organization } from '../../../lib/settings-api';
import { ApiError } from '../../../lib/api-client';

export default function OrganizationSettingsPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = hasPermission(assignments, PERMISSIONS.ORG_MANAGE);

  useEffect(() => {
    if (!ready || !accessToken) return;
    getOrganization(accessToken)
      .then((data) => {
        setOrg(data);
        setLegalName(data.legal_name);
        setDisplayName(data.display_name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load organization'));
  }, [ready, accessToken]);

  async function handleSave() {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateOrganization(accessToken, { legalName, displayName });
      setOrg(updated);
      setMessage('Saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
      <SettingsTabs active="organization" />

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <h2 className="font-title-sm text-title-sm">Organization</h2>
        </CardHeader>
        <CardContent>
          {!org ? (
            <p className="text-on-surface-variant">Loading…</p>
          ) : (
            <div className="space-y-4">
              <FormField label="Legal name">
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canManage} />
              </FormField>
              <FormField label="Display name">
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={!canManage} />
              </FormField>
              <FormField label="Business type">
                <Input value={org.business_type} disabled />
              </FormField>
              {message ? <p className="text-sm text-on-surface-variant">{message}</p> : null}
              {error ? <p className="text-sm text-error">{error}</p> : null}
              {canManage ? (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  You don&apos;t have permission to edit organization settings.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
