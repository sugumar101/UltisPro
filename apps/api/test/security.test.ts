import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { __securityChecks } from '../src/config/env';
import { registerOrganizationSchema, passwordSchema } from '../src/modules/auth/auth.dto';

/**
 * Production hardening. Most of this can't be exercised by booting the app
 * under NODE_ENV=production inside the test runner, so the guardrail logic
 * is exported and asserted directly — the point is that these rules exist
 * and are correct, not that the process exits.
 */

const app = createApp();
const { productionProblems, looksLowEntropy, FORBIDDEN_SECRETS } = __securityChecks;

/** A config that passes every production check, to vary one field at a time. */
function goodProdEnv() {
  return {
    NODE_ENV: 'production' as const,
    API_PORT: 4000,
    WEB_ORIGIN: 'https://app.example.com',
    DATABASE_URL: 'postgresql://u:p@db.example.com/app?sslmode=require',
    REDIS_URL: 'rediss://u:p@redis.example.com:6379',
    JWT_SECRET: 'Zq7#kLm2$Rv9!Wt4&Yb6*Nc1@Hd8^Jf3(Ps5)Gx0-Ae',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    TRUST_PROXY_HOPS: 1,
    EXTRA_CORS_ORIGINS: '',
    COOKIE_SAMESITE: 'lax' as const,
    ENFORCE_HTTPS: true,
  };
}

describe('Production configuration guardrails', () => {
  it('accepts a properly configured production environment', () => {
    expect(productionProblems(goodProdEnv())).toEqual([]);
  });

  it('refuses every placeholder secret shipped in this repo', () => {
    for (const secret of FORBIDDEN_SECRETS) {
      const problems = productionProblems({ ...goodProdEnv(), JWT_SECRET: secret });
      expect(problems.some((p) => p.includes('placeholder'))).toBe(true);
    }
  });

  it('refuses a long-but-low-entropy secret', () => {
    // Passes a naive length check, obviously not a real key.
    const padded = 'a'.repeat(64);
    expect(looksLowEntropy(padded)).toBe(true);
    expect(productionProblems({ ...goodProdEnv(), JWT_SECRET: padded }).length).toBeGreaterThan(0);
  });

  it('requires TLS on the database connection', () => {
    const problems = productionProblems({
      ...goodProdEnv(),
      DATABASE_URL: 'postgresql://u:p@db.example.com/app',
    });
    expect(problems.some((p) => p.includes('TLS'))).toBe(true);
  });

  it('allows a plaintext connection to a local database', () => {
    // Running against localhost is a developer setup, not a production
    // wire — requiring TLS there would block legitimate local debugging.
    const problems = productionProblems({
      ...goodProdEnv(),
      DATABASE_URL: 'postgresql://ultispro:ultispro@localhost:5432/ultispro',
    });
    expect(problems.some((p) => p.includes('TLS'))).toBe(false);
  });

  it('requires an https frontend origin, because the refresh cookie is Secure', () => {
    const problems = productionProblems({ ...goodProdEnv(), WEB_ORIGIN: 'http://app.example.com' });
    expect(problems.some((p) => p.includes('https'))).toBe(true);
  });
});

describe('Password policy', () => {
  it('rejects passwords that clear a length check but are trivially guessable', () => {
    for (const weak of ['password123', 'qwertyuiop', 'welcome123', '1234567890']) {
      expect(passwordSchema.safeParse(weak).success).toBe(false);
    }
  });

  it('rejects a single repeated character and low-variety strings', () => {
    expect(passwordSchema.safeParse('aaaaaaaaaaaa').success).toBe(false);
    expect(passwordSchema.safeParse('ababababab').success).toBe(false);
  });

  it('rejects anything under 10 characters', () => {
    expect(passwordSchema.safeParse('Sh0rt!aa').success).toBe(false);
  });

  it('accepts a long passphrase without demanding symbol gymnastics', () => {
    // NIST-aligned: length beats forced character classes.
    expect(passwordSchema.safeParse('correct horse battery staple').success).toBe(true);
    expect(passwordSchema.safeParse('SuperSecret123!').success).toBe(true);
  });

  it('caps at bcrypt input limit rather than silently truncating', () => {
    expect(passwordSchema.safeParse('x9K'.repeat(40)).success).toBe(false);
  });

  it('is enforced on registration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-organization')
      .send({
        organization: { legalName: 'Weak Pw Ltd', displayName: 'Weak Pw', businessType: 'general' },
        owner: { fullName: 'Ada Owner', email: `owner-${randomUUID()}@test.ultispro.dev`, password: 'password123' },
      });

    expect(res.status).toBe(400);
  });

  it('still accepts the schema shape used everywhere else in the suite', () => {
    const parsed = registerOrganizationSchema.safeParse({
      organization: { legalName: 'Fine Ltd', displayName: 'Fine', businessType: 'general' },
      owner: { fullName: 'Ada Owner', email: 'ada@example.com', password: 'SuperSecret123!' },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('Response hardening', () => {
  it('does not advertise the server technology', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the anti-framing and anti-sniffing headers on API responses', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('marks responses no-store, since they carry per-tenant financial data', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('rejects an unknown browser origin', async () => {
    const res = await request(app).get('/healthz').set('Origin', 'https://evil.example.com');
    // The CORS middleware errors the request rather than reflecting the
    // origin back, which is what would let a hostile site read responses.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Authentication surface', () => {
  it('does not reveal whether an email exists on failed login', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${randomUUID()}@test.ultispro.dev`, password: 'SuperSecret123!' });

    expect(unknown.status).toBe(401);
    // A message naming the reason ("no such user" vs "wrong password") turns
    // the login form into an account-enumeration oracle.
    expect(JSON.stringify(unknown.body).toLowerCase()).not.toContain('not found');
  });

  it('requires authentication on a representative protected route', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(401);
  });

  it('rejects a forged bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});
