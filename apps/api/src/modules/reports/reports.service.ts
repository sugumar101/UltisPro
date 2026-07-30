import { reportsRepository } from './reports.repository';
import type { DateRangeQuery, InventoryReportQuery } from './reports.dto';

interface GstBucket {
  taxName: string;
  ratePercent: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

function aggregateGstLines(
  lines: {
    taxName: string | null;
    ratePercent: string | null;
    cgstPercent: string | null;
    sgstPercent: string | null;
    igstPercent: string | null;
    taxAmount?: string;
    unitCost?: string;
    quantity?: string;
    quantityReceived?: string;
    unitPrice?: string;
    discountAmount?: string;
  }[],
): GstBucket[] {
  const buckets = new Map<string, GstBucket>();

  for (const line of lines) {
    if (!line.ratePercent || Number(line.ratePercent) === 0) continue;

    const key = line.taxName ?? 'Untaxed';
    const rate = Number(line.ratePercent);
    const cgstShare = Number(line.cgstPercent ?? 0) / rate;
    const sgstShare = Number(line.sgstPercent ?? 0) / rate;
    const igstShare = Number(line.igstPercent ?? 0) / rate;

    // Sales lines carry a pre-computed tax_amount; purchase lines don't
    // (purchase_order_items has no tax_amount column), so derive it from
    // quantity * unit_cost * rate for that side.
    const taxAmount =
      line.taxAmount !== undefined
        ? Number(line.taxAmount)
        : Number(line.quantityReceived ?? 0) * Number(line.unitCost ?? 0) * (rate / 100);
    const taxableAmount =
      line.taxAmount !== undefined
        ? Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0) - Number(line.discountAmount ?? 0)
        : Number(line.quantityReceived ?? 0) * Number(line.unitCost ?? 0);

    const existing = buckets.get(key) ?? {
      taxName: key,
      ratePercent: rate,
      taxableAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalTax: 0,
    };
    existing.taxableAmount += taxableAmount;
    existing.cgstAmount += taxAmount * cgstShare;
    existing.sgstAmount += taxAmount * sgstShare;
    existing.igstAmount += taxAmount * igstShare;
    existing.totalTax += taxAmount;
    buckets.set(key, existing);
  }

  return Array.from(buckets.values());
}

export const reportsService = {
  async sales(organizationId: string, query: DateRangeQuery) {
    const [byDay, bestSellers] = await Promise.all([
      reportsRepository.salesByDay(organizationId, query.fromDate, query.toDate, query.branchId),
      reportsRepository.bestSellers(organizationId, query.fromDate, query.toDate, 10),
    ]);

    const rows = byDay.map((row) => ({
      day: row.day,
      invoiceCount: Number(row.invoiceCount),
      subtotal: Number(row.subtotal ?? 0),
      discountTotal: Number(row.discountTotal ?? 0),
      taxTotal: Number(row.taxTotal ?? 0),
      grandTotal: Number(row.grandTotal ?? 0),
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        invoiceCount: acc.invoiceCount + r.invoiceCount,
        subtotal: acc.subtotal + r.subtotal,
        discountTotal: acc.discountTotal + r.discountTotal,
        taxTotal: acc.taxTotal + r.taxTotal,
        grandTotal: acc.grandTotal + r.grandTotal,
      }),
      { invoiceCount: 0, subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 },
    );

    return {
      byDay: rows,
      totals,
      bestSellers: bestSellers.map((b) => ({
        productName: b.productName,
        sku: b.sku,
        quantitySold: Number(b.quantitySold),
        revenue: Number(b.revenue),
      })),
    };
  },

  async inventory(organizationId: string, query: InventoryReportQuery) {
    const rows = await reportsRepository.inventoryValuation(organizationId, query.branchId);
    const withValue = rows.map((row) => {
      const quantityOnHand = Number(row.quantityOnHand);
      const purchasePrice = Number(row.purchasePrice);
      return {
        branchName: row.branchName,
        productName: row.productName,
        sku: row.sku,
        quantityOnHand,
        purchasePrice,
        stockValue: quantityOnHand * purchasePrice,
        reorderLevel: row.reorderLevel,
        lowStock: quantityOnHand <= row.reorderLevel,
      };
    });

    const totalStockValue = withValue.reduce((sum, r) => sum + r.stockValue, 0);
    return { rows: withValue, totalStockValue };
  },

  async gst(organizationId: string, query: DateRangeQuery) {
    const [salesLines, purchaseLines] = await Promise.all([
      reportsRepository.gstSalesLines(organizationId, query.fromDate, query.toDate),
      reportsRepository.gstPurchaseLines(organizationId, query.fromDate, query.toDate),
    ]);

    const outputTax = aggregateGstLines(salesLines);
    const inputTax = aggregateGstLines(purchaseLines);

    const sumTax = (buckets: GstBucket[]) => buckets.reduce((sum, b) => sum + b.totalTax, 0);
    const totalOutputTax = sumTax(outputTax);
    const totalInputTax = sumTax(inputTax);

    return {
      outputTax,
      inputTax,
      totalOutputTax,
      totalInputTax,
      netPayable: totalOutputTax - totalInputTax,
    };
  },

  async cashFlow(organizationId: string, query: DateRangeQuery) {
    const [cashIn, cashOut] = await Promise.all([
      reportsRepository.cashInByMode(organizationId, query.fromDate, query.toDate),
      reportsRepository.cashOutByMode(organizationId, query.fromDate, query.toDate),
    ]);

    const cashInRows = cashIn.map((r) => ({ paymentMode: r.payment_mode, total: Number(r.total) }));
    const cashOutRows = cashOut.map((r) => ({ paymentMode: r.payment_mode, total: Number(r.total) }));
    const totalIn = cashInRows.reduce((sum, r) => sum + r.total, 0);
    const totalOut = cashOutRows.reduce((sum, r) => sum + r.total, 0);

    return { cashIn: cashInRows, cashOut: cashOutRows, totalIn, totalOut, net: totalIn - totalOut };
  },
};
