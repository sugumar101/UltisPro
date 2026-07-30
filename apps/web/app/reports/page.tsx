'use client';

import { useState } from 'react';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import {
  getSalesReport,
  getInventoryReport,
  getGstReport,
  getCashFlowReport,
  downloadCsv,
  type SalesReport,
  type InventoryReport,
  type GstReport,
  type CashFlowReport,
} from '../../lib/reports-api';
import { ApiError } from '../../lib/api-client';

type ReportKey = 'sales' | 'inventory' | 'gst' | 'cash-flow';

const TABS: { key: ReportKey; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'gst', label: 'GST' },
  { key: 'cash-flow', label: 'Cash Flow' },
];

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { ready, accessToken } = useRequireAuth();
  const [active, setActive] = useState<ReportKey>('sales');
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());

  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);
  const [gstReport, setGstReport] = useState<GstReport | null>(null);
  const [cashFlowReport, setCashFlowReport] = useState<CashFlowReport | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runReport() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      if (active === 'sales') setSalesReport(await getSalesReport(accessToken, fromDate, toDate));
      else if (active === 'inventory') setInventoryReport(await getInventoryReport(accessToken));
      else if (active === 'gst') setGstReport(await getGstReport(accessToken, fromDate, toDate));
      else if (active === 'cash-flow') setCashFlowReport(await getCashFlowReport(accessToken, fromDate, toDate));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!accessToken) return;
    try {
      await downloadCsv(accessToken, active, { fromDate, toDate });
    } catch {
      setError('Export failed');
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Reports</h1>

      <div className="mt-4 flex gap-2 border-b border-outline-variant">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2 text-body-md font-semibold ${
              active === tab.key ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-end gap-4">
          {active !== 'inventory' ? (
            <>
              <FormField label="From">
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </FormField>
              <FormField label="To">
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </FormField>
            </>
          ) : null}
          <Button disabled={loading} onClick={runReport}>
            {loading ? 'Loading…' : 'Run report'}
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            Export CSV
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}

      {active === 'sales' && salesReport ? (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Daily sales</h2>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-body-md">
                <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <tr>
                    <th className="p-3">Day</th>
                    <th className="p-3">Invoices</th>
                    <th className="p-3">Subtotal</th>
                    <th className="p-3">Discount</th>
                    <th className="p-3">Tax</th>
                    <th className="p-3">Grand total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReport.byDay.map((row) => (
                    <tr key={row.day} className="border-b border-outline-variant last:border-0">
                      <td className="p-3">{new Date(row.day).toLocaleDateString()}</td>
                      <td className="p-3">{row.invoiceCount}</td>
                      <td className="p-3">₹{row.subtotal.toFixed(2)}</td>
                      <td className="p-3">₹{row.discountTotal.toFixed(2)}</td>
                      <td className="p-3">₹{row.taxTotal.toFixed(2)}</td>
                      <td className="p-3 font-semibold">₹{row.grandTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-outline-variant font-semibold">
                    <td className="p-3">Total</td>
                    <td className="p-3">{salesReport.totals.invoiceCount}</td>
                    <td className="p-3">₹{salesReport.totals.subtotal.toFixed(2)}</td>
                    <td className="p-3">₹{salesReport.totals.discountTotal.toFixed(2)}</td>
                    <td className="p-3">₹{salesReport.totals.taxTotal.toFixed(2)}</td>
                    <td className="p-3">₹{salesReport.totals.grandTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Best sellers</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {salesReport.bestSellers.map((b) => (
                  <li key={b.sku} className="flex justify-between rounded border border-outline-variant p-3">
                    <span>
                      {b.productName} <span className="font-mono-data text-on-surface-variant">({b.sku})</span>
                    </span>
                    <span>
                      {b.quantitySold} sold · ₹{b.revenue.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {active === 'inventory' && inventoryReport ? (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-title-sm text-title-sm">Stock valuation (total ₹{inventoryReport.totalStockValue.toFixed(2)})</h2>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-body-md">
              <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                <tr>
                  <th className="p-3">Branch</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">On hand</th>
                  <th className="p-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {inventoryReport.rows.map((row, i) => (
                  <tr key={i} className="border-b border-outline-variant last:border-0">
                    <td className="p-3">{row.branchName}</td>
                    <td className="p-3">
                      {row.productName} <span className="font-mono-data text-on-surface-variant">({row.sku})</span>
                    </td>
                    <td className={`p-3 ${row.lowStock ? 'font-semibold text-error' : ''}`}>{row.quantityOnHand}</td>
                    <td className="p-3">₹{row.stockValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {active === 'gst' && gstReport ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Output tax (sales) — ₹{gstReport.totalOutputTax.toFixed(2)}</h2>
            </CardHeader>
            <CardContent>
              <GstTable buckets={gstReport.outputTax} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Input tax (purchases) — ₹{gstReport.totalInputTax.toFixed(2)}</h2>
            </CardHeader>
            <CardContent>
              <GstTable buckets={gstReport.inputTax} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent>
              <div className="flex justify-between font-headline-md text-headline-md">
                <span>Net GST payable</span>
                <span>₹{gstReport.netPayable.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {active === 'cash-flow' && cashFlowReport ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Cash in — ₹{cashFlowReport.totalIn.toFixed(2)}</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cashFlowReport.cashIn.map((r) => (
                  <li key={r.paymentMode} className="flex justify-between rounded border border-outline-variant p-3 capitalize">
                    <span>{r.paymentMode.replace('_', ' ')}</span>
                    <span className="font-semibold">₹{r.total.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Cash out — ₹{cashFlowReport.totalOut.toFixed(2)}</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {cashFlowReport.cashOut.map((r) => (
                  <li key={r.paymentMode} className="flex justify-between rounded border border-outline-variant p-3 capitalize">
                    <span>{r.paymentMode.replace('_', ' ')}</span>
                    <span className="font-semibold">₹{r.total.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent>
              <div className="flex justify-between font-headline-md text-headline-md">
                <span>Net cash flow</span>
                <span className={cashFlowReport.net < 0 ? 'text-error' : ''}>₹{cashFlowReport.net.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function GstTable({ buckets }: { buckets: { taxName: string; ratePercent: number; taxableAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalTax: number }[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-outline-variant text-on-surface-variant">
        <tr>
          <th className="py-2">Rate</th>
          <th className="py-2">Taxable</th>
          <th className="py-2">CGST</th>
          <th className="py-2">SGST</th>
          <th className="py-2">IGST</th>
          <th className="py-2">Total</th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((b) => (
          <tr key={b.taxName} className="border-b border-outline-variant last:border-0">
            <td className="py-2">{b.taxName}</td>
            <td className="py-2">₹{b.taxableAmount.toFixed(2)}</td>
            <td className="py-2">₹{b.cgstAmount.toFixed(2)}</td>
            <td className="py-2">₹{b.sgstAmount.toFixed(2)}</td>
            <td className="py-2">₹{b.igstAmount.toFixed(2)}</td>
            <td className="py-2 font-semibold">₹{b.totalTax.toFixed(2)}</td>
          </tr>
        ))}
        {buckets.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-4 text-center text-on-surface-variant">
              No tax data for this period.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
