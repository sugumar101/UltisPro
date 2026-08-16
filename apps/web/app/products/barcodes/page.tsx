'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '../../../lib/hooks/use-require-auth';
import { getProduct, listBrands, type Product, type ProductVariant, type Brand } from '../../../lib/products-api';
import { getOrganization } from '../../../lib/settings-api';
import { Barcode } from '../../../components/ui/barcode';
import { PriceLabel } from '../../../components/ui/price-label';
import { ApiError } from '../../../lib/api-client';

/**
 * Retail price labels, sized for a roll/thermal label printer.
 *
 * One label per printed page (`@page` + a page break after each), which is
 * how a label printer expects input — it feeds and cuts per page. Products
 * expand to one label per **variant**, because in a clothing shop the thing
 * that needs a label is the size, not the style.
 *
 * Two templates:
 *  - `price-tag`  — the full retail tag: brand header, gender strip, product
 *                   name, size/colour, barcode, and MRP with the
 *                   "inclusive of all taxes" line Indian retail requires.
 *  - `compact`    — name + barcode + price only, for small labels where the
 *                   tag layout would be unreadable.
 */

const LABEL_PRESETS = {
  '50x30': { label: '50 × 30 mm', width: 50, height: 30 },
  '50x25': { label: '50 × 25 mm', width: 50, height: 25 },
  '40x30': { label: '40 × 30 mm', width: 40, height: 30 },
  '38x25': { label: '38 × 25 mm', width: 38, height: 25 },
  '75x50': { label: '75 × 50 mm', width: 75, height: 50 },
} as const;

type PresetKey = keyof typeof LABEL_PRESETS;
type Template = 'price-tag' | 'compact';

/**
 * Maps a product's stored gender onto the segments printed on the tag. Boy
 * and girl both fall under KIDS; unisex highlights nothing, since the tag
 * then applies to all three. The segment strip itself lives in PriceLabel.
 */
function activeSegments(gender: string | null): string[] {
  switch (gender) {
    case 'men':
      return ['MEN'];
    case 'women':
      return ['WOMEN'];
    case 'boy':
    case 'girl':
      return ['KIDS'];
    default:
      return [];
  }
}

/**
 * Compact template price size, in mm.
 *
 * Previously a fixed `8.5pt` regardless of label size, which read fine on a
 * 50×30mm label but was disproportionately small on a 75×50mm one and, per
 * user report, small even at the default size. Deriving it from the label's
 * own height — mirroring `PriceLabel`'s mm-based scaling — keeps the price
 * proportionate at every preset. Capped against the label width too, since
 * a large rupee figure (₹1,29,999) on a narrow label would otherwise overflow
 * before it could wrap (SVG-free flow layout has no ellipsis to fall back on).
 */
function compactPriceSizeMm(widthMm: number, heightMm: number, priceText: string): number {
  const budget = widthMm * 0.86;
  const capped = Math.max(3, heightMm * 0.16);
  const naturalWidth = priceText.length * capped * 0.55;
  return naturalWidth > budget ? capped * (budget / naturalWidth) : capped;
}

/** Compact template name size, in mm — same rationale as the price above. */
function compactNameSizeMm(heightMm: number): number {
  return Math.max(1.8, heightMm * 0.075);
}

interface LabelRow {
  key: string;
  product: Product;
  variant: ProductVariant;
}

export default function BarcodeLabelsPage() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Loading labels…</p>}>
      <BarcodeLabels />
    </Suspense>
  );
}

function BarcodeLabels() {
  const { ready, accessToken } = useRequireAuth();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<LabelRow[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [preset, setPreset] = useState<PresetKey>('50x30');
  const [template, setTemplate] = useState<Template>('price-tag');
  const [copies, setCopies] = useState(1);
  // Default on: re-labelling stock you already have means every physical
  // item should get its own label, so a size with 2 in stock prints 2
  // copies without anyone having to notice and set "Copies each" per size
  // by hand. Turning it off falls back to the flat "Copies each" count —
  // e.g. for pre-printing labels ahead of stock actually arriving.
  const [matchStockCopies, setMatchStockCopies] = useState(true);
  const [headerOverride, setHeaderOverride] = useState('');
  // Thermal printers differ in how close to the physical label edge they can
  // print; nudge this up if anything clips on your hardware.
  const [safeInset, setSafeInset] = useState(0);

  const ids = useMemo(() => (searchParams.get('ids') ?? '').split(',').filter(Boolean), [searchParams]);
  // Optional — narrows the products in `ids` down to specific variants
  // (e.g. one size), rather than every variant those products have. Absent,
  // every variant of every requested product prints, same as before.
  const variantIds = useMemo(
    () => (searchParams.get('variantIds') ?? '').split(',').filter(Boolean),
    [searchParams],
  );

  useEffect(() => {
    if (!ready || !accessToken || ids.length === 0) {
      setLoading(false);
      return;
    }

    Promise.all([
      Promise.all(ids.map((id) => getProduct(accessToken, id))),
      listBrands(accessToken).catch(() => [] as Brand[]),
      getOrganization(accessToken).catch(() => null),
    ])
      .then(([results, brandList, organization]) => {
        const wantVariant = variantIds.length > 0 ? new Set(variantIds) : null;
        const next: LabelRow[] = [];
        for (const result of results) {
          for (const variant of result.variants) {
            if (wantVariant && !wantVariant.has(variant.id)) continue;
            next.push({ key: variant.id, product: result.product, variant });
          }
        }
        setRows(next);
        setBrands(brandList);
        if (organization) setOrgName(organization.display_name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load products'))
      .finally(() => setLoading(false));
  }, [ready, accessToken, ids, variantIds]);

  /**
   * Our own store identity, top-left on the tag — a manual override if set,
   * else the organisation's name. The garment's own brand (if any) prints
   * separately via `productBrandFor`, so it no longer displaces this.
   */
  function headerFor(): string {
    if (headerOverride.trim()) return headerOverride.trim();
    return orgName ?? '';
  }

  /** The garment's own brand, top-right on the tag — e.g. "Yoth Jeans". */
  function productBrandFor(product: Product): string {
    const brand = brands.find((b) => b.id === product.brand_id);
    return brand?.name ?? '';
  }

  if (!ready) return null;

  const size = LABEL_PRESETS[preset];
  const printableLabels = rows.flatMap((row) => {
    const count = matchStockCopies ? row.variant.stockOnHand ?? 0 : copies;
    return Array.from({ length: count }, (_, i) => ({ ...row, copy: i }));
  });
  // The tag scales to any label, so it can't clip — but below roughly this
  // size the type gets small enough to be worth warning about.
  const tagIsComfortable = size.width >= 40 && size.height >= 25;

  return (
    <>
      <style>{`
        @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
        body { background: #f6f7fb; }
        .toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
                   padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e6ef; }
        .toolbar button { padding: 8px 16px; border-radius: 8px; border: 1px solid #e2e6ef; background: #fff;
                          cursor: pointer; font-size: 14px; transition: all .2s cubic-bezier(.32,.72,0,1); }
        .toolbar button:hover { border-color: #9aa2b8; }
        .toolbar button.primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        .toolbar button.primary:hover { background: #4338ca; }
        .toolbar select, .toolbar input { padding: 7px 10px; border-radius: 8px; border: 1px solid #e2e6ef; font-size: 14px; }
        .sheet { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px; }
        .empty { padding: 40px; text-align: center; color: #5c6478; font-family: system-ui, sans-serif; }

        /* The price-tag template is a single self-sizing SVG, so the box only
           needs to be exactly the label and never clip. The compact template
           still uses flow layout inside it. */
        .label {
          width: ${size.width}mm; height: ${size.height}mm;
          background: #fff; border: 1px solid #e2e6ef; border-radius: 3px;
          box-sizing: border-box; overflow: hidden;
          font-family: system-ui, -apple-system, sans-serif; color: #000;
          display: flex; flex-direction: column;
        }

        /* --- Compact template --- */
        /* Font sizes are set inline in mm (see compactPriceSizeMm/compactNameSizeMm)
           rather than fixed here, so they scale with the chosen label size instead
           of staying a constant point size on every preset. */
        .compact { align-items: center; justify-content: center; padding: 1.5mm; text-align: center; }
        .compact .name { font-family: system-ui, sans-serif; font-weight: 600; line-height: 1.15;
                         max-height: 2.4em; overflow: hidden; margin-bottom: 0.5mm; }
        .compact .price { font-family: system-ui, sans-serif; font-weight: 700; margin-top: 0.5mm; }

        @media print {
          body { background: #fff; }
          .toolbar { display: none !important; }
          .sheet { display: block; padding: 0; gap: 0; }
          .label { border: none; border-radius: 0; page-break-after: always; break-after: page; }
          .label:last-child { page-break-after: auto; break-after: auto; }
          /* Browsers default to print-color-adjust: economy, which permits
             lightening colours for ink economy instead of reproducing them
             exactly as specified. Every fill on this label is already
             literal #000, but this closes off that whole class of "renders
             correctly on screen, comes out wrong on paper" failure — the
             same gap that turned out to be the cause of a receipt printing
             faint despite identical-looking source markup. */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="toolbar">
        <button className="primary" onClick={() => window.print()} disabled={printableLabels.length === 0}>
          Print{' '}
          {printableLabels.length > 0
            ? `${printableLabels.length} label${printableLabels.length === 1 ? '' : 's'}`
            : ''}
        </button>

        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          Template
          <select value={template} onChange={(e) => setTemplate(e.target.value as Template)}>
            <option value="price-tag">Price tag</option>
            <option value="compact">Compact</option>
          </select>
        </label>

        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          Label size
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetKey)}>
            {Object.entries(LABEL_PRESETS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          Header
          <input
            placeholder="Brand / store name"
            value={headerOverride}
            style={{ width: 150 }}
            onChange={(e) => setHeaderOverride(e.target.value)}
          />
        </label>

        <label
          style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
          title="One label per item in stock — a size with 2 on hand prints 2 copies. Turn off to set a flat count instead."
        >
          <input
            type="checkbox"
            checked={matchStockCopies}
            onChange={(e) => setMatchStockCopies(e.target.checked)}
          />
          Copies = stock on hand
        </label>

        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, opacity: matchStockCopies ? 0.5 : 1 }}>
          Copies each
          <input
            type="number"
            min={1}
            max={50}
            value={copies}
            disabled={matchStockCopies}
            style={{ width: 66 }}
            onChange={(e) => setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          />
        </label>

        <label
          style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
          title="Extra margin on every edge. Increase if your printer clips the label."
        >
          Edge margin
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={safeInset}
            style={{ width: 66 }}
            onChange={(e) => setSafeInset(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
          />
          mm
        </label>

        <button onClick={() => window.close()}>Close</button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5c6478' }}>
          Print at 100% scale (no “fit to page”) — resizing breaks scannability. If edges clip, raise Edge margin.
        </span>
      </div>

      {error ? (
        <p className="empty" style={{ color: '#dc2626' }}>
          {error}
        </p>
      ) : null}
      {loading ? <p className="empty">Loading labels…</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="empty">No products selected. Pick products on the Products page and choose “Print barcodes”.</p>
      ) : null}
      {!loading && !error && rows.length > 0 && printableLabels.length === 0 ? (
        <p className="empty" style={{ color: '#d97706' }}>
          Nothing to print — every selected variant shows 0 in stock, and copies are set to match stock on hand.
          Turn that off above to print a flat number of copies instead.
        </p>
      ) : null}
      {!loading && template === 'price-tag' && !tagIsComfortable ? (
        <p className="empty" style={{ color: '#d97706', paddingBottom: 0 }}>
          Everything still fits at this size, but the text will be small. 40 × 25 mm or larger reads more comfortably —
          or switch to the Compact template.
        </p>
      ) : null}

      <div className="sheet">
        {printableLabels.map((row, index) => {
          const { product, variant } = row;
          const size_ = variant.attributes?.size;
          const color = variant.attributes?.color;
          const price = Number(variant.mrp) || Number(variant.selling_price);
          const on = activeSegments(product.gender);

          return (
            <div className="label" key={`${row.key}-${row.copy}-${index}`}>
              {template === 'price-tag' ? (
                <PriceLabel
                  widthMm={size.width}
                  heightMm={size.height}
                  safeInsetMm={safeInset}
                  brand={headerFor()}
                  productBrand={productBrandFor(product)}
                  productName={product.name}
                  size={size_}
                  color={color}
                  barcode={variant.barcode ?? ''}
                  caption={variant.sku}
                  sellingPrice={Number(variant.selling_price)}
                  mrp={Number(variant.mrp)}
                  activeSegments={on}
                />
              ) : (
                <div className="compact" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div className="name" style={{ fontSize: `${compactNameSizeMm(size.height)}mm` }}>
                    {product.name}
                    {size_ ? ` · ${size_}` : ''}
                  </div>
                  <Barcode
                    value={variant.barcode ?? ''}
                    caption={variant.sku}
                    height={size.height > 26 ? 40 : 30}
                    moduleWidth={1.3}
                    physicalWidthMm={size.width * 0.82}
                  />
                  <div
                    className="price"
                    style={{ fontSize: `${compactPriceSizeMm(size.width, size.height, `₹${price.toLocaleString('en-IN')}`)}mm` }}
                  >
                    ₹{price.toLocaleString('en-IN')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
