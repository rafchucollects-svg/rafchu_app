import { sql } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { POKEMON_CARDS_CATEGORY_ID, searchItems, type EbayItemSummary } from '../lib/ebay.js';
import { parseGrade } from '../lib/gradeParser.js';

interface CardRow {
  id: string;
  name: string;
  number: string;
  set_name: string;
}

// Pull popular cards first (sharpening later). Phase 0 definition of "popular":
// cards that have a tcgplayer market price in the top N by market value.
// This is a crude stand-in for "what users search" and gives us broad coverage
// of the cards that actually have a graded market.
async function selectTopCards(limit: number): Promise<CardRow[]> {
  const rows = await sql<CardRow[]>`
    SELECT c.id, c.name, c.number, s.name AS set_name
    FROM cards c
    JOIN sets s ON s.id = c.set_id
    LEFT JOIN card_prices_latest p
      ON p.card_id = c.id AND p.source = 'tcgplayer' AND p.condition = 'raw'
    WHERE p.market IS NOT NULL
    ORDER BY p.market DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows;
}

function buildQuery(card: CardRow): string {
  // e.g. "Charizard 4/102 Base Set"
  const parts = [card.name, card.number, card.set_name].filter(Boolean);
  return parts.join(' ');
}

interface GradedAggregate {
  condition: string;
  sale_count: number;
  median: number;
  p25: number;
  p75: number;
  sample: Array<{ title: string; price: number; url?: string; endedAt?: string }>;
}

function aggregateByGrade(items: EbayItemSummary[]): GradedAggregate[] {
  const buckets = new Map<string, Array<{ price: number; item: EbayItemSummary }>>();

  for (const item of items) {
    if (!item.price) continue;
    const price = Number(item.price.value);
    if (!Number.isFinite(price) || price <= 0) continue;

    const parsed = parseGrade(item.title);
    if (!parsed) continue; // Phase 0: only aggregate clearly-graded listings

    const key = parsed.label;
    const arr = buckets.get(key) ?? [];
    arr.push({ price, item });
    buckets.set(key, arr);
  }

  const out: GradedAggregate[] = [];
  for (const [condition, entries] of buckets) {
    if (entries.length < 3) continue; // need >=3 data points to trust a median
    const sorted = entries.map((e) => e.price).sort((a, b) => a - b);
    out.push({
      condition,
      sale_count: entries.length,
      median: quantile(sorted, 0.5),
      p25: quantile(sorted, 0.25),
      p75: quantile(sorted, 0.75),
      sample: entries.slice(0, 10).map((e) => ({
        title: e.item.title,
        price: e.price,
        url: e.item.itemWebUrl,
        endedAt: e.item.itemEndDate,
      })),
    });
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lo = sorted[base] ?? 0;
  const hi = sorted[base + 1] ?? lo;
  return Math.round((lo + rest * (hi - lo)) * 100) / 100;
}

export async function ingestEbaySold(): Promise<{ cardsScanned: number; rowsWritten: number }> {
  if (!config.EBAY_CLIENT_ID || !config.EBAY_CLIENT_SECRET) {
    throw new Error('eBay credentials missing. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.');
  }

  const [run] = await sql<[{ id: number }]>`
    INSERT INTO ingest_runs (source, status) VALUES ('ebay_sold', 'running') RETURNING id
  `;
  if (!run) throw new Error('failed to create ingest_runs row');
  const runId = run.id;
  const today = new Date().toISOString().slice(0, 10);

  let cardsScanned = 0;
  let rowsWritten = 0;

  try {
    const cards = await selectTopCards(config.EBAY_TOP_N_CARDS);
    logger.info({ count: cards.length }, 'Scanning eBay for top cards');

    for (const card of cards) {
      cardsScanned++;
      try {
        const items = await searchItems({
          query: buildQuery(card),
          limit: 100,
          categoryId: POKEMON_CARDS_CATEGORY_ID,
        });
        const aggs = aggregateByGrade(items);
        if (!aggs.length) continue;

        const rows = aggs.map((a) => ({
          card_id: card.id,
          source: 'ebay_sold',
          variant: '',
          condition: a.condition,
          snapshot_date: today,
          median: a.median,
          p25: a.p25,
          p75: a.p75,
          sale_count: a.sale_count,
          sample: JSON.stringify(a.sample),
          currency: 'USD',
        }));

        await sql`
          INSERT INTO card_prices ${sql(
            rows,
            'card_id',
            'source',
            'variant',
            'condition',
            'snapshot_date',
            'median',
            'p25',
            'p75',
            'sale_count',
            'sample',
            'currency',
          )}
          ON CONFLICT (card_id, source, variant, condition, snapshot_date) DO UPDATE SET
            median     = EXCLUDED.median,
            p25        = EXCLUDED.p25,
            p75        = EXCLUDED.p75,
            sale_count = EXCLUDED.sale_count,
            sample     = EXCLUDED.sample,
            updated_at = NOW()
        `;
        rowsWritten += rows.length;
      } catch (err) {
        logger.warn({ err, card: card.id }, 'skipping card, eBay fetch failed');
      }

      // Be polite: eBay Browse allows bursty traffic but we don't need to be aggressive.
      if (cardsScanned % 50 === 0) {
        logger.info({ cardsScanned, rowsWritten }, 'progress');
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY card_prices_latest`;
    await sql`
      UPDATE ingest_runs
      SET status = 'ok', finished_at = NOW(), rows_written = ${rowsWritten}
      WHERE id = ${runId}
    `;
    logger.info({ cardsScanned, rowsWritten }, 'eBay sold ingest complete');
    return { cardsScanned, rowsWritten };
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
