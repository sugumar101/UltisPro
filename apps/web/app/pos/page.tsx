'use client';

import { useEffect, useRef, useState } from 'react';
import { DashboardShell } from '../../components/layout/dashboard-shell';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { useRequireAuth } from '../../lib/hooks/use-require-auth';
import { listBranches, getOrganization, type Branch } from '../../lib/settings-api';
import { shareOnWhatsApp, buildReceiptMessage } from '../../lib/whatsapp';
import { listCustomers, lookupCustomerByPhone, createCustomer, type Customer } from '../../lib/customers-api';
import { listTaxes, type Tax } from '../../lib/products-api';
import {
  posSearch,
  holdBill,
  listHeldBills,
  resumeHeldBill,
  describeVariant,
  type PosSearchResult,
  type CartLine,
  type HeldBill,
} from '../../lib/pos-api';
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
  // Phone-first customer capture. `matchedCustomer` is the recognised
  // returning customer; when a number is unknown the cashier fills in the
  // name and the record is created at checkout.
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  // Used to sign the WhatsApp receipt message.
  const [orgName, setOrgName] = useState('');
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosSearchResult[]>([]);
  // The scan box owns focus for the whole screen — a scanner types into
  // whatever is focused, so if focus drifts elsewhere scanning silently does
  // nothing.
  const searchRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([{ amount: '', paymentMode: 'cash' }]);
  // Whole-bill discount entered at the till. Kept as a string so the field
  // can be empty rather than showing a stubborn 0.
  const [billDiscount, setBillDiscount] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept after checkout so the cashier can (re)print the receipt for the
  // sale they just rang up, even though the cart itself has been cleared.
  const [lastSale, setLastSale] = useState<{
    id: string;
    invoiceNumber: string;
    grandTotal: string;
    customerPhone: string | null;
  } | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);

  useEffect(() => {
    if (!ready || !accessToken) return;
    Promise.all([
      listBranches(accessToken),
      listCustomers(accessToken, { page: 1 }),
      listTaxes(accessToken),
      getOrganization(accessToken).catch(() => null),
    ])
      .then(([b, c, t, org]) => {
        setBranches(b);
        setCustomers(c.data);
        setTaxes(t);
        if (org) setOrgName(org.display_name);
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

  /**
   * Runs a POS search and, when the term is an exact barcode hit, drops the
   * item straight into the cart.
   *
   * This is what makes a scanner actually work: a keyboard-wedge scanner
   * types the barcode and sends Enter, so without the auto-add the cashier
   * gets a result list they then have to *click* — taking a hand off the
   * scanner for every single item, which defeats the point of scanning. An
   * exact barcode match is unambiguous by construction (barcodes are unique
   * per organization), so adding it directly is safe; anything else still
   * falls through to the pickable result list.
   */
  async function handleSearch(rawTerm?: string) {
    // Guard against being passed straight to an event handler
    // (`onClick={handleSearch}`), which hands us a MouseEvent rather than a
    // string. Call sites pass either nothing or a real term.
    const term = (typeof rawTerm === 'string' ? rawTerm : query).trim();
    if (!accessToken || !branchId || !term) return;

    try {
      const found = await posSearch(accessToken, branchId, term);

      const exact = found.find((r) => r.barcode && r.barcode === term);
      if (exact) {
        // addToCart owns the error slot here — it raises an out-of-stock
        // warning — so don't clear it afterwards.
        addToCart(exact);
        setQuery('');
        setResults([]);
        searchRef.current?.focus();
        return;
      }

      setResults(found);
      if (found.length === 0) {
        setError(`Nothing found for "${term}". If you scanned a label, check the product still exists and is active.`);
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed');
    }
  }

  function addToCart(result: PosSearchResult) {
    const available = Number(result.quantityOnHand ?? 0);

    // Flag the problem at scan time rather than letting it surface as a
    // server rejection after payment has been entered. This warns rather
    // than blocks: a shop may legitimately sell an item whose stock hasn't
    // been recorded yet, and the checkout transaction is the real guard.
    if (available <= 0) {
      setMessage(null);
      setError(
        `"${result.productName}" (${result.sku}) shows 0 in stock at this branch — checkout will be rejected until stock is added via Inventory, or you switch to the branch holding it.`,
      );
    } else {
      setError(null);
    }

    setCart((prev) => {
      const existing = prev.find((line) => line.productVariantId === result.productVariantId);
      if (existing) {
        return prev.map((line) =>
          line.productVariantId === result.productVariantId
            ? { ...line, quantity: line.quantity + 1, availableStock: available }
            : line,
        );
      }
      return [
        ...prev,
        {
          productVariantId: result.productVariantId,
          sku: result.sku,
          // Fold the variant description into the displayed name so the cart
          // (and the held-bill snapshot) stays unambiguous when several sizes
          // of the same style are on one bill.
          productName: describeVariant(result.attributes)
            ? `${result.productName} (${describeVariant(result.attributes)})`
            : result.productName,
          quantity: 1,
          unitPrice: Number(result.sellingPrice),
          discountAmount: 0,
          taxId: result.taxId ?? undefined,
          availableStock: available,
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

  // Lines the server will reject at checkout. Computed from the stock read
  // at add time, so it's advisory — the authoritative check runs inside the
  // checkout transaction.
  const understockedLines = cart.filter(
    (line) => line.availableStock !== undefined && line.quantity > line.availableStock,
  );

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const lineDiscountTotal = cart.reduce((sum, l) => sum + l.discountAmount, 0);
  const netBeforeBillDiscount = subtotal - lineDiscountTotal;

  // Mirrors sales.service.ts exactly: the bill discount is prorated across
  // lines before tax, so the total shown here matches what the server
  // computes. Capped at the pre-tax total, which the API also enforces.
  const appliedBillDiscount = Math.min(Math.max(0, Number(billDiscount) || 0), netBeforeBillDiscount);
  const discountTotal = lineDiscountTotal + appliedBillDiscount;

  const taxTotal = cart.reduce((sum, l) => {
    const lineNetBefore = l.quantity * l.unitPrice - l.discountAmount;
    const share = netBeforeBillDiscount > 0 ? lineNetBefore / netBeforeBillDiscount : 0;
    const lineNet = lineNetBefore - appliedBillDiscount * share;
    return sum + lineNet * (taxRate(l.taxId) / 100);
  }, 0);

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
    setBillDiscount('');
    // Customer capture is per-sale — the next person at the counter is a
    // different customer, so leaving the previous one selected would bill
    // them by mistake.
    setCustomerPhone('');
    setCustomerName('');
    setMatchedCustomer(null);
    setCustomerId('');
    setMarketingOptIn(false);
    // Hand focus back to the scan box so the next customer can be rung up
    // without touching the mouse.
    searchRef.current?.focus();
  }

  /**
   * Looks the typed number up as soon as it's plausibly complete. A hit
   * fills in the name and their saved consent; a miss leaves the name field
   * open for the cashier and the record is created at checkout.
   */
  async function handlePhoneLookup(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (!accessToken || digits.length < 7) {
      setMatchedCustomer(null);
      return;
    }

    setLookingUp(true);
    try {
      const found = await lookupCustomerByPhone(accessToken, phone);
      setMatchedCustomer(found);
      if (found) {
        setCustomerId(found.id);
        setCustomerName(found.full_name);
        setMarketingOptIn(Boolean(found.marketing_opt_in));
      } else {
        // Unknown number: fall back to walk-in until a name is entered, so
        // the sale can still complete if the customer declines to give one.
        setCustomerId('');
        setCustomerName('');
        setMarketingOptIn(false);
      }
    } catch {
      // A lookup failure must never block a sale.
      setMatchedCustomer(null);
    } finally {
      setLookingUp(false);
    }
  }

  /**
   * Resolves the customer to bill against, creating one when the cashier
   * captured a new number + name. Falls back to the walk-in customer when
   * nothing was captured.
   */
  async function resolveCustomerForSale(): Promise<string | undefined> {
    if (matchedCustomer) return matchedCustomer.id;

    const phone = customerPhone.trim();
    const name = customerName.trim();
    if (!phone || !name || !accessToken) return customerId || undefined;

    // create() is find-or-create on phone server-side, so a double-submit or
    // a race with another till returns the existing customer rather than
    // failing on the unique constraint.
    const created = await createCustomer(accessToken, {
      fullName: name,
      phone,
      marketingOptIn,
    });
    setMatchedCustomer(created);
    setCustomerId(created.id);
    return created.id;
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
      const resolvedCustomerId = await resolveCustomerForSale();
      const result = await createSale(accessToken, {
        branchId,
        customerId: resolvedCustomerId,
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
        billDiscountAmount: appliedBillDiscount > 0 ? appliedBillDiscount : undefined,
      });
      setMessage(`Sale completed: invoice ${result.invoice.invoice_number} (total ₹${result.invoice.grand_total}).`);
      setLastSale({
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoice_number,
        grandTotal: result.invoice.grand_total,
        customerPhone: customerPhone.trim() || matchedCustomer?.phone || null,
      });
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
        // Only an already-saved customer is attached to a hold. A
        // half-captured new customer isn't persisted here on purpose — a
        // held bill may never be resumed, and creating a customer record for
        // an abandoned cart would litter the CRM.
        customerId: matchedCustomer?.id ?? customerId ?? undefined,
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
          <FormField label="Customer mobile">
            <Input
              className="w-44"
              inputMode="tel"
              placeholder="98765 43210"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setMatchedCustomer(null);
              }}
              onBlur={(e) => handlePhoneLookup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePhoneLookup(customerPhone);
                }
              }}
            />
          </FormField>
          <FormField label={matchedCustomer ? 'Customer' : 'Name (new customer)'}>
            <Input
              className="w-44"
              placeholder={lookingUp ? 'Looking up…' : 'Customer name'}
              value={customerName}
              disabled={Boolean(matchedCustomer)}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {matchedCustomer ? (
        <div className="mt-4 flex animate-fade-in items-center gap-3 rounded-md border border-success/30 bg-success-container px-4 py-2.5 text-body-md text-on-success-container">
          <span className="font-semibold">Welcome back, {matchedCustomer.full_name}</span>
          {Number(matchedCustomer.outstanding_balance) > 0 ? (
            <span>· Outstanding ₹{Number(matchedCustomer.outstanding_balance).toFixed(2)}</span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMatchedCustomer(null);
              setCustomerPhone('');
              setCustomerName('');
              setCustomerId('');
              setMarketingOptIn(false);
            }}
          >
            Clear
          </Button>
        </div>
      ) : customerPhone.trim() && !lookingUp ? (
        <div className="mt-4 rounded-md border border-outline-variant bg-surface-container-low px-4 py-2.5">
          <p className="text-body-md text-on-surface-variant">
            New number — enter a name to save this customer, or leave it blank to bill as walk-in.
          </p>
          <label className="mt-1.5 flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
            />
            Customer agreed to receive offers and new-collection updates
          </label>
        </div>
      ) : null}

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
          {lastSale.customerPhone ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const sent = shareOnWhatsApp(
                  lastSale.customerPhone,
                  buildReceiptMessage({
                    storeName: orgName || 'our store',
                    invoiceNumber: lastSale.invoiceNumber,
                    grandTotal: lastSale.grandTotal,
                  }),
                );
                if (!sent) setError('That phone number does not look valid for WhatsApp.');
              }}
            >
              Send on WhatsApp
            </Button>
          ) : null}
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
                  ref={searchRef}
                  autoFocus
                  placeholder="Scan barcode, or search by name / SKU…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                />
                <Button variant="secondary" onClick={() => handleSearch()}>
                  Search
                </Button>
              </div>
              {results.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {results.map((r) => (
                    <li
                      key={r.productVariantId}
                      className="flex cursor-pointer items-center justify-between rounded border border-outline-variant p-3 hover:bg-surface-container-low"
                      onClick={() => {
                        addToCart(r);
                        setQuery('');
                        setResults([]);
                        searchRef.current?.focus();
                      }}
                    >
                      <div>
                        <p className="font-semibold">
                          {r.productName}
                          {describeVariant(r.attributes) ? (
                            <span className="ml-2 rounded bg-surface-container px-1.5 py-0.5 text-xs font-semibold">
                              {describeVariant(r.attributes)}
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono-data text-sm text-on-surface-variant">{r.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">₹{r.sellingPrice}</p>
                        <p
                          className={`text-sm ${
                            Number(r.quantityOnHand ?? 0) <= 0
                              ? 'font-semibold text-error'
                              : 'text-on-surface-variant'
                          }`}
                        >
                          Stock: {r.quantityOnHand ?? 0}
                        </p>
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
                          {line.availableStock !== undefined && line.quantity > line.availableStock ? (
                            <p className="mt-0.5 text-xs font-semibold text-error">
                              Only {line.availableStock} in stock
                            </p>
                          ) : null}
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
                <span className="text-on-surface-variant">Line discounts</span>
                <span>-₹{lineDiscountTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-on-surface-variant">Bill discount</span>
                <div className="flex items-center gap-1">
                  <span className="text-on-surface-variant">-₹</span>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-24 text-right"
                    placeholder="0.00"
                    value={billDiscount}
                    onChange={(e) => setBillDiscount(e.target.value)}
                  />
                </div>
              </div>
              {Number(billDiscount) > netBeforeBillDiscount ? (
                <p className="text-xs text-error">
                  Capped at ₹{netBeforeBillDiscount.toFixed(2)} — a discount can&apos;t exceed the pre-tax total.
                </p>
              ) : null}
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
              {understockedLines.length > 0 ? (
                <p className="rounded border border-error/30 bg-error-container px-3 py-2 text-xs text-on-error-container">
                  Not enough stock for {understockedLines.map((l) => l.sku).join(', ')}. Add stock in Inventory, or
                  switch to the branch that holds it — checkout will be rejected otherwise.
                </p>
              ) : null}
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
