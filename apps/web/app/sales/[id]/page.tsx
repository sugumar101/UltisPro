'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { hasPermission } from '../../../lib/stores/auth-store';
import {
  getReceipt,
  createSalesReturn,
  type SalesInvoice,
  type ReceiptItem,
  type SalesPayment,
} from '../../../lib/sales-api';
import { ApiError } from '../../../lib/api-client';

export default function SalesInvoiceDetailPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canReturn = hasPermission(assignments, PERMISSIONS.SALES_RETURN);
  const params = useParams<{ id: string }>();

  const [invoice, setInvoice] = useState<SalesInvoice | null>(null);
  // Reads the receipt endpoint rather than plain GET /sales/:id so line
  // items arrive already joined to product name/SKU — the raw invoice
  // endpoint only carries product_variant_id, which is meaningless on screen.
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [payments, setPayments] = useState<SalesPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(token: string, id: string) {
    try {
      const result = await getReceipt(token, id);
      setInvoice(result.invoice);
      setItems(result.items);
      setPayments(result.payments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load invoice');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    load(accessToken, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, params.id]);

  async function handleReturnAll() {
    if (!accessToken || !params.id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createSalesReturn(accessToken, params.id, {
        reason: 'Full return initiated from invoice screen',
        items: items.map((i) => ({
          salesInvoiceItemId: i.id,
          quantity: Number(i.quantity),
          refundAmount: Number(i.lineTotal),
        })),
      });
      setMessage(`Return recorded (credit note ${result.header.credit_note_number}); stock and customer balance updated.`);
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create return');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {!invoice && !error ? <p className="text-on-surface-variant">Loading…</p> : null}

      {invoice ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-mono-data">{invoice.invoice_number}</h1>
              <p className="text-on-surface-variant">{new Date(invoice.invoice_date).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-surface-container px-3 py-1 text-sm font-semibold capitalize">
                {invoice.status.replace('_', ' ')}
              </span>
              <p className="mt-1 font-headline-md text-headline-md">₹{invoice.grand_total}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => window.open(`/sales/${invoice.id}/print`, '_blank', 'width=420,height=700')}>
              Print receipt
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.open(`/sales/${invoice.id}/print?format=a4`, '_blank')}
            >
              A4 tax invoice
            </Button>
            {canReturn && invoice.status !== 'returned' && invoice.status !== 'void' ? (
              <Button variant="secondary" disabled={busy} onClick={handleReturnAll}>
                Return all items
              </Button>
            ) : null}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Items</h2>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-body-md">
                <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <tr>
                    <th className="p-4">Item</th>
                    <th className="p-4">HSN</th>
                    <th className="p-4">Qty</th>
                    <th className="p-4">Unit price</th>
                    <th className="p-4">Discount</th>
                    <th className="p-4">Tax</th>
                    <th className="p-4">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b border-outline-variant last:border-0">
                      <td className="p-4">
                        <p className="font-semibold">{i.productName}</p>
                        <p className="font-mono-data text-xs text-on-surface-variant">
                          {i.sku}
                          {i.attributes?.size ? ` · Size ${i.attributes.size}` : ''}
                        </p>
                      </td>
                      <td className="p-4 font-mono-data text-on-surface-variant">{i.hsnCode ?? '—'}</td>
                      <td className="p-4">{Number(i.quantity)}</td>
                      <td className="p-4">₹{i.unitPrice}</td>
                      <td className="p-4">₹{i.discountAmount}</td>
                      <td className="p-4">₹{i.taxAmount}</td>
                      <td className="p-4 font-semibold">₹{i.lineTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Payments</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between rounded border border-outline-variant p-3">
                    <span className="capitalize text-on-surface-variant">{p.payment_mode.replace('_', ' ')}</span>
                    <span className="font-semibold">₹{p.amount}</span>
                  </li>
                ))}
                {payments.length === 0 ? (
                  <p className="text-on-surface-variant">
                    No payments recorded — the full amount was charged to the customer&apos;s account.
                  </p>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </DashboardShell>
  );
}
