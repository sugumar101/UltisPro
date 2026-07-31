import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { normalizePhone, toWhatsAppNumber } from '../src/shared/phone';

/**
 * Phone-based customer capture at the counter. Requires migrations
 * 0001-0012.
 */

const app = createApp();

function uniqueEmail(): string {
  return `owner-${randomUUID()}@test.ultispro.dev`;
}

/** Random 10-digit mobile so parallel tests can't collide on the unique phone constraint. */
function uniquePhone(): string {
  return `9${Math.floor(100000000 + Math.random() * 899999999)}`;
}

async function setupOrg() {
  const email = uniqueEmail();
  const registerRes = await request(app)
    .post('/api/v1/auth/register-organization')
    .send({
      organization: { legalName: 'Lookup Test Pvt Ltd', displayName: 'Lookup Test', businessType: 'clothing' },
      owner: { fullName: 'Ada Owner', email, password: 'SuperSecret123!' },
    });
  return { accessToken: registerRes.body.data.accessToken as string };
}

describe('normalizePhone', () => {
  it('reduces the many ways one number gets typed to a single canonical form', () => {
    const expected = '9876543210';
    expect(normalizePhone('9876543210')).toBe(expected);
    expect(normalizePhone('98765 43210')).toBe(expected);
    expect(normalizePhone('98765-43210')).toBe(expected);
    expect(normalizePhone('+91 98765 43210')).toBe(expected);
    expect(normalizePhone('919876543210')).toBe(expected);
    expect(normalizePhone('09876543210')).toBe(expected);
    expect(normalizePhone('+91-098765-43210')).toBe(expected);
  });

  it('treats unusable input as absent rather than storing a fragment', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('12345')).toBeNull(); // too short to identify anyone
    expect(normalizePhone('abc')).toBeNull();
  });

  it('keeps longer international numbers intact', () => {
    expect(normalizePhone('+1 415 555 0123')).toBe('14155550123');
  });
});

describe('toWhatsAppNumber', () => {
  it('adds the country code to a bare 10-digit number', () => {
    expect(toWhatsAppNumber('98765 43210')).toBe('919876543210');
  });

  it('leaves an already-qualified number alone', () => {
    expect(toWhatsAppNumber('+91 98765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('+1 415 555 0123')).toBe('14155550123');
  });

  it('returns null for an unusable number so callers can explain the failure', () => {
    expect(toWhatsAppNumber('123')).toBeNull();
  });
});

describe('GET /customers/lookup', () => {
  it('finds a customer regardless of how the number is formatted', async () => {
    const { accessToken } = await setupOrg();
    const phone = uniquePhone();

    await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Repeat Customer', phone });

    for (const variant of [phone, `+91 ${phone}`, `0${phone}`, `91${phone}`]) {
      const res = await request(app)
        .get('/api/v1/customers/lookup')
        .query({ phone: variant })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data?.full_name).toBe('Repeat Customer');
    }
  });

  it('returns null (not 404) for an unknown number, since a new customer is the expected case', async () => {
    const { accessToken } = await setupOrg();

    const res = await request(app)
      .get('/api/v1/customers/lookup')
      .query({ phone: uniquePhone() })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('never returns the shared walk-in placeholder as a recognised customer', async () => {
    const { accessToken } = await setupOrg();

    const list = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${accessToken}`);
    const walkin = list.body.data.find((c: { is_walkin: boolean }) => c.is_walkin);
    expect(walkin).toBeTruthy();

    // Even if the walk-in row somehow carried a phone, lookup must skip it.
    const res = await request(app)
      .get('/api/v1/customers/lookup')
      .query({ phone: uniquePhone() })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data).toBeNull();
  });

  it('does not leak customers across organizations', async () => {
    const orgA = await setupOrg();
    const orgB = await setupOrg();
    const phone = uniquePhone();

    await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ fullName: 'Org A Customer', phone });

    const res = await request(app)
      .get('/api/v1/customers/lookup')
      .query({ phone })
      .set('Authorization', `Bearer ${orgB.accessToken}`);

    expect(res.body.data).toBeNull();
  });
});

describe('Sales list customer columns', () => {
  /** Rings up one sale so the list has something to join against. */
  async function saleForCustomer(accessToken: string, customerId?: string) {
    const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    const branchId: string = meRes.body.data.assignments[0].branchId;

    const unitsRes = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);
    const unitId: string = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece').id;

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Sale List Item', unitId, variants: [{ mrp: 100, sellingPrice: 100 }] });
    const variantId = productRes.body.data.variants[0].id;

    await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variantId, quantityDelta: 5 }] });

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        ...(customerId && { customerId }),
        items: [{ productVariantId: variantId, quantity: 1, unitPrice: 100, discountAmount: 0 }],
        payments: [{ amount: 100, paymentMode: 'cash' }],
      });
    expect(saleRes.status).toBe(201);
    return saleRes.body.data.invoice.id as string;
  }

  it('returns the customer name and phone alongside each invoice', async () => {
    const { accessToken } = await setupOrg();
    const phone = uniquePhone();

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Listed Customer', phone });

    await saleForCustomer(accessToken, customer.body.data.id);

    const res = await request(app).get('/api/v1/sales').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    const invoice = res.body.data[0];
    expect(invoice.customerName).toBe('Listed Customer');
    expect(invoice.customerPhone).toBe(phone);
    expect(invoice.customerIsWalkin).toBe(false);
  });

  it('flags walk-in sales rather than showing a blank customer', async () => {
    const { accessToken } = await setupOrg();
    await saleForCustomer(accessToken); // no customerId -> walk-in

    const res = await request(app).get('/api/v1/sales').set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.data[0].customerIsWalkin).toBe(true);
  });

  it('searches by customer name and phone, keeping the paging total consistent with the rows', async () => {
    const { accessToken } = await setupOrg();
    const phone = uniquePhone();

    const customer = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Findable Person', phone });

    await saleForCustomer(accessToken, customer.body.data.id);
    await saleForCustomer(accessToken); // a walk-in sale that must be excluded

    const byName = await request(app)
      .get('/api/v1/sales')
      .query({ q: 'Findable' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(byName.body.data).toHaveLength(1);
    // The count query carries the same filters — a mismatch here is what
    // makes a pager claim more pages than actually exist.
    expect(byName.body.meta.total).toBe(1);

    const byPhone = await request(app)
      .get('/api/v1/sales')
      .query({ q: phone })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(byPhone.body.data).toHaveLength(1);
    expect(byPhone.body.meta.total).toBe(1);
  });
});

describe('Customer creation from the counter', () => {
  it('stores the phone normalised so one person cannot become three records', async () => {
    const { accessToken } = await setupOrg();
    const phone = uniquePhone();

    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Normalised Customer', phone: `+91 ${phone}` });

    expect(created.body.data.phone).toBe(phone);
  });

  it('returns the existing customer instead of failing when the number is already known', async () => {
    const { accessToken } = await setupOrg();
    const phone = uniquePhone();

    const first = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'First Name', phone });

    // A second till (or a double-tap) submitting the same number must not
    // hit the unique constraint — at a counter that's a dead end.
    const second = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Typed Again', phone: `0${phone}` });

    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('defaults marketing consent to false and timestamps it only when granted', async () => {
    const { accessToken } = await setupOrg();

    const withoutConsent = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'No Consent', phone: uniquePhone() });
    expect(withoutConsent.body.data.marketing_opt_in).toBe(false);
    expect(withoutConsent.body.data.marketing_consent_at).toBeNull();

    const withConsent = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Opted In', phone: uniquePhone(), marketingOptIn: true });
    expect(withConsent.body.data.marketing_opt_in).toBe(true);
    expect(withConsent.body.data.marketing_consent_at).toBeTruthy();
  });

  it('clears the consent timestamp when consent is withdrawn', async () => {
    const { accessToken } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Changed Mind', phone: uniquePhone(), marketingOptIn: true });

    const updated = await request(app)
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ marketingOptIn: false });

    expect(updated.body.data.marketing_opt_in).toBe(false);
    // A stale date must not linger and later read as current consent.
    expect(updated.body.data.marketing_consent_at).toBeNull();
  });
});
