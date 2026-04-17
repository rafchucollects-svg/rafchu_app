import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client.js';
import type { ApiSet } from '../types.js';

interface SetRow {
  id: string;
  name: string;
  series: string | null;
  printed_total: number | null;
  total: number | null;
  ptcgo_code: string | null;
  release_date: string | null;
  symbol_url: string | null;
  logo_url: string | null;
}

function toApi(r: SetRow): ApiSet {
  return {
    id: r.id,
    name: r.name,
    series: r.series,
    printedTotal: r.printed_total,
    total: r.total,
    ptcgoCode: r.ptcgo_code,
    releaseDate: r.release_date,
    symbolUrl: r.symbol_url,
    logoUrl: r.logo_url,
  };
}

export async function setRoutes(app: FastifyInstance) {
  app.get('/v1/sets', async () => {
    const rows = await sql<SetRow[]>`
      SELECT id, name, series, printed_total, total, ptcgo_code,
             release_date::text AS release_date, symbol_url, logo_url
      FROM sets
      ORDER BY release_date DESC NULLS LAST, name ASC
    `;
    return { data: rows.map(toApi) };
  });
}
