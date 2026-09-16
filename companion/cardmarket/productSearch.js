import { cardmarketSearchUrl, rankCardmarketProducts } from '../../src/utils/cardmarketProducts.js';
import { safeProductSearchUrl } from './products.js';

// Search strategy is separate from Chrome navigation so retries and identity
// checks can be tested together. Verification failures propagate to the caller.
export const productSearchState = task => ({ nextUrl: cardmarketSearchUrl(task), candidates: [], seen: [], pass: 0, page: 0, fallbackUrls: [] });
export async function findCardmarketProducts(task, readPage, state = productSearchState(task), checkpoint = async () => {}) {
  for (; state.pass < 3; state.pass++) {
    for (; state.nextUrl && state.page < 8;) {
      if (!safeProductSearchUrl(state.nextUrl) || state.seen.includes(state.nextUrl)) throw Object.assign(new Error('Search pagination could not be completed for this card. Review its product link.'), { code: 'search-incomplete' });
      const result = await readPage(state.nextUrl);
      // Record a page only after reading succeeds, so verification can resume
      // this exact page without being mistaken for a pagination loop.
      state.seen.push(state.nextUrl);
      state.candidates.push(...result.candidates);
      state.fallbackUrls = [...new Set([...state.fallbackUrls, ...(result.fallbackUrls || (result.fallbackUrl ? [result.fallbackUrl] : []))])];
      state.nextUrl = result.nextUrl;
      state.page++;
      await checkpoint();
    }
    if (state.nextUrl) throw Object.assign(new Error('Too many search pages for this card. Review its product link.'), { code: 'search-incomplete' });
    const matches = rankCardmarketProducts(task, state.candidates);
    const fallbackUrl = state.fallbackUrls.find(url => !state.seen.includes(url));
    if (matches.length || !fallbackUrl) return matches;
    state.nextUrl = fallbackUrl;
    state.page = 0;
  }
  return rankCardmarketProducts(task, state.candidates);
}
