'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PERMISSIONS } from '@ultispro/shared-types';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { hasPermission } from '../../lib/stores/auth-store';
import { listPurchaseOrders, type PurchaseOrder } from '../../lib/purchasing-api';
import { ApiError } from '../../lib/api-client';

const STATUS_STYLES: Record<PurchaseOrder['status'], string> = {
  draft: 'bg-surface-container text-on-surface-variant',
  approved: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-yellow-100 text-yellow-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PurchaseOrdersPage() {
  const { ready, accessToken, assignments } = useRequireAuth();
  const canManage = hasPermission(assignments, PERMISSIONS.PURCHASE_ORDERS_MANAGE);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !accessToken) return;
    listPurchaseOrders(accessToken)
      .then(setOrders)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load purchase orders'));
  }, [ready, accessToken]);

  if (!ready) return null;

  return (
    <DashboardShell>
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Purchase Orders</h1>
        {canManage ? (
          <Link href="/purchase-orders/new">
            <Button>New purchase order</Button>
          </Link>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-left text-body-md">
            <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <tr>
                <th className="p-4">PO number</th>
                <th className="p-4">Order date</th>
                <th className="p-4">Status</th>
                <th className="p-4">Grand total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                  <td className="p-4">
                    <Link href={`/purchase-orders/${o.id}`} className="font-mono-data font-semibold text-primary hover:underline">
                      {o.po_number}
                    </Link>
                  </td>
                  <td className="p-4 text-on-surface-variant">{new Date(o.order_date).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[o.status]}`}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 font-semibold">₹{o.grand_total}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                    No purchase orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
