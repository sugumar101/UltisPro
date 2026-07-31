import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from './app-error';
import { logger } from './logger';

/**
 * Redirects (or rejects) plaintext HTTP in production.
 *
 * Behind a TLS-terminating proxy the request arrives at the app over HTTP,
 * so the only reliable signal is `X-Forwarded-Proto` — which is why this
 * depends on `trust proxy` being configured correctly (see app.ts). Without
 * that, `req.secure` is always false and this would redirect forever.
 *
 * GETs are redirected so a mistyped link still works; anything else is
 * refused, because silently redirecting a POST drops its body and the
 * client would see a confusing empty success rather than a clear error.
 */
export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV !== 'production' || !env.ENFORCE_HTTPS || req.secure) {
    next();
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
    return;
  }

  throw new AppError('VALIDATION_ERROR', 'This API requires HTTPS.');
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Coarse per-IP request ceiling across the whole API, layered under the
 * tighter per-endpoint limits on auth routes.
 *
 * This exists to blunt scraping and credential-stuffing that spreads itself
 * across many endpoints to stay under any single endpoint's limit — the
 * auth limiter alone can't see that pattern. The ceiling is deliberately
 * generous: a busy till legitimately makes a lot of calls (every scan is a
 * search), so this should only ever catch automated abuse.
 *
 * Deliberately still in-process, unlike the auth limiters which moved to
 * Redis. This runs on *every* request, so a Redis round trip here would add
 * network latency to the entire API — and the thing it guards against
 * (blunt volumetric abuse) is adequately handled by a per-instance ceiling:
 * behind N replicas the effective limit is N x 600/min, which is still a
 * ceiling. Auth is different: credential stuffing spread across instances
 * must see one shared counter, which is exactly why those limits are the
 * ones paying the Redis round trip.
 */
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX_REQUESTS = 600;

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  if (buckets.size < 20_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function globalRateLimit(req: Request, _res: Response, next: NextFunction): void {
  // Skipped in tests: suites fire hundreds of requests from one loopback
  // address, so enforcing here would make pass/fail depend on run order.
  if (env.NODE_ENV === 'test') {
    next();
    return;
  }

  // Health checks come from load balancers on a fixed cadence and must
  // never be throttled — throttling them looks like an outage.
  if (req.path === '/healthz' || req.path === '/readyz') {
    next();
    return;
  }

  const now = Date.now();
  sweep(now);

  const key = req.ip ?? 'unknown';
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + GLOBAL_WINDOW_MS });
    next();
    return;
  }

  if (existing.count >= GLOBAL_MAX_REQUESTS) {
    // Logged at warn so sustained abuse is visible in production logs
    // rather than silently absorbed.
    logger.warn({ ip: key, path: req.path }, 'Global rate limit exceeded');
    throw new AppError('RATE_LIMITED', 'Too many requests. Please slow down.');
  }

  existing.count += 1;
  next();
}

/**
 * Strips headers that leak stack details. `x-powered-by` is already
 * disabled in app.ts; this covers the ones helmet doesn't remove and adds a
 * couple it doesn't set by default for APIs.
 */
export function hardenResponseHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  // An API never renders in a browsing context, so deny framing outright
  // and forbid the browser from guessing content types.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Nothing here should be cached by an intermediary — responses are
  // per-tenant and often contain financial data.
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Exported for tests, which need a clean slate between cases sharing an IP. */
export function __resetGlobalRateLimit(): void {
  buckets.clear();
}
