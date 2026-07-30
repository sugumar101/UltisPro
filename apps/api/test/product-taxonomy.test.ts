import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for the clothing product taxonomy feature (Product
 * Types -> Product Categories, and the dedicated /products/clothing
 * creation endpoint that turns a size selection into one variant per size
 * plus opening stock). Requires migrations 0001-0010 applied against the
 * test database.
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
      organization: { legalName: 'Test Retail Pvt Ltd', displayName: 'Test Retail', businessType: 'clothing' },
      owner: { fullName: 'Ada Owner', email, password: 'SuperSecret123!' },
    });
  const accessToken: string = registerRes.body.data.accessToken;

  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const branchId: string = meRes.body.data.assignments[0].branchId;

  return { accessToken, branchId };
}

async function createTShirtType(accessToken: string) {
  const res = await request(app)
    .post('/api/v1/product-types')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: `T-Shirts-${randomUUID().slice(0, 8)}`, sizeOptions: ['S', 'M', 'L', 'XL'] });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createCategoryFor(accessToken: string, productTypeId: string, name = 'Oversized') {
  const res = await request(app)
    .post('/api/v1/product-categories')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ productTypeId, name });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('Product taxonomy (types + nested categories)', () => {
  it('creates a product type with size options and a category nested under it', async () => {
    const { accessToken } = await setupOrg();
    const type = await createTShirtType(accessToken);
    expect(type.size_options).toEqual(['S', 'M', 'L', 'XL']);

    const category = await createCategoryFor(accessToken, type.id, 'Oversized');
    expect(category.product_type_id).toBe(type.id);

    const listRes = await request(app)
      .get('/api/v1/product-categories')
      .query({ productTypeId: type.id })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listRes.body.data.map((c: { id: string }) => c.id)).toContain(category.id);
  });

  it('rejects a category referencing a product type from another organization', async () => {
    const orgA = await setupOrg();
    const orgB = await setupOrg();
    const type = await createTShirtType(orgA.accessToken);

    const res = await request(app)
      .post('/api/v1/product-categories')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ productTypeId: type.id, name: 'Oversized' });
    expect(res.status).toBe(400);
  });
});

describe('Clothing product creation (/products/clothing)', () => {
  it('creates a product with one variant per selected size, an auto-generated 5-digit product code, and posts opening stock', async () => {
    const { accessToken, branchId } = await setupOrg();
    const type = await createTShirtType(accessToken);
    const category = await createCategoryFor(accessToken, type.id);

    const res = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: type.id,
        productCategoryId: category.id,
        name: 'Classic Oversized Tee',
        gender: 'unisex',
        sizes: [
          { size: 'S', quantity: 5 },
          { size: 'M', quantity: 10 },
          { size: 'L', quantity: 0 },
        ],
        mrp: 999,
        sellingPrice: 799,
        branchId,
      });

    expect(res.status).toBe(201);
    const { product, variants, adjustment } = res.body.data;

    expect(product.product_code).toMatch(/^\d{5}$/);
    expect(product.gender).toBe('unisex');
    expect(variants).toHaveLength(3);

    const skus = variants.map((v: { sku: string }) => v.sku).sort();
    expect(skus).toEqual([`${product.product_code}-L`, `${product.product_code}-M`, `${product.product_code}-S`].sort());

    // Only S and M had quantity > 0, so an adjustment should exist covering those two lines.
    expect(adjustment).toBeTruthy();

    const sVariant = variants.find((v: { sku: string }) => v.sku.endsWith('-S'));
    const mVariant = variants.find((v: { sku: string }) => v.sku.endsWith('-M'));
    const lVariant = variants.find((v: { sku: string }) => v.sku.endsWith('-L'));

    const stockRes = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const stockByVariant: Record<string, number> = {};
    for (const row of stockRes.body.data) {
      stockByVariant[row.productVariantId] = Number(row.quantityOnHand);
    }

    expect(stockByVariant[sVariant.id]).toBe(5);
    expect(stockByVariant[mVariant.id]).toBe(10);
    // L had quantity 0 -- no stock movement, so it may not appear in branch_stock at all.
    expect(stockByVariant[lVariant.id] ?? 0).toBe(0);
  });

  it('does not post any adjustment when every size has quantity 0', async () => {
    const { accessToken, branchId } = await setupOrg();
    const type = await createTShirtType(accessToken);
    const category = await createCategoryFor(accessToken, type.id);

    const res = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: type.id,
        productCategoryId: category.id,
        name: 'Zero Stock Tee',
        gender: 'men',
        sizes: [{ size: 'S', quantity: 0 }],
        mrp: 500,
        sellingPrice: 400,
        branchId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.adjustment).toBeNull();
  });

  it('rejects a duplicate size within the same submission', async () => {
    const { accessToken, branchId } = await setupOrg();
    const type = await createTShirtType(accessToken);
    const category = await createCategoryFor(accessToken, type.id);

    const res = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: type.id,
        productCategoryId: category.id,
        name: 'Duplicate Size Tee',
        gender: 'women',
        sizes: [
          { size: 'M', quantity: 1 },
          { size: 'M', quantity: 2 },
        ],
        mrp: 500,
        sellingPrice: 400,
        branchId,
      });

    expect(res.status).toBe(400);
  });

  it('rejects a category that does not belong to the selected product type', async () => {
    const { accessToken, branchId } = await setupOrg();
    const shirtsType = await createTShirtType(accessToken);
    const pantsType = await request(app)
      .post('/api/v1/product-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Pants-${randomUUID().slice(0, 8)}`, sizeOptions: ['30', '32', '34'] });
    const pantsCategory = await createCategoryFor(accessToken, pantsType.body.data.id, 'Slim Fit');

    const res = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: shirtsType.id,
        productCategoryId: pantsCategory.id, // belongs to pantsType, not shirtsType
        name: 'Mismatched Product',
        gender: 'unisex',
        sizes: [{ size: 'M', quantity: 1 }],
        mrp: 500,
        sellingPrice: 400,
        branchId,
      });

    expect(res.status).toBe(400);
  });

  it('assigns distinct product codes to two different clothing products', async () => {
    const { accessToken, branchId } = await setupOrg();
    const type = await createTShirtType(accessToken);
    const category = await createCategoryFor(accessToken, type.id);

    const base = {
      productTypeId: type.id,
      productCategoryId: category.id,
      gender: 'unisex' as const,
      sizes: [{ size: 'M', quantity: 1 }],
      mrp: 500,
      sellingPrice: 400,
      branchId,
    };

    const first = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...base, name: 'Product One' });
    const second = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...base, name: 'Product Two' });

    expect(first.body.data.product.product_code).not.toBe(second.body.data.product.product_code);
  });
});
