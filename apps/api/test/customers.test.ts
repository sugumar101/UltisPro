import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for Phase 4 (Customers & CRM, M7). Requires migrations
 * 0001-0007 applied against the test database, same as the earlier phase
 * test suites.
 */

const app = createApp();

function uniqueEmail(): string {
  return `owner-${randomUUID()}@test.ultispro.dev`;
}

async function setupOrg() {
  const email = uniqueEmail();
  const registerRes = await request(app)
    .post('/api/v1/auth/register-organization')
    .send({
      organization: { legalName: 'Test Retail Pvt Ltd', displayName: 'Test Retail', businessType: 'general' },
      owner: { fullName: 'Ada Owner', email, password: 'SuperSecret123!' },
    });

  const accessToken: string = registerRes.body.data.accessToken;
  return { accessToken };
}

describe('Customers & CRM (Phase 4 exit criteria)', () => {
  it('seeds a default walk-in customer for a brand-new organization', async () => {
    const { accessToken } = await setupOrg();
    const res = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const walkin = res.body.data.find((c: { is_walkin: boolean }) => c.is_walkin);
    expect(walkin).toBeTruthy();
    expect(walkin.full_name).toBe('Walk-in Customer');
    expect(Number(walkin.credit_limit)).toBe(0);
  });

  it('the walk-in customer cannot be deleted', async () => {
    const { accessToken } = await setupOrg();
    const listRes = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${accessToken}`);
    const walkin = listRes.body.data.find((c: { is_walkin: boolean }) => c.is_walkin);

    const deleteRes = await request(app)
      .delete(`/api/v1/customers/${walkin.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(422);
  });

  it('creates a customer and rejects a duplicate phone number', async () => {
    const { accessToken } = await setupOrg();
    const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;

    const first = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Priya Sharma', phone, creditLimit: 5000 });
    expect(first.status).toBe(201);
    expect(Number(first.body.data.outstanding_balance)).toBe(0);

    const dup = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Someone Else', phone });
    expect(dup.status).toBe(409);
  });

  it('enforces the credit limit when charging a sale to the customer account', async () => {
    const { accessToken } = await setupOrg();

    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Ravi Kumar', creditLimit: 1000 });
    const customerId = customerRes.body.data.id;

    const chargeWithinLimit = await request(app)
      .post(`/api/v1/customers/${customerId}/charge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 600 });
    expect(chargeWithinLimit.status).toBe(200);
    expect(Number(chargeWithinLimit.body.data.outstanding_balance)).toBe(600);

    // A further charge of 500 would push the balance to 1100, over the 1000 limit.
    const chargeOverLimit = await request(app)
      .post(`/api/v1/customers/${customerId}/charge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 500 });
    expect(chargeOverLimit.status).toBe(422);

    // Balance is unchanged after the rejected charge.
    const afterRejection = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(Number(afterRejection.body.data.customer.outstanding_balance)).toBe(600);

    // A charge that exactly reaches the limit (400 more) is allowed.
    const chargeToLimit = await request(app)
      .post(`/api/v1/customers/${customerId}/charge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 400 });
    expect(chargeToLimit.status).toBe(200);
    expect(Number(chargeToLimit.body.data.outstanding_balance)).toBe(1000);
  });

  it('a customer with credit_limit 0 (the default) cannot be charged at all', async () => {
    const { accessToken } = await setupOrg();
    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'No Credit Customer' });
    const customerId = customerRes.body.data.id;

    const chargeRes = await request(app)
      .post(`/api/v1/customers/${customerId}/charge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 1 });
    expect(chargeRes.status).toBe(422);
  });

  it('records a payment that reduces the outstanding balance', async () => {
    const { accessToken } = await setupOrg();
    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Deepa Nair', creditLimit: 2000 });
    const customerId = customerRes.body.data.id;

    await request(app)
      .post(`/api/v1/customers/${customerId}/charge`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 800 });

    const paymentRes = await request(app)
      .post(`/api/v1/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 300 });
    expect(paymentRes.status).toBe(200);
    expect(Number(paymentRes.body.data.outstanding_balance)).toBe(500);
  });

  it('manages customer addresses, keeping only one default at a time', async () => {
    const { accessToken } = await setupOrg();
    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Address Test Customer' });
    const customerId = customerRes.body.data.id;

    const addr1 = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Home', line1: '123 MG Road', city: 'Bengaluru', isDefault: true });
    expect(addr1.status).toBe(201);
    expect(addr1.body.data.is_default).toBe(true);

    const addr2 = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Office', line1: '456 Brigade Road', city: 'Bengaluru', isDefault: true });
    expect(addr2.status).toBe(201);
    expect(addr2.body.data.is_default).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const addresses = detail.body.data.addresses;
    expect(addresses).toHaveLength(2);
    const defaults = addresses.filter((a: { is_default: boolean }) => a.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].label).toBe('Office');
  });
});
