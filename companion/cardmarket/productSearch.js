import { cardmarketSearchUrl, rankCardmarketProducts } from '../../src/utils/cardmarketProducts.js';
import { safeProductSearchUrl } from './products.js';

// Search strategy is separate from Chrome navigation so retries and identity
// checks can be tested together. Verification failures propagate to the caller.
export async function findCardmarketProducts(task, readPage) {
  let nextUrl = cardmarketSearchUrl(task);
  let fallbackUrl;
  const candidates = [];
  const seen = new Set();
  for (let pass = 0; pass < 2; pass++) {
    for (let page = 0; nextUrl && page < 8; page++) {
      if (!safeProductSearchUrl(nextUrl) || seen.has(nextUrl)) throw new Error('Search pagination could not be completed. Retry suggestions.');
      seen.add(nextUrl);
      const result = await readPage(nextUrl);
      candidates.push(...result.candidates);
      fallbackUrl = result.fallbackUrl || fallbackUrl;
      nextUrl = result.nextUrl;
    }
    if (nextUrl) throw new Error('Too many search pages. Use a more precise card name or expansion.');
    const matches = rankCardmarketProducts(task, candidates);
    if (matches.length || !fallbackUrl || seen.has(fallbackUrl)) return matches;
    nextUrl = fallbackUrl;
  }
  return rankCardmarketProducts(task, candidates);
}
