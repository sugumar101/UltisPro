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
import { listStores, createStore, listBranches, createBranch, type Store, type Branch } from '../../../lib/settings-api';
import { ApiError } from '../../../lib/api-client';

export default function StoresSettingsPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.SETTINGS_MANAGE);

  const [stores, setStores] = useState<Store[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);

  const [newBranch, setNewBranch] = useState({ storeId: '', name: '', code: '' });
  const [creatingBranch, setCreatingBranch] = useState(false);

  async function loadAll(token: string) {
    const [storesData, branchesData] = await Promise.all([listStores(token), listBranches(token)]);
    setStores(storesData);
    setBranches(branchesData);
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    loadAll(accessToken).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  async function handleCreateStore() {
    if (!accessToken || !newStoreName) return;
    setCreatingStore(true);
    setError(null);
    try {
      await createStore(accessToken, { name: newStoreName });
      setNewStoreName('');
      await loadAll(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create store');
    } finally {
      setCreatingStore(false);
    }
  }

  async function handleCreateBranch() {
    if (!accessToken || !newBranch.storeId || !newBranch.name || !newBranch.code) return;
    setCreatingBranch(true);
    setError(null);
    try {
      await createBranch(accessToken, newBranch.storeId, { name: newBranch.name, code: newBranch.code });
      setNewBranch({ storeId: '', name: '', code: '' });
      await loadAll(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create branch');
    } finally {
      setCreatingBranch(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Settings</h1>
      <SettingsTabs active="stores" />

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Stores</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {stores.map((store) => (
                <li
                  key={store.id}
                  className="flex items-center justify-between rounded border border-outline-variant p-3"
                >
                  <div>
                    <p className="font-semibold">{store.name}</p>
                    <p className="text-sm text-on-surface-variant">{store.gstin ?? 'No GSTIN on file'}</p>
                  </div>
                </li>
              ))}
              {stores.length === 0 ? <p className="text-on-surface-variant">No stores yet.</p> : null}
            </ul>

            {canManage ? (
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="New store name"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                />
                <Button onClick={handleCreateStore} disabled={creatingStore || !newStoreName}>
                  {creatingStore ? 'Adding…' : 'Add store'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Branches</h2>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {branches.map((branch) => (
                <li
                  key={branch.id}
                  className="flex items-center justify-between rounded border border-outline-variant p-3"
                >
                  <div>
                    <p className="font-semibold">{branch.name}</p>
                    <p className="font-mono-data text-sm text-on-surface-variant">{branch.code}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      branch.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {branch.is_active ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
              {branches.length === 0 ? <p className="text-on-surface-variant">No branches yet.</p> : null}
            </ul>

            {canManage && stores.length > 0 ? (
              <div className="mt-4 space-y-2">
                <FormField label="Store">
                  <select
                    className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                    value={newBranch.storeId}
                    onChange={(e) => setNewBranch((b) => ({ ...b, storeId: e.target.value }))}
                  >
                    <option value="">Select a store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="flex gap-2">
                  <Input
                    placeholder="Branch name"
                    value={newBranch.name}
                    onChange={(e) => setNewBranch((b) => ({ ...b, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Code"
                    value={newBranch.code}
                    onChange={(e) => setNewBranch((b) => ({ ...b, code: e.target.value }))}
                  />
                  <Button onClick={handleCreateBranch} disabled={creatingBranch}>
                    {creatingBranch ? 'Adding…' : 'Add'}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
