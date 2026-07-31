import { apiFetch } from './api-client';

export interface PosSearchResult {
  productVariantId: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  mrp: string;
  productName: string;
  /** e.g. `{ size: 'XL', color: 'White' }` — distinguishes variants sharing a product name. */
  attributes: Record<string, string> | null;
  taxId: string | null;
  quantityOnHand: string | null;
}

/** "XL · White" from a variant's attributes, or empty when it has none. */
export function describeVariant(attributes: Record<string, string> | null | undefined): string {
  if (!attributes) return '';
  return [attributes.size, attributes.color].filter(Boolean).join(' · ');
}

export interface CartLine {
  productVariantId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxId?: string;
  /**
   * Stock on hand at the selling branch when the line was added. Client-side
   * only — it exists so the cashier can be warned *before* checkout that a
   * line will be rejected, rather than after they've collected payment. The
   * server re-checks stock inside the checkout transaction regardless; this
   * is a UX guard, never the source of truth.
   */
  availableStock?: number;
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
