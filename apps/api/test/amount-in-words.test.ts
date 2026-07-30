import { describe, expect, it } from 'vitest';
import { amountInWords } from '../src/shared/amount-in-words';

/**
 * Unit tests for the invoice "amount in words" renderer. No database — this
 * is pure arithmetic-to-English, but it prints on a legal tax document, so
 * the Indian-grouping boundaries (thousand -> lakh -> crore) and the
 * irregular 0-19 range are worth pinning down explicitly.
 */

describe('amountInWords (Indian numbering)', () => {
  it('handles zero and small values', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    // Always the plural "Rupees", including for exactly 1 — matching how
    // Indian invoice software conventionally prints it, and avoiding a
    // special case that would read oddly for "One Rupees and Fifty Paise".
    expect(amountInWords(1)).toBe('One Rupees Only');
    expect(amountInWords(7)).toBe('Seven Rupees Only');
  });

  it('handles the irregular teens and the tens boundary', () => {
    expect(amountInWords(13)).toBe('Thirteen Rupees Only');
    expect(amountInWords(19)).toBe('Nineteen Rupees Only');
    expect(amountInWords(20)).toBe('Twenty Rupees Only');
    expect(amountInWords(21)).toBe('Twenty One Rupees Only');
  });

  it('handles hundreds', () => {
    expect(amountInWords(100)).toBe('One Hundred Rupees Only');
    expect(amountInWords(101)).toBe('One Hundred One Rupees Only');
    expect(amountInWords(999)).toBe('Nine Hundred Ninety Nine Rupees Only');
  });

  it('groups the Indian way, not the short scale', () => {
    // The whole point: 150000 is One Lakh Fifty Thousand, never
    // "One Hundred Fifty Thousand".
    expect(amountInWords(150000)).toBe('One Lakh Fifty Thousand Rupees Only');
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(1000)).toBe('One Thousand Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
  });

  it('handles a realistic mixed invoice total', () => {
    expect(amountInWords(123456)).toBe('One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees Only');
  });

  it('renders paise as a separate clause and rounds to 2 decimals', () => {
    expect(amountInWords(99.5)).toBe('Ninety Nine Rupees and Fifty Paise Only');
    expect(amountInWords(1234.05)).toBe('One Thousand Two Hundred Thirty Four Rupees and Five Paise Only');
    // Rounds rather than truncating.
    expect(amountInWords(10.999)).toBe('Eleven Rupees Only');
  });

  it('handles crores above 99 by recursing rather than needing a bigger scale word', () => {
    expect(amountInWords(1_000_000_000)).toBe('One Hundred Crore Rupees Only');
  });

  it('prefixes negative amounts', () => {
    expect(amountInWords(-50)).toBe('Minus Fifty Rupees Only');
  });
});
