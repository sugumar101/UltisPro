/**
 * Converts a rupee amount to words using the **Indian** numbering system
 * (thousand -> lakh -> crore), not the short scale (thousand -> million ->
 * billion). A GST tax invoice conventionally prints the total in words as a
 * tamper-check on the numeric figure, and Indian invoices always use this
 * grouping -- 150000 is "One Lakh Fifty Thousand", never "One Hundred Fifty
 * Thousand".
 *
 * Paise are rounded to 2 decimals and rendered as a separate "and N Paise"
 * clause, matching the usual printed format.
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Handles 0-99. Values 0-19 are irregular in English and come from the lookup table. */
function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

/** Handles 0-999. */
function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return twoDigitsToWords(rest);
  if (rest === 0) return `${ONES[hundreds]} Hundred`;
  return `${ONES[hundreds]} Hundred ${twoDigitsToWords(rest)}`;
}

/**
 * Integer part only, grouped the Indian way: the lowest three digits, then
 * two-digit groups (thousand, lakh, crore) above that.
 */
function integerToWords(n: number): string {
  if (n === 0) return 'Zero';

  const parts: string[] = [];

  const crore = Math.floor(n / 10_000_000);
  if (crore > 0) {
    // Crores above 99 recurse, so "1,00,00,00,000" reads as
    // "One Hundred Crore" rather than needing a separate scale word.
    parts.push(`${integerToWords(crore)} Crore`);
    n %= 10_000_000;
  }

  const lakh = Math.floor(n / 100_000);
  if (lakh > 0) {
    parts.push(`${twoDigitsToWords(lakh)} Lakh`);
    n %= 100_000;
  }

  const thousand = Math.floor(n / 1000);
  if (thousand > 0) {
    parts.push(`${twoDigitsToWords(thousand)} Thousand`);
    n %= 1000;
  }

  if (n > 0) parts.push(threeDigitsToWords(n));

  return parts.join(' ');
}

export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return '';

  const negative = amount < 0;
  const absolute = Math.abs(amount);

  // Round to paise first so 0.005 cases don't drift between the rupee and
  // paise halves below.
  const totalPaise = Math.round(absolute * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  let words = `${integerToWords(rupees)} Rupees`;
  if (paise > 0) words += ` and ${twoDigitsToWords(paise)} Paise`;
  words += ' Only';

  return negative ? `Minus ${words}` : words;
}
