/**
 * Phone normalisation for customer lookup at the counter.
 *
 * The same customer gets entered half a dozen ways across visits —
 * `98765 43210`, `+91 98765 43210`, `098765-43210`, `919876543210` — and
 * without normalisation each one creates a *new* customer record. That
 * quietly wrecks the two things the phone number exists for: recognising a
 * returning customer, and having one place their purchase history lives.
 *
 * Strategy: reduce to digits, then drop an Indian country code or trunk
 * prefix to get the 10-digit subscriber number that actually identifies the
 * person. Anything that doesn't look like an Indian mobile is kept as its
 * digits so international numbers still store and match consistently.
 */

/** Digits only, with a leading `+` discarded. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Canonical form used for both storage and lookup, so a number matches
 * regardless of how it was typed. Returns null for anything too short to be
 * a real number, which callers treat as "no phone given" rather than
 * storing junk.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = digitsOnly(raw);
  if (!digits) return null;

  // 0-prefixed trunk dialling: 09876543210 -> 9876543210
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Country code, with or without the trunk 0: 919876543210 -> 9876543210
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  if (digits.length === 13 && digits.startsWith('910')) {
    digits = digits.slice(3);
  }

  // Too short to identify anyone — treat as absent rather than store a
  // fragment that will never match again.
  if (digits.length < 7) return null;

  return digits;
}

/**
 * E.164-ish form for `wa.me` links and future messaging providers, which
 * require a country code and no punctuation. Assumes India for bare
 * 10-digit numbers, since that's the launch market (see
 * docs/01-functional-requirements.md §6); longer numbers are assumed to
 * already carry their own country code.
 */
export function toWhatsAppNumber(raw: string | null | undefined, defaultCountryCode = '91'): string | null {
  const normalized = normalizePhone(raw);
  if (!normalized) return null;
  return normalized.length === 10 ? `${defaultCountryCode}${normalized}` : normalized;
}
