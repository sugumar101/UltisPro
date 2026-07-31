-- Search indexes for the POS lookup path.
--
-- POS search matches every token against product name, SKU **and** barcode
-- with `ILIKE '%term%'`. A leading wildcard makes a btree index useless, so
-- only `products.name` was actually indexed for this (migration 0004 added
-- a gin_trgm index there). SKU and barcode fell back to a sequential scan
-- of `product_variants` on every keystroke-triggered search — fine at a few
-- hundred variants, progressively worse as a catalogue grows, and paid on
-- the single most latency-sensitive path in the product (a cashier waiting
-- at the till).
--
-- pg_trgm is already installed (migration 0001).

CREATE INDEX IF NOT EXISTS idx_variants_sku_trgm
  ON product_variants USING gin (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_variants_barcode_trgm
  ON product_variants USING gin (barcode gin_trgm_ops);

-- Customers are searched the same way (name or phone) from the sales list
-- and the counter lookup. `full_name` already has a trigram index from
-- migration 0007; phone did not.
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING gin (phone gin_trgm_ops);

-- The sales list is almost always read newest-first and filtered by branch.
-- The existing index is (organization_id, invoice_date) ascending, which
-- still requires a backward scan; this matches the actual access pattern.
CREATE INDEX IF NOT EXISTS idx_invoices_org_branch_date
  ON sales_invoices(organization_id, branch_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

-- Stock lookups per variant across branches back the product-list stock
-- totals; the existing index leads with branch_id, so a variant-first
-- lookup couldn't use it.
CREATE INDEX IF NOT EXISTS idx_branch_stock_variant
  ON branch_stock(product_variant_id);

-- Low-stock scanning (notification generation, dashboard KPI) filters
-- variants by organization; without this it scans every variant in the
-- table rather than just the tenant's.
CREATE INDEX IF NOT EXISTS idx_variants_org
  ON product_variants(organization_id) WHERE deleted_at IS NULL;
