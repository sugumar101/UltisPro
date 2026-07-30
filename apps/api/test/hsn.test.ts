import { describe, expect, it } from 'vitest';
import { suggestHsnCode } from '../src/shared/hsn';

/**
 * Unit tests for HSN suggestion. The critical property under test is that
 * suggestion NEVER invents a code — an HSN determines the GST rate on a
 * legal invoice, so returning null for anything unrecognised is the correct
 * behaviour, not a shortcoming.
 */

describe('suggestHsnCode', () => {
  it('maps common apparel wording to standard codes', () => {
    expect(suggestHsnCode('T-Shirts')).toBe('6109');
    expect(suggestHsnCode('Polo')).toBe('6109');
    expect(suggestHsnCode("Men's Shirts")).toBe('6205');
    expect(suggestHsnCode('Trousers')).toBe('6203');
    expect(suggestHsnCode('Jeans')).toBe('6203');
    expect(suggestHsnCode('Hoodie')).toBe('6110');
    expect(suggestHsnCode('Socks')).toBe('6115');
    expect(suggestHsnCode('Saree')).toBe('6204');
  });

  it('prefers the more specific rule when one term contains another', () => {
    // "t-shirt" contains "shirt" — the narrower knitted-garment code must
    // win, otherwise every tee would be classified as a woven shirt.
    expect(suggestHsnCode('T-Shirt')).toBe('6109');
    expect(suggestHsnCode('Shirt')).toBe('6205');
    // Likewise "track pant" vs "pant" both land on trousers, but the
    // ordering must not throw.
    expect(suggestHsnCode('Track Pants')).toBe('6203');
  });

  it('is case-insensitive and matches within a longer phrase', () => {
    expect(suggestHsnCode('CLASSIC OVERSIZED TEE')).toBe('6109');
    expect(suggestHsnCode('Premium cotton t-shirt for men')).toBe('6109');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(suggestHsnCode('Widget')).toBeNull();
    expect(suggestHsnCode('Miscellaneous item')).toBeNull();
    expect(suggestHsnCode('')).toBeNull();
    expect(suggestHsnCode(null)).toBeNull();
    expect(suggestHsnCode(undefined)).toBeNull();
  });

  it('handles non-apparel retail categories it does know', () => {
    expect(suggestHsnCode('Sneakers')).toBe('6403');
    expect(suggestHsnCode('Handbag')).toBe('4202');
    expect(suggestHsnCode('Caps')).toBe('6505');
  });
});
