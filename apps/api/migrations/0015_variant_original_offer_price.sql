-- Original price and offer price on product variants (product add page).
--
-- Both optional: a shop that doesn't run offers just leaves these blank and
-- nothing downstream changes. Nullable rather than defaulting to 0 like
-- purchase_price does, because 0 is a legitimate "not tracked" default for
-- cost price but would be a misleading "original price" or "offer price" —
-- callers must be able to tell "not set" apart from "set to zero".
ALTER TABLE product_variants
  ADD COLUMN original_price NUMERIC(12,2),
  ADD COLUMN offer_price NUMERIC(12,2);
