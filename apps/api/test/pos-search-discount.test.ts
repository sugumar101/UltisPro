import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for POS search behaviour, auto-generated SKUs, and
 * bill-level discounts. Requires migrations 0001-0011.
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
      organization: { legalName: 'POS Test Pvt Ltd', displayName: 'POS Test', businessType: 'clothing' },
      owner: { fullName: 'Ada Owner', email, password: 'SuperSecret123!' },
    });
  const accessToken: string = registerRes.body.data.accessToken;

  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const branchId: string = meRes.body.data.assignments[0].branchId;

  const unitsRes = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);
  const unitId: string = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece').id;

  return { accessToken, branchId, unitId };
}

/** Creates a stocked product and returns what POS needs to sell it. */
async function stockedProduct(
  accessToken: string,
  branchId: string,
  unitId: string,
  name: string,
  opts: { sellingPrice?: number; quantity?: number; taxId?: string } = {},
) {
  const productRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name,
      unitId,
      ...(opts.taxId && { taxId: opts.taxId }),
      variants: [{ mrp: opts.sellingPrice ?? 100, sellingPrice: opts.sellingPrice ?? 100 }],
    });
  expect(productRes.status).toBe(201);

  const variant = productRes.body.data.variants[0];

  await request(app)
    .post('/api/v1/inventory/adjustments')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      branchId,
      reasonCode: 'opening_stock',
      items: [{ productVariantId: variant.id, quantityDelta: opts.quantity ?? 10 }],
    });

  return { productId: productRes.body.data.product.id, variant };
}

describe('Auto-generated SKUs', () => {
  it('mints a readable unique SKU when none is supplied', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    const { variant } = await stockedProduct(accessToken, branchId, unitId, 'Classic Oversized Plain');

    // Stem from the product name + a 5-digit serial.
    expect(variant.sku).toMatch(/^CLA-\d{5}$/);
  });

  it('gives every variant of a multi-variant product a distinct SKU', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Multi Variant Tee',
        unitId,
        hasVariants: true,
        variants: [
          { mrp: 100, sellingPrice: 90 },
          { mrp: 100, sellingPrice: 90 },
          { mrp: 100, sellingPrice: 90 },
        ],
      });

    const skus = res.body.data.variants.map((v: { sku: string }) => v.sku);
    expect(new Set(skus).size).toBe(3);
  });

  it('still honours a SKU the user typed', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Manual Sku Product', unitId, variants: [{ sku: 'MY-OWN-SKU', mrp: 10, sellingPrice: 8 }] });

    expect(res.body.data.variants[0].sku).toBe('MY-OWN-SKU');
  });
});

describe('Product list stock totals', () => {
  it('reports stock summed across variants, and 0 for an unstocked product', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();

    await stockedProduct(accessToken, branchId, unitId, 'Stocked Item', { quantity: 7 });

    // Created but never stocked.
    await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Unstocked Item', unitId, variants: [{ mrp: 10, sellingPrice: 8 }] });

    const res = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${accessToken}`);

    const stocked = res.body.data.find((p: { name: string }) => p.name === 'Stocked Item');
    const unstocked = res.body.data.find((p: { name: string }) => p.name === 'Unstocked Item');

    expect(stocked.totalStock).toBe(7);
    expect(stocked.variantCount).toBe(1);
    expect(unstocked.totalStock).toBe(0);
  });

  it('sums stock across a multi-variant product without inflating the row count', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Three Size Tee',
        unitId,
        hasVariants: true,
        variants: [
          { mrp: 100, sellingPrice: 90 },
          { mrp: 100, sellingPrice: 90 },
          { mrp: 100, sellingPrice: 90 },
        ],
      });

    for (const variant of created.body.data.variants) {
      await request(app)
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId,
          reasonCode: 'opening_stock',
          items: [{ productVariantId: variant.id, quantityDelta: 4 }],
        });
    }

    const res = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${accessToken}`);

    // The stock aggregate is a separate query precisely so joining variants
    // can't duplicate product rows or corrupt the paging total.
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);

    const product = res.body.data[0];
    expect(product.totalStock).toBe(12);
    expect(product.variantCount).toBe(3);
  });
});

describe('POS search', () => {
  it('finds a product by a single name word', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    await stockedProduct(accessToken, branchId, unitId, 'Classic Oversized Plain');

    const res = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: 'oversized' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productName).toBe('Classic Oversized Plain');
  });

  it('matches words in any order, which a single-substring search could not', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    await stockedProduct(accessToken, branchId, unitId, 'Classic Oversized Plain');

    // "oversized classic" never appears as a contiguous substring of the
    // name — this is the case that used to return nothing.
    const res = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: 'oversized classic' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data).toHaveLength(1);
  });

  it('tolerates extra whitespace between words', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    await stockedProduct(accessToken, branchId, unitId, 'Classic Oversized Plain');

    const res = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: '  classic   plain ' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data).toHaveLength(1);
  });

  it('requires every term to match, so unrelated words exclude the product', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    await stockedProduct(accessToken, branchId, unitId, 'Classic Oversized Plain');

    const res = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: 'classic denim' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data).toHaveLength(0);
  });

  it('finds a product by its auto-generated SKU and by barcode', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    const { variant } = await stockedProduct(accessToken, branchId, unitId, 'Searchable Widget');

    const bySku = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: variant.sku })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(bySku.body.data).toHaveLength(1);

    const byBarcode = await request(app)
      .get('/api/v1/pos/search')
      .query({ branchId, q: variant.barcode })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(byBarcode.body.data).toHaveLength(1);
    expect(byBarcode.body.data[0].barcode).toBe(variant.barcode);
  });
});

describe('Bill-level discount', () => {
  it('reduces the grand total by the discount when there is no tax', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    const { variant } = await stockedProduct(accessToken, branchId, unitId, 'Plain Item', { sellingPrice: 100 });

    const res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 100, discountAmount: 0 }],
        billDiscountAmount: 50,
        payments: [{ amount: 150, paymentMode: 'cash' }],
      });

    expect(res.status).toBe(201);
    // 200 gross - 50 discount, no tax.
    expect(Number(res.body.data.invoice.grand_total)).toBeCloseTo(150, 2);
    expect(Number(res.body.data.invoice.discount_total)).toBeCloseTo(50, 2);
  });

  it('applies the discount BEFORE tax, so GST is charged on the discounted value', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();

    const taxRes = await request(app)
      .post('/api/v1/taxes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'GST 18%', ratePercent: 18, cgstPercent: 9, sgstPercent: 9, igstPercent: 0 });
    const taxId = taxRes.body.data.id;

    const { variant } = await stockedProduct(accessToken, branchId, unitId, 'Taxed Item', {
      sellingPrice: 100,
      taxId,
    });

    const res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 100, discountAmount: 0, taxId }],
        billDiscountAmount: 100,
        payments: [{ amount: 118, paymentMode: 'cash' }],
      });

    expect(res.status).toBe(201);
    // Taxable value 200 - 100 = 100; tax = 18; grand total = 118.
    // If the discount were taken off the total instead, tax would be 36 and
    // the customer would be charged GST on money they never paid.
    expect(Number(res.body.data.invoice.tax_total)).toBeCloseTo(18, 2);
    expect(Number(res.body.data.invoice.grand_total)).toBeCloseTo(118, 2);
  });

  it('prorates the discount across lines by value', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    const cheap = await stockedProduct(accessToken, branchId, unitId, 'Cheap Item', { sellingPrice: 100 });
    const dear = await stockedProduct(accessToken, branchId, unitId, 'Dear Item', { sellingPrice: 300 });

    const res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        items: [
          { productVariantId: cheap.variant.id, quantity: 1, unitPrice: 100, discountAmount: 0 },
          { productVariantId: dear.variant.id, quantity: 1, unitPrice: 300, discountAmount: 0 },
        ],
        billDiscountAmount: 40,
        payments: [{ amount: 360, paymentMode: 'cash' }],
      });

    expect(res.status).toBe(201);
    const items = res.body.data.items;
    const cheapLine = items.find((i: { product_variant_id: string }) => i.product_variant_id === cheap.variant.id);
    const dearLine = items.find((i: { product_variant_id: string }) => i.product_variant_id === dear.variant.id);

    // 100/400 and 300/400 of the ₹40 discount.
    expect(Number(cheapLine.discount_amount)).toBeCloseTo(10, 2);
    expect(Number(dearLine.discount_amount)).toBeCloseTo(30, 2);
  });

  it('rejects a discount larger than the pre-tax total', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();
    const { variant } = await stockedProduct(accessToken, branchId, unitId, 'Small Item', { sellingPrice: 50 });

    const res = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        items: [{ productVariantId: variant.id, quantity: 1, unitPrice: 50, discountAmount: 0 }],
        billDiscountAmount: 500,
        payments: [],
      });

    expect(res.status).toBe(400);
  });
});
