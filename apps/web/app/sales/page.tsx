'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent } from '../../components/ui/card';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { listSales, type SalesInvoice } from '../../lib/sales-api';
import { ApiError } from '../../lib/api-client';

const STATUS_STYLES: Record<SalesInvoice['status'], string> = {
  completed: 'bg-green-100 text-green-700',
  partially_returned: 'bg-yellow-100 text-yellow-700',
  returned: 'bg-red-100 text-red-700',
  void: 'bg-surface-container text-on-surface-variant',
};

export default function SalesPage() {
  const { ready, accessToken } = useRequireAuth();
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !accessToken) return;
    listSales(accessToken)
      .then((result) => setInvoices(result.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load invoices'));
  }, [ready, accessToken]);

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Sales</h1>
      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-left text-body-md">
            <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <tr>
                <th className="p-4">Invoice</th>
                <th className="p-4">Date</th>
                <th className="p-4">Status</th>
                <th className="p-4">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
                  <td className="p-4">
                    <Link href={`/sales/${inv.id}`} className="font-mono-data font-semibold text-primary hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="p-4 text-on-surface-variant">{new Date(inv.invoice_date).toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[inv.status]}`}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 font-semibold">₹{inv.grand_total}</td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-on-surface-variant">
                    No sales yet — ring up your first sale from the POS screen.
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
