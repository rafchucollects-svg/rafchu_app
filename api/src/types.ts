// Public API response shapes. Stable contract: once Phase 1 goes public,
// changes here are semver-meaningful.

export interface ApiSet {
  id: string;
  name: string;
  series: string | null;
  printedTotal: number | null;
  total: number | null;
  ptcgoCode: string | null;
  releaseDate: string | null;
  symbolUrl: string | null;
  logoUrl: string | null;
}

export interface ApiCardSummary {
  id: string;
  name: string;
  set: { id: string; name: string };
  number: string;
  rarity: string | null;
  images: { small: string | null; large: string | null };
  tcgplayerId: number | null;
}

export interface TcgPlayerPrice {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  directLow: number | null;
  updatedAt: string;
  source: string;
}

export interface CardmarketPrice {
  average: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  trend: number | null;
  lowest: number | null;
  lowestExPlus: number | null;
  suggested: number | null;
  updatedAt: string;
  source: string;
}

export interface GradedPrice {
  condition: string; // e.g. "PSA10"
  saleCount: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  sample: Array<{ title: string; price: number; url?: string; endedAt?: string }>;
  updatedAt: string;
  source: string;
}

export interface ApiCard extends ApiCardSummary {
  supertype: string | null;
  subtypes: string[] | null;
  types: string[] | null;
  hp: string | null;
  artist: string | null;
  nationalPokedexNumbers: number[] | null;
  tcgplayerUrl: string | null;
  cardmarketUrl: string | null;
  prices: {
    tcgplayer: Record<string, TcgPlayerPrice>; // keyed by variant (normal, holofoil, ...)
    cardmarket: Record<string, CardmarketPrice>; // keyed by variant ('' for default, 'reverseHolofoil', ...)
    graded: GradedPrice[];
  };
}

export interface ApiError {
  error: { code: string; message: string };
}
