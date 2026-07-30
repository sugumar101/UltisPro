-- Phase 2: Product Catalog (M4). See docs/03-database-design.md domain 5,
-- with one deviation: `product_suppliers` is deferred to the Phase 3
-- migration (it references `suppliers`, which doesn't exist until M6 —
-- see docs/04-module-breakdown.md M4, corrected dependency note).
--
-- Also brings categories/brands/units/taxes/product_variants in line with
-- the doc's own stated blanket convention ("every tenant table carries
-- created_at/updated_at/created_by/updated_by") — the original draft
-- omitted these on the smaller reference-data tables; added here for
-- consistency and because "who changed this tax rate" is worth knowing.

CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  parent_id       UUID REFERENCES categories(id),
  name            VARCHAR(150) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, parent_id, name)
);
CREATE INDEX idx_categories_org ON categories(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE brands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(150) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_brands_org ON brands(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              VARCHAR(50) NOT NULL,
  symbol            VARCHAR(10) NOT NULL,
  base_unit_id      UUID REFERENCES units(id),
  conversion_factor NUMERIC(12,4) NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (organization_id, symbol)
);
CREATE INDEX idx_units_org ON units(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE taxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(50) NOT NULL,
  rate_percent    NUMERIC(5,2) NOT NULL,
  cgst_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
  sgst_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
  igst_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  CHECK (rate_percent = cgst_percent + sgst_percent OR rate_percent = igst_percent)
);
CREATE INDEX idx_taxes_org ON taxes(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_taxes_updated_at BEFORE UPDATE ON taxes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  category_id      UUID REFERENCES categories(id),
  brand_id         UUID REFERENCES brands(id),
  unit_id          UUID NOT NULL REFERENCES units(id),
  tax_id           UUID REFERENCES taxes(id),
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  hsn_code         VARCHAR(20),
  has_variants     BOOLEAN NOT NULL DEFAULT false,
  track_batches    BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES users(id),
  updated_by       UUID REFERENCES users(id),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_products_org_active ON products(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A simple product still gets exactly one product_variants row (keeps
-- stock/pricing logic uniform between simple and variant products — see
-- docs/03-database-design.md §10).
CREATE TABLE product_variants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id),
  product_id         UUID NOT NULL REFERENCES products(id),
  sku                VARCHAR(100) NOT NULL,
  barcode            VARCHAR(100),
  attributes         JSONB NOT NULL DEFAULT '{}',
  mrp                NUMERIC(12,2) NOT NULL,
  selling_price      NUMERIC(12,2) NOT NULL,
  purchase_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  reorder_level      INTEGER NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id),
  updated_by         UUID REFERENCES users(id),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (organization_id, sku),
  UNIQUE (organization_id, barcode)
);
CREATE INDEX idx_variants_product ON product_variants(product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_variants_barcode ON product_variants(barcode) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id),
  s3_key       VARCHAR(500) NOT NULL,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_images_product ON product_images(product_id);
