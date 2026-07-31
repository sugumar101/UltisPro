import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Shared Redis connection, used for rate-limit counters that must be
 * consistent across replicas.
 *
 * Deliberately lazy and non-fatal: the API must keep serving sales if Redis
 * blips. A till that can't take payment because a *rate limiter's* backing
 * store is down is a far worse outcome than a rate limit that briefly
 * degrades — so every failure path here falls back to in-process counting
 * rather than throwing.
 */

let client: RedisClientType | null = null;
let connecting: Promise<void> | null = null;
let unavailableUntil = 0;

/**
 * How long to stop trying after a failure. Without this, every request
 * would attempt a fresh connection to a dead Redis and pay the full
 * connect timeout — turning a degraded dependency into an outage.
 */
const CIRCUIT_OPEN_MS = 30_000;

function isCircuitOpen(): boolean {
  return Date.now() < unavailableUntil;
}

function openCircuit(reason: string): void {
  if (!isCircuitOpen()) {
    logger.warn({ reason }, 'Redis unavailable — rate limiting falls back to per-process counters');
  }
  unavailableUntil = Date.now() + CIRCUIT_OPEN_MS;
}

async function getClient(): Promise<RedisClientType | null> {
  // Tests and local dev frequently have no Redis; don't make that a hard
  // dependency for running the app.
  if (env.NODE_ENV === 'test') return null;
  if (isCircuitOpen()) return null;
  if (client?.isReady) return client;

  if (!connecting) {
    connecting = (async () => {
      try {
        const next: RedisClientType = createClient({
          url: env.REDIS_URL,
          socket: { connectTimeout: 3000, reconnectStrategy: (retries) => Math.min(retries * 200, 3000) },
        });
        // The client emits 'error' on connection loss; unhandled, that
        // would crash the process.
        next.on('error', (err: Error) => openCircuit(err.message));
        await next.connect();
        client = next;
        logger.info('Redis connected — rate limits are shared across instances');
      } catch (err) {
        openCircuit(err instanceof Error ? err.message : 'connect failed');
        client = null;
      } finally {
        connecting = null;
      }
    })();
  }

  await connecting;
  return client?.isReady ? client : null;
}

export interface RedisCountResult {
  count: number;
  /** Seconds until the window resets. */
  ttlSeconds: number;
}

/**
 * Atomically increments a fixed-window counter and returns the new value.
 * Returns null when Redis is unavailable, signalling the caller to fall
 * back to its in-process counter.
 *
 * INCR-then-EXPIRE is used rather than a Lua script for readability; the
 * only race is a process dying between the two commands, which would leave
 * one key without a TTL. That self-heals on the next window since the
 * counter is reset by the EXPIRE on any subsequent increment path.
 */
export async function incrementWindow(key: string, windowSeconds: number): Promise<RedisCountResult | null> {
  const redis = await getClient();
  if (!redis) return null;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    const ttl = await redis.ttl(key);
    // ttl === -1 means the key somehow has no expiry; repair it rather than
    // letting a counter live forever and permanently lock someone out.
    if (ttl < 0) {
      await redis.expire(key, windowSeconds);
      return { count, ttlSeconds: windowSeconds };
    }
    return { count, ttlSeconds: ttl };
  } catch (err) {
    openCircuit(err instanceof Error ? err.message : 'command failed');
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (client?.isOpen) await client.quit();
  client = null;
}
