import { apiFetch } from './api-client';

export interface PosSearchResult {
  productVariantId: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  mrp: string;
  productName: string;
  taxId: string | null;
  quantityOnHand: string | null;
}

export interface CartLine {
  productVariantId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxId?: string;
}

export interface HeldBill {
  id: string;
  branch_id: string;
  register_code: string;
  customer_id: string | null;
  cart_snapshot: CartLine[];
  created_at: string;
}

export const posSearch = (token: string, branchId: string, q: string) =>
  apiFetch<PosSearchResult[]>(`/api/v1/pos/search?branchId=${branchId}&q=${encodeURIComponent(q)}`, {}, token);

export const listHeldBills = (token: string, branchId: string) =>
  apiFetch<HeldBill[]>(`/api/v1/pos/hold?branchId=${branchId}`, {}, token);

export const holdBill = (
  token: string,
  input: { branchId: string; registerCode: string; customerId?: string; cartSnapshot: CartLine[] },
) => apiFetch<HeldBill>('/api/v1/pos/hold', { method: 'POST', body: JSON.stringify(input) }, token);

export const resumeHeldBill = (token: string, id: string) =>
  apiFetch<HeldBill>(`/api/v1/pos/hold/${id}/resume`, { method: 'POST' }, token);
