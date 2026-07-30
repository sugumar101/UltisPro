import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for Phase 5 (POS & Sales, M8 + M9). Requires migrations
 * 0001-0008 applied against the test database.
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

  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const branchId: string = meRes.body.data.assignments[0].branchId;

  const unitsRes = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);
  const unitId: string = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece').id;

  const customersRes = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${accessToken}`);
  const walkinId: string = customersRes.body.data.find((c: { is_walkin: boolean }) => c.is_walkin).id;

  const productRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Sales Test Widget',
      unitId,
      variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 150, sellingPrice: 100, reorderLevel: 0 }],
    });
  const variantId: string = productRes.body.data.variants[0].id;

  // Seed 50 units of opening stock so sales have something to sell against.
  await request(app)
    .post('/api/v1/inventory/adjustments')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variantId, quantityDelta: 50 }] });

  return { accessToken, branchId, variantId, walkinId };
}

describe('POS & Sales (Phase 5 exit criteria)', () => {
  it('assigns gapless sequential invoice numbers per store', async () => {
    const { accessToken, branchId, variantId, walkinId } = await setupOrg();

    const first = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId: walkinId,
        items: [{ productVariantId: variantId, quantity: 1, unitPrice: 100 }],
        payments: [{ amount: 100, paymentMode: 'cash' }],
      });
    expect(first.status).toBe(201);
    expect(first.body.data.invoice.invoice_number).toBe('INV-000001');

    const second = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId: walkinId,
        items: [{ productVariantId: variantId, quantity: 1, unitPrice: 100 }],
        payments: [{ amount: 100, paymentMode: 'cash' }],
      });
    expect(second.status).toBe(201);
    expect(second.body.data.invoice.invoice_number).toBe('INV-000002');
  });

  it('decrements stock on sale and computes totals correctly', async () => {
    const { accessToken, branchId, variantId, walkinId } = await setupOrg();

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId: walkinId,
        items: [{ productVariantId: variantId, quantity: 5, unitPrice: 100, discountAmount: 20 }],
        payments: [{ amount: 480, paymentMode: 'cash' }],
      });
    expect(saleRes.status).toBe(201);
    expect(Number(saleRes.body.data.invoice.subtotal)).toBe(500);
    expect(Number(saleRes.body.data.invoice.discount_total)).toBe(20);
    expect(Number(saleRes.body.data.invoice.grand_total)).toBe(480);

    const stockRes = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const row = stockRes.body.data.find((r: { productVariantId: string }) => r.productVariantId === variantId);
    expect(Number(row.quantityOnHand)).toBe(45); // 50 opening - 5 sold
  });

  it('rejects a sale that would take stock negative', async () => {
    const { accessToken, branchId, variantId, walkinId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId: walkinId,
        items: [{ productVariantId: variantId, quantity: 1000, unitPrice: 100 }],
        payments: [{ amount: 100000, paymentMode: 'cash' }],
      });
    expect(res.status).toBe(422);
  });

  it('the walk-in customer cannot buy on credit', async () => {
    const { accessToken, branchId, variantId, walkinId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId: walkinId,
        items: [{ productVariantId: variantId, quantity: 1, unitPrice: 100 }],
        payments: [], // no payment at all -> full shortfall
      });
    expect(res.status).toBe(422);
  });

  it('splits payment across two modes and charges the remaining shortfall to a registered customer within their credit limit', async () => {
    const { accessToken, branchId, variantId } = await setupOrg();

    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Credit Customer', creditLimit: 200 });
    const customerId = customerRes.body.data.id;

    // Total = 3 * 100 = 300. Pay 150 cash + 100 card = 250, leaving a 50 shortfall.
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId,
        items: [{ productVariantId: variantId, quantity: 3, unitPrice: 100 }],
        payments: [
          { amount: 150, paymentMode: 'cash' },
          { amount: 100, paymentMode: 'card' },
        ],
      });
    expect(saleRes.status).toBe(201);
    expect(Number(saleRes.body.data.invoice.amount_paid)).toBe(250);
    expect(Number(saleRes.body.data.invoice.grand_total)).toBe(300);
    expect(saleRes.body.data.payments).toHaveLength(2);

    const customerAfter = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(Number(customerAfter.body.data.customer.outstanding_balance)).toBe(50);
  });

  it('rejects a sale whose on-account shortfall would exceed the customer credit limit', async () => {
    const { accessToken, branchId, variantId } = await setupOrg();

    const customerRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Low Credit Customer', creditLimit: 10 });
    const customerId = customerRes.body.data.id;

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId,
        items: [{ productVariantId: variantId, quantity: 3, unitPrice: 100 }],
        payments: [{ amount: 100, paymentMode: 'cash' }], // 200 shortfall, limit is 10
      });
    expect(saleRes.status).toBe(422);
  });

  it('processes a sales return that restores stock and flips the invoice to returned', async () => {
    const { accessToken, branchId, variantId, walkinId } = await setupOrg();

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        customerId: walkinId,
        items: [{ productVariantId: variantId, quantity: 4, unitPrice: 100 }],
        payments: [{ amount: 400, paymentMode: 'cash' }],
      });
    const invoiceId = saleRes.body.data.invoice.id;
    const itemId = saleRes.body.data.items[0].id;

    const returnRes = await request(app)
      .post(`/api/v1/sales/${invoiceId}/return`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Customer changed their mind', items: [{ salesInvoiceItemId: itemId, quantity: 4, refundAmount: 400 }] });
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.status).toBe('returned');

    const stockRes = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const row = stockRes.body.data.find((r: { productVariantId: string }) => r.productVariantId === variantId);
    expect(Number(row.quantityOnHand)).toBe(50); // back to the 50 opening stock

    // Returning more than was sold must be rejected.
    const overReturn = await request(app)
      .post(`/api/v1/sales/${invoiceId}/return`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ salesInvoiceItemId: itemId, quantity: 1, refundAmount: 100 }] });
    expect(overReturn.status).toBe(422);
  });

  it('POS search finds a product by name and reports branch stock', async () => {
    const { accessToken, branchId } = await setupOrg();
    const res = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: 'Sales Test Widget' })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(Number(res.body.data[0].quantityOnHand)).toBe(50);
  });

  it('holds a cart and resumes it', async () => {
    const { accessToken, branchId, variantId } = await setupOrg();

    const holdRes = await request(app)
      .post('/api/v1/pos/hold')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        registerCode: 'REG-1',
        cartSnapshot: [{ productVariantId: variantId, sku: 'SKU', productName: 'Widget', quantity: 2, unitPrice: 100 }],
      });
    expect(holdRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/v1/pos/hold')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listRes.body.data).toHaveLength(1);

    const resumeRes = await request(app)
      .post(`/api/v1/pos/hold/${holdRes.body.data.id}/resume`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.cart_snapshot).toHaveLength(1);

    // Resuming consumes the hold.
    const listAfter = await request(app)
      .get('/api/v1/pos/hold')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listAfter.body.data).toHaveLength(0);
  });
});
