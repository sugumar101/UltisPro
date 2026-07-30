import { describe, expect, it } from 'vitest';
import { generateEan13, ean13CheckDigit } from '../src/shared/barcode';

/**
 * Unit tests for in-store EAN-13 generation. No database — but a wrong
 * check digit produces a label that physically will not scan, so the
 * checksum is worth pinning against known-good values.
 */

describe('ean13CheckDigit', () => {
  it('matches known-good EAN-13 barcodes', () => {
    // Real published EAN-13s; last digit is the check digit, so passing the
    // leading 12 must reproduce it.
    expect(ean13CheckDigit('400638133393')).toBe(1); // 4006381333931
    expect(ean13CheckDigit('590123412345')).toBe(7); // 5901234123457
  });

  it('rejects input that is not exactly 12 digits', () => {
    expect(() => ean13CheckDigit('12345')).toThrow();
    expect(() => ean13CheckDigit('40063813339X')).toThrow();
    expect(() => ean13CheckDigit('4006381333931')).toThrow(); // 13 digits
  });
});

describe('generateEan13', () => {
  it('produces 13 digits carrying a valid check digit', () => {
    for (let i = 0; i < 200; i++) {
      const barcode = generateEan13();
      expect(barcode).toMatch(/^\d{13}$/);
      // Self-consistency: recomputing from the first 12 must give the 13th.
      expect(ean13CheckDigit(barcode.slice(0, 12))).toBe(Number(barcode[12]));
    }
  });

  it('always uses the GS1 restricted-circulation prefix so codes never collide with real GTINs', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateEan13().startsWith('20')).toBe(true);
    }
  });

  it('does not repeat within a large sample', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateEan13());
    // 10 random digits — a duplicate in 1000 draws would signal a broken RNG,
    // not bad luck.
    expect(seen.size).toBe(1000);
  });
});
