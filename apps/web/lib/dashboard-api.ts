import { apiFetch } from './api-client';

export interface DashboardSummary {
  todaySalesTotal: number;
  todaySalesCount: number;
  lowStockCount: number;
  receivables: number;
  payables: number;
  activeProductCount: number;
  pendingPurchaseOrderCount: number;
}

export interface SalesTrendPoint {
  day: string;
  total: number;
  count: number;
}

export interface RecentSale {
  id: string;
  invoice_number: string;
  grand_total: string;
  invoice_date: string;
  status: string;
}

export interface RecentPurchaseOrder {
  id: string;
  po_number: string;
  grand_total: string;
  status: string;
  created_at: string;
}

export const getDashboardSummary = (token: string) =>
  apiFetch<DashboardSummary>('/api/v1/dashboard/summary', {}, token);

export const getDashboardCharts = (token: string, days = 30) =>
  apiFetch<{ salesTrend: SalesTrendPoint[] }>(`/api/v1/dashboard/charts?days=${days}`, {}, token);

export const getRecentActivity = (token: string, limit = 10) =>
  apiFetch<{ recentSales: RecentSale[]; recentPurchaseOrders: RecentPurchaseOrder[] }>(
    `/api/v1/dashboard/recent-activity?limit=${limit}`,
    {},
    token,
  );
