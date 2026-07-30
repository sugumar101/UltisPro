import { apiFetch, apiFetchEnvelope } from './api-client';

export interface SalesInvoice {
  id: string;
  store_id: string;
  branch_id: string;
  customer_id: string | null;
  invoice_number: string;
  invoice_date: string;
  status: 'completed' | 'partially_returned' | 'returned' | 'void';
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  amount_paid: string;
  cashier_id: string | null;
}

export interface SalesInvoiceItem {
  id: string;
  sales_invoice_id: string;
  product_variant_id: string;
  batch_id: string | null;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_id: string | null;
  tax_amount: string;
  line_total: string;
}

export interface SalesPayment {
  id: string;
  amount: string;
  payment_mode: string;
  reference_no: string | null;
  paid_at: string;
}

export interface SaleItemInput {
  productVariantId: string;
  batchId?: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxId?: string;
}

export interface PaymentInput {
  amount: number;
  paymentMode: 'cash' | 'card' | 'upi' | 'wallet' | 'store_credit' | 'gift_voucher';
  referenceNo?: string;
}

export interface CreateSaleInput {
  branchId: string;
  customerId?: string;
  registerCode?: string;
  items: SaleItemInput[];
  payments: PaymentInput[];
}

export interface ListSalesResult {
  data: SalesInvoice[];
  meta: { page: number; pageSize: number; total: number };
}

export async function listSales(
  token: string,
  params: { branchId?: string; customerId?: string; page?: number } = {},
): Promise<ListSalesResult> {
  const search = new URLSearchParams();
  if (params.branchId) search.set('branchId', params.branchId);
  if (params.customerId) search.set('customerId', params.customerId);
  if (params.page) search.set('page', String(params.page));

  const envelope = await apiFetchEnvelope<SalesInvoice[]>(`/api/v1/sales?${search.toString()}`, {}, token);
  return {
    data: envelope.data,
    meta: {
      page: envelope.meta?.page ?? 1,
      pageSize: envelope.meta?.pageSize ?? 20,
      total: envelope.meta?.total ?? envelope.data.length,
    },
  };
}

export const getSale = (token: string, id: string) =>
  apiFetch<{ invoice: SalesInvoice; items: SalesInvoiceItem[]; payments: SalesPayment[] }>(
    `/api/v1/sales/${id}`,
    {},
    token,
  );

export const createSale = (token: string, input: CreateSaleInput) =>
  apiFetch<{ invoice: SalesInvoice; items: SalesInvoiceItem[]; payments: SalesPayment[] }>(
    '/api/v1/sales',
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );

// --- Receipt / tax-invoice printing ---

export interface ReceiptItem {
  id: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  sku: string;
  attributes: Record<string, string>;
  productName: string;
  hsnCode: string | null;
  taxName: string | null;
  ratePercent: string | null;
}

export interface ReceiptGstRow {
  taxName: string;
  ratePercent: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface ReceiptStore {
  name: string;
  gstin: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

export interface ReceiptBranch {
  name: string;
  code: string;
  address_line1: string | null;
  city: string | null;
  phone: string | null;
}

export interface Receipt {
  invoice: SalesInvoice;
  items: ReceiptItem[];
  payments: SalesPayment[];
  customer: { full_name: string; phone: string | null; gstin: string | null; is_walkin: boolean } | null;
  store: ReceiptStore | null;
  branch: ReceiptBranch | null;
  organization: { legal_name: string; display_name: string } | null;
  cashierName: string | null;
  gstSummary: ReceiptGstRow[];
  amountPaid: number;
  balanceDue: number;
  amountInWords: string;
}

export const getReceipt = (token: string, id: string) =>
  apiFetch<Receipt>(`/api/v1/sales/${id}/receipt`, {}, token);

export const createSalesReturn = (
  token: string,
  invoiceId: string,
  input: { reason?: string; items: { salesInvoiceItemId: string; quantity: number; refundAmount: number }[] },
) =>
  apiFetch<{ header: { id: string; credit_note_number: string; grand_total: string }; status: string }>(
    `/api/v1/sales/${invoiceId}/return`,
    { method: 'POST', body: JSON.stringify(input) },
    token,
  );
