-- ============================================================================
-- Rafchu API - Phase 0 schema
-- Minimal shape: sets, cards, card_prices (time-series).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- sets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sets (
  id              TEXT PRIMARY KEY,              -- pokemontcg.io set id, e.g. "base1"
  name            TEXT NOT NULL,
  series          TEXT,
  printed_total   INTEGER,
  total           INTEGER,
  ptcgo_code      TEXT,
  release_date    DATE,
  symbol_url      TEXT,
  logo_url        TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- cards
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards (
  id                      TEXT PRIMARY KEY,      -- pokemontcg.io card id, e.g. "base1-4"
  name                    TEXT NOT NULL,
  set_id                  TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  number                  TEXT NOT NULL,
  rarity                  TEXT,
  supertype               TEXT,
  subtypes                TEXT[],
  types                   TEXT[],
  hp                      TEXT,
  artist                  TEXT,
  national_pokedex_numbers INTEGER[],
  image_small             TEXT,
  image_large             TEXT,
  tcgplayer_id            BIGINT,
  tcgplayer_url           TEXT,
  cardmarket_url          TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_name_trgm     ON cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_set_number    ON cards (set_id, number);
CREATE INDEX IF NOT EXISTS idx_cards_tcgplayer_id  ON cards (tcgplayer_id) WHERE tcgplayer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_rarity        ON cards (rarity);

-- ----------------------------------------------------------------------------
-- card_prices (time-series, one row per card x source x variant x condition x day)
--
-- `source`: 'tcgplayer' | 'cardmarket' | 'ebay_sold'
-- `variant` (TCGPlayer printings): 'normal' | 'holofoil' | 'reverseHolofoil' |
--                                   '1stEditionHolofoil' | '1stEditionNormal' | ''
-- `condition`: 'raw' (tcgplayer/cardmarket market default) | 'NM' | 'LP' | 'MP' |
--              'HP' | 'DMG' | 'PSA10' | 'PSA9' | 'PSA8' | 'BGS10' | 'BGS95' |
--              'BGS9' | 'CGC10' | 'CGC95'
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_prices (
  card_id        TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  source         TEXT NOT NULL,
  variant        TEXT NOT NULL DEFAULT '',
  condition      TEXT NOT NULL DEFAULT 'raw',
  snapshot_date  DATE NOT NULL,

  -- TCGPlayer-shaped fields
  low            NUMERIC(10,2),
  mid            NUMERIC(10,2),
  high           NUMERIC(10,2),
  market         NUMERIC(10,2),
  direct_low     NUMERIC(10,2),

  -- Cardmarket-shaped fields
  average        NUMERIC(10,2),
  avg1           NUMERIC(10,2),
  avg7           NUMERIC(10,2),
  avg30          NUMERIC(10,2),
  trend          NUMERIC(10,2),
  lowest         NUMERIC(10,2),
  lowest_ex_plus NUMERIC(10,2),
  suggested      NUMERIC(10,2),

  -- eBay-shaped aggregate fields
  sale_count     INTEGER,
  median         NUMERIC(10,2),
  p25            NUMERIC(10,2),
  p75            NUMERIC(10,2),
  sample         JSONB,                          -- up to ~10 recent sold listings

  currency       TEXT NOT NULL DEFAULT 'USD',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (card_id, source, variant, condition, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_prices_card_date
  ON card_prices (card_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_prices_source_date
  ON card_prices (source, snapshot_date DESC);

-- ----------------------------------------------------------------------------
-- "latest price" read path
-- Refreshed at the end of every ingest run. Small enough to do CONCURRENTLY.
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS card_prices_latest AS
SELECT DISTINCT ON (card_id, source, variant, condition)
  card_id, source, variant, condition, snapshot_date,
  low, mid, high, market, direct_low,
  average, avg1, avg7, avg30, trend, lowest, lowest_ex_plus, suggested,
  sale_count, median, p25, p75, sample,
  currency, updated_at
FROM card_prices
ORDER BY card_id, source, variant, condition, snapshot_date DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prices_latest_pk
  ON card_prices_latest (card_id, source, variant, condition);

-- ----------------------------------------------------------------------------
-- ingest_runs (audit trail)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_runs (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL,         -- 'pokemontcg' | 'ebay_sold'
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'ok' | 'error'
  rows_written INTEGER,
  error        TEXT
);
