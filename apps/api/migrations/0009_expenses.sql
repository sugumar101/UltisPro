-- Phase 7: Expenses (M10). See docs/03-database-design.md §9.
-- `expense_categories` gains created_by/updated_by (+ trigger), the same
-- treatment every other master-data table has gotten since Phase 2
-- (docs/03-database-design.md §12/§13/§14). `expenses` itself is left as
-- originally drafted (created_by only, no updated_at) — it's a
-- transactional record on the same footing as stock_adjustments and
-- purchase_returns, neither of which gained updated_at either.

CREATE TABLE expense_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(100) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_expense_categories_org ON expense_categories(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE expenses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id),
  branch_id            UUID REFERENCES branches(id),
  expense_category_id  UUID NOT NULL REFERENCES expense_categories(id),
  amount               NUMERIC(14,2) NOT NULL,
  payment_mode         VARCHAR(20) NOT NULL,
  notes                TEXT,
  attachment_s3_key    VARCHAR(500),
  expense_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES users(id),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX idx_expenses_org_date ON expenses(organization_id, expense_date) WHERE deleted_at IS NULL;

-- Phase 7: Notifications (M13). audit_logs already exists since Phase 1
-- (migrations/0002_identity_and_tenancy.sql) — only notifications is new here.
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID REFERENCES users(id), -- NULL = broadcast to all users with matching permission
  type            VARCHAR(50) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  reference_table VARCHAR(50),
  reference_id    UUID,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_org ON notifications(organization_id);
