import { apiFetch } from './api-client';

export interface StockRow {
  id?: string;
  branchId: string;
  productVariantId: string;
  batchId: string | null;
  quantityOnHand: string;
  quantityReserved?: string;
  sku: string;
  reorderLevel: number;
  productName: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
}

export interface LedgerRow {
  id: string;
  branch_id: string;
  product_variant_id: string;
  movement_type: string;
  quantity_delta: string;
  balance_after: string;
  reference_table: string;
  reference_id: string;
  created_at: string;
}

export interface Transfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  status: string;
  created_at: string;
}

export interface AdjustmentItemInput {
  productVariantId: string;
  quantityDelta: number;
  batchNumber?: string;
  expiryDate?: string;
  unitCost?: number;
}

export interface CreateAdjustmentInput {
  branchId: string;
  reasonCode: 'opening_stock' | 'damage' | 'theft' | 'recount' | 'expiry_writeoff' | 'other';
  notes?: string;
  items: AdjustmentItemInput[];
}

export interface TransferItemInput {
  productVariantId: string;
  quantity: number;
  batchId?: string;
}

export interface CreateTransferInput {
  fromBranchId: string;
  toBranchId: string;
  items: TransferItemInput[];
}

export function getStock(token: string, branchId?: string) {
  const search = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<StockRow[]>(`/api/v1/inventory/stock${search}`, {}, token);
}

export function getLowStock(token: string, branchId?: string) {
  const search = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<StockRow[]>(`/api/v1/inventory/low-stock${search}`, {}, token);
}

export function createAdjustment(token: string, input: CreateAdjustmentInput) {
  return apiFetch<{ adjustment: { id: string } }>(
    '/api/v1/inventory/adjustments',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
}

export function listTransfers(token: string) {
  return apiFetch<Transfer[]>('/api/v1/inventory/transfers', {}, token);
}

export function createTransfer(token: string, input: CreateTransferInput) {
  return apiFetch<Transfer>('/api/v1/inventory/transfers', { method: 'POST', body: JSON.stringify(input) }, token);
}

export function receiveTransfer(token: string, id: string) {
  return apiFetch<Transfer>(`/api/v1/inventory/transfers/${id}/receive`, { method: 'POST' }, token);
}
