-- Public, shareable bill links.
--
-- A customer who receives their bill by SMS/email/WhatsApp cannot log in, so
-- the receipt has to be reachable without authentication. That link is
-- therefore the only credential protecting it, which drives every decision
-- here:
--
--   * A dedicated random token, NOT the invoice's own UUID. Reusing the id
--     would make the internal identifier public and let anyone holding one
--     link probe the authenticated API for the same record.
--   * 32 bytes of CSPRNG output rendered base64url (~43 chars). Long enough
--     that enumeration is infeasible, short enough to survive an SMS.
--   * UNIQUE so a collision fails loudly at insert rather than silently
--     handing one customer another's bill.
--
-- Nullable because invoices created before this migration have no token;
-- they simply cannot be shared until reissued. Backfilling would mean
-- minting tokens for historic bills nobody asked to share, which is a
-- needless widening of what's publicly reachable.
ALTER TABLE sales_invoices ADD COLUMN public_token VARCHAR(64);

-- Partial unique index: many pre-existing rows are NULL, and NULLs are
-- distinct in Postgres, so a plain UNIQUE would allow them while still
-- enforcing uniqueness on real tokens. The WHERE clause makes that explicit
-- and keeps the index small.
CREATE UNIQUE INDEX idx_sales_invoices_public_token
  ON sales_invoices(public_token) WHERE public_token IS NOT NULL;
