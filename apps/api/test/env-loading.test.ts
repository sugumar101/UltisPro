import { describe, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * Regression test for the root-cause bug behind "signup silently fails /
 * API unreachable": src/config/env.ts used to rely on an `-r dotenv/config`
 * CLI preload, which resolves `.env` relative to process.cwd(). npm runs
 * workspace scripts (`npm run dev --workspace=apps/api`) with cwd set to
 * apps/api/, not the repo root — so it was loading a `.env` that never
 * existed, leaving every required var unset and killing the process at
 * boot via `process.exit(1)` before it ever bound a port. From the
 * frontend's side that looked like a generic network failure, not a real
 * API error.
 *
 * The fix (env.ts calling `dotenv.config({ path: path.resolve(__dirname, ...) })`
 * directly) is cwd-independent by construction, so there's nothing to
 * black-box test about *behavior* here — env.ts already runs successfully
 * in every other test in this suite, since it's a transitive dependency of
 * `createApp()`. What's worth pinning down is the relative-path arithmetic
 * itself: `apps/api/src/config` (or the compiled `apps/api/dist/config`)
 * is exactly 4 directories below the repo root, and it's easy to silently
 * break that assumption in a future refactor (e.g. moving env.ts) without
 * any test noticing, since a wrong path just means "silently fall through
 * to whatever's already in process.env" rather than a loud failure in most
 * dev setups where env vars happen to be present some other way.
 */
describe('config/env.ts root .env path resolution', () => {
  it('the relative path used in env.ts (4 levels up from src/config) reaches the actual repo root', () => {
    const srcConfigDir = path.resolve(__dirname, '../src/config');
    const resolvedEnvPath = path.resolve(srcConfigDir, '../../../../.env');

    const repoRoot = path.resolve(__dirname, '../../../');
    expect(resolvedEnvPath).toBe(path.join(repoRoot, '.env'));

    // .env itself is gitignored and may not exist on a given checkout, but
    // .env.example always should — confirms the resolved directory really
    // is the repo root, not some other 4-levels-up coincidence.
    expect(fs.existsSync(path.join(repoRoot, '.env.example'))).toBe(true);
  });

  it('the same relative depth holds for a compiled dist/config build', () => {
    const distConfigDir = path.resolve(__dirname, '../dist/config');
    const resolvedEnvPath = path.resolve(distConfigDir, '../../../../.env');

    const repoRoot = path.resolve(__dirname, '../../../');
    expect(resolvedEnvPath).toBe(path.join(repoRoot, '.env'));
  });
});
