/**
 * WhatsApp sharing via `wa.me` deep links.
 *
 * This opens WhatsApp with a pre-filled message that the *user* then sends —
 * it is not an automated or bulk sending channel. That distinction matters:
 *
 *  - Bulk/automated messaging requires the WhatsApp Business API through an
 *    approved provider, with pre-approved message templates and per-message
 *    fees. `docs/01-functional-requirements.md` §6 already treats that as a
 *    pluggable provider rather than an MVP dependency.
 *  - Sending unsolicited promotional messages gets numbers banned by
 *    WhatsApp and breaches India's TRAI/DND rules. Marketing sends must be
 *    gated on `customers.marketing_opt_in`; sending someone the receipt for
 *    a purchase they just made is transactional and is not.
 *
 * Deep links need no API key, no provider account and no per-message cost,
 * which makes them the right MVP: a shopkeeper taps once and the customer
 * has their bill.
 */

/** Digits only, with an assumed country code for bare 10-digit Indian numbers. */
export function toWhatsAppNumber(phone: string | null | undefined, defaultCountryCode = '91'): string | null {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length < 7) return null;

  return digits.length === 10 ? `${defaultCountryCode}${digits}` : digits;
}

export interface ReceiptShareDetails {
  storeName: string;
  invoiceNumber: string;
  grandTotal: string | number;
  /** Public URL of the printable receipt, when the app is reachable from the customer's phone. */
  receiptUrl?: string;
}

export function buildReceiptMessage({
  storeName,
  invoiceNumber,
  grandTotal,
  receiptUrl,
}: ReceiptShareDetails): string {
  const amount = Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const lines = [
    `Thank you for shopping at ${storeName}!`,
    '',
    `Bill: ${invoiceNumber}`,
    `Amount: ₹${amount}`,
  ];
  if (receiptUrl) lines.push('', `View your bill: ${receiptUrl}`);
  return lines.join('\n');
}

/**
 * Opens WhatsApp with the message pre-filled. Returns false when the phone
 * number is unusable, so callers can tell the user why nothing happened
 * rather than appearing to do nothing.
 */
export function shareOnWhatsApp(phone: string | null | undefined, message: string): boolean {
  const number = toWhatsAppNumber(phone);
  if (!number) return false;

  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  return true;
}
