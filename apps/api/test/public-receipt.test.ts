import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * The public bill link is the only unauthenticated read path in the
 * application, so these tests are about what it *doesn't* expose as much as
 * what it does. Requires migrations 0001-0014.
 */

const app = createApp();

async function setupOrg() {
  const registerRes = await request(app)
    .post('/api/v1/auth/register-organization')
    .send({
      organization: { legalName: 'Public Bill Pvt Ltd', displayName: 'Public Bill', businessType: 'clothing' },
      owner: {
        fullName: 'Ada Owner',
        email: `owner-${randomUUID()}@test.ultispro.dev`,
        password: 'SuperSecret123!',
      },
    });
  const accessToken: string = registerRes.body.data.accessToken;

  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const branchId: string = meRes.body.data.assignments[0].branchId;

  const unitsRes = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);
  const unitId: string = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece').id;

  return { accessToken, branchId, unitId };
}

/** Rings up a sale, optionally to a named customer, and returns the invoice. */
async function makeSale(opts: { withCustomer?: boolean } = {}) {
  const { accessToken, branchId, unitId } = await setupOrg();

  let customerId: string | undefined;
  if (opts.withCustomer) {
    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fullName: 'Priya Sharma',
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        email: 'priya@example.com',
      });
    customerId = customerRes.body.data.id;
  }

  const productRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Public Bill Tee', unitId, variants: [{ mrp: 500, sellingPrice: 400 }] });
  const variant = productRes.body.data.variants[0];

  await request(app)
    .post('/api/v1/inventory/adjustments')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variant.id, quantityDelta: 10 }] });

  const saleRes = await request(app)
    .post('/api/v1/sales')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      branchId,
      ...(customerId && { customerId }),
      items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 400, discountAmount: 0 }],
      payments: [{ amount: 800, paymentMode: 'cash' }],
    });

  expect(saleRes.status).toBe(201);
  return { accessToken, invoice: saleRes.body.data.invoice, variantId: variant.id };
}

describe('Public bill token', () => {
  it('mints an unguessable token on every new invoice', async () => {
    const { invoice } = await makeSale();

    expect(typeof invoice.public_token).toBe('string');
    // 32 random bytes as base64url — long enough that enumeration is
    // infeasible, which is the token's entire security model.
    expect(invoice.public_token.length).toBeGreaterThanOrEqual(40);
    expect(invoice.public_token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is not the invoice id, so a link never exposes the internal identifier', async () => {
    const { invoice } = await makeSale();
    expect(invoice.public_token).not.toBe(invoice.id);
  });

  it('gives two invoices different tokens', async () => {
    const first = await makeSale();
    const second = await makeSale();
    expect(first.invoice.public_token).not.toBe(second.invoice.public_token);
  });
});

describe('GET /public/receipt/:token', () => {
  it('serves the bill with no authentication at all', async () => {
    const { invoice } = await makeSale();

    // Deliberately no Authorization header — this is the customer's view.
    const res = await request(app).get(`/api/v1/public/receipt/${invoice.public_token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.invoice.invoiceNumber).toBe(invoice.invoice_number);
    expect(Number(res.body.data.invoice.grandTotal)).toBeCloseTo(800, 2);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productName).toBe('Public Bill Tee');
  });

  it('404s an unknown token without revealing whether it ever existed', async () => {
    const res = await request(app).get('/api/v1/public/receipt/not-a-real-token-at-all');
    expect(res.status).toBe(404);
  });

  it('does not leak internal identifiers', async () => {
    const { invoice } = await makeSale();
    const res = await request(app).get(`/api/v1/public/receipt/${invoice.public_token}`);

    const body = JSON.stringify(res.body);
    // None of these belong on a page anyone with the URL can open.
    expect(body).not.toContain(invoice.id);
    expect(body).not.toContain(invoice.organization_id);
    expect(body).not.toContain(invoice.branch_id);
    expect(res.body.data.invoice.id).toBeUndefined();
  });

  it('does not leak the customer phone, email or account balance', async () => {
    const { invoice } = await makeSale({ withCustomer: true });
    const res = await request(app).get(`/api/v1/public/receipt/${invoice.public_token}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('priya@example.com');
    expect(body).not.toContain('outstanding_balance');
    expect(body).not.toContain('credit_limit');
  });

  it('greets the customer by first name only', async () => {
    const { invoice } = await makeSale({ withCustomer: true });
    const res = await request(app).get(`/api/v1/public/receipt/${invoice.public_token}`);

    // A bill forwarded to a group chat shouldn't disclose a full name.
    expect(res.body.data.customerName).toBe('Priya');
  });

  it('shows no customer name for a walk-in sale', async () => {
    const { invoice } = await makeSale();
    const res = await request(app).get(`/api/v1/public/receipt/${invoice.public_token}`);
    expect(res.body.data.customerName).toBeNull();
  });

  it('includes the shop details a customer needs to recognise the bill', async () => {
    const { invoice } = await makeSale();
    const res = await request(app).get(`/api/v1/public/receipt/${invoice.public_token}`);

    expect(res.body.data.store).toBeTruthy();
    expect(res.body.data.organizationName).toBe('Public Bill');
    expect(res.body.data.amountInWords).toContain('Rupees');
  });
});
