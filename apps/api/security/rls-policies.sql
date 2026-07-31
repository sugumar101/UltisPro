-- ============================================================================
-- Row-Level Security policies — PREPARED, NOT ENABLED.
-- ============================================================================
--
-- This file deliberately lives OUTSIDE apps/api/migrations/ so the migration
-- runner does not pick it up. Applying it is a conscious, staged decision,
-- not something that happens on the next deploy.
--
-- WHY IT ISN'T ON BY DEFAULT
-- --------------------------
-- Enabling these policies without the application change described below
-- does not degrade gracefully — it breaks the product completely. Every
-- policy filters on a session variable the app does not currently set, so
-- `current_setting('app.current_org_id', true)` returns NULL, every policy
-- evaluates false, and every query returns zero rows. Logins fail, the POS
-- shows an empty catalog, reports come back blank. Enabling this blind, in
-- production, would look exactly like total data loss.
--
-- WHAT PROBLEM IT SOLVES
-- ----------------------
-- Tenant isolation today is enforced in application code: every repository
-- method filters `organization_id` explicitly. That has held so far, but it
-- is a convention, not a guarantee — one forgotten `.where('organization_id',
-- ...)` in a future repository method leaks one tenant's data to another,
-- with nothing at the database layer to catch it. RLS turns that convention
-- into an invariant the database enforces regardless of application bugs.
--
-- REQUIRED APPLICATION CHANGE (do this FIRST, in staging)
-- -------------------------------------------------------
-- Every query must run with the tenant's id bound to the connection, inside
-- a transaction so the setting cannot leak between pooled requests:
--
--   // shared/db.ts
--   export function withOrgContext<T>(
--     organizationId: string,
--     work: (trx: Transaction<Database>) => Promise<T>,
--   ): Promise<T> {
--     return db.transaction().execute(async (trx) => {
--       // set_config(..., true) = LOCAL: reverts at transaction end, so a
--       // connection returned to the pool never carries another tenant's id.
--       await sql`select set_config('app.current_org_id', ${organizationId}, true)`.execute(trx);
--       return work(trx);
--     });
--   }
--
-- Every repository read and write then has to go through that transaction.
-- That is a substantial refactor: most reads are currently plain `db.
-- selectFrom(...)` calls with no transaction at all. Budget for touching
-- every repository, and verify with the cross-org tests that already exist
-- (see apps/api/test/*.test.ts — several assert a 404/400 when one org
-- reaches for another's row).
--
-- A NOTE ON THE CONNECTION ROLE
-- -----------------------------
-- RLS does not apply to the table owner or to superusers unless FORCE ROW
-- LEVEL SECURITY is set. `ALTER TABLE ... FORCE ROW LEVEL SECURITY` below
-- covers that, but confirm which role your DATABASE_URL actually connects
-- as — on Neon the default role typically owns the schema, so without FORCE
-- the policies would be silently inert and you would believe you were
-- protected when you were not.
--
-- ROLLOUT ORDER
-- -------------
--   1. Implement withOrgContext and route all repositories through it.
--   2. Apply this file to a STAGING database restored from a production
--      snapshot.
--   3. Run the full test suite plus a manual pass over POS, reports and
--      settings. Blank data anywhere means a query bypassed the wrapper.
--   4. Only then apply to production, during a maintenance window, with a
--      tested rollback (the DISABLE statements at the foot of this file).
-- ============================================================================

BEGIN;

-- Every table carrying organization_id. Tables keyed only by a parent (e.g.
-- sales_invoice_items, customer_addresses, product_images) inherit isolation
-- through their foreign key and are intentionally not listed — adding
-- policies there would require a join per row check for no additional
-- protection.
DO $$
DECLARE
  target_table text;
  tenant_tables text[] := ARRAY[
    'stores', 'branches', 'warehouses', 'users', 'user_store_roles',
    'categories', 'brands', 'units', 'taxes',
    'products', 'product_variants', 'product_types', 'product_categories',
    'batches', 'branch_stock', 'stock_ledger',
    'stock_adjustments', 'stock_transfers',
    'suppliers', 'purchase_orders', 'purchase_returns', 'supplier_payments',
    'product_suppliers',
    'customers', 'held_bills',
    'sales_invoices', 'sales_returns', 'payments',
    'expense_categories', 'expenses', 'notifications', 'audit_logs'
  ];
BEGIN
  FOREACH target_table IN ARRAY tenant_tables LOOP
    -- Skip anything not present, so this file stays runnable as the schema
    -- evolves rather than failing halfway through and leaving RLS enabled
    -- on some tables but not others.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = target_table) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
      -- Without FORCE, the owning role bypasses the policy entirely.
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);

      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', target_table);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
           USING (organization_id = current_setting(''app.current_org_id'', true)::uuid)
           WITH CHECK (organization_id = current_setting(''app.current_org_id'', true)::uuid)',
        target_table
      );
    END IF;
  END LOOP;
END $$;

-- `organizations` is the tenant root, so it is keyed on `id` rather than
-- `organization_id`.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations
  USING (id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

COMMIT;

-- ============================================================================
-- ROLLBACK — keep this to hand during the production window.
-- ============================================================================
-- DO $$
-- DECLARE target_table text;
-- BEGIN
--   FOREACH target_table IN ARRAY ARRAY['organizations','stores','branches','warehouses','users',
--     'user_store_roles','categories','brands','units','taxes','products','product_variants',
--     'product_types','product_categories','batches','branch_stock','stock_ledger',
--     'stock_adjustments','stock_transfers','suppliers','purchase_orders','purchase_returns',
--     'supplier_payments','product_suppliers','customers','held_bills','sales_invoices',
--     'sales_returns','payments','expense_categories','expenses','notifications','audit_logs'] LOOP
--     IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = target_table) THEN
--       EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', target_table);
--       EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', target_table);
--     END IF;
--   END LOOP;
-- END $$;
