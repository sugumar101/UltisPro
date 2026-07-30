import { db } from '../../shared/db';
import { AppError } from '../../shared/app-error';
import { recordAudit } from '../../shared/audit-log.service';
import { amountInWords } from '../../shared/amount-in-words';
import { branchesRepository } from '../branches/branches.repository';
import { productsRepository } from '../products/products.repository';
import { taxesRepository } from '../taxes/taxes.repository';
import { customersRepository } from '../customers/customers.repository';
import { applyStockMovement } from '../inventory/inventory.repository';
import { salesRepository, generateCreditNoteNumber } from './sales.repository';
import type { CreateSaleInput, ListSalesQuery, CreateSalesReturnInput } from './sales.dto';

const ROUNDING_TOLERANCE = 0.01;

async function resolveCustomer(organizationId: string, customerId: string | undefined) {
  if (customerId) {
    const customer = await customersRepository.findById(organizationId, customerId);
    if (!customer) throw new AppError('VALIDATION_ERROR', `Customer ${customerId} not found in your organization`);
    return customer;
  }
  const walkin = await customersRepository.findWalkin(organizationId);
  if (!walkin) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      'No customer selected and no walk-in customer found for this organization',
    );
  }
  return walkin;
}

export const salesService = {
  async list(organizationId: string, query: ListSalesQuery) {
    const { rows, total } = await salesRepository.list(organizationId, query);
    return { rows, total, page: query.page, pageSize: query.pageSize };
  },

  async getById(organizationId: string, id: string) {
    const invoice = await salesRepository.findById(organizationId, id);
    if (!invoice) throw new AppError('NOT_FOUND', 'Sales invoice not found');
    const [items, payments] = await Promise.all([
      salesRepository.listItems(id),
      salesRepository.listPayments(id),
    ]);
    return { invoice, items, payments };
  },

  /**
   * Everything a printed receipt or GST tax invoice needs, in one call:
   * the invoice, its fully-joined line items (product name/SKU/HSN, which
   * `sales_invoice_items` alone doesn't carry), payments, the customer, the
   * store/branch/org letterhead block, the cashier's name, a rate-wise GST
   * summary, and the grand total in words.
   *
   * Assembled server-side rather than left to the print page so that the
   * tax arithmetic on a legal document has exactly one implementation —
   * the frontend renders what it's given and computes none of it.
   */
  async getReceipt(organizationId: string, id: string) {
    const invoice = await salesRepository.findById(organizationId, id);
    if (!invoice) throw new AppError('NOT_FOUND', 'Sales invoice not found');

    const [items, payments, [store, branch, organization, cashier]] = await Promise.all([
      salesRepository.listItemsForReceipt(id),
      salesRepository.listPayments(id),
      salesRepository.findInvoiceContext(organizationId, invoice.store_id, invoice.branch_id, invoice.cashier_id),
    ]);

    const customer = invoice.customer_id
      ? await customersRepository.findById(organizationId, invoice.customer_id)
      : null;

    // Rate-wise GST summary, the block every tax invoice prints beneath the
    // line items. Each line's already-stored `tax_amount` is split into
    // CGST/SGST/IGST using that tax rate's own percentage ratios rather
    // than re-deriving tax from the taxable value — this keeps the summary
    // reconciling exactly against the invoice's stored `tax_total`, even
    // where per-line rounding occurred at checkout. Same approach as the
    // GST report (reports.service.ts#aggregateGstLines).
    const gstByRate = new Map<
      string,
      { taxName: string; ratePercent: number; taxableValue: number; cgst: number; sgst: number; igst: number }
    >();

    for (const item of items) {
      if (!item.ratePercent) continue;
      const ratePercent = Number(item.ratePercent);
      if (ratePercent <= 0) continue;

      const taxableValue = Number(item.quantity) * Number(item.unitPrice) - Number(item.discountAmount);
      const taxAmount = Number(item.taxAmount);
      const cgstShare = Number(item.cgstPercent ?? 0) / ratePercent;
      const sgstShare = Number(item.sgstPercent ?? 0) / ratePercent;
      const igstShare = Number(item.igstPercent ?? 0) / ratePercent;

      const key = String(ratePercent);
      const bucket = gstByRate.get(key) ?? {
        taxName: item.taxName ?? `${ratePercent}%`,
        ratePercent,
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      bucket.taxableValue += taxableValue;
      bucket.cgst += taxAmount * cgstShare;
      bucket.sgst += taxAmount * sgstShare;
      bucket.igst += taxAmount * igstShare;
      gstByRate.set(key, bucket);
    }

    const amountPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balanceDue = Number(invoice.grand_total) - amountPaid;

    return {
      invoice,
      items,
      payments,
      customer,
      store: store ?? null,
      branch: branch ?? null,
      organization: organization ?? null,
      cashierName: cashier?.full_name ?? null,
      gstSummary: [...gstByRate.values()].sort((a, b) => a.ratePercent - b.ratePercent),
      amountPaid,
      // Positive when the customer still owes (charged on account at
      // checkout); the print template shows it as "Balance due".
      balanceDue,
      amountInWords: amountInWords(Number(invoice.grand_total)),
    };
  },

  /**
   * The checkout endpoint (M9 core / POS's `/sales`). Everything — gapless
   * invoice numbering, per-line stock deduction, payment recording, and any
   * on-account shortfall charged to the customer — happens in one DB
   * transaction, matching the design decision in
   * docs/03-database-design.md §10.
   */
  async create(organizationId: string, actorUserId: string, input: CreateSaleInput) {
    const branch = await branchesRepository.findById(organizationId, input.branchId);
    if (!branch) throw new AppError('VALIDATION_ERROR', `Branch ${input.branchId} not found in your organization`);

    const customer = await resolveCustomer(organizationId, input.customerId);

    const taxIds = [...new Set(input.items.map((i) => i.taxId).filter((id): id is string => Boolean(id)))];
    const taxes = new Map<string, { rate_percent: string }>();
    for (const taxId of taxIds) {
      const tax = await taxesRepository.findById(organizationId, taxId);
      if (!tax) throw new AppError('VALIDATION_ERROR', `Tax rate ${taxId} not found in your organization`);
      taxes.set(taxId, tax);
    }

    const variants = new Map<string, { purchase_price: string }>();
    for (const item of input.items) {
      const variant = await productsRepository.findVariantById(organizationId, item.productVariantId);
      if (!variant) throw new AppError('VALIDATION_ERROR', `Product variant ${item.productVariantId} not found in your organization`);
      variants.set(item.productVariantId, variant);
    }

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const lineComputations = input.items.map((item) => {
      const lineGross = item.quantity * item.unitPrice;
      const lineNet = lineGross - item.discountAmount;
      const rate = item.taxId ? Number(taxes.get(item.taxId)!.rate_percent) : 0;
      const taxAmount = lineNet * (rate / 100);
      subtotal += lineGross;
      discountTotal += item.discountAmount;
      taxTotal += taxAmount;
      return { ...item, lineNet, taxAmount, lineTotal: lineNet + taxAmount };
    });
    const grandTotal = subtotal - discountTotal + taxTotal;

    const amountPaid = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (amountPaid > grandTotal + ROUNDING_TOLERANCE) {
      throw new AppError('VALIDATION_ERROR', `Payments (${amountPaid}) exceed the invoice grand total (${grandTotal})`);
    }

    const shortfall = Math.max(0, grandTotal - amountPaid);
    if (shortfall > ROUNDING_TOLERANCE) {
      if (customer.is_walkin) {
        throw new AppError(
          'BUSINESS_RULE_VIOLATION',
          'The walk-in customer cannot buy on credit — collect full payment or select a registered customer',
        );
      }
      const projectedBalance = Number(customer.outstanding_balance) + shortfall;
      if (projectedBalance > Number(customer.credit_limit)) {
        throw new AppError(
          'BUSINESS_RULE_VIOLATION',
          `Charging the ${shortfall} shortfall would exceed this customer's credit limit of ${customer.credit_limit} (current balance: ${customer.outstanding_balance})`,
        );
      }
    }

    const result = await db.transaction().execute(async (trx) => {
      const invoiceNumber = await salesRepository.nextInvoiceNumber(trx, branch.store_id);

      const invoice = await salesRepository.createInvoice(trx, organizationId, {
        store_id: branch.store_id,
        branch_id: input.branchId,
        customer_id: customer.id,
        invoice_number: invoiceNumber,
        subtotal,
        discount_total: discountTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
        amount_paid: amountPaid,
        register_code: input.registerCode ?? null,
        cashier_id: actorUserId,
      });

      const items = [];
      for (const line of lineComputations) {
        const item = await salesRepository.addInvoiceItem(trx, invoice.id, {
          product_variant_id: line.productVariantId,
          batch_id: line.batchId ?? null,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          discount_amount: line.discountAmount,
          tax_id: line.taxId ?? null,
          tax_amount: line.taxAmount,
          line_total: line.lineTotal,
        });
        items.push(item);

        await applyStockMovement(trx, {
          organizationId,
          branchId: input.branchId,
          productVariantId: line.productVariantId,
          batchId: line.batchId ?? null,
          movementType: 'sale',
          referenceTable: 'sales_invoices',
          referenceId: invoice.id,
          quantityDelta: -line.quantity,
          unitCost: Number(variants.get(line.productVariantId)!.purchase_price),
          actorUserId,
        });
      }

      const payments = [];
      for (const payment of input.payments) {
        const created = await salesRepository.addPayment(trx, organizationId, {
          sales_invoice_id: invoice.id,
          customer_id: customer.id,
          amount: payment.amount,
          payment_mode: payment.paymentMode,
          reference_no: payment.referenceNo ?? null,
          created_by: actorUserId,
        });
        payments.push(created);
      }

      if (shortfall > ROUNDING_TOLERANCE) {
        await customersRepository.adjustOutstandingBalance(trx, organizationId, customer.id, shortfall);
      }

      return { invoice, items, payments };
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'sales_invoices',
      entityId: result.invoice.id,
      after: { invoiceNumber: result.invoice.invoice_number, grandTotal, itemCount: result.items.length },
    });

    return result;
  },

  async createReturn(organizationId: string, invoiceId: string, actorUserId: string, input: CreateSalesReturnInput) {
    const result = await db.transaction().execute(async (trx) => {
      const invoice = await salesRepository.findForUpdate(trx, organizationId, invoiceId);
      if (!invoice) throw new AppError('NOT_FOUND', 'Sales invoice not found');
      if (invoice.status === 'returned' || invoice.status === 'void') {
        throw new AppError('BUSINESS_RULE_VIOLATION', `A ${invoice.status} invoice cannot be returned against`);
      }

      let grandTotal = 0;
      const items = [];
      for (const returnItem of input.items) {
        const originalItem = await salesRepository.findItemForUpdate(trx, returnItem.salesInvoiceItemId);
        if (!originalItem || originalItem.sales_invoice_id !== invoiceId) {
          throw new AppError('VALIDATION_ERROR', `Line item ${returnItem.salesInvoiceItemId} does not belong to this invoice`);
        }

        const alreadyReturned = await salesRepository.alreadyReturnedQuantity(trx, returnItem.salesInvoiceItemId);
        const remaining = Number(originalItem.quantity) - alreadyReturned;
        if (returnItem.quantity > remaining) {
          throw new AppError(
            'BUSINESS_RULE_VIOLATION',
            `Cannot return ${returnItem.quantity}: only ${remaining} remain returnable for this line`,
          );
        }

        grandTotal += returnItem.refundAmount;
      }

      const header = await salesRepository.createReturnHeader(trx, organizationId, actorUserId, {
        sales_invoice_id: invoiceId,
        credit_note_number: generateCreditNoteNumber(),
        reason: input.reason ?? null,
        grand_total: grandTotal,
      });

      for (const returnItem of input.items) {
        const originalItem = await salesRepository.findItemForUpdate(trx, returnItem.salesInvoiceItemId);
        const created = await salesRepository.addReturnItem(trx, header.id, {
          sales_invoice_item_id: returnItem.salesInvoiceItemId,
          quantity: returnItem.quantity,
          refund_amount: returnItem.refundAmount,
        });
        items.push(created);

        // Restores stock the sale removed.
        await applyStockMovement(trx, {
          organizationId,
          branchId: invoice.branch_id,
          productVariantId: originalItem!.product_variant_id,
          batchId: originalItem!.batch_id,
          movementType: 'sale_return',
          referenceTable: 'sales_returns',
          referenceId: header.id,
          quantityDelta: returnItem.quantity,
          actorUserId,
        });
      }

      // Whether or not this sale was paid in cash/card or charged on
      // account, crediting the refund against the customer's account is a
      // reasonable stand-in until gift_vouchers/store_credits (P1, see
      // docs/03-database-design.md §14) ship a proper refund ledger. A
      // walk-in customer has no account to credit, so this is skipped —
      // refunding cash back to a walk-in customer is a till-side action,
      // not a database one.
      if (invoice.customer_id) {
        const customer = await customersRepository.findById(organizationId, invoice.customer_id);
        if (customer && !customer.is_walkin) {
          await customersRepository.adjustOutstandingBalance(trx, organizationId, customer.id, -grandTotal);
        }
      }

      const allItems = await salesRepository.listItemsTrx(trx, invoiceId);
      let fullyReturned = true;
      for (const item of allItems) {
        const returned = await salesRepository.alreadyReturnedQuantity(trx, item.id);
        if (returned < Number(item.quantity)) fullyReturned = false;
      }
      const newStatus = fullyReturned ? 'returned' : 'partially_returned';
      await salesRepository.setStatus(trx, invoiceId, newStatus);

      return { header, items, status: newStatus };
    });

    await recordAudit({
      organizationId,
      actorUserId,
      action: 'create',
      entityTable: 'sales_returns',
      entityId: result.header.id,
      after: { invoiceId, creditNoteNumber: result.header.credit_note_number, grandTotal: result.header.grand_total },
    });

    return result;
  },
};
