import { config } from '../config.js';
import { logger } from './logger.js';

// eBay Browse API client (client-credentials OAuth).
// Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
//
// Note: Browse API exposes *active* listings with a `filter=buyingOptions:{FIXED_PRICE}` + `filter=conditions:...`
// For true "sold" data, upgrade to Marketplace Insights API (gated rollout). For Phase 0 we approximate by
// filtering Browse for condition=USED/NEW on graded cards, which is a decent stand-in for raw price signal
// and keeps us inside a universally-available API. Swap to Marketplace Insights once access is granted.

const OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  if (!config.EBAY_CLIENT_ID || !config.EBAY_CLIENT_SECRET) {
    throw new Error('EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set');
  }

  const basic = Buffer.from(`${config.EBAY_CLIENT_ID}:${config.EBAY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'https://api.ebay.com/oauth/api_scope',
  });

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

export interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: { value: string; currency: string };
  condition?: string;
  itemWebUrl?: string;
  itemEndDate?: string;
  seller?: { username?: string; feedbackPercentage?: string };
}

interface SearchResponse {
  itemSummaries?: EbayItemSummary[];
  total?: number;
}

export interface SearchOptions {
  query: string;
  limit?: number; // max 200
  categoryId?: string; // Pokemon Individual Cards = 183454
}

export async function searchItems(opts: SearchOptions, attempt = 1): Promise<EbayItemSummary[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: opts.query,
    limit: String(opts.limit ?? 100),
  });
  if (opts.categoryId) params.set('category_ids', opts.categoryId);

  const res = await fetch(`${BROWSE_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': config.EBAY_MARKETPLACE,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`eBay ${res.status} after 5 retries`);
    const backoff = Math.min(1000 * 2 ** attempt, 30_000);
    logger.warn({ status: res.status, attempt, backoff, q: opts.query }, 'retrying eBay');
    await new Promise((r) => setTimeout(r, backoff));
    return searchItems(opts, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`eBay ${res.status} ${res.statusText}: ${await res.text()}`);
  }

  const body = (await res.json()) as SearchResponse;
  return body.itemSummaries ?? [];
}

// Pokemon Individual Cards category on eBay US
export const POKEMON_CARDS_CATEGORY_ID = '183454';
