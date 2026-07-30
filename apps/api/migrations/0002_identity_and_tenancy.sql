-- Phase 1: Identity & Tenancy (M1 Authentication, M2 Organizations/Stores/Branches, M3 Users/Roles/Permissions).
-- Base tables per docs/03-database-design.md domains 3 and 4, with two
-- deliberate refinements made during implementation:
--   1. users.email is GLOBALLY unique (not per-organization as originally
--      drafted) so login-by-email is unambiguous without an org slug step.
--   2. password_reset_tokens is a new table, not in the original design doc,
--      required to implement FR AUTH-03 (password reset).
-- Both are reflected back into docs/03-database-design.md.

CREATE TABLE organizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name         VARCHAR(255) NOT NULL,
  display_name       VARCHAR(255) NOT NULL,
  business_type      VARCHAR(50) NOT NULL DEFAULT 'general'
                       CHECK (business_type IN ('general','clothing','supermarket','electronics','mobile','grocery','pharmacy','hardware')),
  default_currency   CHAR(3) NOT NULL DEFAULT 'INR',
  timezone           VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  subscription_plan  VARCHAR(50) NOT NULL DEFAULT 'trial',
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE stores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              VARCHAR(255) NOT NULL,
  gstin             VARCHAR(15),
  invoice_prefix    VARCHAR(10) NOT NULL DEFAULT 'INV',
  next_invoice_seq  BIGINT NOT NULL DEFAULT 1,
  address_line1     VARCHAR(255),
  address_line2     VARCHAR(255),
  city              VARCHAR(100),
  state             VARCHAR(100),
  postal_code       VARCHAR(20),
  country           VARCHAR(100) NOT NULL DEFAULT 'India',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  updated_by        UUID,
  deleted_at        TIMESTAMPTZ,
  UNIQUE (organization_id, gstin)
);
CREATE INDEX idx_stores_org ON stores(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  store_id        UUID NOT NULL REFERENCES stores(id),
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(20) NOT NULL,
  address_line1   VARCHAR(255),
  city            VARCHAR(100),
  state           VARCHAR(100),
  postal_code     VARCHAR(20),
  phone           VARCHAR(20),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  UNIQUE (store_id, code)
);
CREATE INDEX idx_branches_org ON branches(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id       UUID REFERENCES branches(id),
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(20) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, code)
);
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  email               VARCHAR(255) NOT NULL UNIQUE,
  phone               VARCHAR(20),
  full_name           VARCHAR(255) NOT NULL,
  password_hash       VARCHAR(255) NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  last_login_at       TIMESTAMPTZ,
  failed_login_count  SMALLINT NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  updated_by          UUID,
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_users_org ON users(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Deferred FKs now that users exists (created_by/updated_by audit columns).
ALTER TABLE stores   ADD CONSTRAINT fk_stores_created_by   FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE stores   ADD CONSTRAINT fk_stores_updated_by   FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE branches ADD CONSTRAINT fk_branches_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE branches ADD CONSTRAINT fk_branches_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE users    ADD CONSTRAINT fk_users_created_by    FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE users    ADD CONSTRAINT fk_users_updated_by    FOREIGN KEY (updated_by) REFERENCES users(id);

CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id), -- NULL = system role, shared across all orgs
  name            VARCHAR(100) NOT NULL,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(100) NOT NULL UNIQUE,
  module      VARCHAR(50) NOT NULL,
  description VARCHAR(255)
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- A user's role can differ per branch (Manager at Branch A, Cashier at Branch B).
CREATE TABLE user_store_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  role_id         UUID NOT NULL REFERENCES roles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);
CREATE INDEX idx_user_store_roles_user ON user_store_roles(user_id);
CREATE INDEX idx_user_store_roles_branch ON user_store_roles(branch_id);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  family_id   UUID NOT NULL, -- rotation family; reuse of a revoked token revokes the whole family
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- Generic audit trail (docs/03-database-design.md §9). Brought forward into
-- Phase 1, not deferred, per docs/04-module-breakdown.md M13: "the audit
-- logging engine is MVP from day one ... wired in from M1 onward."
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_user_id   UUID REFERENCES users(id),
  action          VARCHAR(50) NOT NULL,
  entity_table    VARCHAR(50) NOT NULL,
  entity_id       UUID NOT NULL,
  before_data     JSONB,
  after_data      JSONB,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_table, entity_id);
CREATE INDEX idx_audit_logs_org_date ON audit_logs(organization_id, created_at);
