import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for Phase 3 (Suppliers & Purchasing, M6). Requires
 * migrations 0001-0006 applied against the test database, same as
 * test/auth.test.ts and test/products-inventory.test.ts.
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

  const productRes = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Purchasing Test Widget',
      unitId,
      variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 100, sellingPrice: 80 }],
    });
  const variantId: string = productRes.body.data.variants[0].id;

  const supplierRes = await request(app)
    .post('/api/v1/suppliers')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Acme Supplies', paymentTermsDays: 30 });
  const supplierId: string = supplierRes.body.data.id;

  return { accessToken, branchId, variantId, supplierId };
}

describe('Suppliers & Purchasing (Phase 3 exit criteria)', () => {
  it('creates a supplier with zero outstanding balance', async () => {
    const { accessToken, supplierId } = await setupOrg();
    const res = await request(app).get(`/api/v1/suppliers/${supplierId}`).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.data.supplier.outstanding_balance)).toBe(0);
  });

  it('creates a draft PO with correctly computed subtotal/tax/grand totals', async () => {
    const { accessToken, branchId, variantId, supplierId } = await setupOrg();

    const res = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        supplierId,
        items: [{ productVariantId: variantId, quantityOrdered: 10, unitCost: 50 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.header.status).toBe('draft');
    expect(Number(res.body.data.header.subtotal)).toBe(500);
    expect(Number(res.body.data.header.tax_total)).toBe(0);
    expect(Number(res.body.data.header.grand_total)).toBe(500);
  });

  it('rejects receiving against a draft (unapproved) PO', async () => {
    const { accessToken, branchId, variantId, supplierId } = await setupOrg();
    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, supplierId, items: [{ productVariantId: variantId, quantityOrdered: 5, unitCost: 20 }] });
    const poId = poRes.body.data.header.id;
    const itemId = poRes.body.data.items[0].id;

    const receiveRes = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 5 }] });

    expect(receiveRes.status).toBe(422);
  });

  it('runs the full approve -> partial receive -> full receive flow, writing stock and supplier balance correctly', async () => {
    const { accessToken, branchId, variantId, supplierId } = await setupOrg();

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, supplierId, items: [{ productVariantId: variantId, quantityOrdered: 20, unitCost: 30 }] });
    const poId = poRes.body.data.header.id;
    const itemId = poRes.body.data.items[0].id;

    const approveRes = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/approve`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    // Receive 12 of 20.
    const partialReceive = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 12 }] });
    expect(partialReceive.status).toBe(200);
    expect(partialReceive.body.data.status).toBe('partially_received');

    const stockAfterPartial = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const rowAfterPartial = stockAfterPartial.body.data.find(
      (r: { productVariantId: string }) => r.productVariantId === variantId,
    );
    expect(Number(rowAfterPartial.quantityOnHand)).toBe(12);

    const supplierAfterPartial = await request(app)
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(Number(supplierAfterPartial.body.data.supplier.outstanding_balance)).toBe(360); // 12 * 30

    // Attempting to receive more than the remaining 8 must be rejected.
    const overReceive = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 9 }] });
    expect(overReceive.status).toBe(422);

    // Receive the remaining 8 -> PO should flip to fully received.
    const finalReceive = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 8 }] });
    expect(finalReceive.status).toBe(200);
    expect(finalReceive.body.data.status).toBe('received');

    const stockAfterFull = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const rowAfterFull = stockAfterFull.body.data.find(
      (r: { productVariantId: string }) => r.productVariantId === variantId,
    );
    expect(Number(rowAfterFull.quantityOnHand)).toBe(20);

    const supplierAfterFull = await request(app)
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(Number(supplierAfterFull.body.data.supplier.outstanding_balance)).toBe(600); // 20 * 30
  });

  it('records a purchase return that removes stock and reduces the supplier balance', async () => {
    const { accessToken, branchId, variantId, supplierId } = await setupOrg();

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, supplierId, items: [{ productVariantId: variantId, quantityOrdered: 10, unitCost: 25 }] });
    const poId = poRes.body.data.header.id;
    const itemId = poRes.body.data.items[0].id;

    await request(app).post(`/api/v1/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${accessToken}`);
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 10 }] });

    // Outstanding balance is now 250 (10 * 25); return 4 units.
    const returnRes = await request(app)
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId: poId,
        reason: 'Damaged in transit',
        items: [{ productVariantId: variantId, quantity: 4, unitCost: 25 }],
      });
    expect(returnRes.status).toBe(201);

    const stockAfterReturn = await request(app)
      .get('/api/v1/inventory/stock')
      .query({ branchId })
      .set('Authorization', `Bearer ${accessToken}`);
    const row = stockAfterReturn.body.data.find((r: { productVariantId: string }) => r.productVariantId === variantId);
    expect(Number(row.quantityOnHand)).toBe(6); // 10 received - 4 returned

    const supplierRes = await request(app)
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(Number(supplierRes.body.data.supplier.outstanding_balance)).toBe(150); // 250 - (4*25)=100 -> 150

    // Returning more than was received must be rejected.
    const overReturn = await request(app)
      .post('/api/v1/purchase-returns')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        purchaseOrderId: poId,
        items: [{ productVariantId: variantId, quantity: 100, unitCost: 25 }],
      });
    expect(overReturn.status).toBe(422);
  });

  it('records a supplier payment that reduces the outstanding balance', async () => {
    const { accessToken, branchId, variantId, supplierId } = await setupOrg();

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, supplierId, items: [{ productVariantId: variantId, quantityOrdered: 4, unitCost: 100 }] });
    const poId = poRes.body.data.header.id;
    const itemId = poRes.body.data.items[0].id;

    await request(app).post(`/api/v1/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${accessToken}`);
    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 4 }] });

    // Outstanding balance is 400 (4 * 100).
    const paymentRes = await request(app)
      .post(`/api/v1/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amount: 150, paymentMode: 'bank_transfer', purchaseOrderId: poId });
    expect(paymentRes.status).toBe(201);

    const supplierRes = await request(app)
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(Number(supplierRes.body.data.supplier.outstanding_balance)).toBe(250);
    expect(supplierRes.body.data.payments).toHaveLength(1);
  });

  it('cancels a draft PO and rejects cancelling a fully received one', async () => {
    const { accessToken, branchId, variantId, supplierId } = await setupOrg();

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, supplierId, items: [{ productVariantId: variantId, quantityOrdered: 1, unitCost: 10 }] });
    const poId = poRes.body.data.header.id;

    const cancelRes = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');

    const secondCancel = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(secondCancel.status).toBe(422);
  });
});
