-- Migration 0005: pricing_seasons table
-- Named date-range windows with priority-based matching so rate resolution
-- can prefer season-specific rate cards over year-round defaults.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS pricing_seasons (
  id            varchar        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text           NOT NULL,
  destination_id varchar,                          -- null = applies to all destinations
  start_date    text           NOT NULL,           -- YYYY-MM-DD inclusive
  end_date      text           NOT NULL,           -- YYYY-MM-DD inclusive
  priority      integer        NOT NULL DEFAULT 0, -- higher number wins on overlap
  is_active     boolean        NOT NULL DEFAULT true,
  created_at    timestamp      DEFAULT now(),
  updated_at    timestamp      DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_seasons_date_range_idx ON pricing_seasons (start_date, end_date);
CREATE INDEX IF NOT EXISTS pricing_seasons_priority_idx   ON pricing_seasons (priority);
