import { describe, expect, it } from 'vitest';
import { createRateLimitCounter } from '../src/shared/rate-limit.middleware';

/**
 * Unit tests for the fixed-window counter backing rate-limit.middleware.ts.
 * Tested directly against createRateLimitCounter (no Express, no app, no
 * NODE_ENV dependency) because the HTTP-facing rateLimit() middleware
 * bypasses enforcement entirely under NODE_ENV=test — see the comment in
 * rate-limit.middleware.ts for why (every integration suite's setupOrg()
 * helper would otherwise trip the limit within a single test run).
 */

describe('createRateLimitCounter', () => {
  it('allows requests up to the configured max within the window', () => {
    const counter = createRateLimitCounter({ windowMs: 60_000, max: 3 });
    const now = Date.now();

    expect(counter.check('ip-a', now).allowed).toBe(true);
    expect(counter.check('ip-a', now + 1).allowed).toBe(true);
    expect(counter.check('ip-a', now + 2).allowed).toBe(true);
  });

  it('rejects the request that exceeds max within the window, with a retryAfterSeconds hint', () => {
    const counter = createRateLimitCounter({ windowMs: 60_000, max: 2 });
    const now = Date.now();

    expect(counter.check('ip-a', now).allowed).toBe(true);
    expect(counter.check('ip-a', now + 1).allowed).toBe(true);

    const third = counter.check('ip-a', now + 2);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
      expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('tracks separate keys independently', () => {
    const counter = createRateLimitCounter({ windowMs: 60_000, max: 1 });
    const now = Date.now();

    expect(counter.check('ip-a', now).allowed).toBe(true);
    expect(counter.check('ip-a', now + 1).allowed).toBe(false);
    // A different key (e.g. a different IP, or a different route's keyPrefix) is unaffected.
    expect(counter.check('ip-b', now + 1).allowed).toBe(true);
  });

  it('resets the count once the window rolls over', () => {
    const counter = createRateLimitCounter({ windowMs: 1000, max: 1 });
    const now = Date.now();

    expect(counter.check('ip-a', now).allowed).toBe(true);
    expect(counter.check('ip-a', now + 500).allowed).toBe(false);
    // Past the window boundary, the count resets.
    expect(counter.check('ip-a', now + 1001).allowed).toBe(true);
  });
});
