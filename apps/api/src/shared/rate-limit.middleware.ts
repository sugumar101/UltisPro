import type { NextFunction, Request, Response } from 'express';
import { AppError } from './app-error';
import { env } from '../config/env';
import { incrementWindow } from './redis';

/**
 * Fixed-window in-memory rate limiter, applied to the auth endpoints most
 * exposed to abuse (credential stuffing on /login, spam org creation on
 * /register-organization, email-enumeration/spam on /password/forgot).
 *
 * Deliberately in-memory rather than Redis-backed: Redis is already a
 * declared infra dependency (docs/02-system-architecture.md, REDIS_URL in
 * config/env.ts) but nothing in this codebase actually opens a Redis
 * connection yet — introducing one just for rate-limit counters would be
 * the first real usage of it, undertested in this sandboxed build. An
 * in-memory Map is correct for a single-process deployment (including the
 * `npm run dev` / single-container Docker setup this repo ships) but does
 * **not** share state across multiple API instances — behind a load
 * balancer with >1 replica, each instance enforces its own limit
 * independently, which loosens the effective limit by a factor of N.
 * Before scaling horizontally in production, replace the in-memory store
 * here with a Redis-backed counter (e.g. `INCR` + `EXPIRE`) keyed the same
 * way. Flagged as a P1 follow-up in docs/05-development-roadmap.md Phase 8.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Rolling window size in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key within the window. */
  max: number;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Pure fixed-window counter, decoupled from Express and from `env` so it
 * can be unit-tested directly (apps/api/test/rate-limit.test.ts) without
 * going through the NODE_ENV=test bypass that the HTTP-facing middleware
 * below applies to keep the integration suites deterministic.
 */
export function createRateLimitCounter(options: RateLimitOptions) {
  const { windowMs, max } = options;
  const buckets = new Map<string, WindowEntry>();

  function sweepExpired(now: number): void {
    if (buckets.size < 10_000) return; // cheap guard; avoid an O(n) sweep on every call
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitDecision {
      sweepExpired(now);
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
      }

      if (existing.count >= max) {
        return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
      }

      existing.count += 1;
      return { allowed: true };
    },
    reset(): void {
      buckets.clear();
    },
  };
}

export interface RateLimitMiddlewareOptions extends RateLimitOptions {
  /** Distinguishes independently-limited routes sharing the same IP. */
  keyPrefix: string;
}

/**
 * Rate-limit middleware backed by Redis, falling back to a per-process
 * counter when Redis is unavailable.
 *
 * Redis is what makes the limit *mean* something once the API runs on more
 * than one instance: with per-process counters and three replicas, a
 * "10 logins per 15 minutes" rule actually permits 30, and an attacker
 * spreading attempts across instances sees no limit at all.
 *
 * The fallback is deliberate rather than fail-closed. If Redis is down,
 * rejecting every request would take the tills offline over a *rate
 * limiter's* backing store — far worse than a limit that degrades to
 * per-instance for a few minutes.
 */
export function rateLimit(options: RateLimitMiddlewareOptions) {
  const { keyPrefix, ...counterOptions } = options;
  const fallbackCounter = createRateLimitCounter(counterOptions);
  const windowSeconds = Math.ceil(counterOptions.windowMs / 1000);

  return function rateLimitMiddleware(req: Request, _res: Response, next: NextFunction): void {
    // Every integration test file drives multiple organizations through
    // /register-organization and /login via a shared setupOrg() helper —
    // easily dozens of calls per run, all from the same loopback IP.
    // Enforcing production limits here would make the test suite's pass/
    // fail status depend on run order and machine speed instead of on the
    // behavior under test. Bypassing under NODE_ENV=test is the standard
    // tradeoff; the counting logic itself is unit-tested directly in
    // rate-limit.test.ts against createRateLimitCounter, which has no env
    // dependency.
    if (env.NODE_ENV === 'test') {
      next();
      return;
    }

    const key = `${keyPrefix}:${req.ip ?? 'unknown'}`;

    void (async () => {
      try {
        const shared = await incrementWindow(`ratelimit:${key}`, windowSeconds);

        if (shared) {
          if (shared.count > counterOptions.max) {
            next(
              new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', {
                retryAfterSeconds: shared.ttlSeconds,
              }),
            );
            return;
          }
          next();
          return;
        }

        // Redis unavailable — degrade to this process's own counter.
        const decision = fallbackCounter.check(key);
        if (!decision.allowed) {
          next(
            new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', {
              retryAfterSeconds: decision.retryAfterSeconds,
            }),
          );
          return;
        }
        next();
      } catch (err) {
        // Never let a limiter fault block a sale.
        next(err instanceof AppError ? err : undefined);
      }
    })();
  };
}
