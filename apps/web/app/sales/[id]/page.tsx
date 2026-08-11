'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
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
import { openAppWindow } from '../../../lib/app-url';

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
  // Presence of an item id here = selected for return; its value is the
  // quantity chosen for that line (defaults to the full remaining quantity).
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

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

  const returnableItems = items.filter((i) => Number(i.remainingQuantity) > 0);
  const selectedIds = Object.keys(returnQty);
  const allReturnableSelected = returnableItems.length > 0 && selectedIds.length === returnableItems.length;

  function toggleItem(item: ReceiptItem) {
    setReturnQty((prev) => {
      const next = { ...prev };
      if (item.id in next) {
        delete next[item.id];
      } else {
        next[item.id] = Number(item.remainingQuantity);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setReturnQty((prev) => {
      if (Object.keys(prev).length === returnableItems.length && returnableItems.length > 0) return {};
      const next: Record<string, number> = {};
      for (const item of returnableItems) next[item.id] = Number(item.remainingQuantity);
      return next;
    });
  }

  function updateQty(item: ReceiptItem, raw: number) {
    const max = Number(item.remainingQuantity);
    const value = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), max);
    setReturnQty((prev) => ({ ...prev, [item.id]: value }));
  }

  async function handleReturnSelected() {
    if (!accessToken || !params.id || selectedIds.length === 0) return;

    const lines = selectedIds.map((id) => ({ item: items.find((i) => i.id === id)!, qty: returnQty[id] }));
    const invalid = lines.find(({ item, qty }) => qty <= 0 || qty > Number(item.remainingQuantity));
    if (invalid) {
      setError(`Return quantity for ${invalid.item.productName} must be greater than 0 and at most ${invalid.item.remainingQuantity}`);
      return;
    }

    const totalRefund = lines.reduce((sum, { item, qty }) => sum + (Number(item.lineTotal) / Number(item.quantity)) * qty, 0);
    const confirmed = window.confirm(
      `Return ${lines.length} item${lines.length === 1 ? '' : 's'} for a total refund of ₹${totalRefund.toFixed(2)}? This restores stock and updates the customer's balance.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createSalesReturn(accessToken, params.id, {
        reason: reason || undefined,
        items: lines.map(({ item, qty }) => ({
          salesInvoiceItemId: item.id,
          quantity: qty,
          refundAmount: Math.round((Number(item.lineTotal) / Number(item.quantity)) * qty * 100) / 100,
        })),
      });
      setMessage(`Return recorded (credit note ${result.header.credit_note_number}); stock and customer balance updated.`);
      setReturnQty({});
      setReason('');
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create return');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const canReturnStatus = canReturn && invoice?.status !== 'returned' && invoice?.status !== 'void';
  const showReturnUI = canReturnStatus && returnableItems.length > 0;

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
            <Button onClick={() => openAppWindow(`/sales/${invoice.id}/print`, 'width=420,height=700')}>
              Print receipt
            </Button>
            <Button
              variant="secondary"
              onClick={() => openAppWindow(`/sales/${invoice.id}/print?format=a4`)}
            >
              A4 tax invoice
            </Button>
          </div>

          {showReturnUI ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <label className="text-label-sm text-on-surface-variant">Reason (optional)</label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. damaged, wrong size"
                />
              </div>
              <Button variant="secondary" onClick={toggleSelectAll}>
                {allReturnableSelected ? 'Clear selection' : 'Select all returnable'}
              </Button>
              <Button variant="secondary" disabled={busy || selectedIds.length === 0} onClick={handleReturnSelected}>
                Return selected ({selectedIds.length})
              </Button>
            </div>
          ) : null}

          <Card className="mt-6">
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Items</h2>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-body-md">
                <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <tr>
                    {showReturnUI ? (
                      <th className="w-10 p-4">
                        <input
                          type="checkbox"
                          aria-label="Select all returnable items"
                          checked={allReturnableSelected}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    ) : null}
                    <th className="p-4">Item</th>
                    <th className="p-4">HSN</th>
                    <th className="p-4">Qty</th>
                    <th className="p-4">Unit price</th>
                    <th className="p-4">Discount</th>
                    <th className="p-4">Tax</th>
                    <th className="p-4">Line total</th>
                    {canReturnStatus ? <th className="p-4">Return qty</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const remaining = Number(i.remainingQuantity);
                    const returned = Number(i.returnedQuantity);
                    const selected = i.id in returnQty;
                    return (
                      <tr
                        key={i.id}
                        className={`border-b border-outline-variant last:border-0 ${selected ? 'bg-primary-container/40' : ''}`}
                      >
                        {showReturnUI ? (
                          <td className="p-4">
                            {remaining > 0 ? (
                              <input
                                type="checkbox"
                                aria-label={`Select ${i.productName} for return`}
                                checked={selected}
                                onChange={() => toggleItem(i)}
                              />
                            ) : null}
                          </td>
                        ) : null}
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
                        {canReturnStatus ? (
                          <td className="p-4">
                            {remaining <= 0 ? (
                              <span className="text-sm text-on-surface-variant">Fully returned</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {selected ? (
                                  <Input
                                    type="number"
                                    step="any"
                                    min="0.01"
                                    max={remaining}
                                    value={returnQty[i.id]}
                                    onChange={(e) => updateQty(i, Number(e.target.value))}
                                    className="w-24"
                                  />
                                ) : null}
                                {returned > 0 ? (
                                  <span className="text-xs text-on-surface-variant">{i.returnedQuantity} returned</span>
                                ) : null}
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
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
