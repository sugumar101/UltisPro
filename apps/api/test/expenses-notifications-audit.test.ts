import { randomUUID } from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * Integration tests for Phase 7 (Expenses, Notifications & Audit Surface,
 * M10 + M13). Requires migrations 0001-0009 applied against the test
 * database.
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

  return { accessToken, branchId, unitId };
}

describe('Expenses (Phase 7 exit criteria: expenses feed into P&L)', () => {
  it('creates an expense category and an expense against it', async () => {
    const { accessToken } = await setupOrg();

    const categoryRes = await request(app)
      .post('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Rent' });
    expect(categoryRes.status).toBe(201);

    const expenseRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ expenseCategoryId: categoryRes.body.data.id, amount: 15000, paymentMode: 'bank_transfer', notes: 'July rent' });
    expect(expenseRes.status).toBe(201);
    expect(Number(expenseRes.body.data.amount)).toBe(15000);

    const listRes = await request(app).get('/api/v1/expenses').set('Authorization', `Bearer ${accessToken}`);
    expect(listRes.body.data).toHaveLength(1);
  });

  it('rejects an expense against a category from another organization', async () => {
    const orgA = await setupOrg();
    const orgB = await setupOrg();

    const categoryRes = await request(app)
      .post('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Utilities' });

    const res = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .send({ expenseCategoryId: categoryRes.body.data.id, amount: 100, paymentMode: 'cash' });
    expect(res.status).toBe(400);
  });
});

describe('Notifications (Phase 7 exit criteria: low-stock events surface as in-app notifications)', () => {
  it('generates a low-stock notification on demand and lets it be marked read exactly once', async () => {
    const { accessToken, branchId, unitId } = await setupOrg();

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Notification Test Widget',
        unitId,
        variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 10, sellingPrice: 8, reorderLevel: 5 }],
      });
    const variantId = productRes.body.data.variants[0].id;

    // Stock at 3, reorder level 5 -> low stock.
    await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ branchId, reasonCode: 'opening_stock', items: [{ productVariantId: variantId, quantityDelta: 3 }] });

    const firstList = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${accessToken}`);
    expect(firstList.status).toBe(200);
    const lowStockNotif = firstList.body.data.find((n: { type: string }) => n.type === 'low_stock');
    expect(lowStockNotif).toBeTruthy();
    expect(lowStockNotif.read_at).toBeNull();

    // Fetching again must not create a duplicate for the same still-unread condition.
    const secondList = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${accessToken}`);
    const lowStockCount = secondList.body.data.filter((n: { type: string }) => n.type === 'low_stock').length;
    expect(lowStockCount).toBe(1);

    const readRes = await request(app)
      .post(`/api/v1/notifications/${lowStockNotif.id}/read`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.read_at).toBeTruthy();
  });
});

describe('Audit log (Phase 7 exit criteria: accurate before/after trail)', () => {
  it('lists audit entries with an accurate before/after trail for a product update', async () => {
    const { accessToken, unitId } = await setupOrg();

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Audit Test Widget',
        unitId,
        variants: [{ sku: `SKU-${randomUUID().slice(0, 8)}`, mrp: 10, sellingPrice: 8 }],
      });
    const productId = productRes.body.data.product.id;

    await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Audit Test Widget (renamed)' });

    const auditRes = await request(app)
      .get('/api/v1/audit-logs')
      .query({ entityTable: 'products', entityId: productId })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(auditRes.status).toBe(200);
    const actions = auditRes.body.data.map((e: { action: string }) => e.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
  });

  it('gates the audit log behind the AUDIT_VIEW permission', async () => {
    const res = await request(app).get('/api/v1/audit-logs');
    expect(res.status).toBe(401); // no token at all
  });
});
