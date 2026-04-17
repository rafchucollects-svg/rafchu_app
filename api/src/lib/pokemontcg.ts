import { config } from '../config.js';
import { logger } from './logger.js';

const BASE = 'https://api.pokemontcg.io/v2';

export interface PTCGSet {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  ptcgoCode?: string;
  releaseDate?: string;
  images?: { symbol?: string; logo?: string };
}

export interface PTCGTcgPlayerPrice {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  directLow?: number;
}

export interface PTCGCardmarketPrice {
  averageSellPrice?: number;
  lowPrice?: number;
  trendPrice?: number;
  germanProLow?: number;
  suggestedPrice?: number;
  reverseHoloSell?: number;
  reverseHoloLow?: number;
  reverseHoloTrend?: number;
  lowPriceExPlus?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  reverseHoloAvg1?: number;
  reverseHoloAvg7?: number;
  reverseHoloAvg30?: number;
}

export interface PTCGCard {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  artist?: string;
  rarity?: string;
  number: string;
  nationalPokedexNumbers?: number[];
  images?: { small?: string; large?: string };
  set: PTCGSet;
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, PTCGTcgPlayerPrice>;
  };
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: PTCGCardmarketPrice;
  };
}

interface PagedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
}

const DEFAULT_HEADERS: Record<string, string> = config.POKEMONTCG_API_KEY
  ? { 'X-Api-Key': config.POKEMONTCG_API_KEY }
  : {};

async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const res = await fetch(url, { headers: DEFAULT_HEADERS });

  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`pokemontcg ${res.status} after 5 retries: ${url}`);
    const backoff = Math.min(1000 * 2 ** attempt, 30_000);
    logger.warn({ url, status: res.status, attempt, backoff }, 'retrying pokemontcg');
    await new Promise((r) => setTimeout(r, backoff));
    return fetchJson<T>(url, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`pokemontcg ${res.status} ${res.statusText}: ${url}`);
  }

  return (await res.json()) as T;
}

export async function* fetchAllSets(): AsyncGenerator<PTCGSet> {
  const url = `${BASE}/sets?pageSize=250`;
  const body = await fetchJson<PagedResponse<PTCGSet>>(url);
  for (const s of body.data) yield s;

  const totalPages = Math.ceil(body.totalCount / body.pageSize);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchJson<PagedResponse<PTCGSet>>(`${BASE}/sets?pageSize=250&page=${page}`);
    for (const s of next.data) yield s;
  }
}

export async function* fetchAllCards(pageSize = config.PTCG_PAGE_SIZE): AsyncGenerator<PTCGCard> {
  let page = 1;
  while (true) {
    const url = `${BASE}/cards?pageSize=${pageSize}&page=${page}`;
    const body = await fetchJson<PagedResponse<PTCGCard>>(url);
    if (body.data.length === 0) return;

    for (const c of body.data) yield c;

    if (page * pageSize >= body.totalCount) return;
    page++;
  }
}
