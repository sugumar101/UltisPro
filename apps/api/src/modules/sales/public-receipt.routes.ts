import { Router } from 'express';
import { salesService } from './sales.service';
import { sendSuccess } from '../../shared/response-envelope';
import { rateLimit } from '../../shared/rate-limit.middleware';

/**
 * The one **unauthenticated** router in the application: it serves a single
 * receipt to whoever holds its share link.
 *
 * Kept in its own file, mounted under its own `/public` prefix, precisely so
 * this is impossible to miss in review. Nothing else should ever be added
 * here without deciding, deliberately, that it is safe to expose with no
 * credential beyond a URL.
 *
 * Protections:
 *   - The token is 32 random bytes, so guessing is infeasible.
 *   - A tight per-IP rate limit caps how fast anyone could try anyway.
 *   - The service returns a narrowed projection (no contact details, no
 *     internal ids, no account balance) — see getPublicReceipt.
 */
export const publicReceiptRouter = Router();

// Deliberately stricter than the global limit. A legitimate customer opens
// their bill once or twice; anything hammering this endpoint is enumerating.
const receiptLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'public:receipt',
});

publicReceiptRouter.get('/public/receipt/:token', receiptLimiter, async (req, res) => {
  const receipt = await salesService.getPublicReceipt(req.params.token);
  sendSuccess(res, receipt);
});
