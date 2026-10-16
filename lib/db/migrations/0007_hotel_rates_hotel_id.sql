-- Migration 0007: link hotel rate cards to catalog hotels.
-- hotel_name remains populated for legacy/imported rows and fallback matching.
ALTER TABLE hotel_rates
  ADD COLUMN IF NOT EXISTS hotel_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_rates_hotel_id_fkey'
  ) THEN
    ALTER TABLE hotel_rates
      ADD CONSTRAINT hotel_rates_hotel_id_fkey
      FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hotel_rates_hotel_id_idx ON hotel_rates(hotel_id);
