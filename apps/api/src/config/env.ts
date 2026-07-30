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
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast and loud: a misconfigured environment should never boot silently.
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
