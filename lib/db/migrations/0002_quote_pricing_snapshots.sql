-- Migration 0002: quote_pricing_snapshots table + valid_until on pricing_quotes
-- All statements are idempotent (safe to replay on an already-migrated database).

-- 1. Add valid_until expiry column to pricing_quotes.
--    Set when a quote is approved (30 days forward); cleared on re-draft.
--    Expired quotes cannot be sent or accepted without a fresh recalculation.
ALTER TABLE pricing_quotes
  ADD COLUMN IF NOT EXISTS valid_until timestamp;

-- 2. Create the immutable pricing snapshot table.
--    One row per approval/recalculation cycle; rows are INSERT-only.
CREATE TABLE IF NOT EXISTS quote_pricing_snapshots (
  id                 varchar      PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id           varchar      NOT NULL
                       REFERENCES pricing_quotes(id) ON DELETE CASCADE,
  version            integer      NOT NULL DEFAULT 1,
  -- Full inputs: pax, nights, component costs, rule values, adjustment rules,
  -- and rate-resolver calculationMeta.
  calculation_input  jsonb        NOT NULL,
  -- Full outputs: assistanceType, baseCostPerPerson, totalGroupCost,
  -- freeAdjustmentFactor, and per-hotel/occupancy line items with every
  -- cost/margin/adjustment field preserved.
  calculation_output jsonb        NOT NULL,
  -- Pricing rule record (values copied at snapshot time) + adjustment rule IDs.
  rules_used         jsonb        NOT NULL,
  -- Why the snapshot was created: "approved", "re_approved", etc.
  reason             text         NOT NULL DEFAULT 'approved',
  created_by         varchar,
  created_at         timestamp    DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS quote_pricing_snapshots_quote_id_idx
  ON quote_pricing_snapshots (quote_id);

CREATE UNIQUE INDEX IF NOT EXISTS quote_pricing_snapshots_quote_version_idx
  ON quote_pricing_snapshots (quote_id, version);
