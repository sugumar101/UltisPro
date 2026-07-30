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
import { listCustomers, createCustomer, type Customer } from '../../lib/customers-api';
import { ApiError } from '../../lib/api-client';

export default function CustomersPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.CUSTOMERS_MANAGE);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ fullName: '', phone: '', email: '', creditLimit: '' });
  const [saving, setSaving] = useState(false);

  async function load(token: string) {
    try {
      const result = await listCustomers(token, { q: q || undefined, page });
      setCustomers(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customers');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    load(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, page]);

  async function handleCreate() {
    if (!accessToken || !form.fullName) return;
    setSaving(true);
    setError(null);
    try {
      await createCustomer(accessToken, {
        fullName: form.fullName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      });
      setForm({ fullName: '', phone: '', email: '', creditLimit: '' });
      await load(accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Customers</h1>

      <div className="mt-4 flex gap-2">
        <Input
          placeholder="Search by name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              if (accessToken) load(accessToken);
            }
          }}
        />
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            if (accessToken) load(accessToken);
          }}
        >
          Search
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <table className="w-full text-left text-body-md">
              <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">Credit limit</th>
                  <th className="p-4">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                    <td className="p-4">
                      <Link href={`/customers/${c.id}`} className="font-semibold text-primary hover:underline">
                        {c.full_name}
                      </Link>
                      {c.is_walkin ? <span className="ml-2 text-xs text-on-surface-variant">(walk-in)</span> : null}
                    </td>
                    <td className="p-4 text-on-surface-variant">{c.phone ?? c.email ?? '—'}</td>
                    <td className="p-4">₹{c.credit_limit}</td>
                    <td className={`p-4 font-semibold ${Number(c.outstanding_balance) > 0 ? 'text-error' : ''}`}>
                      ₹{c.outstanding_balance}
                    </td>
                  </tr>
                ))}
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                      No customers yet.
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
              <h2 className="font-title-sm text-title-sm">New customer</h2>
              <FormField label="Full name">
                <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </FormField>
              <FormField label="Phone (optional)">
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </FormField>
              <FormField label="Email (optional)">
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </FormField>
              <FormField label="Credit limit (optional, default 0)">
                <Input
                  type="number"
                  value={form.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                />
              </FormField>
              <Button className="w-full" disabled={saving || !form.fullName} onClick={handleCreate}>
                {saving ? 'Adding…' : 'Add customer'}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-body-md text-on-surface-variant">
          <span>
            Page {page} of {totalPages} ({total} customers)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
