import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for GET /sales/:id/receipt — the endpoint backing
 * receipt/tax-invoice printing (POS-08, SAL-02). Requires migrations
 * 0001-0010 applied against the test database.
 *
 * The dataset is hand-computed so the GST summary can be asserted exactly:
 * 2 units @ ₹100 with an 18% tax split 9% CGST / 9% SGST
 *   taxable value = 200.00, tax = 36.00 (18.00 CGST + 18.00 SGST)
 *   grand total   = 236.00
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
      organization: { legalName: 'Receipt Test Pvt Ltd', displayName: 'Receipt Test', businessType: 'general' },
      owner: { fullName: 'Ada Owner', email, password: 'SuperSecret123!' },
    });
  const accessToken: string = registerRes.body.data.accessToken;

  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const branchId: string = meRes.body.data.assignments[0].branchId;

  const unitsRes = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);
  const unitId: string = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece').id;

  return { accessToken, branchId, unitId };
}

/** Builds one completed sale and returns its invoice id plus the ids used to make it. */
async function createSaleFixture() {
  const { accessToken, branchId, unitId } = await setupOrg();

  const taxRes = await request(app)
    .post('/api/v1/taxes')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'GST 18%', ratePercent: 18, cgstPercent: 9, sgstPercent: 9, igstPercent: 0 });
  const taxId: string = taxRes.body.data.id;

  const productRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Receipt Test Widget',
      unitId,
      taxId,
      hsnCode: '61091000',
      variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 120, sellingPrice: 100 }],
    });
  const variantId: string = productRes.body.data.variants[0].id;

  await request(app)
    .post('/api/v1/inventory/adjustments')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variantId, quantityDelta: 10 }] });

  const saleRes = await request(app)
    .post('/api/v1/sales')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      branchId,
      items: [{ productVariantId: variantId, quantity: 2, unitPrice: 100, discountAmount: 0, taxId }],
      payments: [{ amount: 236, paymentMode: 'cash' }],
    });
  expect(saleRes.status).toBe(201);

  return { accessToken, invoiceId: saleRes.body.data.invoice.id as string, variantId };
}

describe('GET /sales/:id/receipt', () => {
  it('returns line items joined to product name, SKU and HSN code', async () => {
    const { accessToken, invoiceId } = await createSaleFixture();

    const res = await request(app)
      .get(`/api/v1/sales/${invoiceId}/receipt`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const { items } = res.body.data;
    expect(items).toHaveLength(1);
    // The raw sales_invoice_items row carries none of these — they only
    // exist because the receipt query joins out to products/variants.
    expect(items[0].productName).toBe('Receipt Test Widget');
    expect(items[0].hsnCode).toBe('61091000');
    expect(typeof items[0].sku).toBe('string');
  });

  it('includes the store/branch letterhead block and cashier name', async () => {
    const { accessToken, invoiceId } = await createSaleFixture();

    const res = await request(app)
      .get(`/api/v1/sales/${invoiceId}/receipt`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.store).toBeTruthy();
    expect(res.body.data.branch).toBeTruthy();
    expect(res.body.data.organization.display_name).toBe('Receipt Test');
    expect(res.body.data.cashierName).toBe('Ada Owner');
  });

  it('computes a rate-wise GST summary that reconciles to the invoice tax total', async () => {
    const { accessToken, invoiceId } = await createSaleFixture();

    const res = await request(app)
      .get(`/api/v1/sales/${invoiceId}/receipt`)
      .set('Authorization', `Bearer ${accessToken}`);

    const { gstSummary, invoice } = res.body.data;
    expect(gstSummary).toHaveLength(1);

    const row = gstSummary[0];
    expect(row.ratePercent).toBe(18);
    expect(row.taxableValue).toBeCloseTo(200, 2);
    expect(row.cgst).toBeCloseTo(18, 2);
    expect(row.sgst).toBeCloseTo(18, 2);
    expect(row.igst).toBeCloseTo(0, 2);

    // The summary must add back up to what's stored on the invoice —
    // this is the property that makes the printed document defensible.
    expect(row.cgst + row.sgst + row.igst).toBeCloseTo(Number(invoice.tax_total), 2);
  });

  it('renders the grand total in words and reports a zero balance for a fully paid sale', async () => {
    const { accessToken, invoiceId } = await createSaleFixture();

    const res = await request(app)
      .get(`/api/v1/sales/${invoiceId}/receipt`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.amountInWords).toBe('Two Hundred Thirty Six Rupees Only');
    expect(res.body.data.amountPaid).toBeCloseTo(236, 2);
    expect(res.body.data.balanceDue).toBeCloseTo(0, 2);
  });

  it('does not leak an invoice belonging to another organization', async () => {
    const { invoiceId } = await createSaleFixture();
    const otherOrg = await setupOrg();

    const res = await request(app)
      .get(`/api/v1/sales/${invoiceId}/receipt`)
      .set('Authorization', `Bearer ${otherOrg.accessToken}`);

    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const { invoiceId } = await createSaleFixture();
    const res = await request(app).get(`/api/v1/sales/${invoiceId}/receipt`);
    expect(res.status).toBe(401);
  });
});
