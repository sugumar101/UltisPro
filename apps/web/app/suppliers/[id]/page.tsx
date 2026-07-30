'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { hasPermission } from '../../../lib/stores/auth-store';
import { getSupplier, recordSupplierPayment, type Supplier, type SupplierPayment } from '../../../lib/purchasing-api';
import { ApiError } from '../../../lib/api-client';

const PAYMENT_MODES = ['cash', 'bank_transfer', 'cheque', 'upi', 'card'] as const;

export default function SupplierDetailPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.SUPPLIERS_MANAGE);
  const params = useParams<{ id: string }>();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>('bank_transfer');
  const [saving, setSaving] = useState(false);

  async function load(token: string, id: string) {
    try {
      const result = await getSupplier(token, id);
      setSupplier(result.supplier);
      setPayments(result.payments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load supplier');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    load(accessToken, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, params.id]);

  async function handleRecordPayment() {
    if (!accessToken || !params.id || !amount) return;
    setSaving(true);
    setError(null);
    try {
      await recordSupplierPayment(accessToken, params.id, { amount: Number(amount), paymentMode: mode });
      setAmount('');
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {!supplier && !error ? <p className="text-on-surface-variant">Loading…</p> : null}

      {supplier ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">{supplier.name}</h1>
              <p className="text-on-surface-variant">
                {supplier.phone ?? '—'} · {supplier.email ?? '—'} · {supplier.payment_terms_days} day terms
              </p>
            </div>
            <div className="text-right">
              <p className="text-label-sm text-on-surface-variant">Outstanding balance</p>
              <p className={`font-headline-md text-headline-md ${Number(supplier.outstanding_balance) > 0 ? 'text-error' : 'text-on-surface'}`}>
                ₹{supplier.outstanding_balance}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="font-title-sm text-title-sm">Payment history</h2>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-left text-body-md">
                  <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                    <tr>
                      <th className="p-4">Date</th>
                      <th className="p-4">Mode</th>
                      <th className="p-4">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-outline-variant last:border-0">
                        <td className="p-4">{new Date(p.paid_at).toLocaleDateString()}</td>
                        <td className="p-4 capitalize text-on-surface-variant">{p.payment_mode.replace('_', ' ')}</td>
                        <td className="p-4 font-semibold">₹{p.amount}</td>
                      </tr>
                    ))}
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-on-surface-variant">
                          No payments recorded yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {canManage ? (
              <Card>
                <CardHeader>
                  <h2 className="font-title-sm text-title-sm">Record a payment</h2>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FormField label="Amount">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </FormField>
                  <FormField label="Payment mode">
                    <select
                      className="w-full rounded border border-outline-variant px-3 py-2 text-body-md"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as typeof mode)}
                    >
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <Button className="w-full" disabled={saving || !amount} onClick={handleRecordPayment}>
                    {saving ? 'Recording…' : 'Record payment'}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
}
