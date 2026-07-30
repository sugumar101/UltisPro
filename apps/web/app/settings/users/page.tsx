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
import {
  listUsers,
  inviteUser,
  listBranches,
  listRoles,
  type OrgUser,
  type Branch,
  type Role,
} from '../../../lib/settings-api';
import { ApiError } from '../../../lib/api-client';

export default function UsersSettingsPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.USERS_MANAGE);

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ fullName: '', email: '', initialPassword: '', branchId: '', roleId: '' });
  const [inviting, setInviting] = useState(false);

  async function loadAll(token: string) {
    const [usersData, branchesData, rolesData] = await Promise.all([
      listUsers(token),
      listBranches(token),
      listRoles(token),
    ]);
    setUsers(usersData);
    setBranches(branchesData);
    setRoles(rolesData);
  }

  useEffect(() => {
    if (!ready || !accessToken || !canManage) return;
    loadAll(accessToken).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, canManage]);

  async function handleInvite() {
    if (!accessToken) return;
    const { fullName, email, initialPassword, branchId, roleId } = form;
    if (!fullName || !email || !initialPassword || !branchId || !roleId) return;

    setInviting(true);
    setError(null);
    try {
      await inviteUser(accessToken, { fullName, email, initialPassword, assignments: [{ branchId, roleId }] });
      setForm({ fullName: '', email: '', initialPassword: '', branchId: '', roleId: '' });
      await loadAll(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  }

  if (!ready) return null;

  if (!canManage) {
    return (
      <DashboardShell>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
        <SettingsTabs active="users" />
        <p className="mt-6 text-on-surface-variant">You don&apos;t have permission to manage users.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
      <SettingsTabs active="users" />

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Team</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between rounded border border-outline-variant p-3">
                  <div>
                    <p className="font-semibold">{u.full_name}</p>
                    <p className="text-sm text-on-surface-variant">{u.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
              {users.length === 0 ? <p className="text-on-surface-variant">No team members yet.</p> : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Invite a team member</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <FormField label="Full name">
                <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </FormField>
              <FormField label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </FormField>
              <FormField label="Initial password">
                <Input
                  type="password"
                  value={form.initialPassword}
                  onChange={(e) => setForm((f) => ({ ...f, initialPassword: e.target.value }))}
                />
              </FormField>
              <FormField label="Branch">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                >
                  <option value="">Select a branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Role">
                <select
                  className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                  value={form.roleId}
                  onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                >
                  <option value="">Select a role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <p className="text-xs text-on-surface-variant">
                Email delivery isn&apos;t wired up yet — share the password with them directly for now.
              </p>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
