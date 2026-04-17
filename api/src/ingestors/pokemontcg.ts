import { sql } from '../db/client.js';
import { logger } from '../lib/logger.js';
import {
  fetchAllSets,
  fetchAllCards,
  type PTCGCard,
  type PTCGSet,
  type PTCGTcgPlayerPrice,
  type PTCGCardmarketPrice,
} from '../lib/pokemontcg.js';

// ---------------------------------------------------------------------------
// Shape normalizers: map pokemontcg.io -> our DB rows.
// ---------------------------------------------------------------------------

function toSetRow(s: PTCGSet) {
  return {
    id: s.id,
    name: s.name,
    series: s.series ?? null,
    printed_total: s.printedTotal ?? null,
    total: s.total ?? null,
    ptcgo_code: s.ptcgoCode ?? null,
    release_date: s.releaseDate ? normalizeDate(s.releaseDate) : null,
    symbol_url: s.images?.symbol ?? null,
    logo_url: s.images?.logo ?? null,
  };
}

// pokemontcg.io returns "2023/09/22" style dates. Coerce to ISO.
function normalizeDate(d: string): string | null {
  const iso = d.replaceAll('/', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function toCardRow(c: PTCGCard) {
  const tcgplayerId = extractTcgplayerId(c.tcgplayer?.url);
  return {
    id: c.id,
    name: c.name,
    set_id: c.set.id,
    number: c.number,
    rarity: c.rarity ?? null,
    supertype: c.supertype ?? null,
    subtypes: c.subtypes ?? null,
    types: c.types ?? null,
    hp: c.hp ?? null,
    artist: c.artist ?? null,
    national_pokedex_numbers: c.nationalPokedexNumbers ?? null,
    image_small: c.images?.small ?? null,
    image_large: c.images?.large ?? null,
    tcgplayer_id: tcgplayerId,
    tcgplayer_url: c.tcgplayer?.url ?? null,
    cardmarket_url: c.cardmarket?.url ?? null,
  };
}

// pokemontcg.io's tcgplayer.url looks like:
//   https://prices.pokemontcg.io/tcgplayer/base1-4  (not useful)
// or sometimes:
//   https://www.tcgplayer.com/product/12345/...    (useful)
// We try the second form first.
function extractTcgplayerId(url?: string): number | null {
  if (!url) return null;
  const m = url.match(/tcgplayer\.com\/product\/(\d+)/);
  return m && m[1] ? Number(m[1]) : null;
}

// Build price rows for a single card. Emits one row per variant per source.
interface PriceRow {
  card_id: string;
  source: 'tcgplayer' | 'cardmarket';
  variant: string;
  condition: string;
  snapshot_date: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  direct_low: number | null;
  average: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  trend: number | null;
  lowest: number | null;
  lowest_ex_plus: number | null;
  suggested: number | null;
  currency: string;
}

function toPriceRows(c: PTCGCard, today: string): PriceRow[] {
  const rows: PriceRow[] = [];

  // TCGPlayer: nested by variant, e.g. prices.normal.{low,mid,high,market,directLow}
  const tp = c.tcgplayer?.prices ?? {};
  for (const [variant, p] of Object.entries(tp) as Array<[string, PTCGTcgPlayerPrice]>) {
    if (p == null) continue;
    rows.push({
      card_id: c.id,
      source: 'tcgplayer',
      variant,
      condition: 'raw',
      snapshot_date: today,
      low: p.low ?? null,
      mid: p.mid ?? null,
      high: p.high ?? null,
      market: p.market ?? null,
      direct_low: p.directLow ?? null,
      average: null,
      avg1: null,
      avg7: null,
      avg30: null,
      trend: null,
      lowest: null,
      lowest_ex_plus: null,
      suggested: null,
      currency: 'USD',
    });
  }

  // Cardmarket: flat structure, one "record" per card.
  const cm = c.cardmarket?.prices;
  if (cm) {
    rows.push(cardmarketRow(c.id, today, '', cm, {
      averageKey: 'averageSellPrice',
      lowestKey: 'lowPrice',
      trendKey: 'trendPrice',
    }));

    // If reverse-holo subfields exist, emit a second row for that variant.
    if (
      cm.reverseHoloSell != null ||
      cm.reverseHoloLow != null ||
      cm.reverseHoloTrend != null ||
      cm.reverseHoloAvg30 != null
    ) {
      rows.push(cardmarketRow(c.id, today, 'reverseHolofoil', cm, {
        averageKey: 'reverseHoloSell',
        lowestKey: 'reverseHoloLow',
        trendKey: 'reverseHoloTrend',
        avg1Key: 'reverseHoloAvg1',
        avg7Key: 'reverseHoloAvg7',
        avg30Key: 'reverseHoloAvg30',
      }));
    }
  }

  return rows;
}

function cardmarketRow(
  cardId: string,
  today: string,
  variant: string,
  cm: PTCGCardmarketPrice,
  keys: {
    averageKey: keyof PTCGCardmarketPrice;
    lowestKey: keyof PTCGCardmarketPrice;
    trendKey: keyof PTCGCardmarketPrice;
    avg1Key?: keyof PTCGCardmarketPrice;
    avg7Key?: keyof PTCGCardmarketPrice;
    avg30Key?: keyof PTCGCardmarketPrice;
  },
): PriceRow {
  const num = (k?: keyof PTCGCardmarketPrice) => (k ? (cm[k] ?? null) : null);
  return {
    card_id: cardId,
    source: 'cardmarket',
    variant,
    condition: 'raw',
    snapshot_date: today,
    low: null,
    mid: null,
    high: null,
    market: null,
    direct_low: null,
    average: num(keys.averageKey),
    avg1: num(keys.avg1Key ?? 'avg1'),
    avg7: num(keys.avg7Key ?? 'avg7'),
    avg30: num(keys.avg30Key ?? 'avg30'),
    trend: num(keys.trendKey),
    lowest: num(keys.lowestKey),
    lowest_ex_plus: cm.lowPriceExPlus ?? null,
    suggested: cm.suggestedPrice ?? null,
    currency: 'EUR',
  };
}

// ---------------------------------------------------------------------------
// Public entrypoint: run a full pokemontcg.io sync.
// ---------------------------------------------------------------------------
export async function ingestPokemonTcg(): Promise<{ sets: number; cards: number; prices: number }> {
  const [run] = await sql<[{ id: number }]>`
    INSERT INTO ingest_runs (source, status) VALUES ('pokemontcg', 'running') RETURNING id
  `;
  if (!run) throw new Error('failed to create ingest_runs row');
  const runId = run.id;
  const today = new Date().toISOString().slice(0, 10);

  let setCount = 0;
  let cardCount = 0;
  let priceCount = 0;

  try {
    logger.info('Starting pokemontcg.io set sync');
    const setBatch: ReturnType<typeof toSetRow>[] = [];
    for await (const s of fetchAllSets()) {
      setBatch.push(toSetRow(s));
      if (setBatch.length >= 100) {
        await upsertSets(setBatch);
        setCount += setBatch.length;
        setBatch.length = 0;
      }
    }
    if (setBatch.length) {
      await upsertSets(setBatch);
      setCount += setBatch.length;
    }
    logger.info({ setCount }, 'Sets synced');

    logger.info('Starting pokemontcg.io card sync');
    const cardBatch: ReturnType<typeof toCardRow>[] = [];
    const priceBatch: PriceRow[] = [];
    for await (const c of fetchAllCards()) {
      cardBatch.push(toCardRow(c));
      priceBatch.push(...toPriceRows(c, today));

      if (cardBatch.length >= 500) {
        await upsertCards(cardBatch);
        cardCount += cardBatch.length;
        cardBatch.length = 0;
      }
      if (priceBatch.length >= 1000) {
        await upsertPrices(priceBatch);
        priceCount += priceBatch.length;
        priceBatch.length = 0;
      }
      if (cardCount % 2500 === 0 && cardCount > 0) {
        logger.info({ cardCount, priceCount }, 'Progress');
      }
    }
    if (cardBatch.length) {
      await upsertCards(cardBatch);
      cardCount += cardBatch.length;
    }
    if (priceBatch.length) {
      await upsertPrices(priceBatch);
      priceCount += priceBatch.length;
    }

    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY card_prices_latest`;

    await sql`
      UPDATE ingest_runs
      SET status = 'ok', finished_at = NOW(), rows_written = ${cardCount + priceCount}
      WHERE id = ${runId}
    `;

    logger.info({ setCount, cardCount, priceCount }, 'pokemontcg.io sync complete');
    return { sets: setCount, cards: cardCount, prices: priceCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE ingest_runs
      SET status = 'error', finished_at = NOW(), error = ${message}
      WHERE id = ${runId}
    `;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Batched upserts.
// ---------------------------------------------------------------------------

async function upsertSets(rows: ReturnType<typeof toSetRow>[]) {
  if (!rows.length) return;
  await sql`
    INSERT INTO sets ${sql(rows, 'id', 'name', 'series', 'printed_total', 'total', 'ptcgo_code', 'release_date', 'symbol_url', 'logo_url')}
    ON CONFLICT (id) DO UPDATE SET
      name          = EXCLUDED.name,
      series        = EXCLUDED.series,
      printed_total = EXCLUDED.printed_total,
      total         = EXCLUDED.total,
      ptcgo_code    = EXCLUDED.ptcgo_code,
      release_date  = EXCLUDED.release_date,
      symbol_url    = EXCLUDED.symbol_url,
      logo_url      = EXCLUDED.logo_url,
      updated_at    = NOW()
  `;
}

async function upsertCards(rows: ReturnType<typeof toCardRow>[]) {
  if (!rows.length) return;
  await sql`
    INSERT INTO cards ${sql(
      rows,
      'id',
      'name',
      'set_id',
      'number',
      'rarity',
      'supertype',
      'subtypes',
      'types',
      'hp',
      'artist',
      'national_pokedex_numbers',
      'image_small',
      'image_large',
      'tcgplayer_id',
      'tcgplayer_url',
      'cardmarket_url',
    )}
    ON CONFLICT (id) DO UPDATE SET
      name                     = EXCLUDED.name,
      set_id                   = EXCLUDED.set_id,
      number                   = EXCLUDED.number,
      rarity                   = EXCLUDED.rarity,
      supertype                = EXCLUDED.supertype,
      subtypes                 = EXCLUDED.subtypes,
      types                    = EXCLUDED.types,
      hp                       = EXCLUDED.hp,
      artist                   = EXCLUDED.artist,
      national_pokedex_numbers = EXCLUDED.national_pokedex_numbers,
      image_small              = EXCLUDED.image_small,
      image_large              = EXCLUDED.image_large,
      tcgplayer_id             = EXCLUDED.tcgplayer_id,
      tcgplayer_url            = EXCLUDED.tcgplayer_url,
      cardmarket_url           = EXCLUDED.cardmarket_url,
      updated_at               = NOW()
  `;
}

async function upsertPrices(rows: PriceRow[]) {
  if (!rows.length) return;
  await sql`
    INSERT INTO card_prices ${sql(
      rows,
      'card_id',
      'source',
      'variant',
      'condition',
      'snapshot_date',
      'low',
      'mid',
      'high',
      'market',
      'direct_low',
      'average',
      'avg1',
      'avg7',
      'avg30',
      'trend',
      'lowest',
      'lowest_ex_plus',
      'suggested',
      'currency',
    )}
    ON CONFLICT (card_id, source, variant, condition, snapshot_date) DO UPDATE SET
      low            = EXCLUDED.low,
      mid            = EXCLUDED.mid,
      high           = EXCLUDED.high,
      market         = EXCLUDED.market,
      direct_low     = EXCLUDED.direct_low,
      average        = EXCLUDED.average,
      avg1           = EXCLUDED.avg1,
      avg7           = EXCLUDED.avg7,
      avg30          = EXCLUDED.avg30,
      trend          = EXCLUDED.trend,
      lowest         = EXCLUDED.lowest,
      lowest_ex_plus = EXCLUDED.lowest_ex_plus,
      suggested      = EXCLUDED.suggested,
      currency       = EXCLUDED.currency,
      updated_at     = NOW()
  `;
}
