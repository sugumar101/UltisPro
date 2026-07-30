-- Phase 3: Suppliers & Purchasing (M6). See docs/03-database-design.md §7,
-- with one addition beyond the original draft: `suppliers` gains
-- created_by/updated_by (+ trigger), matching the Phase 2 precedent of
-- bringing master-data tables in line with this doc's own stated blanket
-- convention (docs/03-database-design.md §12).
--
-- Also creates `product_suppliers`, deferred from the Phase 2 migration
-- because it references `suppliers` (see docs/03-database-design.md §12,
-- docs/04-module-breakdown.md M4). No dedicated API is built for it in
-- Phase 3 — it's optional sourcing metadata, not required for the
-- PO create -> approve -> receive flow to work end-to-end; CRUD for it is
-- left for a later pass (see docs/05-development-roadmap.md Phase 3 notes).

CREATE TABLE suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  name                VARCHAR(255) NOT NULL,
  gstin               VARCHAR(15),
  phone               VARCHAR(20),
  email               VARCHAR(255),
  payment_terms_days  SMALLINT NOT NULL DEFAULT 0,
  outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id),
  updated_by          UUID REFERENCES users(id),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_org ON suppliers(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  po_number       VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','partially_received','received','cancelled')),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, po_number)
);
CREATE INDEX idx_purchase_orders_org ON purchase_orders(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);

CREATE TABLE purchase_order_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id    UUID NOT NULL REFERENCES purchase_orders(id),
  product_variant_id   UUID NOT NULL REFERENCES product_variants(id),
  quantity_ordered     NUMERIC(14,4) NOT NULL,
  quantity_received    NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost            NUMERIC(12,4) NOT NULL,
  tax_id               UUID REFERENCES taxes(id),
  line_total           NUMERIC(14,2) NOT NULL,
  CHECK (quantity_received <= quantity_ordered)
);
CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);

CREATE TABLE purchase_returns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id),
  reason              TEXT,
  grand_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id)
);
CREATE INDEX idx_purchase_returns_po ON purchase_returns(purchase_order_id);

CREATE TABLE purchase_return_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id   UUID NOT NULL REFERENCES purchase_returns(id),
  product_variant_id   UUID NOT NULL REFERENCES product_variants(id),
  batch_id             UUID REFERENCES batches(id),
  quantity             NUMERIC(14,4) NOT NULL,
  unit_cost            NUMERIC(12,4) NOT NULL
);
CREATE INDEX idx_purchase_return_items_return ON purchase_return_items(purchase_return_id);

CREATE TABLE supplier_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  amount            NUMERIC(14,2) NOT NULL,
  payment_mode      VARCHAR(20) NOT NULL CHECK (payment_mode IN ('cash','bank_transfer','cheque','upi','card')),
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id)
);
CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);

CREATE TABLE product_suppliers (
  product_id           UUID NOT NULL REFERENCES products(id),
  supplier_id          UUID NOT NULL REFERENCES suppliers(id),
  supplier_sku         VARCHAR(100),
  last_purchase_price  NUMERIC(12,2),
  PRIMARY KEY (product_id, supplier_id)
);
