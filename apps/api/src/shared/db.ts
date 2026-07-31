import { Pool } from 'pg';
import { Kysely, PostgresDialect, type Generated, type ColumnType } from 'kysely';
import { env } from '../config/env';

/**
 * Grows module-by-module as each one lands its migrations
 * (docs/03-database-design.md). Phase 1 adds the full Identity & Tenancy
 * domain (docs/04-module-breakdown.md M1/M2/M3).
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * NUMERIC columns: node-pg always returns these as strings (avoids float
 * precision loss on money/quantity values); writes accept either a JS
 * number or a string, since service-layer code mostly deals in numbers.
 */
type Numeric = ColumnType<string, number | string, number | string>;

export interface OrganizationsTable {
  id: Generated<string>;
  legal_name: string;
  display_name: string;
  business_type: string;
  default_currency: Generated<string>;
  timezone: Generated<string>;
  subscription_plan: Generated<string>;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface StoresTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  gstin: string | null;
  invoice_prefix: Generated<string>;
  next_invoice_seq: Generated<Numeric>;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: Generated<string>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface BranchesTable {
  id: Generated<string>;
  organization_id: string;
  store_id: string;
  name: string;
  code: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface WarehousesTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string | null;
  name: string;
  code: string;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface UsersTable {
  id: Generated<string>;
  organization_id: string;
  email: string;
  phone: string | null;
  full_name: string;
  password_hash: string;
  is_active: Generated<boolean>;
  last_login_at: Timestamp | null;
  failed_login_count: Generated<number>;
  locked_until: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface RolesTable {
  id: string;
  organization_id: string | null;
  name: string;
  is_system: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface PermissionsTable {
  id: Generated<string>;
  code: string;
  module: string;
  description: string | null;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
}

export interface UserStoreRolesTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string;
  branch_id: string;
  role_id: string;
  created_at: Generated<Timestamp>;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface PasswordResetTokensTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface AuditLogsTable {
  id: Generated<string>;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  entity_table: string;
  entity_id: string;
  before_data: unknown;
  after_data: unknown;
  ip_address: string | null;
  created_at: Generated<Timestamp>;
}

// --- Phase 2: Catalog (docs/03-database-design.md §5, changelog §12) ---

export interface CategoriesTable {
  id: Generated<string>;
  organization_id: string;
  parent_id: string | null;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface BrandsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface UnitsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  symbol: string;
  base_unit_id: string | null;
  conversion_factor: Generated<Numeric>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface TaxesTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  rate_percent: Numeric;
  cgst_percent: Generated<Numeric>;
  sgst_percent: Generated<Numeric>;
  igst_percent: Generated<Numeric>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface ProductsTable {
  id: Generated<string>;
  organization_id: string;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string;
  tax_id: string | null;
  name: string;
  description: string | null;
  hsn_code: string | null;
  has_variants: Generated<boolean>;
  track_batches: Generated<boolean>;
  is_active: Generated<boolean>;
  // --- Phase 9: clothing product taxonomy (docs/03-database-design.md §19) ---
  // All nullable: only populated by the new clothing product flow; every
  // product created via the pre-existing generic /products endpoint leaves
  // these null.
  product_type_id: string | null;
  product_category_id: string | null;
  gender: string | null;
  product_code: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

// --- Phase 9: clothing product taxonomy (docs/03-database-design.md §19) ---

export interface ProductTypesTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  /**
   * e.g. ['XS','S','M','L','XL','2XL','3XL'] or ['28','30',...,'44'] --
   * admin-entered, drives the size checkbox grid on the clothing product
   * form. Native Postgres TEXT[], not JSONB -- the `pg` driver marshals JS
   * arrays <-> Postgres arrays automatically, unlike the JSONB `attributes`
   * column on product_variants which needs manual JSON.stringify.
   */
  size_options: Generated<string[]>;
  /** Inherited by products created under this type when no HSN is entered (migration 0011). */
  default_hsn_code: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface ProductCategoriesTable {
  id: Generated<string>;
  organization_id: string;
  product_type_id: string;
  name: string;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface ProductVariantsTable {
  id: Generated<string>;
  organization_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  /** JSONB — always write JSON.stringify(obj); reads back as a parsed object. */
  attributes: ColumnType<Record<string, string>, string, string>;
  mrp: Numeric;
  selling_price: Numeric;
  purchase_price: Generated<Numeric>;
  reorder_level: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface ProductImagesTable {
  id: Generated<string>;
  product_id: string;
  s3_key: string;
  sort_order: Generated<number>;
  created_at: Generated<Timestamp>;
}

// --- Phase 2: Inventory (docs/03-database-design.md §6) ---

export interface BatchesTable {
  id: Generated<string>;
  organization_id: string;
  product_variant_id: string;
  batch_number: string;
  manufactured_date: string | null;
  expiry_date: string | null;
  purchase_price: Numeric | null;
  created_at: Generated<Timestamp>;
}

export interface BranchStockTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string;
  product_variant_id: string;
  batch_id: string | null;
  quantity_on_hand: Generated<Numeric>;
  quantity_reserved: Generated<Numeric>;
  updated_at: Generated<Timestamp>;
}

export interface StockLedgerTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string;
  product_variant_id: string;
  batch_id: string | null;
  movement_type: string;
  reference_table: string;
  reference_id: string;
  quantity_delta: Numeric;
  balance_after: Numeric;
  unit_cost: Numeric | null;
  created_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface StockAdjustmentsTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string;
  reason_code: string;
  notes: string | null;
  approved_by: string | null;
  created_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface StockAdjustmentItemsTable {
  id: Generated<string>;
  stock_adjustment_id: string;
  product_variant_id: string;
  batch_id: string | null;
  quantity_delta: Numeric;
}

export interface StockTransfersTable {
  id: Generated<string>;
  organization_id: string;
  from_branch_id: string;
  to_branch_id: string;
  status: Generated<string>;
  created_at: Generated<Timestamp>;
  created_by: string | null;
  completed_at: Timestamp | null;
}

export interface StockTransferItemsTable {
  id: Generated<string>;
  stock_transfer_id: string;
  product_variant_id: string;
  batch_id: string | null;
  quantity: Numeric;
}

// --- Phase 3: Suppliers & Purchasing (docs/03-database-design.md §7, changelog §13) ---

export interface SuppliersTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: Generated<number>;
  outstanding_balance: Generated<Numeric>;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface PurchaseOrdersTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string;
  supplier_id: string;
  po_number: string;
  status: Generated<string>;
  order_date: Generated<string>;
  expected_date: string | null;
  subtotal: Generated<Numeric>;
  tax_total: Generated<Numeric>;
  grand_total: Generated<Numeric>;
  created_at: Generated<Timestamp>;
  created_by: string | null;
  approved_by: string | null;
  approved_at: Timestamp | null;
  deleted_at: Timestamp | null;
}

export interface PurchaseOrderItemsTable {
  id: Generated<string>;
  purchase_order_id: string;
  product_variant_id: string;
  quantity_ordered: Numeric;
  quantity_received: Generated<Numeric>;
  unit_cost: Numeric;
  tax_id: string | null;
  line_total: Numeric;
}

export interface PurchaseReturnsTable {
  id: Generated<string>;
  organization_id: string;
  purchase_order_id: string;
  reason: string | null;
  grand_total: Generated<Numeric>;
  created_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface PurchaseReturnItemsTable {
  id: Generated<string>;
  purchase_return_id: string;
  product_variant_id: string;
  batch_id: string | null;
  quantity: Numeric;
  unit_cost: Numeric;
}

export interface SupplierPaymentsTable {
  id: Generated<string>;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  amount: Numeric;
  payment_mode: string;
  paid_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface ProductSuppliersTable {
  product_id: string;
  supplier_id: string;
  supplier_sku: string | null;
  last_purchase_price: Numeric | null;
}

// --- Phase 4: Customers & CRM (docs/03-database-design.md §8, changelog §14) ---

export interface CustomersTable {
  id: Generated<string>;
  organization_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  credit_limit: Generated<Numeric>;
  outstanding_balance: Generated<Numeric>;
  loyalty_points: Generated<number>;
  is_walkin: Generated<boolean>;
  /** Promotional messaging consent (migration 0012). Never inferred from having a phone number. */
  marketing_opt_in: Generated<boolean>;
  marketing_consent_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface CustomerAddressesTable {
  id: Generated<string>;
  customer_id: string;
  label: string | null;
  line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  is_default: Generated<boolean>;
}

// --- Phase 5: POS & Sales (docs/03-database-design.md §8) ---

export interface HeldBillsTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string;
  register_code: string;
  customer_id: string | null;
  /** JSONB — always write JSON.stringify(obj); reads back as a parsed object. */
  cart_snapshot: ColumnType<unknown, string, string>;
  created_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface SalesInvoicesTable {
  id: Generated<string>;
  organization_id: string;
  store_id: string;
  branch_id: string;
  customer_id: string | null;
  invoice_number: string;
  invoice_date: Generated<Timestamp>;
  status: Generated<string>;
  subtotal: Numeric;
  discount_total: Generated<Numeric>;
  tax_total: Generated<Numeric>;
  grand_total: Numeric;
  amount_paid: Generated<Numeric>;
  register_code: string | null;
  cashier_id: string | null;
  pdf_s3_key: string | null;
  created_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface SalesInvoiceItemsTable {
  id: Generated<string>;
  sales_invoice_id: string;
  product_variant_id: string;
  batch_id: string | null;
  quantity: Numeric;
  unit_price: Numeric;
  discount_amount: Generated<Numeric>;
  tax_id: string | null;
  tax_amount: Generated<Numeric>;
  line_total: Numeric;
}

export interface SalesReturnsTable {
  id: Generated<string>;
  organization_id: string;
  sales_invoice_id: string;
  credit_note_number: string;
  reason: string | null;
  grand_total: Numeric;
  created_at: Generated<Timestamp>;
  created_by: string | null;
}

export interface SalesReturnItemsTable {
  id: Generated<string>;
  sales_return_id: string;
  sales_invoice_item_id: string;
  quantity: Numeric;
  refund_amount: Numeric;
}

export interface PaymentsTable {
  id: Generated<string>;
  organization_id: string;
  sales_invoice_id: string | null;
  customer_id: string | null;
  amount: Numeric;
  payment_mode: string;
  reference_no: string | null;
  paid_at: Generated<Timestamp>;
  created_by: string | null;
}

// --- Phase 7: Expenses (docs/03-database-design.md §9) ---

export interface ExpenseCategoriesTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: Timestamp | null;
}

export interface ExpensesTable {
  id: Generated<string>;
  organization_id: string;
  branch_id: string | null;
  expense_category_id: string;
  amount: Numeric;
  payment_mode: string;
  notes: string | null;
  attachment_s3_key: string | null;
  expense_date: Generated<string>;
  created_at: Generated<Timestamp>;
  created_by: string | null;
  deleted_at: Timestamp | null;
}

// --- Phase 7: Notifications (docs/03-database-design.md §9) ---

export interface NotificationsTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  reference_table: string | null;
  reference_id: string | null;
  read_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface Database {
  schema_migrations: {
    id: Generated<number>;
    name: string;
    applied_at: Generated<Timestamp>;
  };
  organizations: OrganizationsTable;
  stores: StoresTable;
  branches: BranchesTable;
  warehouses: WarehousesTable;
  users: UsersTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  user_store_roles: UserStoreRolesTable;
  refresh_tokens: RefreshTokensTable;
  password_reset_tokens: PasswordResetTokensTable;
  audit_logs: AuditLogsTable;
  categories: CategoriesTable;
  brands: BrandsTable;
  units: UnitsTable;
  taxes: TaxesTable;
  products: ProductsTable;
  product_variants: ProductVariantsTable;
  product_images: ProductImagesTable;
  product_types: ProductTypesTable;
  product_categories: ProductCategoriesTable;
  batches: BatchesTable;
  branch_stock: BranchStockTable;
  stock_ledger: StockLedgerTable;
  stock_adjustments: StockAdjustmentsTable;
  stock_adjustment_items: StockAdjustmentItemsTable;
  stock_transfers: StockTransfersTable;
  stock_transfer_items: StockTransferItemsTable;
  suppliers: SuppliersTable;
  purchase_orders: PurchaseOrdersTable;
  purchase_order_items: PurchaseOrderItemsTable;
  purchase_returns: PurchaseReturnsTable;
  purchase_return_items: PurchaseReturnItemsTable;
  supplier_payments: SupplierPaymentsTable;
  product_suppliers: ProductSuppliersTable;
  customers: CustomersTable;
  customer_addresses: CustomerAddressesTable;
  held_bills: HeldBillsTable;
  sales_invoices: SalesInvoicesTable;
  sales_invoice_items: SalesInvoiceItemsTable;
  sales_returns: SalesReturnsTable;
  sales_return_items: SalesReturnItemsTable;
  payments: PaymentsTable;
  expense_categories: ExpenseCategoriesTable;
  expenses: ExpensesTable;
  notifications: NotificationsTable;
}

/**
 * Connection pool sizing.
 *
 * The default `max` is 10, which is the practical throughput ceiling of a
 * single instance: every checkout holds a connection for a multi-statement
 * transaction with row locks, so ten concurrent checkouts saturate the
 * process regardless of how much CPU is free.
 *
 * Sizing is a budget, not a maximum-is-better dial. The real constraint is
 * the *server's* connection limit shared across every replica:
 *
 *     DB_POOL_MAX x replica count  <  server max_connections
 *
 * Neon's smaller plans allow a few hundred; exceeding it doesn't degrade,
 * it hard-fails new connections. 20 x 3 replicas = 60 leaves ample room,
 * which is why the default is deliberately modest rather than large.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,

  // Return idle connections rather than holding them open forever. Serverless
  // Postgres bills for connection time, and idle sockets are the first thing
  // an intermediate proxy drops silently.
  idleTimeoutMillis: 30_000,

  // Fail fast when the database is unreachable instead of queueing requests
  // until the whole process wedges. Surfaces as a 500 with a real message.
  connectionTimeoutMillis: 10_000,

  // Server-side guard: no single statement may pin a connection indefinitely.
  // Without this one pathological query (a report over a huge date range,
  // say) holds a pool slot until the client gives up, and under load the
  // pool drains and the API stops responding entirely. Set per connection at
  // creation so it applies to every query on it.
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,

  // Bounds how long a transaction may sit idle holding locks — a client that
  // disconnects mid-checkout would otherwise keep stock rows locked until
  // the TCP timeout, blocking every other till selling that variant.
  idle_in_transaction_session_timeout: 30_000,
});

pool.on('error', (err) => {
  // A pooled connection can fail while idle (network blip, server restart).
  // pg emits this on the pool rather than a request, and an unhandled
  // 'error' event would crash the process.
  // eslint-disable-next-line no-console
  console.error('Unexpected database pool error:', err.message);
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
