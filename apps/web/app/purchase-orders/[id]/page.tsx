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
  getPurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseReturn,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '../../../lib/purchasing-api';
import { ApiError } from '../../../lib/api-client';

export default function PurchaseOrderDetailPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canApprove = hasPermission(assignments, PERMISSIONS.PURCHASE_ORDERS_APPROVE);
  const canManage = hasPermission(assignments, PERMISSIONS.PURCHASE_ORDERS_MANAGE);
  const params = useParams<{ id: string }>();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(token: string, id: string) {
    try {
      const result = await getPurchaseOrder(token, id);
      setOrder(result.order);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load purchase order');
    }
  }

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    load(accessToken, params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken, params.id]);

  async function handleApprove() {
    if (!accessToken || !params.id) return;
    setBusy(true);
    setError(null);
    try {
      await approvePurchaseOrder(accessToken, params.id);
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to approve');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!accessToken || !params.id) return;
    setBusy(true);
    setError(null);
    try {
      await cancelPurchaseOrder(accessToken, params.id);
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive() {
    if (!accessToken || !params.id) return;
    const receiveItems = Object.entries(receiveQty)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([purchaseOrderItemId, qty]) => ({ purchaseOrderItemId, quantityReceived: Number(qty) }));

    if (receiveItems.length === 0) {
      setError('Enter a quantity to receive for at least one line.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await receivePurchaseOrder(accessToken, params.id, receiveItems);
      setMessage('Stock received and added to inventory.');
      setReceiveQty({});
      await load(accessToken, params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to receive');
    } finally {
      setBusy(false);
    }
  }

  async function handleReturnFullyReceived() {
    if (!accessToken || !params.id) return;
    const returnItems = items.filter((i) => Number(i.quantity_received) > 0);
    if (returnItems.length === 0) {
      setError('Nothing has been received on this PO yet.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createPurchaseReturn(accessToken, {
        purchaseOrderId: params.id,
        reason: 'Return initiated from purchase order screen',
        items: returnItems.map((i) => ({
          productVariantId: i.product_variant_id,
          quantity: Number(i.quantity_received),
          unitCost: Number(i.unit_cost),
        })),
      });
      setMessage('Purchase return recorded; stock and supplier balance updated.');
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
      {!order && !error ? <p className="text-on-surface-variant">Loading…</p> : null}

      {order ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">{order.po_number}</h1>
              <p className="text-on-surface-variant">
                Ordered {new Date(order.order_date).toLocaleDateString()}
                {order.expected_date ? ` · Expected ${new Date(order.expected_date).toLocaleDateString()}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-surface-container px-3 py-1 text-sm font-semibold capitalize">
                {order.status.replace('_', ' ')}
              </span>
              <p className="font-headline-md text-headline-md">₹{order.grand_total}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {order.status === 'draft' && canApprove ? (
              <Button disabled={busy} onClick={handleApprove}>
                Approve
              </Button>
            ) : null}
            {(order.status === 'draft' || order.status === 'approved') && canManage ? (
              <Button variant="destructive" disabled={busy} onClick={handleCancel}>
                Cancel PO
              </Button>
            ) : null}
            {(order.status === 'received' || order.status === 'partially_received') && canManage ? (
              <Button variant="secondary" disabled={busy} onClick={handleReturnFullyReceived}>
                Return all received stock
              </Button>
            ) : null}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Line items</h2>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-body-md">
                <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <tr>
                    <th className="p-4">Variant ID</th>
                    <th className="p-4">Ordered</th>
                    <th className="p-4">Received</th>
                    <th className="p-4">Unit cost</th>
                    {canManage && (order.status === 'approved' || order.status === 'partially_received') ? (
                      <th className="p-4">Receive now</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const outstanding = Number(item.quantity_ordered) - Number(item.quantity_received);
                    return (
                      <tr key={item.id} className="border-b border-outline-variant last:border-0">
                        <td className="p-4 font-mono-data text-on-surface-variant">{item.product_variant_id}</td>
                        <td className="p-4">{item.quantity_ordered}</td>
                        <td className="p-4">{item.quantity_received}</td>
                        <td className="p-4">₹{item.unit_cost}</td>
                        {canManage && (order.status === 'approved' || order.status === 'partially_received') ? (
                          <td className="p-4">
                            {outstanding > 0 ? (
                              <Input
                                type="number"
                                placeholder={`up to ${outstanding}`}
                                value={receiveQty[item.id] ?? ''}
                                onChange={(e) => setReceiveQty((q) => ({ ...q, [item.id]: e.target.value }))}
                                className="w-28"
                              />
                            ) : (
                              <span className="text-on-surface-variant">Complete</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {canManage && (order.status === 'approved' || order.status === 'partially_received') ? (
                <div className="p-4">
                  <Button disabled={busy} onClick={handleReceive}>
                    Receive stock
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </DashboardShell>
  );
}
