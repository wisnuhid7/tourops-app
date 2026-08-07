-- Migration 0006: add FK from pricing_seasons.destination_id → countries.id
-- ON DELETE SET NULL: deleting a country clears the destination scope,
-- making the season global rather than orphaning it.
-- Idempotent: drop constraint if it already exists before re-adding.

ALTER TABLE pricing_seasons
  DROP CONSTRAINT IF EXISTS pricing_seasons_destination_id_fkey;

ALTER TABLE pricing_seasons
  ADD CONSTRAINT pricing_seasons_destination_id_fkey
  FOREIGN KEY (destination_id)
  REFERENCES countries(id)
  ON DELETE SET NULL;
