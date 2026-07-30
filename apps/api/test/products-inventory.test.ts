import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for Phase 2 (Catalog + Inventory Core, M4->M5). Requires
 * migrations 0001-0005 applied against the test database, same as
 * test/auth.test.ts. Each test registers its own organization so runs don't
 * collide, and exercises the real HTTP surface end-to-end rather than
 * calling services/repositories directly.
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
  // Seeded automatically at registration — see auth.service.ts registerOrganization().
  const defaultUnit = unitsRes.body.data.find((u: { name: string }) => u.name === 'Piece');

  return { accessToken, branchId, unitId: defaultUnit.id as string };
}

describe('Catalog + Inventory (Phase 2 exit criteria)', () => {
  it('seeds a default "Piece" unit for a brand-new organization', async () => {
    const { unitId } = await setupOrg();
    expect(typeof unitId).toBe('string');
  });

  it('creates a product with a single variant', async () => {
    const { accessToken, unitId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Notebook A5',
        unitId,
        variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 100, sellingPrice: 90 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.product.name).toBe('Notebook A5');
    expect(res.body.data.variants).toHaveLength(1);
  });

  it('creates a product with multiple variants and rejects duplicate SKUs', async () => {
    const { accessToken, unitId } = await setupOrg();
    const sku = `SKU-${randomUUID().slice(0, 8)}`;

    const first = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'T-Shirt',
        unitId,
        hasVariants: true,
        variants: [
          { sku, mrp: 500, sellingPrice: 450 },
          { sku: `${sku}-L`, mrp: 500, sellingPrice: 450 },
        ],
      });
    expect(first.status).toBe(201);
    expect(first.body.data.variants).toHaveLength(2);

    const dup = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Another product', unitId, variants: [{ sku, mrp: 1, sellingPrice: 1 }] });

    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('holds the stock ledger reconciliation invariant across adjustments and transfers', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ledger Test Widget',
        unitId,
        variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 50, sellingPrice: 40, reorderLevel: 5 }],
      });
    const variantId: string = productRes.body.data.variants[0].id;

    // Opening stock: +100
    const opening = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        reasonCode: 'opening_stock',
        items: [{ productVariantId: variantId, quantityDelta: 100 }],
      });
    expect(opening.status).toBe(201);

    // Damage write-off: -10
    const damage = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        reasonCode: 'damage',
        items: [{ productVariantId: variantId, quantityDelta: -10 }],
      });
    expect(damage.status).toBe(201);

    // A negative adjustment that would push stock below zero must be rejected...
    const overDraw = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        reasonCode: 'other',
        items: [{ productVariantId: variantId, quantityDelta: -1000 }],
      });
    expect(overDraw.status).toBe(422);

    // ...and must not have written anything to the ledger.
    const stockAfterRejection = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const rowAfterRejection = stockAfterRejection.body.data.find(
      (r: { productVariantId: string }) => r.productVariantId === variantId,
    );
    expect(Number(rowAfterRejection.quantityOnHand)).toBe(90);

    const ledgerRes = await request(app)
      .get('/api/v1/inventory/ledger')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);

    const entriesForVariant = ledgerRes.body.data.filter(
      (row: { product_variant_id: string }) => row.product_variant_id === variantId,
    );
    const sumOfDeltas = entriesForVariant.reduce(
      (sum: number, row: { quantity_delta: string }) => sum + Number(row.quantity_delta),
      0,
    );

    expect(sumOfDeltas).toBe(90);
    expect(Number(rowAfterRejection.quantityOnHand)).toBe(sumOfDeltas);
  });

  it('moves stock between branches via a transfer (dispatch, then receive)', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();

    // A second branch under the same store, to transfer into.
    const storesRes = await request(app).get('/api/v1/stores').set('Authorization', `Bearer ${accessToken}`);
    const storeId: string = storesRes.body.data[0].id;
    const branch2Res = await request(app)
      .post(`/api/v1/stores/${storeId}/branches`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Second Branch', code: `BR-${randomUUID().slice(0, 6)}` });
    const branch2Id: string = branch2Res.body.data.id;

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Transfer Test Widget',
        unitId,
        variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 20, sellingPrice: 15 }],
      });
    const variantId: string = productRes.body.data.variants[0].id;

    await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variantId, quantityDelta: 30 }] });

    const transferRes = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fromBranchId: branchId,
        toBranchId: branch2Id,
        items: [{ productVariantId: variantId, quantity: 12 }],
      });
    expect(transferRes.status).toBe(201);
    expect(transferRes.body.data.status).toBe('in_transit');

    const receiveRes = await request(app)
      .post(`/api/v1/inventory/transfers/${transferRes.body.data.id}/receive`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.status).toBe('completed');

    const stockRes = await request(app)
      .get('/api/v1/inventory/stock')
      .set('Authorization', `Bearer ${accessToken}`);
    const sourceRow = stockRes.body.data.find(
      (r: { productVariantId: string; branchId: string }) => r.productVariantId === variantId && r.branchId === branchId,
    );
    const destRow = stockRes.body.data.find(
      (r: { productVariantId: string; branchId: string }) => r.productVariantId === variantId && r.branchId === branch2Id,
    );

    expect(Number(sourceRow.quantityOnHand)).toBe(18);
    expect(Number(destRow.quantityOnHand)).toBe(12);

    // Receiving the same transfer twice must be rejected, not double-applied.
    const secondReceive = await request(app)
      .post(`/api/v1/inventory/transfers/${transferRes.body.data.id}/receive`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(secondReceive.status).toBe(422);
  });
});
