# UltisPro — Module Breakdown

Each module below is a bounded context under `apps/api/src/modules/<name>` and a corresponding route group under `apps/web/app/(dashboard)/<name>`. "Depends on" lists modules whose APIs/entities it consumes — build those first.

## M0. Platform Foundations (not a product module, but a prerequisite)
Monorepo scaffold, Docker Compose (Postgres/Redis), CI pipeline, base Express app (error middleware, logger, health checks), base Next.js app (shell, theme, auth guard), shared Zod/type package. Nothing here is user-facing; every other module depends on it.

## M1. Authentication
- **Entities:** users, refresh_tokens
- **APIs:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password/forgot`, `POST /auth/password/reset`
- **Screens:** Login, Forgot/Reset Password
- **Depends on:** M0
- **MVP:** Yes

## M2. Organizations, Stores & Branches
- **Entities:** organizations, stores, branches, warehouses, organization_settings
- **APIs:** `/organizations/:id`, `/stores`, `/stores/:id/branches`, `/warehouses`, `/settings`
- **Screens:** Org onboarding wizard, Store settings, Branch management, General settings
- **Depends on:** M1
- **MVP:** Yes

## M3. Users, Roles & Permissions
- **Entities:** users, roles, permissions, role_permissions, user_store_roles
- **APIs:** `/users`, `/roles`, `/permissions`, `/users/:id/store-roles`
- **Screens:** User list/invite, Role editor (permission matrix), My Profile
- **Depends on:** M1, M2
- **MVP:** Yes (system roles); custom role editor is P1

## M4. Product Catalog (Products, Categories, Brands, Units, Taxes)
- **Entities:** products, product_variants, product_images, categories, brands, units, taxes, product_suppliers
- **APIs:** `/products`, `/products/:id/variants`, `/categories`, `/brands`, `/units`, `/taxes`, `/products/import`
- **Screens:** Product list (table + filters), Product create/edit (with variant matrix builder), Category/Brand/Unit/Tax masters, Bulk import
- **Depends on:** M2 (org-level masters); `product_suppliers` specifically depends on M6 (Suppliers) and is deferred to Phase 3 — see docs/03-database-design.md §12
- **MVP:** Yes; bulk import is P1
- **Post-launch addition (Phase 13):** barcode label printing — scannable EAN-13 rendered as inline SVG (`apps/web/lib/ean13.ts`, `components/ui/barcode.tsx`), a `/products/barcodes` print view sized for roll/thermal label printers (50×25, 40×30, 38×25 mm presets, copies-per-label, one label per variant), reachable per-row from the Products list, from the product detail page, and via multi-select for bulk batches. Covered by `apps/web/lib/ean13.test.ts`.
- **Post-launch addition (Phase 12):** full edit/delete across the catalog — products (name, description, HSN, active state), individual variants (edit, add, delete, with the last variant protected), and every master (categories, brands, units, taxes, product types, product categories) via a shared inline `EditableListRow`. Plus automatic HSN: `product_types.default_hsn_code` (migration 0011) and `shared/hsn.ts`, which *suggests* real standard codes from product wording and returns null when unsure — HSN is never fabricated, since it drives the GST rate. Covered by `apps/api/test/products-crud.test.ts` and `apps/api/test/hsn.test.ts`. See `docs/03-database-design.md` §22.
- **Post-launch addition (Phase 11):** product entry no longer requires pre-registering masters — Category and Brand are free-text fields backed by a datalist of existing values, found-or-created by name on save (`categoryName`/`brandName` on `POST /products`, `brandName` on `POST /products/clothing`). Barcodes auto-generate as in-store EAN-13s (GS1 `20`–`29` restricted-circulation prefix) for any variant saved without one, with each clothing size getting its own scannable code. Covered by `apps/api/test/products-autofill.test.ts` and `apps/api/test/barcode.test.ts`. See `docs/03-database-design.md` §21.
- **Post-launch addition (Phase 9):** a dedicated clothing product flow — `product_types`/`product_categories` (org-defined, dynamic taxonomy with per-type size lists), `POST /products/clothing` (product name, type, category, gender, a size checkbox set each becoming its own variant/SKU, one shared price, auto-generated 5-digit product code, and optional opening stock posted to a branch in the same transaction), and a new `/products/new-clothing` screen — additive to, and fully independent of, the generic Products flow above. See `docs/03-database-design.md` §19. **Not delivered:** image upload for clothing products (no storage backend wired up yet).

## M5. Inventory & Warehouse
- **Entities:** branch_stock, stock_ledger, batches, stock_adjustments, stock_transfers
- **APIs:** `/inventory/stock`, `/inventory/ledger`, `/inventory/adjustments`, `/inventory/transfers`, `/inventory/low-stock`, `/inventory/expiring`
- **Screens:** Stock overview (per branch), Stock ledger viewer, Adjustment form, Transfer workflow, Low-stock/expiry alert lists
- **Depends on:** M2, M4
- **MVP:** Yes (adjustments, ledger, low-stock); warehouse-as-separate-DC is P1

## M6. Suppliers & Purchasing — ✅ Complete
- **Entities:** suppliers, purchase_orders, purchase_order_items, purchase_returns, purchase_return_items, supplier_payments, product_suppliers (table created, CRUD deferred — see below)
- **APIs:** `/suppliers`, `/suppliers/:id/payments`, `/purchase-orders`, `/purchase-orders/:id/approve`, `/purchase-orders/:id/receive`, `/purchase-orders/:id/cancel`, `/purchase-returns`
- **Screens:** Supplier list/detail (outstanding, payment history), PO create/approve/receive, Purchase return action
- **Depends on:** M2, M4, M5 (receiving a PO writes stock_ledger via the same `applyStockMovement()` choke point Phase 2 introduced)
- **MVP:** Yes
- **Delivered:** migration 0006; PO lifecycle draft → approved → partially_received/received → (optionally) cancelled, with row-locked receiving so partial receipts across multiple calls converge correctly; supplier `outstanding_balance` accrues on receipt and is reduced by returns/payments (all row-locked against concurrent writers); purchase returns reuse `applyStockMovement` with `movement_type = 'purchase_return'`. Two documented MVP simplifications: PO numbers are a random short code rather than a gapless per-org sequence (no legal requirement here, unlike invoice numbers); goods received always land in unbatched stock (`batch_id: null`) even for batch-tracked products — batch capture at receipt time is left for a later pass. `product_suppliers` (deferred from Phase 2) is now created in the schema but has no dedicated CRUD yet, since it's optional sourcing metadata not required for the PO flow.

## M7. Customers & CRM — ✅ Complete (MVP scope)
- **Entities:** customers, customer_addresses (loyalty_transactions, gift_vouchers, store_credits deferred — see below)
- **APIs:** `/customers`, `/customers/:id`, `/customers/:id/charge`, `/customers/:id/payments`, `/customers/:id/addresses[/:addressId]`
- **Screens:** Customer list/detail (addresses, credit limit, outstanding balance, charge/payment actions); Quick-add customer (POS inline) ships with POS in Phase 5
- **Depends on:** M2
- **MVP:** Yes (core CRUD, credit limit, walk-in); loyalty/vouchers/store-credit are P1
- **Delivered:** migration 0007; customers + customer_addresses with row-locked `outstanding_balance` adjustments (charge/payment), mirroring the supplier balance pattern from M6; a default walk-in customer is now seeded at org signup (`auth.service.ts`), alongside the default unit from Phase 2. `/customers/:id/history` (purchase history) and `/customers/:id/loyalty` are deferred to Phase 5 — they'd query `sales_invoices`/`loyalty_transactions`, neither of which exists yet; building against a non-existent table would be meaningless (same reasoning that deferred `product_suppliers` to Phase 3). `loyalty_transactions`, `gift_vouchers`, and `store_credits` remain P1 per this doc's original scoping — `store_credits.source_return_id` also references `sales_returns`, which doesn't exist until Phase 5.

## M8. Point of Sale (Billing) — ✅ Complete (MVP scope)
- **Entities:** held_bills; writes sales_invoices/items, payments, stock_ledger
- **APIs:** `/pos/search`, `/pos/hold`, `/pos/hold/:id/resume`, `/sales` (create, this *is* the checkout endpoint)
- **Screens:** POS screen (product grid/search, cart, customer panel, payment panel)
- **Depends on:** M4, M5, M7, M9 (invoice numbering)
- **MVP:** Yes — this is the flagship screen
- **Delivered:** search-and-add-to-cart against live branch stock, editable per-line qty/price/discount, split payment across multiple modes, hold/resume (cart snapshot as JSONB), checkout via `/sales`. Barcode scanning is supported the same way a keyboard-wedge scanner works everywhere else in retail software — it just types into the search box and the Enter key triggers search — so no separate "scanner mode" was needed.
- **Receipt printing (POS-08) — delivered in Phase 10:** checkout now opens a print window automatically (toggleable), and the last sale stays pinned above the cart with a reprint action so the cashier can reprint without leaving POS. See M9 below for the shared receipt endpoint and print templates. **Still not delivered:** cash-drawer kick and auto-cut, which need real ESC/POS control bytes via a local print agent rather than the browser print pipeline.

## M9. Sales, Invoices & Payments — ✅ Complete (MVP scope)
- **Entities:** sales_invoices, sales_invoice_items, sales_returns, sales_return_items, payments
- **APIs:** `/sales`, `/sales/:id`, `/sales/:id/return`, `/sales/:id/pdf` (deferred — see below)
- **Screens:** Invoice list, Invoice detail, Sales return action
- **Depends on:** M4, M5, M7
- **MVP:** Yes
- **Delivered:** checkout writes the invoice, line items, payments, and per-item `stock_ledger` deductions in one transaction; gapless sequential invoice numbering via `stores.next_invoice_seq` under a row lock (docs/03-database-design.md §10); any shortfall between payments collected and the grand total is charged to the customer's account with the same credit-limit enforcement from M7, and is rejected outright for the walk-in customer (no anonymous credit). Sales returns restore stock via `applyStockMovement('sale_return', ...)`, credit the refund against the customer's account (a stand-in for the P1 store-credit ledger), and track cumulative returned quantity per line to flip invoice status to `partially_returned`/`returned`. `/payments` as a standalone top-level endpoint wasn't needed — every payment is created as part of `/sales` checkout, and read via `/sales/:id`.
- **Printing & invoice documents (SAL-02) — delivered in Phase 10:** `GET /sales/:id/receipt` returns everything a printed document needs in one call — line items joined out to product name/SKU/HSN (the raw `sales_invoice_items` table stores only `product_variant_id`), the store/branch/org letterhead, customer, cashier, a rate-wise CGST/SGST/IGST summary, and the grand total in words (Indian lakh/crore grouping, `shared/amount-in-words.ts`). All tax arithmetic is computed server-side so the legal document has exactly one implementation; the print page renders and calculates nothing. `/sales/:id/print` renders two templates from that payload — an 80mm thermal receipt and a full A4 GST tax invoice — switchable in the toolbar. Covered by `apps/api/test/sales-receipt.test.ts` and `apps/api/test/amount-in-words.test.ts`.
- **Why browser printing rather than server-side PDF or raw ESC/POS:** a thermal printer installed as a normal OS printer prints the 80mm template correctly (the page sets `@page { size: 80mm auto }` and the driver rasterises it) — this is how most browser-based POS systems drive thermal hardware, and it avoids adding a headless-browser dependency (puppeteer et al) to the API purely to render an invoice. "Save as PDF" in the same print dialog covers the PDF half of SAL-02. **Still deferred:** S3 archival of generated invoice PDFs (SAL-02's second half — no storage backend is configured), plus cash-drawer kick / auto-cut as noted under M8.

## M10. Expenses — ✅ Complete
- **Entities:** expenses, expense_categories
- **APIs:** `/expenses`, `/expense-categories`
- **Screens:** Expense list/form
- **Depends on:** M2
- **MVP:** P1 in the original scoping, but pulled into Phase 7 per `docs/05-development-roadmap.md`
- **Delivered:** migration 0009; expense_categories + expenses CRUD, filterable by branch/category/date range, with a running total on the list page. Feeds a full P&L view in the future (revenue from M9's sales reports minus expenses here) — that combined P&L report itself isn't built, since M11 (Reports) only scoped sales/inventory/GST/cash-flow as MVP.

## M11. Reports & Analytics — ✅ Complete (MVP scope)
- **Entities:** read-only aggregations over M5/M6/M7/M9/M10
- **APIs:** `/reports/sales`, `/reports/inventory`, `/reports/gst`, `/reports/cash-flow` (each accepts `?format=csv`); `/reports/purchases`, `/reports/customers`, `/reports/suppliers`, `/reports/best-sellers` as standalone endpoints are P1 (best-sellers ships as a section *within* the sales report instead — see below)
- **Screens:** Report picker (tabbed) + filterable table, per-report CSV export
- **Depends on:** M5, M6, M7, M9, M10
- **MVP:** Daily/monthly sales, inventory, GST, cash-flow; the rest are P1
- **Delivered:** the four MVP reports, all reading live data from Phases 2–5. Sales groups by day over a date range and includes a top-10 best-sellers section (folding M11's separate `best-sellers` endpoint into the sales report rather than a standalone route — same data source, one query). Inventory values current stock at `product_variants.purchase_price`. GST reconciles output tax (from `sales_invoice_items`) against input tax (from received `purchase_order_items`), correctly split into CGST/SGST/IGST using each tax rate's own split ratios — this is real double-entry-style netting, not just a sales-side total. Cash-flow groups `payments`/`supplier_payments` by mode over a date range. **`/reports/:name/export` is folded into each report endpoint via `?format=csv`** rather than being a separate route — same effect, simpler routing; PDF/Excel export are still P1 (`packages/shared/exporters` from the cross-cutting concerns section below hasn't been built).

## M12. Dashboard — ✅ Complete
- **Entities:** read-only aggregations, notifications
- **APIs:** `/dashboard/summary`, `/dashboard/charts`, `/dashboard/recent-activity`
- **Screens:** Dashboard home (KPI cards, charts, recent bills/activity)
- **Depends on:** M9, M11
- **MVP:** Yes
- **Delivered:** KPI cards (today's sales, low-stock count, receivables, payables, active products, pending POs), a 30-day sales trend line chart (recharts), and a recent-activity feed (latest sales + latest purchase orders). All backed by real aggregation queries, not placeholders.

## M13. Notifications & Audit — ✅ Complete
- **Entities:** notifications, audit_logs
- **APIs:** `/notifications`, `/notifications/:id/read`, `/audit-logs`
- **Screens:** Notification bell/center, Audit log viewer (admin only)
- **Depends on:** M0 (cross-cutting — audit hooks live in the shared service layer and are wired in from M1 onward, even though the *viewer* screen ships later)
- **MVP:** Audit logging engine is MVP from day one (non-negotiable per FR); notification center UI pulled into Phase 7 per the roadmap
- **Delivered:** migration 0009 adds `notifications` (`audit_logs` already existed since Phase 1). The audit log viewer is a straightforward paginated read over data every mutating service has been writing since Phase 1 — filterable by entity table/id/actor, gated by `AUDIT_VIEW`. Notifications are generated **on demand** rather than pushed by a background worker (no queue consumer is wired up in this build — see the simplification note below); opening the bell checks current low-stock and expiring-batch conditions and creates a broadcast notification the first time each is seen, idempotently (`findUnreadByReference` prevents duplicates). Marking a broadcast notification (`user_id: null`) read marks it read for the whole organization, not just the reading user — a proper per-user read-state table for broadcasts is a P1 follow-up.

## Cross-Cutting Concerns (not separate modules, implemented once, used everywhere)
- **Validation layer** — shared Zod DTO pattern, established in M0, reused by every module.
- **Export engine (CSV/Excel/PDF)** — one shared service (`packages/shared/exporters`) invoked by M11's report endpoints; built once when M11 starts.
- **Search** — Postgres `pg_trgm` for type-ahead (products, customers); no separate search infra (e.g., Elasticsearch) until data volume actually requires it.
- **Print/receipt rendering** — shared invoice-to-PDF and invoice-to-ESC/POS renderers, consumed by both M8 (POS) and M9 (invoice reprint).
