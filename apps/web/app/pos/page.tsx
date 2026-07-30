'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { listBranches, type Branch } from '../../lib/settings-api';
import { listCustomers, type Customer } from '../../lib/customers-api';
import { listTaxes, type Tax } from '../../lib/products-api';
import { posSearch, holdBill, listHeldBills, resumeHeldBill, type PosSearchResult, type CartLine, type HeldBill } from '../../lib/pos-api';
import { createSale, type PaymentInput } from '../../lib/sales-api';
import { ApiError } from '../../lib/api-client';

const PAYMENT_MODES: PaymentInput['paymentMode'][] = ['cash', 'card', 'upi', 'wallet', 'store_credit', 'gift_voucher'];

interface PaymentLine {
  amount: string;
  paymentMode: PaymentInput['paymentMode'];
}

export default function PosPage() {
  const { ready, accessToken } = useRequireAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosSearchResult[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([{ amount: '', paymentMode: 'cash' }]);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept after checkout so the cashier can (re)print the receipt for the
  // sale they just rang up, even though the cart itself has been cleared.
  const [lastSale, setLastSale] = useState<{ id: string; invoiceNumber: string } | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([listBranches(accessToken), listCustomers(accessToken, { page: 1 }), listTaxes(accessToken)])
      .then(([b, c, t]) => {
        setBranches(b);
        setCustomers(c.data);
        setTaxes(t);
        if (b.length > 0) setBranchId(b[0].id);
        const walkin = c.data.find((cust) => cust.is_walkin);
        if (walkin) setCustomerId(walkin.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load POS data'));
  }, [ready, accessToken]);

  useEffect(() => {
    if (!accessToken || !branchId) return;
    listHeldBills(accessToken, branchId).then(setHeldBills).catch(() => undefined);
  }, [accessToken, branchId]);

  async function handleSearch() {
    if (!accessToken || !branchId || !query) return;
    try {
      setResults(await posSearch(accessToken, branchId, query));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    }
  }

  function addToCart(result: PosSearchResult) {
    setCart((prev) => {
      const existing = prev.find((line) => line.productVariantId === result.productVariantId);
      if (existing) {
        return prev.map((line) =>
          line.productVariantId === result.productVariantId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          productVariantId: result.productVariantId,
          sku: result.sku,
          productName: result.productName,
          quantity: 1,
          unitPrice: Number(result.sellingPrice),
          discountAmount: 0,
          taxId: result.taxId ?? undefined,
        },
      ];
    });
  }

  function updateCartLine(index: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeCartLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function taxRate(taxId?: string): number {
    if (!taxId) return 0;
    const tax = taxes.find((t) => t.id === taxId);
    return tax ? Number(tax.rate_percent) : 0;
  }

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discountTotal = cart.reduce((sum, l) => sum + l.discountAmount, 0);
  const taxTotal = cart.reduce((sum, l) => sum + (l.quantity * l.unitPrice - l.discountAmount) * (taxRate(l.taxId) / 100), 0);
  const grandTotal = subtotal - discountTotal + taxTotal;
  const amountPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const shortfall = Math.max(0, grandTotal - amountPaid);

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPaymentLine() {
    setPayments((prev) => [...prev, { amount: '', paymentMode: 'cash' }]);
  }

  function resetCart() {
    setCart([]);
    setPayments([{ amount: '', paymentMode: 'cash' }]);
    setResults([]);
    setQuery('');
  }

  /**
   * Opens the print view in a small popup rather than navigating away — the
   * cashier keeps the POS screen (and their branch/customer selection) and
   * can immediately start the next sale while the receipt prints. `auto=1`
   * makes the print dialog fire as soon as the receipt renders.
   */
  function openReceipt(invoiceId: string, auto: boolean) {
    const query = auto ? '?auto=1' : '';
    window.open(`/sales/${invoiceId}/print${query}`, '_blank', 'width=420,height=700');
  }

  async function handleCheckout() {
    if (!accessToken || !branchId || cart.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createSale(accessToken, {
        branchId,
        customerId: customerId || undefined,
        items: cart.map((l) => ({
          productVariantId: l.productVariantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxId: l.taxId,
        })),
        payments: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ amount: Number(p.amount), paymentMode: p.paymentMode })),
      });
      setMessage(`Sale completed: invoice ${result.invoice.invoice_number} (total ₹${result.invoice.grand_total}).`);
      setLastSale({ id: result.invoice.id, invoiceNumber: result.invoice.invoice_number });
      resetCart();
      if (autoPrint) openReceipt(result.invoice.id, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleHold() {
    if (!accessToken || !branchId || cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await holdBill(accessToken, {
        branchId,
        registerCode: 'REG-1',
        customerId: customerId || undefined,
        cartSnapshot: cart,
      });
      resetCart();
      setHeldBills(await listHeldBills(accessToken, branchId));
      setMessage('Cart held. Resume it any time from the list below.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to hold cart');
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(id: string) {
    if (!accessToken || !branchId) return;
    try {
      const held = await resumeHeldBill(accessToken, id);
      setCart(held.cart_snapshot);
      if (held.customer_id) setCustomerId(held.customer_id);
      setHeldBills(await listHeldBills(accessToken, branchId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resume cart');
    }
  }

  if (!ready) return null;

  return (
    <DashboardShell>
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Point of Sale</h1>
        <div className="flex gap-3">
          <FormField label="Branch">
            <select
              className="rounded border border-outline-variant px-3 py-2 text-body-md"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Customer">
            <select
              className="rounded border border-outline-variant px-3 py-2 text-body-md"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-error">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}

      {lastSale ? (
        <div className="mt-4 flex items-center gap-3 rounded border border-outline-variant bg-surface-container-low p-3">
          <span className="text-body-md">
            Last sale: <span className="font-mono-data font-semibold">{lastSale.invoiceNumber}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => openReceipt(lastSale.id, false)}>
            Print receipt
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.open(`/sales/${lastSale.id}`, '_blank')}>
            View invoice
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Search products</h2>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name, SKU, or scan barcode…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="secondary" onClick={handleSearch}>
                  Search
                </Button>
              </div>
              {results.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {results.map((r) => (
                    <li
                      key={r.productVariantId}
                      className="flex cursor-pointer items-center justify-between rounded border border-outline-variant p-3 hover:bg-surface-container-low"
                      onClick={() => addToCart(r)}
                    >
                      <div>
                        <p className="font-semibold">{r.productName}</p>
                        <p className="font-mono-data text-sm text-on-surface-variant">{r.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">₹{r.sellingPrice}</p>
                        <p className="text-sm text-on-surface-variant">Stock: {r.quantityOnHand ?? 0}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Cart</h2>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-left text-body-md">
                <thead className="border-b border-outline-variant text-label-sm text-on-surface-variant">
                  <tr>
                    <th className="p-3">Item</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Discount</th>
                    <th className="p-3">Line total</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line, i) => {
                    const lineTotal =
                      line.quantity * line.unitPrice - line.discountAmount +
                      (line.quantity * line.unitPrice - line.discountAmount) * (taxRate(line.taxId) / 100);
                    return (
                      <tr key={i} className="border-b border-outline-variant last:border-0">
                        <td className="p-3">
                          <p className="font-semibold">{line.productName}</p>
                          <p className="font-mono-data text-xs text-on-surface-variant">{line.sku}</p>
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="w-20"
                            value={line.quantity}
                            onChange={(e) => updateCartLine(i, { quantity: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="w-24"
                            value={line.unitPrice}
                            onChange={(e) => updateCartLine(i, { unitPrice: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            className="w-24"
                            value={line.discountAmount}
                            onChange={(e) => updateCartLine(i, { discountAmount: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-3 font-semibold">₹{lineTotal.toFixed(2)}</td>
                        <td className="p-3">
                          <Button variant="destructive" size="sm" onClick={() => removeCartLine(i)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                        Cart is empty — search for a product above to add it.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {heldBills.length > 0 ? (
            <Card>
              <CardHeader>
                <h2 className="font-title-sm text-title-sm">Held bills</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {heldBills.map((h) => (
                    <li key={h.id} className="flex items-center justify-between rounded border border-outline-variant p-3">
                      <span className="text-sm text-on-surface-variant">
                        {h.cart_snapshot.length} item(s) · {new Date(h.created_at).toLocaleTimeString()}
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => handleResume(h.id)}>
                        Resume
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Totals</h2>
            </CardHeader>
            <CardContent className="space-y-2 text-body-md">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Discount</span>
                <span>-₹{discountTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Tax</span>
                <span>₹{taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-outline-variant pt-2 font-headline-md text-headline-md">
                <span>Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-title-sm text-title-sm">Payment</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={p.amount}
                    onChange={(e) => updatePayment(i, { amount: e.target.value })}
                  />
                  <select
                    className="rounded border border-outline-variant px-3 py-2 text-body-md"
                    value={p.paymentMode}
                    onChange={(e) => updatePayment(i, { paymentMode: e.target.value as PaymentInput['paymentMode'] })}
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={addPaymentLine}>
                Add payment method
              </Button>
              <div className="flex justify-between border-t border-outline-variant pt-2 text-body-md">
                <span className="text-on-surface-variant">{shortfall > 0.01 ? 'On account' : 'Paid'}</span>
                <span className={shortfall > 0.01 ? 'font-semibold text-error' : 'font-semibold'}>
                  ₹{shortfall > 0.01 ? shortfall.toFixed(2) : amountPaid.toFixed(2)}
                </span>
              </div>
              <label className="flex items-center gap-2 text-sm text-on-surface-variant">
                <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
                Print receipt automatically after checkout
              </label>
              <Button className="w-full" disabled={busy || cart.length === 0} onClick={handleCheckout}>
                {busy ? 'Processing…' : 'Checkout'}
              </Button>
              <Button variant="secondary" className="w-full" disabled={busy || cart.length === 0} onClick={handleHold}>
                Hold cart
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
