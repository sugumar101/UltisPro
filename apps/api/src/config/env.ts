import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env explicitly, pinned to a path relative to this
// file rather than process.cwd(). The npm scripts that start this process
// (`npm run dev --workspace=apps/api`, `npm run migrate --workspace=apps/api`)
// run with cwd set to apps/api/ — standard npm workspace behavior — so the
// old approach (an `-r dotenv/config` CLI preload, which defaults to
// `${cwd}/.env`) was silently looking for apps/api/.env, which never
// existed, instead of the repo-root .env that actually has the values.
// That left every required env var unset, which fails the schema check
// below and calls process.exit(1) before the server ever binds a port —
// from the frontend's perspective this looks like the API is just
// unreachable, not like a real error.
//
// This resolves the same relative depth whether running from source
// (apps/api/src/config/env.ts) or from a compiled build
// (apps/api/dist/config/env.js) — both are 4 directories below the repo
// root. In Docker/ECS, where env vars are injected directly by the
// platform and no .env file exists in the image, dotenv.config() on a
// missing path is a safe no-op and never overwrites already-set
// process.env values, so this doesn't change production behavior.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
if (process.env.NODE_ENV === 'production') {
  // NODE_ENV=production callers are expected to pass DATABASE_URL etc.
  // explicitly (see .env.production.example) rather than rely on a
  // committed file; this only fills in anything not already set.
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env.production') });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /**
   * How many reverse proxies sit in front of the API. Behind a load
   * balancer, ingress or CDN, `req.ip` is the *proxy's* address unless
   * Express is told to trust the X-Forwarded-For chain — which silently
   * breaks per-IP rate limiting (every client shares one bucket) and
   * records the wrong address in audit logs.
   *
   * Set this to the number of proxies you actually control, and no higher:
   * each trusted hop is a header position an attacker can forge to spoof
   * their source IP and evade rate limits.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /**
   * Extra browser origins allowed to call the API, comma-separated, on top
   * of WEB_ORIGIN — e.g. a staging frontend and a custom domain sharing one
   * API. Empty means only WEB_ORIGIN is allowed.
   */
  EXTRA_CORS_ORIGINS: z.string().optional().default(''),

  /**
   * Connections per instance. Budget this against the database server's own
   * limit: DB_POOL_MAX x replicas must stay comfortably under
   * `max_connections`, because exceeding it hard-fails rather than queueing.
   */
  DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),

  /**
   * Server-side statement timeout. Any query exceeding it is cancelled,
   * freeing its pool slot. Generous enough for the heaviest report, short
   * enough that a pathological query can't drain the pool.
   */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),

  /**
   * SameSite policy for the refresh cookie.
   *
   * `lax` is right when the frontend and API share a registrable domain
   * (app.example.com + api.example.com) — cross-*origin* but same-*site*,
   * so the cookie is still sent.
   *
   * `none` is required when they're genuinely different sites (a Vercel
   * frontend calling a Render API, say). Browsers only accept
   * `SameSite=None` together with `Secure`, so this forces HTTPS — and it
   * removes SameSite's CSRF protection, leaving the CORS allow-list as the
   * control. Don't reach for it unless the deployment actually needs it.
   */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  /** Set false only if TLS terminates *inside* the container (rare). */
  ENFORCE_HTTPS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Placeholder secrets that ship in this repo's own example files and test
 * config. If one of these reaches production it means a template was copied
 * and never filled in — the most common way an app ends up signing tokens
 * with a publicly-known key.
 */
const FORBIDDEN_SECRETS = [
  'REPLACE_WITH_A_REAL_RANDOM_SECRET_AT_LEAST_32_CHARS',
  'change-me-in-production-min-32-characters-long',
  'test-only-secret-please-change-me-32chars',
  'ci-test-secret-please-change-me-32chars',
  'ci-test-only-secret-please-change-me-32chars',
  'placeholder-only-for-running-migrations-not-a-real-secret',
];

/**
 * Crude entropy check: a secret of the right *length* can still be
 * `aaaaaaaa…`. Counting distinct characters filters hand-typed padding
 * without adding a dependency.
 */
function looksLowEntropy(secret: string): boolean {
  return new Set(secret).size < 12;
}

/**
 * Production invariants a schema can't express. Deliberately hard failures
 * rather than warnings: each is a condition where the service would still
 * start and look healthy while being insecure, which is worse than
 * refusing to boot.
 */
function productionProblems(env: Env): string[] {
  const problems: string[] = [];

  if (FORBIDDEN_SECRETS.includes(env.JWT_SECRET)) {
    problems.push('JWT_SECRET is still a placeholder from an example file. Generate one with: openssl rand -base64 48');
  }
  if (looksLowEntropy(env.JWT_SECRET)) {
    problems.push('JWT_SECRET has too few distinct characters to be a real random secret.');
  }

  // Every managed Postgres (Neon included) supports TLS; a plaintext
  // connection puts credentials and customer data on the wire in clear.
  const dbUrl = env.DATABASE_URL;
  const hasTls = /sslmode=(require|verify-ca|verify-full)/.test(dbUrl) || /ssl=true/.test(dbUrl);
  const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  if (!hasTls && !isLocal) {
    problems.push('DATABASE_URL must enable TLS in production — append ?sslmode=require');
  }

  if (!env.WEB_ORIGIN.startsWith('https://')) {
    problems.push(
      'WEB_ORIGIN must be https:// in production — the refresh cookie is Secure and browsers will not send it over http.',
    );
  }

  return problems;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast and loud: a misconfigured environment should never boot silently.
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  if (parsed.data.NODE_ENV === 'production') {
    const problems = productionProblems(parsed.data);
    if (problems.length > 0) {
      // eslint-disable-next-line no-console
      console.error('Refusing to start — production security requirements not met:');
      // eslint-disable-next-line no-console
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
  }

  return parsed.data;
}

export const env = loadEnv();

/** Every browser origin permitted to call this API. */
export const allowedOrigins: string[] = [
  env.WEB_ORIGIN,
  ...env.EXTRA_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

/** Exported for tests — lets the guardrails be asserted without booting a process. */
export const __securityChecks = { productionProblems, looksLowEntropy, FORBIDDEN_SECRETS };
