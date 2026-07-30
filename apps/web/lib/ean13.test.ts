import { describe, expect, it } from 'vitest';
import { encodeEan13, isValidEan13, isGuardModule, getBarRuns, EAN13_MODULE_COUNT } from './ean13';

/**
 * The encoder has to be exactly right or printed labels silently fail to
 * scan — the worst kind of bug, because it only shows up at the till. These
 * assertions pin the symbol structure against the published EAN-13 spec.
 */

describe('isValidEan13', () => {
  it('accepts real barcodes with correct check digits', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('5901234123457')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidEan13('4006381333932')).toBe(false);
  });

  it('rejects anything that is not 13 digits', () => {
    expect(isValidEan13('123')).toBe(false);
    expect(isValidEan13('40063813339311')).toBe(false);
    expect(isValidEan13('400638133393X')).toBe(false);
    expect(isValidEan13('')).toBe(false);
  });
});

describe('encodeEan13', () => {
  it('produces a 95-module symbol', () => {
    const modules = encodeEan13('5901234123457');
    expect(modules).not.toBeNull();
    expect(modules).toHaveLength(95);
  });

  it('places the three guard patterns correctly', () => {
    const modules = encodeEan13('5901234123457')!;
    expect(modules.slice(0, 3)).toBe('101'); // start
    expect(modules.slice(45, 50)).toBe('01010'); // centre
    expect(modules.slice(92)).toBe('101'); // end
  });

  it('encodes the first digit through left-hand parity rather than drawing it', () => {
    // First digit 0 => all six left digits use L-codes. L-codes always start
    // with 0 and end with 1; G-codes are their reverse-complement, so the
    // parity choice is observable in the encoding.
    const zeroLead = encodeEan13('0123456789012')!;
    const firstLeftDigit = zeroLead.slice(3, 10);
    expect(firstLeftDigit).toBe('0011001'); // L-code for 1

    // First digit 5 => pattern LGGLLG, so the second left digit (0) uses a
    // G-code where a leading digit of 0 would have used an L-code.
    const fiveLead = encodeEan13('5901234123457')!;
    expect(fiveLead.slice(10, 17)).toBe('0100111'); // G-code for 0
    expect(zeroLead.slice(10, 17)).toBe('0010011'); // L-code for 2
  });

  it('encodes a fully known symbol end to end', () => {
    // 5901234123457: first digit 5 -> parity LGGLLG over digits 9,0,1,2,3,4
    //   9 as L = 0001011
    //   0 as G = 0100111
    //   1 as G = 0110011
    //   2 as L = 0010011
    //   3 as L = 0111101
    //   4 as G = 0011101
    // right digits 1,2,3,4,5,7 as R-codes
    const expected =
      '101' +
      '0001011' + '0100111' + '0110011' + '0010011' + '0111101' + '0011101' +
      '01010' +
      '1100110' + '1101100' + '1000010' + '1011100' + '1001110' + '1000100' +
      '101';

    expect(encodeEan13('5901234123457')).toBe(expected);
  });

  it('returns null for malformed input rather than a wrong symbol', () => {
    expect(encodeEan13('abc')).toBeNull();
    expect(encodeEan13('123')).toBeNull();
    expect(encodeEan13('')).toBeNull();
  });
});

describe('getBarRuns', () => {
  it('returns merged bar runs that stay inside the symbol width', () => {
    const runs = getBarRuns('5901234123457');
    expect(runs).not.toBeNull();

    for (const run of runs!) {
      expect(run.width).toBeGreaterThan(0);
      expect(run.start).toBeGreaterThanOrEqual(0);
      // Nothing may extend past the 95-module symbol — this is what
      // guarantees the drawn barcode fits the space allocated for it.
      expect(run.start + run.width).toBeLessThanOrEqual(EAN13_MODULE_COUNT);
    }
  });

  it('merges adjacent bars rather than emitting one run per module', () => {
    const modules = encodeEan13('5901234123457')!;
    const runs = getBarRuns('5901234123457')!;

    // Total bar modules must be conserved by the merge.
    const barModules = modules.split('').filter((m) => m === '1').length;
    const runModules = runs.reduce((sum, run) => sum + run.width, 0);
    expect(runModules).toBe(barModules);

    // And merging must actually have happened — some run is wider than 1.
    expect(runs.some((run) => run.width > 1)).toBe(true);
  });

  it('flags the guard runs so they can be drawn taller', () => {
    const runs = getBarRuns('5901234123457')!;
    expect(runs.some((run) => run.isGuard)).toBe(true);
    expect(runs[0].isGuard).toBe(true); // start guard
  });

  it('returns null for malformed input', () => {
    expect(getBarRuns('nope')).toBeNull();
  });
});

describe('isGuardModule', () => {
  it('identifies the start, centre and end guard positions', () => {
    expect(isGuardModule(0)).toBe(true);
    expect(isGuardModule(2)).toBe(true);
    expect(isGuardModule(3)).toBe(false);
    expect(isGuardModule(45)).toBe(true);
    expect(isGuardModule(49)).toBe(true);
    expect(isGuardModule(50)).toBe(false);
    expect(isGuardModule(92)).toBe(true);
    expect(isGuardModule(94)).toBe(true);
  });
});
