-- Migration 0004: change quote_pricing_snapshots FK from ON DELETE CASCADE to
-- ON DELETE RESTRICT so that deleting a pricing_quote row cannot silently
-- remove its immutable audit snapshots.
-- The update/delete triggers added in 0003 fire BEFORE the FK cascade,
-- so this change closes the bypass gap where CASCADE runs at FK level
-- (skipping row-level triggers on the child table).
-- Idempotent: drop and re-add.

ALTER TABLE quote_pricing_snapshots
  DROP CONSTRAINT IF EXISTS quote_pricing_snapshots_quote_id_fkey;

ALTER TABLE quote_pricing_snapshots
  ADD CONSTRAINT quote_pricing_snapshots_quote_id_fkey
  FOREIGN KEY (quote_id)
  REFERENCES pricing_quotes(id)
  ON DELETE RESTRICT;
