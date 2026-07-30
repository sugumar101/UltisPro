/**
 * Minimal CSV serializer for report exports (docs/04-module-breakdown.md
 * M11's `/reports/:name/export`, folded into each report endpoint via
 * `?format=csv` rather than a separate route — see
 * docs/05-development-roadmap.md Phase 6 notes). Not a full RFC 4180
 * implementation (no embedded-newline support), which is sufficient for
 * flat aggregate rows of numbers/dates/short strings.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
