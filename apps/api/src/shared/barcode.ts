/**
 * EAN-13 barcode generation for products created without a manufacturer
 * barcode of their own — which is the normal case for a clothing retailer,
 * where garments arrive with no scannable GTIN and the shop prints its own
 * labels.
 *
 * Generated codes use the **`20`-`29` prefix range**, which GS1 reserves for
 * "restricted circulation within a company" — i.e. in-store use. That's the
 * correct range for self-assigned codes: it guarantees a generated barcode
 * can never collide with a real manufacturer's GTIN on some other product,
 * so scanning stays unambiguous if the shop later stocks branded goods that
 * do carry their own barcodes.
 *
 * EAN-13 (rather than a plain random string) because it's what every retail
 * barcode scanner, label printer, and barcode font already understands
 * without configuration.
 */

/**
 * Standard EAN-13 checksum: digits in odd positions (1-indexed) weigh 1,
 * even positions weigh 3; the check digit is whatever makes the total a
 * multiple of 10. Scanners verify this, so a wrong check digit means a
 * label that simply won't scan.
 */
export function ean13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error('EAN-13 check digit requires exactly 12 digits');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(twelveDigits[i]);
    // i is 0-indexed, so even i == odd position == weight 1.
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  return (10 - (sum % 10)) % 10;
}

/**
 * One candidate barcode. Callers must check it against the organization's
 * existing barcodes and retry on collision — see
 * products.service.ts#generateUniqueBarcode, which owns that loop, the same
 * check-then-insert pattern used for 5-digit product codes.
 */
export function generateEan13(): string {
  // '20' prefix (restricted circulation) + 10 random digits = 12, then the
  // computed 13th check digit.
  let body = '20';
  for (let i = 0; i < 10; i++) {
    body += Math.floor(Math.random() * 10);
  }
  return body + String(ean13CheckDigit(body));
}
