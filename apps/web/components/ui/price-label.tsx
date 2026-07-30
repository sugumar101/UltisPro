'use client';

import { getBarRuns, isValidEan13, EAN13_MODULE_COUNT } from '../../lib/ean13';

/**
 * A retail price tag rendered as a **single SVG with a viewBox in millimetres**.
 *
 * The earlier CSS-flex version overflowed: the label box was sized in mm
 * while the barcode inside it was a fixed-pixel SVG, so on smaller labels the
 * footer got clipped by `overflow: hidden`. Laying the whole tag out in one
 * SVG coordinate system fixes that structurally rather than by tuning
 * numbers — every element is positioned as a fraction of the label's own
 * dimensions, so the content cannot exceed the label at any size, and the
 * browser scales the whole thing crisply at print DPI.
 *
 * Vertical space is divided into four bands that always sum to 1. Changing
 * one band's share automatically reflows the rest.
 */

const BANDS = {
  header: 0.16, // brand + gender strip
  meta: 0.19, // product name + size/colour
  code: 0.37, // barcode + SKU caption
  footer: 0.28, // MRP caption + price, stacked and centred
};

const GENDER_SEGMENTS = ['MEN', 'WOMEN', 'KIDS'] as const;

export interface PriceLabelProps {
  widthMm: number;
  heightMm: number;
  /**
   * Extra inset in mm on every edge, on top of the normal padding. Thermal
   * printers vary in how close to the physical label edge they can actually
   * print, and a right-anchored element is the first thing to get clipped —
   * this lets a shop dial the layout in for its own hardware without
   * changing label stock.
   */
  safeInsetMm?: number;
  brand: string;
  productName: string;
  size?: string;
  color?: string;
  barcode: string;
  /** Human-readable line under the bars — usually the SKU, not the EAN digits. */
  caption: string;
  price: number;
  /** Which of MEN/WOMEN/KIDS to emphasise; empty highlights none (unisex). */
  activeSegments: string[];
  showGenderStrip?: boolean;
}

/**
 * SVG has no text wrapping or ellipsis, so long names are truncated by
 * estimating rendered width. 0.52em average advance is a decent
 * approximation for a humanist sans at these sizes — erring slightly short
 * is safe, erring long would overflow.
 */
function truncateToWidth(text: string, fontSizeMm: number, availableMm: number): string {
  const maxChars = Math.floor(availableMm / (fontSizeMm * 0.52));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function PriceLabel({
  widthMm,
  heightMm,
  safeInsetMm = 0,
  brand,
  productName,
  size,
  color,
  barcode,
  caption,
  price,
  activeSegments,
  showGenderStrip = true,
}: PriceLabelProps) {
  // Padding scales with the label so a 38mm tag isn't proportionally emptier
  // than a 50mm one, plus any printer-specific safety inset.
  const pad = Math.max(1, widthMm * 0.035) + safeInsetMm;
  const innerW = widthMm - pad * 2;

  // The bands divide the space *between* the paddings, not the full label
  // height. Dividing the full height and then offsetting by `pad` is exactly
  // the bug that pushed the footer `pad` millimetres past the bottom edge and
  // let overflow clip the "(incl. of all taxes)" line.
  const innerH = heightMm - pad * 2;

  const headerH = innerH * BANDS.header;
  const metaH = innerH * BANDS.meta;
  const codeH = innerH * BANDS.code;
  const footerH = innerH * BANDS.footer;

  const headerY = pad;
  const metaY = headerY + headerH;
  const codeY = metaY + metaH;
  const footerY = codeY + codeH;
  // footerY + footerH === heightMm - pad, by construction.

  // Type scale derived from the *inner* height for the same reason.
  const brandSize = innerH * 0.125;
  const segmentSize = innerH * 0.055;
  const nameSize = innerH * 0.09;
  const attrSize = innerH * 0.068;
  const captionSize = innerH * 0.066;
  const mrpSize = innerH * 0.058;
  const priceSize = innerH * 0.135;

  const runs = getBarRuns(barcode);
  const validBarcode = runs !== null && isValidEan13(barcode);

  // EAN-13 requires clear "quiet zones" either side of the symbol — 9 modules
  // left and 7 right — or scanners cannot reliably find the symbol edges.
  // Budgeting for them here (rather than letting bars run to the padding)
  // is a scannability requirement, not styling.
  const QUIET_LEFT = 9;
  const QUIET_RIGHT = 7;
  // Held to 94% of the inner width and centred, so the symbol keeps clear of
  // the edges even if the printer's usable width is slightly under the label.
  const codeW = innerW * 0.94;
  const codeX = (widthMm - codeW) / 2;
  const moduleW = codeW / (EAN13_MODULE_COUNT + QUIET_LEFT + QUIET_RIGHT);
  const barsX = codeX + QUIET_LEFT * moduleW;

  // Bars occupy the code band minus room for the caption beneath them.
  const captionBand = captionSize * 1.35;
  const guardExtraRatio = 0.06;
  const barsH = Math.max(2, (codeH - captionBand) / (1 + guardExtraRatio));
  const guardExtra = barsH * guardExtraRatio;

  const attrs = [size ? `Size: ${size}` : null, color ? `Color: ${color}` : null].filter(Boolean).join('   ');

  // The price is centred rather than right-anchored. A right-anchored element
  // is the first casualty when a thermal printer's real printable width is
  // narrower than the label — which is exactly how the price ended up
  // running off the edge. Centring means any edge loss eats empty margin on
  // both sides instead of the most important number on the tag.
  //
  // It is never truncated either; if a large figure (₹ 1,29,999) exceeds its
  // budget the type shrinks, because a clipped price is worse than a small one.
  const priceText = `₹ ${price.toLocaleString('en-IN')}`;
  const priceBudget = innerW * 0.9;
  const priceCapped = Math.min(priceSize, footerH * 0.5);
  const naturalPriceW = priceText.length * priceCapped * 0.55;
  const fittedPriceSize =
    naturalPriceW > priceBudget ? priceCapped * (priceBudget / naturalPriceW) : priceCapped;

  return (
    <svg
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      width={`${widthMm}mm`}
      height={`${heightMm}mm`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Price label for ${productName}`}
      style={{ display: 'block' }}
    >
      <rect width={widthMm} height={heightMm} fill="#ffffff" />

      {/* --- Header: brand, gender strip, rule --- */}
      <text
        x={pad}
        y={headerY + brandSize * 0.82}
        fontSize={brandSize}
        fontWeight={800}
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing={-brandSize * 0.03}
        fill="#000000"
      >
        {truncateToWidth(brand, brandSize, innerW * 0.55)}
      </text>

      {showGenderStrip ? (
        <text
          x={widthMm - pad}
          y={headerY + brandSize * 0.75}
          fontSize={segmentSize}
          fontWeight={600}
          fontFamily="system-ui, -apple-system, sans-serif"
          textAnchor="end"
          letterSpacing={segmentSize * 0.06}
          fill="#000000"
        >
          {GENDER_SEGMENTS.map((segment, i) => (
            <tspan key={segment} fill={activeSegments.includes(segment) ? '#000000' : '#a8adbd'}>
              {i > 0 ? '  ' : ''}
              {segment}
            </tspan>
          ))}
        </text>
      ) : null}

      <line
        x1={pad}
        y1={metaY - metaH * 0.12}
        x2={widthMm - pad}
        y2={metaY - metaH * 0.12}
        stroke="#000000"
        strokeWidth={heightMm * 0.012}
      />

      {/* --- Product name + attributes --- */}
      <text
        x={pad}
        y={metaY + nameSize * 0.88}
        fontSize={nameSize}
        fontWeight={700}
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="#000000"
      >
        {truncateToWidth(productName, nameSize, innerW)}
      </text>

      {attrs ? (
        <text
          x={pad}
          y={metaY + nameSize * 0.88 + attrSize * 1.25}
          fontSize={attrSize}
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="#000000"
        >
          {truncateToWidth(attrs, attrSize, innerW)}
        </text>
      ) : null}

      {/* --- Barcode --- */}
      {validBarcode ? (
        <>
          {runs.map((run, i) => (
            <rect
              key={i}
              x={barsX + run.start * moduleW}
              y={codeY}
              width={run.width * moduleW}
              height={run.isGuard ? barsH + guardExtra : barsH}
              fill="#000000"
            />
          ))}
          <text
            x={widthMm / 2}
            y={codeY + barsH + guardExtra + captionSize}
            fontSize={captionSize}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            textAnchor="middle"
            letterSpacing={captionSize * 0.08}
            fill="#000000"
          >
            {truncateToWidth(caption, captionSize * 0.62, innerW)}
          </text>
        </>
      ) : (
        <text
          x={widthMm / 2}
          y={codeY + codeH * 0.55}
          fontSize={captionSize}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          fill="#000000"
        >
          {caption || 'No barcode'}
        </text>
      )}

      {/* --- Footer: MRP + price --- */}
      <line
        x1={pad}
        y1={footerY}
        x2={widthMm - pad}
        y2={footerY}
        stroke="#000000"
        strokeWidth={heightMm * 0.009}
      />

      {/* Footer: caption then price, both centred and stacked. Positions are
          fractions of the footer band rather than multiples of their own font
          size, so the price's descender always lands inside the band. */}
      <text
        x={widthMm / 2}
        y={footerY + footerH * 0.3}
        fontSize={mrpSize * 0.95}
        fontWeight={600}
        fontFamily="system-ui, -apple-system, sans-serif"
        textAnchor="middle"
        fill="#000000"
      >
        MRP (incl. of all taxes)
      </text>

      <text
        x={widthMm / 2}
        y={footerY + footerH * 0.88}
        fontSize={fittedPriceSize}
        fontWeight={800}
        fontFamily="system-ui, -apple-system, sans-serif"
        textAnchor="middle"
        letterSpacing={-fittedPriceSize * 0.02}
        fill="#000000"
      >
        {priceText}
      </text>
    </svg>
  );
}
