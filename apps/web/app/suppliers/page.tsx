'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { hasPermission } from '../../lib/stores/auth-store';
import { listSuppliers, createSupplier, type Supplier } from '../../lib/purchasing-api';
import { ApiError } from '../../lib/api-client';

export default function SuppliersPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.SUPPLIERS_MANAGE);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', gstin: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  async function load(token: string) {
    try {
      setSuppliers(await listSuppliers(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load suppliers');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    load(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  async function handleCreate() {
    if (!accessToken || !form.name) return;
    setSaving(true);
    setError(null);
    try {
      await createSupplier(accessToken, {
        name: form.name,
        gstin: form.gstin || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
      });
      setForm({ name: '', gstin: '', phone: '', email: '' });
      await load(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create supplier');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Suppliers</h1>
      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <table className="w-full text-left text-body-md">
              <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">Payment terms</th>
                  <th className="p-4">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                    <td className="p-4">
                      <Link href={`/suppliers/${s.id}`} className="font-semibold text-primary hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="p-4 text-on-surface-variant">{s.phone ?? s.email ?? '—'}</td>
                    <td className="p-4">{s.payment_terms_days} days</td>
                    <td className={`p-4 font-semibold ${Number(s.outstanding_balance) > 0 ? 'text-error' : ''}`}>
                      ₹{s.outstanding_balance}
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                      No suppliers yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-title-sm text-title-sm">New supplier</h2>
              <FormField label="Name">
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </FormField>
              <FormField label="GSTIN (optional)">
                <Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} />
              </FormField>
              <FormField label="Phone (optional)">
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </FormField>
              <FormField label="Email (optional)">
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </FormField>
              <Button className="w-full" disabled={saving || !form.name} onClick={handleCreate}>
                {saving ? 'Adding…' : 'Add supplier'}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardShell>
  );
}
