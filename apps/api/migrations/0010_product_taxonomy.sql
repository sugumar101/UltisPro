-- Clothing-vertical product taxonomy: Product Type (Shirts, T-Shirts, Pants,
-- Shorts, ...) -> Product Category nested under a type (for T-Shirts:
-- Oversized, Normal Fit, Drop Shoulder, Polo, ...). Deliberately NEW tables
-- rather than repurposing the existing `categories` table (which already
-- has an unused parent_id self-reference) -- this feature ships behind a
-- separate "New Clothing Product" flow (apps/web/app/products/new-clothing),
-- kept fully independent of the existing generic Products flow so nothing
-- here can affect the already-shipped, already-tested generic product
-- creation path. See docs/03-database-design.md for the full writeup.
--
-- `size_options` on product_types is what makes the size checkboxes on the
-- clothing form data-driven per the requirement ("product type and mapped
-- category should be inserted into DB so we can make it dynamic") -- e.g.
-- Shirts/T-Shirts -> {XS,S,M,L,XL,2XL,3XL}, Pants/Shorts -> {28,30,...,44},
-- entered by whoever manages Settings > Catalog, not hardcoded in the app.

CREATE TABLE product_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            VARCHAR(100) NOT NULL,
  size_options    TEXT[] NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_product_types_org ON product_types(organization_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_product_types_updated_at BEFORE UPDATE ON product_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  product_type_id UUID NOT NULL REFERENCES product_types(id),
  name            VARCHAR(100) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, product_type_id, name)
);
CREATE INDEX idx_product_categories_type ON product_categories(product_type_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_product_categories_updated_at BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Nullable additions to the existing `products` table (migration
-- 0004_catalog.sql) -- populated only by the new clothing flow; every
-- product created via the existing generic /products endpoint simply
-- leaves these null, so nothing about the existing flow changes.
ALTER TABLE products ADD COLUMN product_type_id UUID REFERENCES product_types(id);
ALTER TABLE products ADD COLUMN product_category_id UUID REFERENCES product_categories(id);
ALTER TABLE products ADD COLUMN gender VARCHAR(20);
-- 5-digit auto-generated code, unique per org once assigned. Nullable
-- because existing/generic products never get one.
ALTER TABLE products ADD COLUMN product_code CHAR(5);
ALTER TABLE products ADD CONSTRAINT products_product_code_unique UNIQUE (organization_id, product_code);

CREATE INDEX idx_products_product_type ON products(product_type_id) WHERE deleted_at IS NULL;
