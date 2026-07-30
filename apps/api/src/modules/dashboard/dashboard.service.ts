import { dashboardRepository } from './dashboard.repository';

export const dashboardService = {
  async summary(organizationId: string) {
    const [todaySales, lowStockCount, receivables, payables, activeProducts, pendingPOs] = await Promise.all([
      dashboardRepository.todaySales(organizationId),
      dashboardRepository.lowStockCount(organizationId),
      dashboardRepository.receivables(organizationId),
      dashboardRepository.payables(organizationId),
      dashboardRepository.activeProductCount(organizationId),
      dashboardRepository.pendingPurchaseOrderCount(organizationId),
    ]);

    return {
      todaySalesTotal: todaySales.total,
      todaySalesCount: todaySales.count,
      lowStockCount,
      receivables,
      payables,
      activeProductCount: activeProducts,
      pendingPurchaseOrderCount: pendingPOs,
    };
  },

  async charts(organizationId: string, days: number) {
    const trend = await dashboardRepository.salesTrend(organizationId, days);
    return {
      salesTrend: trend.map((row) => ({ day: row.day, total: Number(row.total), count: Number(row.count) })),
    };
  },

  async recentActivity(organizationId: string, limit: number) {
    const [recentSales, recentPurchaseOrders] = await Promise.all([
      dashboardRepository.recentSales(organizationId, limit),
      dashboardRepository.recentPurchaseOrders(organizationId, limit),
    ]);
    return { recentSales, recentPurchaseOrders };
  },
};
