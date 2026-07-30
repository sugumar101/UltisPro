import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for Phase 6 (Dashboard & Reports, M12 + M11). Requires
 * migrations 0001-0008 applied against the test database. No new tables
 * were added in this phase — everything here reads existing data, so these
 * tests build a small known dataset (one taxed sale, one taxed purchase
 * receipt) and check the aggregates against hand-computed numbers.
 */

const app = createApp();

function uniqueEmail(): string {
  return `owner-${randomUUID()}@test.ultispro.dev`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function setupOrgWithKnownActivity() {
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

  // GST 18% intra-state (9% CGST + 9% SGST), for both sale and purchase.
  const taxRes = await request(app)
    .post('/api/v1/taxes')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'GST 18%', ratePercent: 18, cgstPercent: 9, sgstPercent: 9 });
  const taxId: string = taxRes.body.data.id;

  const productRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Report Test Widget',
      unitId,
      taxId,
      variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 150, sellingPrice: 100, purchasePrice: 50 }],
    });
  const variantId: string = productRes.body.data.variants[0].id;

  const suppliersRes = await request(app)
    .post('/api/v1/suppliers')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Report Test Supplier' });
  const supplierId: string = suppliersRes.body.data.id;

  // Opening stock: +20
  await request(app)
    .post('/api/v1/inventory/adjustments')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variantId, quantityDelta: 20 }] });

  // Known sale: 2 units @ 100, 18% tax -> subtotal 200, tax 36, grand total 236, paid in full (cash).
  const saleRes = await request(app)
    .post('/api/v1/sales')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      branchId,
      customerId: walkinId,
      items: [{ productVariantId: variantId, quantity: 2, unitPrice: 100, taxId }],
      payments: [{ amount: 236, paymentMode: 'cash' }],
    });

  // Known purchase receipt: 10 units @ unit cost 50, 18% tax.
  const poRes = await request(app)
    .post('/api/v1/purchase-orders')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      branchId,
      supplierId,
      items: [{ productVariantId: variantId, quantityOrdered: 10, unitCost: 50, taxId }],
    });
  const poId = poRes.body.data.header.id;
  const poItemId = poRes.body.data.items[0].id;
  await request(app).post(`/api/v1/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${accessToken}`);
  await request(app)
    .post(`/api/v1/purchase-orders/${poId}/receive`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ items: [{ purchaseOrderItemId: poItemId, quantityReceived: 10 }] });

  return { accessToken, branchId, variantId, saleId: saleRes.body.data.invoice.id };
}

describe('Dashboard & Reports (Phase 6 exit criteria)', () => {
  it('dashboard summary reflects live data from earlier phases', async () => {
    const { accessToken } = await setupOrgWithKnownActivity();

    const res = await request(app).get('/api/v1/dashboard/summary').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.todaySalesTotal).toBe(236);
    expect(res.body.data.todaySalesCount).toBe(1);
    expect(res.body.data.activeProductCount).toBe(1);
    expect(res.body.data.pendingPurchaseOrderCount).toBe(0); // fully received
  });

  it('the sales report totals match the known sale exactly', async () => {
    const { accessToken } = await setupOrgWithKnownActivity();
    const yesterday = isoDate(new Date(Date.now() - 86400000));
    const tomorrow = isoDate(new Date(Date.now() + 86400000));

    const res = await request(app)
      .get('/api/v1/reports/sales')
      .query({ fromDate: yesterday, toDate: tomorrow })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.invoiceCount).toBe(1);
    expect(res.body.data.totals.subtotal).toBe(200);
    expect(res.body.data.totals.taxTotal).toBe(36);
    expect(res.body.data.totals.grandTotal).toBe(236);
    expect(res.body.data.bestSellers[0].quantitySold).toBe(2);
  });

  it('the GST report nets output tax against input tax with the correct CGST/SGST split', async () => {
    const { accessToken } = await setupOrgWithKnownActivity();
    const yesterday = isoDate(new Date(Date.now() - 86400000));
    const tomorrow = isoDate(new Date(Date.now() + 86400000));

    const res = await request(app)
      .get('/api/v1/reports/gst')
      .query({ fromDate: yesterday, toDate: tomorrow })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    // Output tax: sale of 200 taxable @ 18% = 36 (18 CGST + 18 SGST).
    expect(res.body.data.totalOutputTax).toBe(36);
    expect(res.body.data.outputTax[0].cgstAmount).toBe(18);
    expect(res.body.data.outputTax[0].sgstAmount).toBe(18);
    // Input tax: purchase of 500 taxable (10 * 50) @ 18% = 90 (45 + 45).
    expect(res.body.data.totalInputTax).toBe(90);
    expect(res.body.data.inputTax[0].cgstAmount).toBe(45);
    // Net payable = output - input = 36 - 90 = -54 (a refund position, correctly negative).
    expect(res.body.data.netPayable).toBe(-54);
  });

  it('the inventory report values stock at purchase price', async () => {
    const { accessToken, variantId } = await setupOrgWithKnownActivity();
    const res = await request(app).get('/api/v1/reports/inventory').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    // 20 opening - 2 sold + 10 received = 28 on hand, at purchase price 50 => value 1400.
    const row = res.body.data.rows.find((r: { sku: string }) => true);
    expect(row).toBeTruthy();
    expect(res.body.data.totalStockValue).toBe(1400);
  });

  it('the cash-flow report captures the sale payment as cash in', async () => {
    const { accessToken } = await setupOrgWithKnownActivity();
    const yesterday = isoDate(new Date(Date.now() - 86400000));
    const tomorrow = isoDate(new Date(Date.now() + 86400000));

    const res = await request(app)
      .get('/api/v1/reports/cash-flow')
      .query({ fromDate: yesterday, toDate: tomorrow })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalIn).toBe(236);
    const cashRow = res.body.data.cashIn.find((r: { paymentMode: string }) => r.paymentMode === 'cash');
    expect(cashRow.total).toBe(236);
  });

  it('CSV export returns a text/csv payload', async () => {
    const { accessToken } = await setupOrgWithKnownActivity();
    const yesterday = isoDate(new Date(Date.now() - 86400000));
    const tomorrow = isoDate(new Date(Date.now() + 86400000));

    const res = await request(app)
      .get('/api/v1/reports/sales')
      .query({ fromDate: yesterday, toDate: tomorrow, format: 'csv' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('grandTotal');
  });
});
