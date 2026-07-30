# UltisPro — Functional Requirements

**Product:** UltisPro Retail Billing & Inventory Management (multi-tenant SaaS)
**Version:** 0.1 (Phase 1 planning)
**Date:** 2026-07-24

## 1. Purpose & Scope

UltisPro is a cloud-based, multi-tenant billing and inventory platform for independent and multi-branch retail businesses across clothing, supermarket, electronics, mobile, grocery, pharmacy, and hardware verticals. One codebase and one configurable data model serve every vertical — behavior differs by **organization-level configuration** (business type, enabled features, tax regime), not by forked code paths.

Comparable products: Shopify POS, Square POS, Zoho Books/Inventory, Odoo POS, Oracle NetSuite. UltisPro's wedge is billing speed at the counter combined with GST-correct accounting and inventory control, at SMB pricing.

## 2. Tenancy Model

- **Organization** = the paying customer (a retail business, single- or multi-branch).
- **Store** = a legal/billing entity under an organization (own GSTIN, own invoice sequence).
- **Branch** = a physical outlet under a store (own stock, own POS registers, own staff).
- A user belongs to an organization and is granted roles scoped to one or more stores/branches.
- All tenant data is isolated by `organization_id` (row-level, shared schema — see 02-system-architecture.md §3).

## 3. Personas

| Persona | Goals | Primary Screens |
|---|---|---|
| Super Admin (UltisPro ops) | Manage tenants, billing/subscriptions, platform health | Admin console (out of MVP scope, see §7) |
| Business Owner / Org Admin | Configure org, view all-branch analytics, manage users | Dashboard, Settings, Reports |
| Branch Manager | Run daily operations for one branch, approve returns/discounts | Dashboard, Inventory, Reports (branch-scoped) |
| Cashier / POS Operator | Bill customers as fast as possible | POS screen only |
| Inventory Manager | Maintain stock accuracy, purchasing, transfers | Products, Inventory, Purchases |
| Accountant / Finance | Reconcile payments, taxes, expenses | Invoices, Payments, Expenses, GST reports |

## 4. Functional Requirements by Module

Priority: **M** = MVP (must ship first), **P1** = fast-follow, **P2** = later phase.

### 4.1 Authentication & Access
| ID | Requirement | Priority |
|---|---|---|
| AUTH-01 | Email + password login issuing short-lived JWT access token and rotating refresh token | M |
| AUTH-02 | Logout revokes refresh token (server-side denylist in Redis) | M |
| AUTH-03 | Password reset via emailed time-limited token | M |
| AUTH-04 | Role-Based Access Control: permissions checked per-endpoint and per-UI-action | M |
| AUTH-05 | Per-store/branch scoping — a user's token carries the store/branch(es) they can operate in | M |
| AUTH-06 | Account lockout after N failed attempts; audit-logged | P1 |
| AUTH-07 | Optional TOTP 2FA for admin/owner roles | P2 |

### 4.2 User, Role & Permission Management
| ID | Requirement | Priority |
|---|---|---|
| USR-01 | CRUD users within an organization; invite via email | M |
| USR-02 | System-defined roles (Owner, Manager, Cashier, Inventory Clerk, Accountant) with editable permission sets | M |
| USR-03 | Custom roles with granular permission matrix (module × action: view/create/edit/delete/approve) | P1 |
| USR-04 | Assign users to one or more branches with a role per branch | M |

### 4.3 Store & Branch Management
| ID | Requirement | Priority |
|---|---|---|
| STR-01 | CRUD stores with GSTIN, legal name, invoice number sequence/prefix | M |
| STR-02 | CRUD branches under a store with address, contact, opening hours | M |
| STR-03 | Per-branch register/terminal identifiers for POS | M |
| STR-04 | Business-type flag per organization (clothing/grocery/pharmacy/...) driving optional fields (batch/expiry, size/color variants) | M |

### 4.4 Product Catalog (Products, Categories, Brands, Units, Taxes)
| ID | Requirement | Priority |
|---|---|---|
| PRD-01 | CRUD products with SKU, barcode(s), MRP, selling price, purchase price, HSN code, GST rate | M |
| PRD-02 | Product variants (size/color/etc.) sharing a parent product with independent SKU/barcode/stock | M |
| PRD-03 | Multiple images per product, stored in S3 | M |
| PRD-04 | Category tree (parent/child) and brand master | M |
| PRD-05 | Unit of measure master (pcs, kg, litre, box, ...) with conversion factor for bulk-to-retail units | M |
| PRD-06 | Tax master supporting GST slabs (0/5/12/18/28%) and CGST/SGST/IGST split by intra/inter-state | M |
| PRD-07 | Bulk import/export of products via CSV/Excel | P1 |
| PRD-08 | Batch/lot and expiry-date tracking at the product level (mandatory for pharmacy/grocery) | M |

### 4.5 Inventory & Warehouse
| ID | Requirement | Priority |
|---|---|---|
| INV-01 | Real-time stock balance per product/variant per branch (and per batch where applicable) | M |
| INV-02 | Append-only stock ledger recording every movement (sale, purchase, return, adjustment, transfer) with running balance | M |
| INV-03 | Manual stock adjustment with reason code and approval trail | M |
| INV-04 | Stock transfer between branches/warehouses with in-transit state | M |
| INV-05 | Reorder level per product/branch and low-stock alert (dashboard + notification) | M |
| INV-06 | Expiry alerts for near-expiry batches | M |
| INV-07 | Warehouse master separate from sales branches (for chains with a central DC) | P1 |

### 4.6 Suppliers & Purchasing
| ID | Requirement | Priority |
|---|---|---|
| SUP-01 | CRUD suppliers with GSTIN, contact, payment terms | M |
| SUP-02 | Purchase order creation, approval, and receipt (partial receipt supported) | M |
| SUP-03 | Purchase return to supplier with reason and linked original PO | M |
| SUP-04 | Supplier outstanding balance and payment history | M |
| SUP-05 | Supplier-wise purchase history and performance report | P1 |

### 4.7 Customers & CRM
| ID | Requirement | Priority |
|---|---|---|
| CUS-01 | CRUD customers with phone/email/GSTIN, multiple addresses | M |
| CUS-02 | Purchase history per customer | M |
| CUS-03 | Credit limit and running outstanding balance for credit-sale customers | M |
| CUS-04 | Loyalty points accrual and redemption rules configurable per organization | P1 |
| CUS-05 | Store credit and gift voucher issuance/redemption | P1 |
| CUS-06 | Walk-in ("cash") customer fallback with no KYC required | M |

### 4.8 Point of Sale (Billing)
| ID | Requirement | Priority |
|---|---|---|
| POS-01 | Barcode scan and type-ahead product search add line items in <200ms perceived latency | M |
| POS-02 | Full keyboard-shortcut operation (no mouse required for a complete sale) | M |
| POS-03 | Category quick filters and quantity stepper on line items | M |
| POS-04 | Hold bill / resume held bill (multiple concurrent held bills per register) | M |
| POS-05 | Line- and bill-level discounts (percentage or flat), with approval threshold for manager override | M |
| POS-06 | Split payment across cash/card/UPI/wallet/store-credit/voucher in one transaction | M |
| POS-07 | Invoice preview before finalizing | M |
| POS-08 | Thermal receipt printing (ESC/POS) | M |
| POS-09 | Email and WhatsApp receipt delivery | P1 |
| POS-10 | Offline-tolerant billing: queue sale locally and sync when connectivity returns | P2 |
| POS-11 | Sales return / exchange against original invoice | M |

### 4.9 Sales, Invoicing & Payments
| ID | Requirement | Priority |
|---|---|---|
| SAL-01 | GST-compliant tax invoice generation (sequential, store-scoped numbering, no gaps) | M |
| SAL-02 | Invoice PDF generation and archival in S3 | M |
| SAL-03 | Payment recording against invoice with multiple modes and partial payments | M |
| SAL-04 | Sales return with automatic stock and ledger reversal | M |
| SAL-05 | Credit note generation for returns | M |

### 4.10 Expenses
| ID | Requirement | Priority |
|---|---|---|
| EXP-01 | CRUD expense entries with category, amount, payment mode, attachment | P1 |
| EXP-02 | Expense categories master | P1 |

### 4.11 Reports & Analytics
| ID | Requirement | Priority |
|---|---|---|
| RPT-01 | Daily/monthly sales report with drill-down | M |
| RPT-02 | Profit & Loss (revenue − COGS − expenses) | P1 |
| RPT-03 | Inventory valuation and stock movement report | M |
| RPT-04 | GST summary report (GSTR-1 style outward supply summary) | M |
| RPT-05 | Purchase report, customer report, supplier report | P1 |
| RPT-06 | Cash flow and payment-mode-wise collection report | M |
| RPT-07 | Best-selling products and employee (cashier) performance report | P1 |
| RPT-08 | Export any report/table to CSV, Excel, and PDF | M |

### 4.12 Dashboard
| ID | Requirement | Priority |
|---|---|---|
| DSH-01 | Revenue, sales count, profit, and low-stock KPI cards with trend sparkline | M |
| DSH-02 | Top products, top customers, recent bills, recent activity feed | M |
| DSH-03 | Charts: sales trend, category mix, payment-mode split | M |

### 4.13 Notifications & Settings
| ID | Requirement | Priority |
|---|---|---|
| NOT-01 | In-app notification center (low stock, PO approvals, large discounts) | P1 |
| NOT-02 | Org-level settings: invoice numbering, tax defaults, receipt template, currency/locale | M |
| SET-02 | Audit log viewer (who changed what, when) for admins | M |

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | POS "add item to cart" round trip < 300ms p95; dashboard load < 2s p95 |
| Availability | 99.9% uptime target for API; graceful degradation of POS during transient backend issues |
| Scalability | Horizontally scalable API tier; supports thousands of organizations and tens of millions of ledger rows per tenant over time |
| Security | JWT + RBAC, encrypted secrets, TLS everywhere, OWASP Top-10 mitigations (see 02-system-architecture.md §7) |
| Compliance | Indian GST invoicing rules (sequential numbering, HSN, CGST/SGST/IGST split); extensible to other tax regimes later |
| Auditability | Every financial and stock-affecting mutation is attributable (`created_by`/`updated_by`) and reversible via return/credit-note flows, never hard-deleted |
| Accessibility | WCAG 2.1 AA for admin/back-office screens; POS screen optimized for speed over strict AA (documented exception) |
| Localization | Multi-currency-ready schema (currency stored per org); UI copy externalized for future i18n |
| Data retention | Soft delete everywhere; audit history retained indefinitely unless purged by explicit admin action |

## 6. Assumptions & Constraints

- Primary launch market is India (GST-first), architected so tax rules are data-driven rather than hardcoded, to support other regimes later.
- Thermal printing targets standard ESC/POS 80mm/58mm printers via a browser print bridge or local print-agent (decided during POS module implementation).
- WhatsApp receipt delivery depends on a third-party Business API provider — treated as a pluggable notification channel, not a hard dependency for MVP.
- Multi-branch chains are in scope from day one at the data-model level, even though the first working vertical slice may exercise a single branch.

## 7. Out of Scope for MVP (Phase 2+)

- Full super-admin SaaS billing/subscription console (metering, plan upgrades, dunning) — UltisPro itself needs to be sellable before it needs self-serve billing; tracked separately from the retail product roadmap.
- True offline-first POS with conflict-free sync (POS-10) — MVP requires connectivity; an offline *indicator* ships in MVP, offline *queueing* is P2.
- Native mobile apps — MVP is responsive web only.
- Marketplace/e-commerce channel integrations.
