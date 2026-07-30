'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { getDashboardSummary, getDashboardCharts, getRecentActivity, type DashboardSummary, type SalesTrendPoint, type RecentSale, type RecentPurchaseOrder } from '../../lib/dashboard-api';
import { ApiError } from '../../lib/api-client';

export default function DashboardPage() {
  const { ready, user, accessToken } = useRequireAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trend, setTrend] = useState<SalesTrendPoint[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [recentPOs, setRecentPOs] = useState<RecentPurchaseOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([getDashboardSummary(accessToken), getDashboardCharts(accessToken, 30), getRecentActivity(accessToken, 8)])
      .then(([s, c, r]) => {
        setSummary(s);
        setTrend(c.salesTrend);
        setRecentSales(r.recentSales);
        setRecentPOs(r.recentPurchaseOrders);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'));
  }, [ready, accessToken]);

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Dashboard</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">Welcome back, {user?.fullName}.</p>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      {summary ? (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label="Today's sales" value={`₹${summary.todaySalesTotal.toFixed(2)}`} sub={`${summary.todaySalesCount} invoice(s)`} />
          <Kpi
            label="Low stock items"
            value={String(summary.lowStockCount)}
            sub="View in Inventory"
            danger={summary.lowStockCount > 0}
          />
          <Kpi label="Receivables" value={`₹${summary.receivables.toFixed(2)}`} sub="Owed by customers" />
          <Kpi label="Payables" value={`₹${summary.payables.toFixed(2)}`} sub="Owed to suppliers" />
          <Kpi label="Active products" value={String(summary.activeProductCount)} sub="In catalog" />
          <Kpi label="Pending POs" value={String(summary.pendingPurchaseOrderCount)} sub="Awaiting receipt" />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Sales trend (30 days)</h2>
          </CardHeader>
          <CardContent>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend}>
                  <XAxis dataKey="day" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                  <YAxis />
                  <Tooltip formatter={(v: number) => `₹${v.toFixed(2)}`} labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                  <Line type="monotone" dataKey="total" stroke="#4F46E5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-on-surface-variant">No sales yet — ring up your first sale from the POS screen.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Recent activity</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-label-sm font-semibold text-on-surface-variant">Sales</p>
              <ul className="space-y-1">
                {recentSales.map((s) => (
                  <li key={s.id} className="flex justify-between text-sm">
                    <Link href={`/sales/${s.id}`} className="font-mono-data text-primary hover:underline">
                      {s.invoice_number}
                    </Link>
                    <span className="font-semibold">₹{s.grand_total}</span>
                  </li>
                ))}
                {recentSales.length === 0 ? <p className="text-sm text-on-surface-variant">No sales yet.</p> : null}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-label-sm font-semibold text-on-surface-variant">Purchase orders</p>
              <ul className="space-y-1">
                {recentPOs.map((po) => (
                  <li key={po.id} className="flex justify-between text-sm">
                    <Link href={`/purchase-orders/${po.id}`} className="font-mono-data text-primary hover:underline">
                      {po.po_number}
                    </Link>
                    <span className="capitalize text-on-surface-variant">{po.status.replace('_', ' ')}</span>
                  </li>
                ))}
                {recentPOs.length === 0 ? <p className="text-sm text-on-surface-variant">No purchase orders yet.</p> : null}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function Kpi({ label, value, sub, danger }: { label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent>
        <p className="text-label-sm text-on-surface-variant">{label}</p>
        <p className={`font-headline-md text-headline-md ${danger ? 'text-error' : 'text-on-surface'}`}>{value}</p>
        <p className="text-xs text-on-surface-variant">{sub}</p>
      </CardContent>
    </Card>
  );
}
