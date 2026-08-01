/**
 * @deprecated Superseded by `./share-bill.ts`.
 *
 * This module sent a WhatsApp message containing only the invoice number and
 * amount. It has been replaced by `share-bill.ts`, which sends a link to the
 * public bill page (`/r/<token>`) across WhatsApp, SMS and email from one
 * shared message builder — so a customer receives something they can
 * actually open rather than a figure to take on trust.
 *
 * Kept as a re-export purely so any straggling import keeps compiling.
 * Delete once nothing references it.
 */
export { sendOnWhatsApp, buildBillMessage, buildBillUrl, toDialableNumber } from './share-bill';
