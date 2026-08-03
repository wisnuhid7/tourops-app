-- Migration 0001: pricing_adjustment_rules table and adjustment_items column
-- All statements are idempotent (safe to replay on an already-migrated database).
-- This migration is self-contained: every type it references is guarded here.

-- 1. Create enums (DO/EXCEPTION pattern because CREATE TYPE has no IF NOT EXISTS guard)

-- Guard the shared margin_type enum (may already exist from the pricing-rules table).
DO $$ BEGIN
  CREATE TYPE margin_type AS ENUM ('fixed', 'percentage');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pricing_adjustment_type AS ENUM (
    'tax', 'service_fee', 'booking_fee', 'surcharge', 'discount'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pricing_adjustment_stage AS ENUM (
    'before_margin', 'after_margin', 'after_free_policy'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create the adjustment rules table
CREATE TABLE IF NOT EXISTS pricing_adjustment_rules (
  id          varchar     PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  type        pricing_adjustment_type NOT NULL,
  -- reuses the margin_type enum: 'fixed' = flat per-person, 'percentage' = % of running total
  amount_type margin_type NOT NULL DEFAULT 'percentage',
  amount      numeric     NOT NULL,
  application_order integer NOT NULL DEFAULT 0,
  applies_to_stage pricing_adjustment_stage NOT NULL DEFAULT 'after_free_policy',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamp   DEFAULT now(),
  updated_at  timestamp   DEFAULT now()
);

-- 3. Index for ordering queries
CREATE INDEX IF NOT EXISTS pricing_adjustment_rules_order_idx
  ON pricing_adjustment_rules (application_order);

-- 4. Add adjustment_items column to existing line-items table
ALTER TABLE pricing_quote_line_items
  ADD COLUMN IF NOT EXISTS adjustment_items jsonb;
