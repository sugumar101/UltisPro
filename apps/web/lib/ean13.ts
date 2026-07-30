/**
 * EAN-13 symbol encoding — turns a 13-digit barcode string into the bar/space
 * module pattern a scanner reads.
 *
 * Written by hand rather than pulled from a package because the repo has no
 * lockfile yet and adding a barcode library for ~60 lines of table lookup
 * isn't worth the dependency. The encoding is a fixed, decades-stable
 * standard, so there's nothing here that needs maintaining.
 *
 * Structure of the 95-module symbol:
 *   start guard (101) | 6 left digits x 7 | centre guard (01010) |
 *   6 right digits x 7 | end guard (101)
 *
 * The 13th digit is never drawn directly: the *first* digit is encoded
 * implicitly, by which mix of L/G parity patterns the six left-hand digits
 * use. That's why an EAN-13 fits in the same space as a 12-digit symbol.
 */

const L_CODES = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

const G_CODES = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];

const R_CODES = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];

/** Which of L/G each of the six left digits uses, selected by the first digit. */
const PARITY_PATTERNS = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const START_GUARD = '101';
const CENTRE_GUARD = '01010';
const END_GUARD = '101';

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/**
 * Returns the 95-character module string ('1' = bar, '0' = space), or null
 * if the input isn't a well-formed EAN-13. Callers render null as a plain
 * text fallback rather than drawing an unscannable symbol.
 */
export function encodeEan13(code: string): string | null {
  if (!/^\d{13}$/.test(code)) return null;

  const digits = code.split('').map(Number);
  const pattern = PARITY_PATTERNS[digits[0]];

  let left = '';
  for (let i = 0; i < 6; i++) {
    const digit = digits[i + 1];
    left += pattern[i] === 'L' ? L_CODES[digit] : G_CODES[digit];
  }

  let right = '';
  for (let i = 0; i < 6; i++) {
    right += R_CODES[digits[i + 7]];
  }

  return START_GUARD + left + CENTRE_GUARD + right + END_GUARD;
}

/**
 * Module indices belonging to the three guard patterns. Guard bars are drawn
 * slightly taller than data bars on a real barcode — purely conventional,
 * but its absence is what makes a hand-drawn barcode look wrong.
 */
export function isGuardModule(index: number): boolean {
  return (
    index < 3 || // start
    (index >= 45 && index < 50) || // centre
    index >= 92 // end
  );
}

export interface BarRun {
  /** Start position in module units (0–95). */
  start: number;
  /** Width in module units. */
  width: number;
  isGuard: boolean;
}

/** Total module count of an EAN-13 symbol — the unit width callers scale against. */
export const EAN13_MODULE_COUNT = 95;

/**
 * Collapses the module string into runs of adjacent bars, in module units so
 * the caller can scale them into whatever coordinate system it's drawing in
 * (px on screen, mm on a label). Merging runs also avoids hairline seams
 * between abutting rects at fractional scales.
 */
export function getBarRuns(code: string): BarRun[] | null {
  const modules = encodeEan13(code);
  if (!modules) return null;

  const runs: BarRun[] = [];
  let index = 0;
  while (index < modules.length) {
    if (modules[index] === '1') {
      let width = 1;
      while (index + width < modules.length && modules[index + width] === '1') width++;
      runs.push({ start: index, width, isGuard: isGuardModule(index) });
      index += width;
    } else {
      index++;
    }
  }
  return runs;
}
