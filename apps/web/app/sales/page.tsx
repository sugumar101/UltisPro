'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { listSales, type SalesInvoice } from '../../lib/sales-api';
import { shareOnWhatsApp, buildReceiptMessage } from '../../lib/whatsapp';
import { getOrganization } from '../../lib/settings-api';
import { ApiError } from '../../lib/api-client';

const STATUS_STYLES: Record<SalesInvoice['status'], string> = {
  completed: 'bg-success-container text-on-success-container',
  partially_returned: 'bg-warning-container text-on-warning-container',
  returned: 'bg-error-container text-on-error-container',
  void: 'bg-surface-container text-on-surface-variant',
};

export default function SalesPage() {
  const { ready, accessToken } = useRequireAuth();
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(token: string, term?: string) {
    setLoading(true);
    try {
      const result = await listSales(token, { q: term || undefined });
      setInvoices(result.data);
      setTotal(result.meta.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !accessToken) return;
    load(accessToken);
    getOrganization(accessToken)
      .then((org) => setOrgName(org.display_name))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accessToken]);

  if (!ready) return null;

  return (
    <DashboardShell>
      <div>
        <h1 className="text-headline-lg text-on-surface">Sales</h1>
        <p className="mt-0.5 text-body-md text-on-surface-variant">
          {total} invoice{total === 1 ? '' : 's'}
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <Input
            className="pl-9"
            placeholder="Search by customer name, mobile number, or invoice number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && accessToken) load(accessToken, q);
            }}
          />
        </div>
        <Button variant="secondary" onClick={() => accessToken && load(accessToken, q)}>
          Search
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      <Card className="mt-6">
        <CardContent className="p-0">
          <table className="w-full text-left text-body-md">
            <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <tr>
                <th className="p-4">Invoice</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Date</th>
                <th className="p-4">Status</th>
                <th className="p-4">Total</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="row-hover border-b border-outline-variant last:border-0">
                  <td className="p-4">
                    <Link
                      href={`/sales/${inv.id}`}
                      className="font-mono-data font-semibold text-primary hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="p-4">
                    {/* Walk-in is a placeholder rather than a person, so it's
                        shown muted and without a phone line. */}
                    {inv.customerIsWalkin || !inv.customerName ? (
                      <span className="text-on-surface-variant">Walk-in</span>
                    ) : (
                      <>
                        <p className="font-semibold">{inv.customerName}</p>
                        {inv.customerPhone ? (
                          <p className="font-mono-data text-xs text-on-surface-variant">{inv.customerPhone}</p>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="p-4 text-on-surface-variant">{new Date(inv.invoice_date).toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[inv.status]}`}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 font-semibold">₹{inv.grand_total}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          window.open(`/sales/${inv.id}/print`, '_blank', 'width=420,height=700')
                        }
                      >
                        Print
                      </Button>
                      {inv.customerPhone && !inv.customerIsWalkin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const sent = shareOnWhatsApp(
                              inv.customerPhone,
                              buildReceiptMessage({
                                storeName: orgName || 'our store',
                                invoiceNumber: inv.invoice_number,
                                grandTotal: inv.grand_total,
                              }),
                            );
                            if (!sent) setError('That phone number does not look valid for WhatsApp.');
                          }}
                        >
                          WhatsApp
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-on-surface-variant">
                    {q
                      ? `No invoices match “${q}”.`
                      : 'No sales yet — ring up your first sale from the POS screen.'}
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
