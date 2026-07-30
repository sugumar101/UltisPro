import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for the product-entry conveniences: inline
 * find-or-create of Category/Brand by name, and auto-generated in-store
 * EAN-13 barcodes. Requires migrations 0001-0010.
 *
 * These exist because a brand-new organization starts with zero categories
 * and zero brands, which made the old id-only dropdowns unusable without
 * first detouring through Settings.
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
      organization: { legalName: 'Autofill Test Pvt Ltd', displayName: 'Autofill Test', businessType: 'clothing' },
      owner: { fullName: 'Ada Owner', email, password: 'SuperSecret123!' },
    });
  const accessToken: string = registerRes.body.data.accessToken;

  const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  const branchId: string = meRes.body.data.assignments[0].branchId;

  const unitsRes = await request(app).get('/api/v1/units').set('Authorization', `Bearer ${accessToken}`);
  const unitId: string = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece').id;

  return { accessToken, branchId, unitId };
}

function newSku(): string {
  return `SKU-${randomUUID().slice(0, 8)}`;
}

describe('Inline category/brand creation on product save', () => {
  it('creates a category and brand that did not exist before, and links them to the product', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Inline Masters Tee',
        unitId,
        categoryName: 'Topwear',
        brandName: 'Northwind',
        variants: [{ sku: newSku(), mrp: 999, sellingPrice: 799 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.product.category_id).toBeTruthy();
    expect(res.body.data.product.brand_id).toBeTruthy();

    // They must now show up as real masters, usable from Settings too.
    const categories = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${accessToken}`);
    expect(categories.body.data.map((c: { name: string }) => c.name)).toContain('Topwear');

    const brands = await request(app).get('/api/v1/brands').set('Authorization', `Bearer ${accessToken}`);
    expect(brands.body.data.map((b: { name: string }) => b.name)).toContain('Northwind');
  });

  it('reuses an existing category/brand instead of duplicating it, case-insensitively', async () => {
    const { accessToken, unitId } = await setupOrg();

    const first = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'First Tee',
        unitId,
        categoryName: 'Topwear',
        brandName: 'Northwind',
        variants: [{ sku: newSku(), mrp: 999, sellingPrice: 799 }],
      });

    // Different casing and surrounding whitespace must still match.
    const second = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Second Tee',
        unitId,
        categoryName: '  topwear ',
        brandName: 'NORTHWIND',
        variants: [{ sku: newSku(), mrp: 999, sellingPrice: 799 }],
      });

    expect(second.body.data.product.category_id).toBe(first.body.data.product.category_id);
    expect(second.body.data.product.brand_id).toBe(first.body.data.product.brand_id);

    const categories = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${accessToken}`);
    const topwearCount = categories.body.data.filter(
      (c: { name: string }) => c.name.toLowerCase() === 'topwear',
    ).length;
    expect(topwearCount).toBe(1);
  });

  it('leaves category/brand null when neither an id nor a name is given', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Bare Product', unitId, variants: [{ sku: newSku(), mrp: 10, sellingPrice: 8 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.product.category_id).toBeNull();
    expect(res.body.data.product.brand_id).toBeNull();
  });
});

describe('Automatic barcode generation', () => {
  it('generates a valid in-store EAN-13 for a variant saved without one', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Auto Barcode Tee', unitId, variants: [{ sku: newSku(), mrp: 500, sellingPrice: 400 }] });

    const barcode: string = res.body.data.variants[0].barcode;
    expect(barcode).toMatch(/^20\d{11}$/); // restricted-circulation prefix + 13 total digits
  });

  it('does not overwrite a manufacturer barcode the user supplied', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Branded Goods',
        unitId,
        variants: [{ sku: newSku(), barcode: '5901234123457', mrp: 500, sellingPrice: 400 }],
      });

    expect(res.body.data.variants[0].barcode).toBe('5901234123457');
  });

  it('gives every variant of a multi-variant product a distinct barcode', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Multi Variant Tee',
        unitId,
        hasVariants: true,
        variants: [
          { sku: newSku(), mrp: 500, sellingPrice: 400 },
          { sku: newSku(), mrp: 500, sellingPrice: 400 },
          { sku: newSku(), mrp: 500, sellingPrice: 400 },
        ],
      });

    const barcodes = res.body.data.variants.map((v: { barcode: string }) => v.barcode);
    expect(new Set(barcodes).size).toBe(3);
  });

  it('gives each size of a clothing product its own barcode so scanning rings up the right size', async () => {
    const { accessToken, branchId } = await setupOrg();

    const typeRes = await request(app)
      .post('/api/v1/product-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `T-Shirts-${randomUUID().slice(0, 8)}`, sizeOptions: ['S', 'M', 'L'] });
    const categoryRes = await request(app)
      .post('/api/v1/product-categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productTypeId: typeRes.body.data.id, name: 'Oversized' });

    const res = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: typeRes.body.data.id,
        productCategoryId: categoryRes.body.data.id,
        name: 'Barcoded Oversized Tee',
        brandName: 'Northwind',
        gender: 'unisex',
        sizes: [
          { size: 'S', quantity: 2 },
          { size: 'M', quantity: 3 },
          { size: 'L', quantity: 0 },
        ],
        mrp: 999,
        sellingPrice: 799,
        branchId,
      });

    expect(res.status).toBe(201);
    const barcodes = res.body.data.variants.map((v: { barcode: string }) => v.barcode);
    expect(barcodes).toHaveLength(3);
    expect(new Set(barcodes).size).toBe(3);
    for (const barcode of barcodes) expect(barcode).toMatch(/^20\d{11}$/);

    // The brand typed on the clothing form was created and linked too.
    expect(res.body.data.product.brand_id).toBeTruthy();
  });

  it('stores an optional colour on every size variant so it can print on the price tag', async () => {
    const { accessToken, branchId } = await setupOrg();

    const typeRes = await request(app)
      .post('/api/v1/product-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `T-Shirts-${randomUUID().slice(0, 8)}`, sizeOptions: ['S', 'M'] });
    const categoryRes = await request(app)
      .post('/api/v1/product-categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productTypeId: typeRes.body.data.id, name: 'Oversized' });

    const res = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: typeRes.body.data.id,
        productCategoryId: categoryRes.body.data.id,
        name: 'White Oversized Tee',
        color: 'White',
        gender: 'men',
        sizes: [
          { size: 'S', quantity: 1 },
          { size: 'M', quantity: 1 },
        ],
        mrp: 1299,
        sellingPrice: 999,
        branchId,
      });

    expect(res.status).toBe(201);
    for (const variant of res.body.data.variants) {
      expect(variant.attributes.color).toBe('White');
      expect(variant.attributes.size).toBeTruthy();
    }
  });
});
