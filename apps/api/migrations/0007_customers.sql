-- Phase 4: Customers & CRM (M7). See docs/03-database-design.md §8, with one
-- deviation: only `customers` and `customer_addresses` are created here.
-- `loyalty_transactions`, `gift_vouchers`, and `store_credits` are P1 per
-- docs/04-module-breakdown.md M7 ("MVP: Yes (core CRUD, credit limit,
-- walk-in); loyalty/vouchers/store-credit are P1") and are also awkward to
-- stand up now: `store_credits.source_return_id` references `sales_returns`,
-- which doesn't exist until Phase 5 — the same "don't build against a table
-- that doesn't exist yet" reasoning that deferred `product_suppliers` to
-- Phase 3 (docs/03-database-design.md §12).
--
-- `customers` gains created_by/updated_by (+ trigger), matching the
-- suppliers precedent from Phase 3 (docs/03-database-design.md §13) — it's
-- a mutable, org-owned entity on the same footing.

CREATE TABLE customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  full_name           VARCHAR(255) NOT NULL,
  phone               VARCHAR(20),
  email               VARCHAR(255),
  gstin               VARCHAR(15),
  credit_limit        NUMERIC(14,2) NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  loyalty_points      INTEGER NOT NULL DEFAULT 0, -- earning/redeeming is P1 (loyalty_transactions); column reserved now
  is_walkin           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id),
  updated_by          UUID REFERENCES users(id),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (organization_id, phone)
);
CREATE INDEX idx_customers_org ON customers(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_name_trgm ON customers USING gin (full_name gin_trgm_ops);
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customer_addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id),
  label        VARCHAR(50),
  line1        VARCHAR(255),
  city         VARCHAR(100),
  state        VARCHAR(100),
  postal_code  VARCHAR(20),
  is_default   BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
