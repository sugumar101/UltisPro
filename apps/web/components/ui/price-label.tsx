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
  meta: 0.14, // product name + size/colour, single line
  code: 0.33, // barcode + SKU caption
  footer: 0.37, // selling price + MRP, stacked and centred
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
  /** Our own store/brand name, printed top-left. */
  brand: string;
  /** The garment's own brand (e.g. "Yoth Jeans"), printed top-right. Falls
   *  back to the gender strip when omitted, so labels for unbranded stock
   *  keep showing MEN/WOMEN/KIDS in that slot. */
  productBrand?: string;
  productName: string;
  size?: string;
  color?: string;
  barcode: string;
  /** Human-readable line under the bars — usually the SKU, not the EAN digits. */
  caption: string;
  /** Printed prominently — what the customer actually pays. */
  sellingPrice: number;
  /** Printed smaller beneath the selling price, retail-label convention (see DMart-style tags) — lets a shopper see the discount rather than just the final number. */
  mrp: number;
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

/**
 * Fits "name · Size: X   Color: Y" onto the one line the name band has.
 * Plain `truncateToWidth` on the concatenated string chops wherever the
 * character budget runs out, which — for a long product name — lands
 * mid-way through "Size:" and hides the value the label exists to show.
 * Colour is the least important part (staff can eyeball the garment), so
 * it's dropped first; the product name is shortened next, but the "Size: X"
 * suffix itself is never truncated, since a garment size is functional
 * information a torn-off fragment can't convey.
 */
function fitNameLine(name: string, size: string | undefined, color: string | undefined, fontSizeMm: number, availableMm: number): string {
  const maxChars = Math.max(1, Math.floor(availableMm / (fontSizeMm * 0.52)));
  const sizePart = size ? `Size: ${size}` : '';
  const colorPart = color ? `Color: ${color}` : '';

  const withBoth = [sizePart, colorPart].filter(Boolean).join('   ');
  const withBothLine = withBoth ? `${name}  ·  ${withBoth}` : name;
  if (withBothLine.length <= maxChars) return withBothLine;

  const withSizeLine = sizePart ? `${name}  ·  ${sizePart}` : name;
  if (withSizeLine.length <= maxChars) return withSizeLine;

  if (sizePart) {
    const suffix = `  ·  ${sizePart}`;
    const nameBudget = maxChars - suffix.length - 1;
    if (nameBudget >= 2) return `${name.slice(0, nameBudget)}…${suffix}`;
  }

  return truncateToWidth(withSizeLine, fontSizeMm, availableMm);
}

export function PriceLabel({
  widthMm,
  heightMm,
  safeInsetMm = 0,
  brand,
  productBrand,
  productName,
  size,
  color,
  barcode,
  caption,
  sellingPrice,
  mrp,
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
  const captionSize = innerH * 0.066;
  const mrpSize = innerH * 0.09;
  const priceSize = innerH * 0.2;

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

  // Size/colour ride on the same line as the product name rather than a line
  // of their own — one fewer line frees vertical space for a bigger price,
  // which matters more on a small tag than a second line ever did.
  const nameLine = fitNameLine(productName, size, color, nameSize, innerW);

  // SP and MRP are centred rather than right-anchored. A right-anchored
  // element is the first casualty when a thermal printer's real printable
  // width is narrower than the label — which is exactly how the price ended
  // up running off the edge before. Centring means any edge loss eats empty
  // margin on both sides instead of the numbers themselves.
  //
  // Both share one line rather than stacking on two. Stacked, the MRP line
  // ended up close enough to the label's physical bottom edge that it
  // stopped printing on some thermal printers even though it rendered fine
  // on screen — a single line needs far less total vertical space, so it
  // sits with generous clearance from both the divider above and the
  // physical edge below instead of right at the margin.
  //
  // Neither is ever truncated; if the combined text exceeds its width
  // budget both shrink together (same scale factor, so SP stays visually
  // bigger than MRP at any size) rather than either one clipping.
  const spText = `SP ₹ ${sellingPrice.toLocaleString('en-IN')}`;
  const mrpText = `MRP ₹ ${mrp.toLocaleString('en-IN')}`;
  const lineBudget = innerW * 0.92;
  const spBase = Math.min(priceSize, footerH * 0.46);
  // Was 0.5 — too small to read comfortably at a glance. 0.7 keeps MRP
  // clearly secondary to SP while actually being legible.
  const mrpBase = spBase * 0.7;
  // SVG collapses runs of literal whitespace when rendering text, so
  // padding the string with extra spaces (tried first) had no visible
  // effect — the gap has to be a real geometric offset instead. `gapW` is
  // sized off mrpBase (scales with the MRP tspan it precedes) and applied
  // via `dx` on that tspan below, not via characters.
  const gapW = mrpBase * 1.1;
  const naturalLineW = spText.length * spBase * 0.55 + gapW + mrpText.length * mrpBase * 0.55;
  const fitScale = naturalLineW > lineBudget ? lineBudget / naturalLineW : 1;
  const fittedSpSize = spBase * fitScale;
  const fittedMrpSize = mrpBase * fitScale;
  const fittedGapW = gapW * fitScale;

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

      {/* --- Header: our brand (left), garment brand or gender strip (right) --- */}
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

      {productBrand ? (
        <text
          x={widthMm - pad}
          y={headerY + brandSize * 0.82}
          fontSize={segmentSize * 1.25}
          fontWeight={700}
          fontFamily="system-ui, -apple-system, sans-serif"
          textAnchor="end"
          fill="#000000"
        >
          {truncateToWidth(productBrand, segmentSize * 1.25, innerW * 0.4)}
        </text>
      ) : showGenderStrip ? (
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

      {/* --- Product name + size/colour, one line --- */}
      <text
        x={pad}
        y={metaY + nameSize * 0.88}
        fontSize={nameSize}
        fontWeight={700}
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="#000000"
      >
        {nameLine}
      </text>

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

      {/* --- Footer: SP and MRP on one line --- */}
      <line
        x1={pad}
        y1={footerY}
        x2={widthMm - pad}
        y2={footerY}
        stroke="#000000"
        strokeWidth={heightMm * 0.009}
      />

      {/* Single <text> with both tspans (neither carries its own x), so
          textAnchor="middle" centres the SP+MRP pair as one unit rather
          than each independently. Positioned at 0.65 of the footer band —
          with only one line to place instead of two, there's comfortable
          clearance from both the divider above and the physical label edge
          below without needing to tune it against either. */}
      <text
        x={widthMm / 2}
        y={footerY + footerH * 0.65}
        fontFamily="system-ui, -apple-system, sans-serif"
        textAnchor="middle"
        fill="#000000"
      >
        <tspan fontSize={fittedSpSize} fontWeight={800} letterSpacing={-fittedSpSize * 0.02}>
          {spText}
        </tspan>
        <tspan dx={fittedGapW} fontSize={fittedMrpSize} fontWeight={600}>
          {' '}
          {mrpText}
        </tspan>
      </text>
    </svg>
  );
}
