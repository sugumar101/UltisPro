-- Phase 5: POS & Sales (M8 + M9). See docs/03-database-design.md §8.
-- held_bills, sales_invoices, sales_invoice_items, sales_returns,
-- sales_return_items, payments — as originally drafted, no deviations.
-- Sequential invoice numbering reuses stores.next_invoice_seq /
-- stores.invoice_prefix, already present since the Phase 1 migration
-- (docs/03-database-design.md §10).

CREATE TABLE held_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  register_code   VARCHAR(20) NOT NULL,
  customer_id     UUID REFERENCES customers(id),
  cart_snapshot   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id)
);
CREATE INDEX idx_held_bills_branch ON held_bills(branch_id);

CREATE TABLE sales_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id),
  store_id           UUID NOT NULL REFERENCES stores(id),
  branch_id          UUID NOT NULL REFERENCES branches(id),
  customer_id        UUID REFERENCES customers(id),
  invoice_number     VARCHAR(50) NOT NULL,
  invoice_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             VARCHAR(20) NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('completed','partially_returned','returned','void')),
  subtotal           NUMERIC(14,2) NOT NULL,
  discount_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total        NUMERIC(14,2) NOT NULL,
  amount_paid        NUMERIC(14,2) NOT NULL DEFAULT 0,
  register_code      VARCHAR(20),
  cashier_id         UUID REFERENCES users(id),
  pdf_s3_key         VARCHAR(500),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (store_id, invoice_number)
);
CREATE INDEX idx_invoices_org_date ON sales_invoices(organization_id, invoice_date);
CREATE INDEX idx_invoices_customer ON sales_invoices(customer_id);

CREATE TABLE sales_invoice_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id      UUID NOT NULL REFERENCES sales_invoices(id),
  product_variant_id    UUID NOT NULL REFERENCES product_variants(id),
  batch_id              UUID REFERENCES batches(id),
  quantity              NUMERIC(14,4) NOT NULL,
  unit_price            NUMERIC(12,4) NOT NULL,
  discount_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_id                UUID REFERENCES taxes(id),
  tax_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_sales_invoice_items_invoice ON sales_invoice_items(sales_invoice_id);

CREATE TABLE sales_returns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  sales_invoice_id     UUID NOT NULL REFERENCES sales_invoices(id),
  credit_note_number   VARCHAR(50) NOT NULL,
  reason               TEXT,
  grand_total          NUMERIC(14,2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES users(id),
  UNIQUE (organization_id, credit_note_number)
);
CREATE INDEX idx_sales_returns_invoice ON sales_returns(sales_invoice_id);

CREATE TABLE sales_return_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id       UUID NOT NULL REFERENCES sales_returns(id),
  sales_invoice_item_id UUID NOT NULL REFERENCES sales_invoice_items(id),
  quantity              NUMERIC(14,4) NOT NULL,
  refund_amount         NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_sales_return_items_return ON sales_return_items(sales_return_id);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  sales_invoice_id  UUID REFERENCES sales_invoices(id),
  customer_id       UUID REFERENCES customers(id),
  amount            NUMERIC(14,2) NOT NULL,
  payment_mode      VARCHAR(20) NOT NULL
                      CHECK (payment_mode IN ('cash','card','upi','wallet','store_credit','gift_voucher')),
  reference_no      VARCHAR(100),
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id)
);
CREATE INDEX idx_payments_invoice ON payments(sales_invoice_id);
