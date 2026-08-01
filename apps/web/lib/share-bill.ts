/**
 * Sharing a bill link over WhatsApp, SMS and email.
 *
 * **All three open the operator's own app with the message pre-filled — the
 * shopkeeper presses send.** Nothing is dispatched by the server. That is a
 * deliberate scope decision, not an oversight:
 *
 *   - Automated SMS needs a licensed gateway (MSG91, Twilio) with per-message
 *     billing and, in India, DLT template registration before a single
 *     message will deliver.
 *   - Automated email needs SMTP or a provider (SES, Postmark) plus SPF/DKIM
 *     on the sending domain, or the mail lands in spam.
 *
 * Deep links need none of that and work today on the device the till is
 * already running on. When a provider is added later, only the `send*`
 * functions here change — the POS calls stay identical.
 *
 * Transactional vs marketing: sending someone the receipt for a purchase
 * they just made is transactional and does not require marketing consent
 * (`customers.marketing_opt_in`). Promotional messages do.
 */

import { appUrl } from './app-url';

export interface BillShareDetails {
  storeName: string;
  invoiceNumber: string;
  grandTotal: string | number;
  /** Public, no-login bill URL — see apps/web/app/r/[token]/page.tsx. */
  billUrl: string;
  customerName?: string | null;
}

/** Digits only, with a country code assumed for bare 10-digit Indian numbers. */
export function toDialableNumber(phone: string | null | undefined, defaultCountryCode = '91'): string | null {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length < 7) return null;

  return digits.length === 10 ? `${defaultCountryCode}${digits}` : digits;
}

export function buildBillMessage({
  storeName,
  invoiceNumber,
  grandTotal,
  billUrl,
  customerName,
}: BillShareDetails): string {
  const amount = Number(grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const greeting = customerName ? `Hi ${customerName.split(' ')[0]},` : 'Hi,';

  return [
    `${greeting} thank you for shopping at ${storeName}!`,
    '',
    `Bill ${invoiceNumber} — ₹${amount}`,
    `View your bill: ${billUrl}`,
    '',
    'We hope to see you again soon.',
  ].join('\n');
}

export type ShareResult = { ok: true } | { ok: false; reason: string };

/**
 * Invokes a `sms:`/`mailto:` handler by clicking a detached anchor rather
 * than assigning `window.location.href`.
 *
 * Assigning location navigates the POS away from the till screen — and if
 * the OS has no handler registered it can leave the cashier staring at a
 * blank page mid-sale. A synthetic anchor click hands the URL to the
 * protocol handler while leaving the current page untouched, and does
 * nothing at all when no handler exists.
 */
function openProtocolLink(href: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function sendOnWhatsApp(phone: string | null | undefined, details: BillShareDetails): ShareResult {
  const number = toDialableNumber(phone);
  if (!number) return { ok: false, reason: 'No valid mobile number for this customer.' };

  window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildBillMessage(details))}`, '_blank', 'noopener');
  return { ok: true };
}

export function sendOverSms(phone: string | null | undefined, details: BillShareDetails): ShareResult {
  const number = toDialableNumber(phone);
  if (!number) return { ok: false, reason: 'No valid mobile number for this customer.' };

  // `?body=` is the widely-supported form across iOS and Android. A desktop
  // till with no SMS handler simply does nothing, which is why the POS also
  // shows a copyable link.
  openProtocolLink(`sms:+${number}?body=${encodeURIComponent(buildBillMessage(details))}`);
  return { ok: true };
}

export function sendOverEmail(email: string | null | undefined, details: BillShareDetails): ShareResult {
  const address = email?.trim();
  if (!address || !address.includes('@')) return { ok: false, reason: 'No email address for this customer.' };

  const subject = `Your bill ${details.invoiceNumber} from ${details.storeName}`;
  openProtocolLink(
    `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      buildBillMessage(details),
    )}`,
  );
  return { ok: true };
}

/**
 * Public bill URL for an invoice token — absolute, so it survives being
 * pasted into an SMS, an email, or a WhatsApp message.
 *
 * Must include the deployment's base path. When the app is served from a
 * subpath (https://www.ultis.in/retailpro), a link built as
 * `${origin}/r/<token>` points at the domain root and 404s — and because
 * this URL is what customers receive, that failure only surfaces after the
 * message has already been sent.
 *
 * `basePath` isn't readable from client code, which is why next.config.mjs
 * mirrors it into NEXT_PUBLIC_BASE_PATH. Next inlines that at build time,
 * so it must be set in the build environment, not just at runtime.
 */
export function buildBillUrl(publicToken: string): string {
  return appUrl(`/r/${publicToken}`);
}
