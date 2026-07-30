import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests against a real Postgres database — these require
 * migrations to have been applied first (`npm run migrate`, or the CI
 * "Apply migrations to the test database" step). Each test uses a unique
 * email so the suite is safe to re-run against a persistent test database
 * without unique-constraint collisions.
 */

const app = createApp();

function uniqueEmail(): string {
  return `owner-${randomUUID()}@test.ultispro.dev`;
}

async function registerOrg(email: string, overrides: Partial<{ legalName: string; password: string }> = {}) {
  return request(app)
    .post('/api/v1/auth/register-organization')
    .send({
      organization: {
        legalName: overrides.legalName ?? 'Test Retail Pvt Ltd',
        displayName: 'Test Retail',
        businessType: 'general',
      },
      owner: { fullName: 'Ada Owner', email, password: overrides.password ?? 'SuperSecret123!' },
    });
}

describe('Auth + RBAC (Phase 1 exit criteria)', () => {
  it('registers an organization, creating an Owner user scoped to a default branch', async () => {
    const email = uniqueEmail();
    const res = await registerOrg(email);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.email).toBe(email);

    const cookies = res.get('Set-Cookie');
    expect(cookies?.some((c: string) => c.startsWith('ultispro_refresh_token='))).toBe(true);
  });

  it('rejects registering the same owner email twice', async () => {
    const email = uniqueEmail();

    const first = await registerOrg(email);
    expect(first.status).toBe(201);

    const second = await registerOrg(email);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('logs in, fetches /auth/me with the Owner permission set, and can hit an org:manage-gated endpoint', async () => {
    const email = uniqueEmail();
    await registerOrg(email);

    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: 'SuperSecret123!' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.accessToken as string;

    const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.assignments).toHaveLength(1);
    expect(meRes.body.data.assignments[0].permissions).toContain('org:manage');

    const orgRes = await request(app)
      .patch('/api/v1/organizations/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Renamed Co' });
    expect(orgRes.status).toBe(200);
    expect(orgRes.body.data.display_name).toBe('Renamed Co');
  });

  it('rejects login with the wrong password', async () => {
    const email = uniqueEmail();
    await registerOrg(email);

    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'not-the-password' });
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token on /auth/refresh and rejects the old one on reuse', async () => {
    const email = uniqueEmail();
    const registerRes = await registerOrg(email);

    const setCookie = registerRes.get('Set-Cookie') ?? [];
    const refreshCookie = setCookie.find((c: string) => c.startsWith('ultispro_refresh_token='));
    expect(refreshCookie).toBeDefined();

    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie!);
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.accessToken).toBe('string');

    // Reusing the original (now-rotated) refresh cookie must fail — this is
    // the reuse-detection path in auth.service.ts#refresh.
    const reuseRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie!);
    expect(reuseRes.status).toBe(401);
  });

  it('denies /api/v1/users without a token and allows it for an Owner (who has users:manage)', async () => {
    const noAuthRes = await request(app).get('/api/v1/users');
    expect(noAuthRes.status).toBe(401);

    const email = uniqueEmail();
    const registerRes = await registerOrg(email);
    const token = registerRes.body.data.accessToken as string;

    const asOwnerRes = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(asOwnerRes.status).toBe(200);
    expect(Array.isArray(asOwnerRes.body.data)).toBe(true);

    const garbageTokenRes = await request(app).get('/api/v1/users').set('Authorization', 'Bearer garbage');
    expect(garbageTokenRes.status).toBe(401);
  });
});
