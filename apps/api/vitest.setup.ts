import { config } from 'dotenv';
import path from 'path';

// Loads test-safe env vars so env.ts validation doesn't fail (or worse,
// call process.exit) when tests run outside a fully-configured shell,
// e.g. in CI before secrets are injected, or a bare `vitest run` locally.
config({ path: path.resolve(__dirname, '.env.test'), override: false });
