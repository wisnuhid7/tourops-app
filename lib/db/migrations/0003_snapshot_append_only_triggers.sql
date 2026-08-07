-- Migration 0003: append-only enforcement on quote_pricing_snapshots
-- Adds BEFORE UPDATE and BEFORE DELETE triggers so no code path (ORM or
-- direct SQL) can silently modify or remove a snapshot row, guaranteeing
-- the tamper-proof property at the database level.
-- All statements are idempotent.

-- Trigger function (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION prevent_snapshot_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'quote_pricing_snapshots is append-only: % is not permitted (quote_id=%, version=%)',
    TG_OP,
    COALESCE(OLD.quote_id::text, '?'),
    COALESCE(OLD.version::text, '?');
END;
$$;

-- DROP IF EXISTS + CREATE because PostgreSQL has no CREATE TRIGGER IF NOT EXISTS
DROP TRIGGER IF EXISTS no_update_quote_pricing_snapshots
  ON quote_pricing_snapshots;

CREATE TRIGGER no_update_quote_pricing_snapshots
  BEFORE UPDATE ON quote_pricing_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_modification();

DROP TRIGGER IF EXISTS no_delete_quote_pricing_snapshots
  ON quote_pricing_snapshots;

CREATE TRIGGER no_delete_quote_pricing_snapshots
  BEFORE DELETE ON quote_pricing_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_modification();
