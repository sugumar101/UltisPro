'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '../../../../lib/hooks/use-require-auth';
import { getReceipt, type Receipt } from '../../../../lib/sales-api';
import { ApiError } from '../../../../lib/api-client';

/**
 * Printable receipt / GST tax invoice (POS-08, SAL-02).
 *
 * Rendered as ordinary HTML+CSS and printed through the browser's own print
 * pipeline rather than generating a PDF server-side or emitting raw ESC/POS
 * bytes. That choice is deliberate for this build:
 *   - A thermal printer installed as a normal OS printer prints this fine —
 *     the 80mm layout below sets `@page { size: 80mm auto }` and the printer
 *     driver rasterises it, which is how most browser-based POS systems
 *     drive thermal hardware.
 *   - "Save as PDF" in the same print dialog covers the PDF half of SAL-02
 *     without adding a headless-browser dependency (puppeteer et al) to the
 *     API.
 * What this does NOT do is open a cash drawer or cut the paper — those need
 * real ESC/POS control codes via a local print agent. Documented as the
 * remaining gap in docs/04-module-breakdown.md.
 *
 * All money/tax figures come pre-computed from GET /sales/:id/receipt; this
 * component formats and lays out, and calculates nothing.
 */

type Format = 'a4' | 'thermal';

function money(value: string | number): string {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * `useSearchParams()` forces this subtree to be client-rendered, and Next 15
 * requires it to sit under a Suspense boundary or `next build` fails the
 * page. The boundary lives here rather than in a parent layout so the rest
 * of the /sales routes are unaffected.
 */
export default function PrintInvoicePage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Loading receipt…</p>}>
      <PrintInvoice />
    </Suspense>
  );
}

function PrintInvoice() {
  const { ready, accessToken } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>(searchParams.get('format') === 'a4' ? 'a4' : 'thermal');

  const autoPrint = searchParams.get('auto') === '1';

  useEffect(() => {
    if (!ready || !accessToken || !params.id) return;
    getReceipt(accessToken, params.id)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load receipt'));
  }, [ready, accessToken, params.id]);

  useEffect(() => {
    // Wait for the receipt to actually be in the DOM before printing —
    // print() is synchronous and would otherwise capture a blank page.
    if (!autoPrint || !receipt) return;
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [autoPrint, receipt]);

  if (!ready) return null;
  if (error) return <p style={{ padding: 24, color: '#b3261e' }}>{error}</p>;
  if (!receipt) return <p style={{ padding: 24 }}>Loading receipt…</p>;

  const { invoice, items, payments, customer, store, branch, organization, gstSummary } = receipt;
  const hasIgst = gstSummary.some((g) => g.igst > 0.005);

  return (
    <>
      <style>{`
        @page { size: ${format === 'thermal' ? '80mm auto' : 'A4'}; margin: ${format === 'thermal' ? '3mm' : '12mm'}; }
        body { background: #f4f4f5; }
        .toolbar { display: flex; gap: 8px; align-items: center; padding: 12px 16px; background: #fff; border-bottom: 1px solid #ddd; position: sticky; top: 0; }
        .toolbar button { padding: 8px 16px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 14px; }
        .toolbar button.primary { background: #1b5e20; color: #fff; border-color: #1b5e20; }
        .sheet { background: #fff; margin: 16px auto; padding: ${format === 'thermal' ? '6mm 4mm' : '14mm'}; box-shadow: 0 1px 6px rgba(0,0,0,.15); }
        /* Explicit color is load-bearing here, not decorative: the root
           layout's <body> applies the app's --on-surface token (#1e2433,
           globals.css) as its default text color, and neither .sheet rule
           overrode it before. #1e2433 reads as "basically black" on any
           screen or laser/inkjet printer, but a thermal head thresholds
           color to a burn/no-burn decision per dot — it isn't literally
           #000000, so it dithers lighter than true black, which is why the
           *entire* receipt (not just the .muted lines) was printing faint
           on every thermal printer regardless of that printer's own
           darkness setting. */
        .sheet.thermal { width: 80mm; font-family: ui-monospace, 'Courier New', monospace; font-size: 11px; font-weight: 700; line-height: 1.35; color: #000; }
        .sheet.a4 { width: 210mm; min-height: 297mm; font-family: system-ui, sans-serif; font-size: 12px; color: #000; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: 700; }
        .muted { color: #555; }
        .rule { border-top: 1px dashed #999; margin: 6px 0; }
        .solid-rule { border-top: 1px solid #333; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        .a4 table.lines th, .a4 table.lines td { border: 1px solid #999; padding: 5px 6px; }
        .a4 table.lines th { background: #f0f0f0; text-align: left; font-size: 11px; }
        .thermal table td { padding: 1px 0; vertical-align: top; }
        .totals-row { display: flex; justify-content: space-between; }
        .a4-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .box { border: 1px solid #999; padding: 8px; }
        @media print {
          body { background: #fff; }
          .toolbar { display: none !important; }
          .sheet { margin: 0; padding: 0; box-shadow: none; width: auto; }
          /* Browsers default to print-color-adjust: economy, which lets the
             print pipeline lighten colors for ink economy instead of
             reproducing exactly what's specified — unlike raw GDI text
             (e.g. Notepad), which has no such layer and always prints at
             full black. That gap is why this receipt printed faint on the
             same printer/driver/paper that prints a Notepad file dark:
             every color on the page was being economy-adjusted before it
             ever reached the driver. "exact" forces literal reproduction. */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* .muted is a lighter #555 on screen for visual hierarchy, but a
             thermal printer only burns black-or-nothing — it can't render a
             mid-gray as anything but a faint, easy-to-miss dither. SKU lines,
             invoice labels, and the return-policy footer all use this class,
             so left unstyled here they print near-invisible even though the
             on-screen preview looks fine. Force solid black for print only. */
          .muted { color: #000; }
        }
      `}</style>

      <div className="toolbar">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <button onClick={() => setFormat('thermal')} disabled={format === 'thermal'}>
          80mm receipt
        </button>
        <button onClick={() => setFormat('a4')} disabled={format === 'a4'}>
          A4 tax invoice
        </button>
        <button onClick={() => window.close()}>Close</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
          Tip: choose &quot;Save as PDF&quot; in the print dialog to archive a copy.
        </span>
      </div>

      {format === 'thermal' ? (
        <div className="sheet thermal">
          {organization?.display_name ? (
            <div className="center bold" style={{ fontSize: 15 }}>
              {organization.display_name}
            </div>
          ) : null}
          <div className="center bold" style={{ fontSize: 14 }}>
            {store?.name ?? organization?.display_name ?? 'Store'}
          </div>
          {branch?.address_line1 ? <div className="center">{branch.address_line1}</div> : null}
          {branch?.city ? <div className="center">{branch.city}</div> : null}
          {branch?.phone ? <div className="center">Ph: {branch.phone}</div> : null}
          {store?.gstin ? <div className="center">GSTIN: {store.gstin}</div> : null}

          <div className="rule" />
          <div className="center bold">TAX INVOICE</div>
          <div className="rule" />

          <div className="totals-row">
            <span>Bill No:</span>
            <span className="bold">{invoice.invoice_number}</span>
          </div>
          <div className="totals-row">
            <span>Date:</span>
            <span>{new Date(invoice.invoice_date).toLocaleString('en-IN')}</span>
          </div>
          {receipt.cashierName ? (
            <div className="totals-row">
              <span>Cashier:</span>
              <span>{receipt.cashierName}</span>
            </div>
          ) : null}
          {customer && !customer.is_walkin ? (
            <div className="totals-row">
              <span>Customer:</span>
              <span>{customer.full_name}</span>
            </div>
          ) : null}

          <div className="rule" />
          <table>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td colSpan={2}>
                    <div>{item.productName}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {item.sku}
                      {item.attributes?.size ? ` · Size ${item.attributes.size}` : ''}
                    </div>
                    <div className="totals-row">
                      <span>
                        {Number(item.quantity)} x {money(item.unitPrice)}
                        {Number(item.discountAmount) > 0 ? ` (-${money(item.discountAmount)})` : ''}
                      </span>
                      <span className="bold">{money(item.lineTotal)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rule" />
          <div className="totals-row">
            <span>Subtotal</span>
            <span>{money(invoice.subtotal)}</span>
          </div>
          {Number(invoice.discount_total) > 0 ? (
            <div className="totals-row">
              <span>Discount</span>
              <span>-{money(invoice.discount_total)}</span>
            </div>
          ) : null}
          <div className="totals-row">
            <span>Tax</span>
            <span>{money(invoice.tax_total)}</span>
          </div>
          <div className="solid-rule" />
          <div className="totals-row bold" style={{ fontSize: 14 }}>
            <span>TOTAL</span>
            <span>₹{money(invoice.grand_total)}</span>
          </div>
          <div className="solid-rule" />

          {payments.map((p) => (
            <div className="totals-row" key={p.id}>
              <span style={{ textTransform: 'capitalize' }}>{p.payment_mode.replace('_', ' ')}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
          {receipt.balanceDue > 0.01 ? (
            <div className="totals-row bold">
              <span>Balance due (on account)</span>
              <span>{money(receipt.balanceDue)}</span>
            </div>
          ) : null}

          <div className="rule" />
          <div style={{ fontSize: 10 }}>{receipt.amountInWords}</div>
          <div className="rule" />
          <div className="center">Thank you for shopping with us!</div>
          <div className="center muted" style={{ fontSize: 11 }}>
            Goods once sold are subject to our return policy.
          </div>
        </div>
      ) : (
        <div className="sheet a4">
          <div className="center bold" style={{ fontSize: 16, marginBottom: 10 }}>
            TAX INVOICE
          </div>

          <div className="a4-header">
            <div style={{ flex: 1 }}>
              <div className="bold" style={{ fontSize: 15 }}>
                {store?.name ?? organization?.display_name}
              </div>
              {organization?.legal_name && organization.legal_name !== store?.name ? (
                <div className="muted">{organization.legal_name}</div>
              ) : null}
              {store?.address_line1 ? <div>{store.address_line1}</div> : null}
              {store?.address_line2 ? <div>{store.address_line2}</div> : null}
              <div>
                {[store?.city, store?.state, store?.postal_code].filter(Boolean).join(', ')}
              </div>
              {store?.gstin ? (
                <div className="bold" style={{ marginTop: 4 }}>
                  GSTIN: {store.gstin}
                </div>
              ) : null}
            </div>
            <div className="box" style={{ minWidth: 220 }}>
              <div className="totals-row">
                <span className="muted">Invoice No</span>
                <span className="bold">{invoice.invoice_number}</span>
              </div>
              <div className="totals-row">
                <span className="muted">Date</span>
                <span>{new Date(invoice.invoice_date).toLocaleString('en-IN')}</span>
              </div>
              {branch ? (
                <div className="totals-row">
                  <span className="muted">Branch</span>
                  <span>{branch.name}</span>
                </div>
              ) : null}
              {receipt.cashierName ? (
                <div className="totals-row">
                  <span className="muted">Billed by</span>
                  <span>{receipt.cashierName}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="box" style={{ marginTop: 12 }}>
            <span className="muted">Bill to: </span>
            <span className="bold">{customer?.full_name ?? 'Walk-in Customer'}</span>
            {customer?.phone ? <span> · {customer.phone}</span> : null}
            {customer?.gstin ? <span> · GSTIN: {customer.gstin}</span> : null}
          </div>

          <table className="lines" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 26 }}>#</th>
                <th>Item</th>
                <th style={{ width: 70 }}>HSN</th>
                <th className="right" style={{ width: 44 }}>
                  Qty
                </th>
                <th className="right" style={{ width: 70 }}>
                  Rate
                </th>
                <th className="right" style={{ width: 70 }}>
                  Discount
                </th>
                <th className="right" style={{ width: 60 }}>
                  Tax %
                </th>
                <th className="right" style={{ width: 70 }}>
                  Tax
                </th>
                <th className="right" style={{ width: 80 }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>
                    <div>{item.productName}</div>
                    <div className="muted" style={{ fontSize: 10 }}>
                      {item.sku}
                      {item.attributes?.size ? ` · Size ${item.attributes.size}` : ''}
                    </div>
                  </td>
                  <td>{item.hsnCode ?? '—'}</td>
                  <td className="right">{Number(item.quantity)}</td>
                  <td className="right">{money(item.unitPrice)}</td>
                  <td className="right">{money(item.discountAmount)}</td>
                  <td className="right">{item.ratePercent ? `${Number(item.ratePercent)}%` : '—'}</td>
                  <td className="right">{money(item.taxAmount)}</td>
                  <td className="right bold">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {gstSummary.length > 0 ? (
                <table className="lines">
                  <thead>
                    <tr>
                      <th>Tax rate</th>
                      <th className="right">Taxable value</th>
                      {hasIgst ? (
                        <th className="right">IGST</th>
                      ) : (
                        <>
                          <th className="right">CGST</th>
                          <th className="right">SGST</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {gstSummary.map((row) => (
                      <tr key={row.ratePercent}>
                        <td>{row.taxName}</td>
                        <td className="right">{money(row.taxableValue)}</td>
                        {hasIgst ? (
                          <td className="right">{money(row.igst)}</td>
                        ) : (
                          <>
                            <td className="right">{money(row.cgst)}</td>
                            <td className="right">{money(row.sgst)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <span className="muted">Amount in words: </span>
                <span className="bold">{receipt.amountInWords}</span>
              </div>
            </div>

            <div style={{ width: 260 }}>
              <div className="box">
                <div className="totals-row">
                  <span>Subtotal</span>
                  <span>{money(invoice.subtotal)}</span>
                </div>
                <div className="totals-row">
                  <span>Discount</span>
                  <span>-{money(invoice.discount_total)}</span>
                </div>
                <div className="totals-row">
                  <span>Tax</span>
                  <span>{money(invoice.tax_total)}</span>
                </div>
                <div className="solid-rule" />
                <div className="totals-row bold" style={{ fontSize: 15 }}>
                  <span>Grand total</span>
                  <span>₹{money(invoice.grand_total)}</span>
                </div>
                <div className="solid-rule" />
                {payments.map((p) => (
                  <div className="totals-row" key={p.id}>
                    <span style={{ textTransform: 'capitalize' }} className="muted">
                      {p.payment_mode.replace('_', ' ')}
                    </span>
                    <span>{money(p.amount)}</span>
                  </div>
                ))}
                {receipt.balanceDue > 0.01 ? (
                  <div className="totals-row bold" style={{ marginTop: 4 }}>
                    <span>Balance due</span>
                    <span>{money(receipt.balanceDue)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
            <div className="muted" style={{ fontSize: 10, maxWidth: 340 }}>
              This is a computer-generated invoice. Goods once sold are subject to our return policy.
            </div>
            <div className="center" style={{ width: 200 }}>
              <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
                For {store?.name ?? organization?.display_name}
              </div>
              <div className="muted" style={{ fontSize: 10 }}>
                Authorised signatory
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
