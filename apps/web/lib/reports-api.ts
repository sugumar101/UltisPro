import { apiFetch } from './api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface SalesReport {
  byDay: { day: string; invoiceCount: number; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number }[];
  totals: { invoiceCount: number; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number };
  bestSellers: { productName: string; sku: string; quantitySold: number; revenue: number }[];
}

export interface InventoryReport {
  rows: {
    branchName: string;
    productName: string;
    sku: string;
    quantityOnHand: number;
    purchasePrice: number;
    stockValue: number;
    reorderLevel: number;
    lowStock: boolean;
  }[];
  totalStockValue: number;
}

export interface GstBucket {
  taxName: string;
  ratePercent: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

export interface GstReport {
  outputTax: GstBucket[];
  inputTax: GstBucket[];
  totalOutputTax: number;
  totalInputTax: number;
  netPayable: number;
}

export interface CashFlowReport {
  cashIn: { paymentMode: string; total: number }[];
  cashOut: { paymentMode: string; total: number }[];
  totalIn: number;
  totalOut: number;
  net: number;
}

export const getSalesReport = (token: string, fromDate: string, toDate: string, branchId?: string) =>
  apiFetch<SalesReport>(
    `/api/v1/reports/sales?fromDate=${fromDate}&toDate=${toDate}${branchId ? `&branchId=${branchId}` : ''}`,
    {},
    token,
  );

export const getInventoryReport = (token: string, branchId?: string) =>
  apiFetch<InventoryReport>(`/api/v1/reports/inventory${branchId ? `?branchId=${branchId}` : ''}`, {}, token);

export const getGstReport = (token: string, fromDate: string, toDate: string) =>
  apiFetch<GstReport>(`/api/v1/reports/gst?fromDate=${fromDate}&toDate=${toDate}`, {}, token);

export const getCashFlowReport = (token: string, fromDate: string, toDate: string) =>
  apiFetch<CashFlowReport>(`/api/v1/reports/cash-flow?fromDate=${fromDate}&toDate=${toDate}`, {}, token);

/**
 * The CSV export needs the in-memory Bearer access token, so it can't be a
 * plain `<a href>` to the API (the browser wouldn't send the Authorization
 * header). Instead this fetches the CSV as a blob and triggers a download
 * client-side.
 */
export async function downloadCsv(
  token: string,
  report: 'sales' | 'inventory' | 'gst' | 'cash-flow',
  params: Record<string, string | undefined>,
): Promise<void> {
  const search = new URLSearchParams();
  search.set('format', 'csv');
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/reports/${report}?${search.toString()}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export failed');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report}-report.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
