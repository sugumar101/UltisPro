'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

/**
 * Public bill view — the page a customer lands on from an SMS, email or
 * WhatsApp link.
 *
 * Deliberately **not** wrapped in useRequireAuth or DashboardShell: the
 * recipient has no account, and rendering app chrome (sidebar, notification
 * bell, sign-out) to a member of the public would be both confusing and a
 * small information leak about the shop's internals.
 *
 * Styling is self-contained rather than using the design system, for the
 * same reason the print pages are: this renders for someone on an unknown
 * phone, and it should look like a receipt, not like the admin app.
 */

interface PublicReceipt {
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    status: string;
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    grandTotal: string;
  };
  items: {
    productName: string;
    sku: string;
    attributes: Record<string, string> | null;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxAmount: string;
    lineTotal: string;
  }[];
  payments: { amount: string; paymentMode: string }[];
  customerName: string | null;
  store: { name: string; gstin: string | null; city: string | null } | null;
  branch: { name: string; phone: string | null } | null;
  organizationName: string | null;
  amountInWords: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function money(value: string | number): string {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PublicBillPage() {
  const params = useParams<{ token: string }>();
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.token) return;

    // Plain fetch with no credentials — this endpoint takes no cookie or
    // bearer token, and sending one would be pointless here.
    fetch(`${API_BASE_URL}/api/v1/public/receipt/${encodeURIComponent(params.token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? 'Unable to load this bill');
        setReceipt(json.data as PublicReceipt);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-8 font-sans text-slate-900">
      <style>{`
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
        }
      `}</style>

      {loading ? <p className="text-center text-slate-500">Loading your bill…</p> : null}

      {error ? (
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">This bill link isn&apos;t valid</p>
          <p className="mt-2 text-sm text-slate-500">
            It may have been mistyped or the bill may have been removed. Please ask the store for a new link.
          </p>
        </div>
      ) : null}

      {receipt ? (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-7 text-center text-white">
            <p className="text-xl font-bold">{receipt.store?.name ?? receipt.organizationName}</p>
            {receipt.branch?.name ? <p className="mt-0.5 text-sm text-indigo-100">{receipt.branch.name}</p> : null}
            <p className="mt-4 text-sm text-indigo-100">
              {receipt.customerName ? `Thank you, ${receipt.customerName}!` : 'Thank you for shopping with us!'}
            </p>
            <p className="mt-3 text-3xl font-bold">₹{money(receipt.invoice.grandTotal)}</p>
          </div>

          <div className="flex justify-between border-b border-slate-100 px-6 py-4 text-sm">
            <div>
              <p className="text-slate-500">Bill number</p>
              <p className="font-mono font-semibold">{receipt.invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Date</p>
              <p className="font-semibold">{new Date(receipt.invoice.invoiceDate).toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="px-6 py-4">
            {receipt.items.map((item, index) => (
              <div key={index} className="flex justify-between border-b border-slate-100 py-3 last:border-0">
                <div className="pr-3">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-slate-500">
                    {Number(item.quantity)} × ₹{money(item.unitPrice)}
                    {item.attributes?.size ? ` · Size ${item.attributes.size}` : ''}
                    {item.attributes?.color ? ` · ${item.attributes.color}` : ''}
                  </p>
                </div>
                <p className="whitespace-nowrap font-semibold">₹{money(item.lineTotal)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-slate-100 px-6 py-4 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>₹{money(receipt.invoice.subtotal)}</span>
            </div>
            {Number(receipt.invoice.discountTotal) > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>−₹{money(receipt.invoice.discountTotal)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-500">
              <span>Tax</span>
              <span>₹{money(receipt.invoice.taxTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <span>Total</span>
              <span>₹{money(receipt.invoice.grandTotal)}</span>
            </div>
            <p className="pt-1 text-xs text-slate-400">{receipt.amountInWords}</p>
          </div>

          {receipt.payments.length > 0 ? (
            <div className="border-t border-slate-100 px-6 py-4 text-sm">
              {receipt.payments.map((payment, index) => (
                <div key={index} className="flex justify-between text-slate-500">
                  <span className="capitalize">Paid by {payment.paymentMode.replace('_', ' ')}</span>
                  <span>₹{money(payment.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="border-t border-slate-100 px-6 py-5 text-center text-xs text-slate-400">
            {receipt.store?.gstin ? <p>GSTIN: {receipt.store.gstin}</p> : null}
            {receipt.branch?.phone ? <p className="mt-1">Questions? Call {receipt.branch.phone}</p> : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Save or print this bill
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
