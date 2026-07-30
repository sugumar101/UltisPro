-- Phase 2: Inventory & Warehouse (M5). See docs/03-database-design.md domain 6.

CREATE TABLE batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  product_variant_id  UUID NOT NULL REFERENCES product_variants(id),
  batch_number        VARCHAR(100) NOT NULL,
  manufactured_date   DATE,
  expiry_date         DATE,
  purchase_price      NUMERIC(12,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, product_variant_id, batch_number)
);
CREATE INDEX idx_batches_expiry ON batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_batches_variant ON batches(product_variant_id);

-- Current stock snapshot (denormalized for read speed; source of truth is stock_ledger below).
CREATE TABLE branch_stock (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  branch_id           UUID NOT NULL REFERENCES branches(id),
  product_variant_id  UUID NOT NULL REFERENCES product_variants(id),
  batch_id            UUID REFERENCES batches(id),
  quantity_on_hand    NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantity_reserved   NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_variant_id, batch_id)
);
CREATE INDEX idx_branch_stock_lookup ON branch_stock(branch_id, product_variant_id);
CREATE TRIGGER trg_branch_stock_updated_at BEFORE UPDATE ON branch_stock
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Immutable append-only ledger; branch_stock is a materialized rollup of this
-- table, kept in sync in the same DB transaction on every write (see
-- inventory.repository.ts / inventory.service.ts). Never updated or deleted.
CREATE TABLE stock_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  branch_id           UUID NOT NULL REFERENCES branches(id),
  product_variant_id  UUID NOT NULL REFERENCES product_variants(id),
  batch_id            UUID REFERENCES batches(id),
  movement_type       VARCHAR(30) NOT NULL
                        CHECK (movement_type IN ('purchase','purchase_return','sale','sale_return',
                                                  'adjustment_in','adjustment_out','transfer_in','transfer_out')),
  reference_table     VARCHAR(50) NOT NULL,
  reference_id        UUID NOT NULL,
  quantity_delta      NUMERIC(14,4) NOT NULL,
  balance_after       NUMERIC(14,4) NOT NULL,
  unit_cost           NUMERIC(12,4),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id)
);
CREATE INDEX idx_stock_ledger_variant_branch ON stock_ledger(branch_id, product_variant_id, created_at);
CREATE INDEX idx_stock_ledger_reference ON stock_ledger(reference_table, reference_id);

CREATE TABLE stock_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  reason_code     VARCHAR(50) NOT NULL,
  notes           TEXT,
  approved_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id)
);
CREATE INDEX idx_stock_adjustments_branch ON stock_adjustments(branch_id, created_at);

CREATE TABLE stock_adjustment_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_adjustment_id   UUID NOT NULL REFERENCES stock_adjustments(id),
  product_variant_id    UUID NOT NULL REFERENCES product_variants(id),
  batch_id              UUID REFERENCES batches(id),
  quantity_delta        NUMERIC(14,4) NOT NULL
);
CREATE INDEX idx_stock_adjustment_items_adjustment ON stock_adjustment_items(stock_adjustment_id);

CREATE TABLE stock_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  from_branch_id    UUID NOT NULL REFERENCES branches(id),
  to_branch_id      UUID NOT NULL REFERENCES branches(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_transit','completed','cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id),
  completed_at      TIMESTAMPTZ,
  CHECK (from_branch_id <> to_branch_id)
);
CREATE INDEX idx_stock_transfers_from ON stock_transfers(from_branch_id);
CREATE INDEX idx_stock_transfers_to ON stock_transfers(to_branch_id);

CREATE TABLE stock_transfer_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transfer_id    UUID NOT NULL REFERENCES stock_transfers(id),
  product_variant_id   UUID NOT NULL REFERENCES product_variants(id),
  batch_id             UUID REFERENCES batches(id),
  quantity             NUMERIC(14,4) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX idx_stock_transfer_items_transfer ON stock_transfer_items(stock_transfer_id);
