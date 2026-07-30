'use client';

import { encodeEan13, isGuardModule, isValidEan13 } from '../../lib/ean13';

interface BarcodeProps {
  value: string;
  /** Height of the bars in px (excludes the human-readable digits below). */
  height?: number;
  /** Width of one module in px. 2 is comfortable on screen; 1.4–2 prints well. */
  moduleWidth?: number;
  /** Show the human-readable line underneath — standard on retail labels. */
  showText?: boolean;
  /**
   * Overrides the text printed under the bars. Retail labels often show the
   * SKU (`ULT-TS-000124`) rather than the raw EAN digits, since that's what
   * staff quote to each other. The *encoded* value is always `value`
   * regardless — this only changes the caption a human reads.
   */
  caption?: string;
  className?: string;
}

/**
 * Renders a scannable EAN-13 barcode as inline SVG.
 *
 * SVG rather than a canvas or an image so it stays crisp at any print DPI —
 * a rasterised barcode at 96dpi frequently fails to scan once printed on a
 * small label, which is exactly the failure mode that makes people distrust
 * software-generated barcodes.
 *
 * Renders a plain-text fallback for anything that isn't a valid EAN-13
 * (including user-supplied manufacturer codes in other symbologies) rather
 * than drawing a symbol that would scan as the wrong number.
 */
export function Barcode({
  value,
  height = 52,
  moduleWidth = 2,
  showText = true,
  caption,
  className,
}: BarcodeProps) {
  const modules = encodeEan13(value);

  if (!modules || !isValidEan13(value)) {
    return (
      <div className={className}>
        <span className="font-mono-data text-xs text-on-surface-variant">{caption ?? value ?? '—'}</span>
      </div>
    );
  }

  // Guard bars extend below the data bars, into the text band.
  const guardExtra = showText ? 8 : 0;
  const width = modules.length * moduleWidth;
  const totalHeight = height + guardExtra + (showText ? 12 : 0);

  const bars: { x: number; w: number; h: number }[] = [];
  let index = 0;
  while (index < modules.length) {
    if (modules[index] === '1') {
      // Merge runs of adjacent bars into one rect — fewer nodes, and avoids
      // hairline seams between abutting rects at some zoom levels.
      let run = 1;
      while (index + run < modules.length && modules[index + run] === '1') run++;
      bars.push({
        x: index * moduleWidth,
        w: run * moduleWidth,
        h: isGuardModule(index) ? height + guardExtra : height,
      });
      index += run;
    } else {
      index++;
    }
  }

  return (
    <svg
      className={className}
      width={width}
      height={totalHeight}
      viewBox={`0 0 ${width} ${totalHeight}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect width={width} height={totalHeight} fill="#ffffff" />
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={0} width={bar.w} height={bar.h} fill="#000000" />
      ))}
      {showText ? (
        <text
          x={width / 2}
          y={totalHeight - 1}
          textAnchor="middle"
          fontSize={11}
          fontFamily="ui-monospace, monospace"
          letterSpacing={caption ? 0.5 : 2}
          fill="#000000"
        >
          {caption ?? value}
        </text>
      ) : null}
    </svg>
  );
}
