import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for HSN inheritance and the edit/delete lifecycle of
 * products and catalog masters. Requires migrations 0001-0011.
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
      organization: { legalName: 'CRUD Test Pvt Ltd', displayName: 'CRUD Test', businessType: 'clothing' },
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

describe('Automatic HSN assignment', () => {
  it('suggests an HSN from the product name when none is entered', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Classic Cotton T-Shirt',
        unitId,
        variants: [{ sku: newSku(), mrp: 999, sellingPrice: 799 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.product.hsn_code).toBe('6109');
  });

  it('never overrides an HSN the user typed', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Classic Cotton T-Shirt',
        unitId,
        hsnCode: '9999',
        variants: [{ sku: newSku(), mrp: 999, sellingPrice: 799 }],
      });

    expect(res.body.data.product.hsn_code).toBe('9999');
  });

  it('leaves HSN null when the product name matches nothing known, rather than inventing one', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Unclassifiable Gizmo', unitId, variants: [{ sku: newSku(), mrp: 10, sellingPrice: 8 }] });

    expect(res.body.data.product.hsn_code).toBeNull();
  });

  it('auto-fills a product type default HSN from its name, and clothing products inherit it', async () => {
    const { accessToken, branchId } = await setupOrg();

    const typeRes = await request(app)
      .post('/api/v1/product-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'T-Shirts', sizeOptions: ['S', 'M', 'L'] });
    expect(typeRes.body.data.default_hsn_code).toBe('6109');

    const categoryRes = await request(app)
      .post('/api/v1/product-categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productTypeId: typeRes.body.data.id, name: 'Oversized' });

    const productRes = await request(app)
      .post('/api/v1/products/clothing')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        productTypeId: typeRes.body.data.id,
        productCategoryId: categoryRes.body.data.id,
        // Name alone gives no clue — the code must come from the type.
        name: 'Midnight Special',
        gender: 'unisex',
        sizes: [{ size: 'M', quantity: 1 }],
        mrp: 999,
        sellingPrice: 799,
        branchId,
      });

    expect(productRes.body.data.product.hsn_code).toBe('6109');
  });

  it('respects an explicit default HSN set on the product type over the suggestion', async () => {
    const { accessToken } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/product-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'T-Shirts', sizeOptions: ['M'], defaultHsnCode: '6205' });

    expect(res.body.data.default_hsn_code).toBe('6205');
  });
});

describe('Product edit and delete', () => {
  it('updates a product name, description and HSN', async () => {
    const { accessToken, unitId } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Original Name', unitId, variants: [{ sku: newSku(), mrp: 100, sellingPrice: 90 }] });
    const productId = created.body.data.product.id;

    const updated = await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Renamed Product', description: 'Now with a description', hsnCode: '6203' });

    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Renamed Product');
    expect(updated.body.data.hsn_code).toBe('6203');
  });

  it('updates a variant price and barcode', async () => {
    const { accessToken, unitId } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Priced Product', unitId, variants: [{ sku: newSku(), mrp: 100, sellingPrice: 90 }] });
    const productId = created.body.data.product.id;
    const variantId = created.body.data.variants[0].id;

    const updated = await request(app)
      .patch(`/api/v1/products/${productId}/variants/${variantId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sellingPrice: 75, reorderLevel: 5 });

    expect(updated.status).toBe(200);
    expect(Number(updated.body.data.selling_price)).toBe(75);
    expect(updated.body.data.reorder_level).toBe(5);
  });

  it('deletes one variant of a multi-variant product', async () => {
    const { accessToken, unitId } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Two Variant Product',
        unitId,
        hasVariants: true,
        variants: [
          { sku: newSku(), mrp: 100, sellingPrice: 90 },
          { sku: newSku(), mrp: 100, sellingPrice: 90 },
        ],
      });
    const productId = created.body.data.product.id;
    const doomedVariantId = created.body.data.variants[0].id;

    const res = await request(app)
      .delete(`/api/v1/products/${productId}/variants/${doomedVariantId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(fetched.body.data.variants).toHaveLength(1);
    expect(fetched.body.data.variants.map((v: { id: string }) => v.id)).not.toContain(doomedVariantId);
  });

  it("refuses to delete a product's only variant, since a product must always have at least one", async () => {
    const { accessToken, unitId } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Single Variant Product', unitId, variants: [{ sku: newSku(), mrp: 100, sellingPrice: 90 }] });

    const res = await request(app)
      .delete(`/api/v1/products/${created.body.data.product.id}/variants/${created.body.data.variants[0].id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(422); // BUSINESS_RULE_VIOLATION
  });

  it('soft-deletes a product so it disappears from the list but the row survives for invoice history', async () => {
    const { accessToken, unitId } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Doomed Product', unitId, variants: [{ sku: newSku(), mrp: 100, sellingPrice: 90 }] });
    const productId = created.body.data.product.id;

    const deleted = await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleted.status).toBe(200);

    const list = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${accessToken}`);
    expect(list.body.data.map((p: { id: string }) => p.id)).not.toContain(productId);

    // Fetching it directly now 404s — it's gone from the application's view.
    const fetched = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(fetched.status).toBe(404);
  });
});

describe('Catalog master edit and delete', () => {
  it('renames and deletes a category', async () => {
    const { accessToken } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Topwear' });
    const id = created.body.data.id;

    const renamed = await request(app)
      .patch(`/api/v1/categories/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Upper Body' });
    expect(renamed.body.data.name).toBe('Upper Body');

    await request(app).delete(`/api/v1/categories/${id}`).set('Authorization', `Bearer ${accessToken}`);

    const list = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${accessToken}`);
    expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(id);
  });

  it('renames and deletes a product type', async () => {
    const { accessToken } = await setupOrg();

    const created = await request(app)
      .post('/api/v1/product-types')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Shirts', sizeOptions: ['S', 'M'] });
    const id = created.body.data.id;

    const updated = await request(app)
      .patch(`/api/v1/product-types/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Formal Shirts', sizeOptions: ['S', 'M', 'L'], defaultHsnCode: '6205' });
    expect(updated.body.data.name).toBe('Formal Shirts');
    expect(updated.body.data.size_options).toEqual(['S', 'M', 'L']);

    await request(app).delete(`/api/v1/product-types/${id}`).set('Authorization', `Bearer ${accessToken}`);

    const list = await request(app).get('/api/v1/product-types').set('Authorization', `Bearer ${accessToken}`);
    expect(list.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
  });

  it('does not let one organization edit another organization master', async () => {
    const orgA = await setupOrg();
    const orgB = await setupOrg();

    const created = await request(app)
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Northwind' });

    const res = await request(app)
      .patch(`/api/v1/brands/${created.body.data.id}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(404);
  });
});
