import { apiFetch } from './api-client';

export interface Supplier {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
  outstanding_balance: string;
  is_active: boolean;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  amount: string;
  payment_mode: string;
  paid_at: string;
}

export interface PurchaseOrder {
  id: string;
  branch_id: string;
  supplier_id: string;
  po_number: string;
  status: 'draft' | 'approved' | 'partially_received' | 'received' | 'cancelled';
  order_date: string;
  expected_date: string | null;
  subtotal: string;
  tax_total: string;
  grand_total: string;
  approved_by: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_variant_id: string;
  quantity_ordered: string;
  quantity_received: string;
  unit_cost: string;
  tax_id: string | null;
  line_total: string;
}

export interface PurchaseOrderItemInput {
  productVariantId: string;
  quantityOrdered: number;
  unitCost: number;
  taxId?: string;
}

export interface CreatePurchaseOrderInput {
  branchId: string;
  supplierId: string;
  expectedDate?: string;
  items: PurchaseOrderItemInput[];
}

export interface ReceiveItemInput {
  purchaseOrderItemId: string;
  quantityReceived: number;
}

export interface PurchaseReturn {
  id: string;
  purchase_order_id: string;
  reason: string | null;
  grand_total: string;
  created_at: string;
}

// --- Suppliers ---

export const listSuppliers = (token: string) => apiFetch<Supplier[]>('/api/v1/suppliers', {}, token);

export const getSupplier = (token: string, id: string) =>
  apiFetch<{ supplier: Supplier; payments: SupplierPayment[] }>(`/api/v1/suppliers/${id}`, {}, token);

export const createSupplier = (
  token: string,
  input: { name: string; gstin?: string; phone?: string; email?: string; paymentTermsDays?: number },
) => apiFetch<Supplier>('/api/v1/suppliers', { method: 'POST', body: JSON.stringify(input) }, token);

export const recordSupplierPayment = (
  token: string,
  supplierId: string,
  input: { amount: number; paymentMode: string; purchaseOrderId?: string },
) =>
  apiFetch<SupplierPayment>(
    `/api/v1/suppliers/${supplierId}/payments`,
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );

// --- Purchase orders ---

export const listPurchaseOrders = (token: string) => apiFetch<PurchaseOrder[]>('/api/v1/purchase-orders', {}, token);

export const getPurchaseOrder = (token: string, id: string) =>
  apiFetch<{ order: PurchaseOrder; items: PurchaseOrderItem[] }>(`/api/v1/purchase-orders/${id}`, {}, token);

export const createPurchaseOrder = (token: string, input: CreatePurchaseOrderInput) =>
  apiFetch<{ header: PurchaseOrder; items: PurchaseOrderItem[] }>(
    '/api/v1/purchase-orders',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );

export const approvePurchaseOrder = (token: string, id: string) =>
  apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}/approve`, { method: 'POST' }, token);

export const receivePurchaseOrder = (token: string, id: string, items: ReceiveItemInput[]) =>
  apiFetch<PurchaseOrder>(
    `/api/v1/purchase-orders/${id}/receive`,
    { method: 'POST', body: JSON.stringify({ items }) },
    token,
  );

export const cancelPurchaseOrder = (token: string, id: string) =>
  apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}/cancel`, { method: 'POST' }, token);

// --- Purchase returns ---

export const listPurchaseReturns = (token: string) => apiFetch<PurchaseReturn[]>('/api/v1/purchase-returns', {}, token);

export const createPurchaseReturn = (
  token: string,
  input: {
    purchaseOrderId: string;
    reason?: string;
    items: { productVariantId: string; quantity: number; unitCost: number; batchId?: string }[];
  },
) =>
  apiFetch<{ header: PurchaseReturn }>(
    '/api/v1/purchase-returns',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
