import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import type { ApiCard, ApiCardSummary, CardmarketPrice, GradedPrice, TcgPlayerPrice } from '../types.js';

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------
interface CardRow {
  id: string;
  name: string;
  set_id: string;
  set_name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  hp: string | null;
  artist: string | null;
  national_pokedex_numbers: number[] | null;
  image_small: string | null;
  image_large: string | null;
  tcgplayer_id: number | null;
  tcgplayer_url: string | null;
  cardmarket_url: string | null;
}

interface PriceRow {
  card_id: string;
  source: string;
  variant: string;
  condition: string;
  snapshot_date: string;
  low: string | null;
  mid: string | null;
  high: string | null;
  market: string | null;
  direct_low: string | null;
  average: string | null;
  avg1: string | null;
  avg7: string | null;
  avg30: string | null;
  trend: string | null;
  lowest: string | null;
  lowest_ex_plus: string | null;
  suggested: string | null;
  sale_count: number | null;
  median: string | null;
  p25: string | null;
  p75: string | null;
  sample: Array<{ title: string; price: number; url?: string; endedAt?: string }> | null;
  currency: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const num = (s: string | null): number | null => (s == null ? null : Number(s));

function toSummary(r: CardRow): ApiCardSummary {
  return {
    id: r.id,
    name: r.name,
    set: { id: r.set_id, name: r.set_name },
    number: r.number,
    rarity: r.rarity,
    images: { small: r.image_small, large: r.image_large },
    tcgplayerId: r.tcgplayer_id,
  };
}

function toCard(r: CardRow, prices: PriceRow[]): ApiCard {
  const tcgplayer: Record<string, TcgPlayerPrice> = {};
  const cardmarket: Record<string, CardmarketPrice> = {};
  const graded: GradedPrice[] = [];

  for (const p of prices) {
    if (p.source === 'tcgplayer') {
      tcgplayer[p.variant] = {
        low: num(p.low),
        mid: num(p.mid),
        high: num(p.high),
        market: num(p.market),
        directLow: num(p.direct_low),
        updatedAt: p.updated_at,
        source: 'pokemontcg.io (TCGPlayer license)',
      };
    } else if (p.source === 'cardmarket') {
      cardmarket[p.variant] = {
        average: num(p.average),
        avg1: num(p.avg1),
        avg7: num(p.avg7),
        avg30: num(p.avg30),
        trend: num(p.trend),
        lowest: num(p.lowest),
        lowestExPlus: num(p.lowest_ex_plus),
        suggested: num(p.suggested),
        updatedAt: p.updated_at,
        source: 'pokemontcg.io (Cardmarket license)',
      };
    } else if (p.source === 'ebay_sold') {
      graded.push({
        condition: p.condition,
        saleCount: p.sale_count,
        median: num(p.median),
        p25: num(p.p25),
        p75: num(p.p75),
        sample: p.sample ?? [],
        updatedAt: p.updated_at,
        source: 'eBay (Browse API)',
      });
    }
  }

  return {
    ...toSummary(r),
    supertype: r.supertype,
    subtypes: r.subtypes,
    types: r.types,
    hp: r.hp,
    artist: r.artist,
    nationalPokedexNumbers: r.national_pokedex_numbers,
    tcgplayerUrl: r.tcgplayer_url,
    cardmarketUrl: r.cardmarket_url,
    prices: { tcgplayer, cardmarket, graded },
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const searchQuerySchema = z.object({
  q: z.string().min(1).max(100).optional(),
  set: z.string().max(50).optional(),
  rarity: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const pricesQuerySchema = z.object({
  source: z.enum(['tcgplayer', 'cardmarket', 'ebay_sold']).optional(),
  variant: z.string().max(50).optional(),
  condition: z.string().max(20).optional(),
  window: z
    .string()
    .regex(/^\d+d$/)
    .optional(), // e.g. "30d"
});

export async function cardRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // GET /v1/cards/search
  // -------------------------------------------------------------------------
  app.get('/v1/cards/search', async (req, reply) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const { q, set, rarity, page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;

    const rows = await sql<CardRow[]>`
      SELECT
        c.id, c.name, c.set_id, s.name AS set_name, c.number, c.rarity,
        c.supertype, c.subtypes, c.types, c.hp, c.artist,
        c.national_pokedex_numbers, c.image_small, c.image_large,
        c.tcgplayer_id, c.tcgplayer_url, c.cardmarket_url
      FROM cards c
      JOIN sets s ON s.id = c.set_id
      WHERE 1 = 1
        ${q ? sql`AND c.name ILIKE ${'%' + q + '%'}` : sql``}
        ${set ? sql`AND c.set_id = ${set}` : sql``}
        ${rarity ? sql`AND c.rarity = ${rarity}` : sql``}
      ORDER BY
        ${q ? sql`similarity(c.name, ${q}) DESC,` : sql``}
        c.name ASC, c.set_id ASC, c.number ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    return {
      data: rows.map(toSummary),
      page,
      pageSize,
      hasMore: rows.length === pageSize,
    };
  });

  // -------------------------------------------------------------------------
  // GET /v1/cards/:id
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/cards/:id', async (req, reply) => {
    const { id } = req.params;
    const [cardRow] = await sql<CardRow[]>`
      SELECT
        c.id, c.name, c.set_id, s.name AS set_name, c.number, c.rarity,
        c.supertype, c.subtypes, c.types, c.hp, c.artist,
        c.national_pokedex_numbers, c.image_small, c.image_large,
        c.tcgplayer_id, c.tcgplayer_url, c.cardmarket_url
      FROM cards c
      JOIN sets s ON s.id = c.set_id
      WHERE c.id = ${id}
    `;
    if (!cardRow) {
      return reply.code(404).send({ error: { code: 'not_found', message: `card ${id} not found` } });
    }

    const priceRows = await sql<PriceRow[]>`
      SELECT
        card_id, source, variant, condition, snapshot_date::text AS snapshot_date,
        low::text, mid::text, high::text, market::text, direct_low::text,
        average::text, avg1::text, avg7::text, avg30::text, trend::text,
        lowest::text, lowest_ex_plus::text, suggested::text,
        sale_count, median::text, p25::text, p75::text, sample,
        currency, updated_at::text AS updated_at
      FROM card_prices_latest
      WHERE card_id = ${id}
    `;

    return toCard(cardRow, priceRows);
  });

  // -------------------------------------------------------------------------
  // GET /v1/cards/:id/prices
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/cards/:id/prices', async (req, reply) => {
    const { id } = req.params;
    const parsed = pricesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const { source, variant, condition, window } = parsed.data;
    const days = window ? Number(window.replace('d', '')) : null;

    const rows = await sql<PriceRow[]>`
      SELECT
        card_id, source, variant, condition, snapshot_date::text AS snapshot_date,
        low::text, mid::text, high::text, market::text, direct_low::text,
        average::text, avg1::text, avg7::text, avg30::text, trend::text,
        lowest::text, lowest_ex_plus::text, suggested::text,
        sale_count, median::text, p25::text, p75::text, sample,
        currency, updated_at::text AS updated_at
      FROM card_prices
      WHERE card_id = ${id}
        ${source ? sql`AND source = ${source}` : sql``}
        ${variant !== undefined ? sql`AND variant = ${variant}` : sql``}
        ${condition ? sql`AND condition = ${condition}` : sql``}
        ${days ? sql`AND snapshot_date >= (CURRENT_DATE - ${days}::int)` : sql``}
      ORDER BY snapshot_date DESC, source, variant, condition
      LIMIT 5000
    `;

    if (rows.length === 0) {
      // Distinguish "card doesn't exist" from "card has no prices"
      const [exists] = await sql<[{ ok: number }?]>`SELECT 1::int AS ok FROM cards WHERE id = ${id}`;
      if (!exists) {
        return reply.code(404).send({ error: { code: 'not_found', message: `card ${id} not found` } });
      }
    }

    return {
      cardId: id,
      data: rows.map((p) => ({
        source: p.source,
        variant: p.variant,
        condition: p.condition,
        snapshotDate: p.snapshot_date,
        low: num(p.low),
        mid: num(p.mid),
        high: num(p.high),
        market: num(p.market),
        directLow: num(p.direct_low),
        average: num(p.average),
        avg1: num(p.avg1),
        avg7: num(p.avg7),
        avg30: num(p.avg30),
        trend: num(p.trend),
        lowest: num(p.lowest),
        lowestExPlus: num(p.lowest_ex_plus),
        suggested: num(p.suggested),
        saleCount: p.sale_count,
        median: num(p.median),
        p25: num(p.p25),
        p75: num(p.p75),
        sample: p.sample,
        currency: p.currency,
      })),
    };
  });
}
