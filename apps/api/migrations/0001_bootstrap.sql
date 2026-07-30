-- Phase 0 bootstrap: extensions and the shared updated_at trigger used by
-- every tenant table introduced from Phase 1 onward.
-- See docs/03-database-design.md §2.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
