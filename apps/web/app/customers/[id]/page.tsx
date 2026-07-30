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
import {
  getCustomer,
  chargeCustomer,
  recordCustomerPayment,
  type Customer,
  type CustomerAddress,
} from '../../../lib/customers-api';
import { ApiError } from '../../../lib/api-client';

export default function CustomerDetailPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.CUSTOMERS_MANAGE);
  const params = useParams<{ id: string }>();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [chargeAmount, setChargeAmount] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(token: string, id: string) {
    try {
      const result = await getCustomer(token, id);
      setCustomer(result.customer);
      setAddresses(result.addresses);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customer');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    load(accessToken, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, params.id]);

  async function handleCharge() {
    if (!accessToken || !params.id || !chargeAmount) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await chargeCustomer(accessToken, params.id, Number(chargeAmount));
      setMessage('Charge applied to the customer account.');
      setChargeAmount('');
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to charge customer');
    } finally {
      setBusy(false);
    }
  }

  async function handlePayment() {
    if (!accessToken || !params.id || !paymentAmount) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await recordCustomerPayment(accessToken, params.id, Number(paymentAmount));
      setMessage('Payment recorded.');
      setPaymentAmount('');
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {!customer && !error ? <p className="text-on-surface-variant">Loading…</p> : null}

      {customer ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">
                {customer.full_name}
                {customer.is_walkin ? <span className="ml-2 text-sm text-on-surface-variant">(walk-in)</span> : null}
              </h1>
              <p className="text-on-surface-variant">
                {customer.phone ?? '—'} · {customer.email ?? '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-label-sm text-on-surface-variant">Outstanding / credit limit</p>
              <p className={`font-headline-md text-headline-md ${Number(customer.outstanding_balance) > 0 ? 'text-error' : 'text-on-surface'}`}>
                ₹{customer.outstanding_balance} / ₹{customer.credit_limit}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="font-title-sm text-title-sm">Addresses</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {addresses.map((a) => (
                    <li key={a.id} className="rounded border border-outline-variant p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{a.label ?? 'Address'}</span>
                        {a.is_default ? (
                          <span className="rounded-full bg-primary-container px-2 py-0.5 text-xs">Default</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-on-surface-variant">
                        {[a.line1, a.city, a.state, a.postal_code].filter(Boolean).join(', ') || 'No details on file'}
                      </p>
                    </li>
                  ))}
                  {addresses.length === 0 ? <p className="text-on-surface-variant">No addresses on file.</p> : null}
                </ul>
              </CardContent>
            </Card>

            {canManage ? (
              <Card>
                <CardHeader>
                  <h2 className="font-title-sm text-title-sm">Account actions</h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <FormField label="Charge amount">
                      <Input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} />
                    </FormField>
                    <Button className="mt-2 w-full" disabled={busy || !chargeAmount} onClick={handleCharge}>
                      Charge to account
                    </Button>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Rejected if it would exceed the credit limit.
                    </p>
                  </div>
                  <div>
                    <FormField label="Payment amount">
                      <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                    </FormField>
                    <Button
                      variant="secondary"
                      className="mt-2 w-full"
                      disabled={busy || !paymentAmount}
                      onClick={handlePayment}
                    >
                      Record payment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
}
