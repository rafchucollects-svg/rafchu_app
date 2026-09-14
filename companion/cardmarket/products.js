import { cardmarketSearchUrl, sameCardmarketSet } from '../../src/utils/cardmarketProducts.js';
import { safeCardmarketImage, safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
const text = el => (el?.innerText ?? el?.textContent ?? '').trim();
export function safeProductSearchUrl(value) {
  try { const url = new URL(value); return url.origin === 'https://www.cardmarket.com' && !url.username && !url.password && (url.pathname === '/en/Pokemon/Products/Search' || /^\/en\/Pokemon\/Products\/Singles\/[^/]+\/?$/.test(url.pathname)) ? url.href : null; } catch { return null; }
}
function identity(title) {
  const match = title.match(/^(.+?)\s*\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[2].trim().split(/\s+/);
  return { name: match[1].trim(), number: parts.pop(), code: parts.join(' ') };
}
export function readCardmarketProducts(root, href, task) {
  const productUrl = safeCardmarketProduct(href);
  if (productUrl && root.querySelector('#FilterForm')) {
    const title = text(root.querySelector('h1'));
    const card = identity(title);
    const set = title.replace(/^.*?\([^)]+\)\s*/, '').replace(/\s*-\s*Singles\s*$/, '').trim();
    if (!card || !set) throw new Error('Could not read the product identity.');
    return { candidates: [{ ...card, set, productUrl, source: 'browser-search', productImageUrl: safeCardmarketImage(root.querySelector('#mainContent .slideshow .slide:nth-child(2) img')?.getAttribute('src')) }], nextUrl: null };
  }
  const url = safeProductSearchUrl(href);
  const form = root.querySelector('#SearchResultForm');
  if (!url || !form) throw new Error('Complete Cardmarket search verification in the reader tab, then retry.');
  const options = [...form.querySelectorAll('select[name="idExpansion"] option')].filter(el => el.value !== '0' && sameCardmarketSet(text(el), task.set));
  if (options.length !== 1) throw Object.assign(new Error('No unique expansion match in Cardmarket search. Check the expansion or replace the suggested URL.'), { code: 'expansion-mismatch' });
  const category = [...form.querySelectorAll('select[name="idCategory"] option')].find(el => text(el) === 'Singles');
  if (!category) throw new Error('Cardmarket’s Singles search filter is unavailable.');
  const current = new URL(url);
  const expansionResults = /^\/en\/Pokemon\/Products\/Singles\/[^/]+\/?$/.test(current.pathname) &&
    sameCardmarketSet(text(root.querySelector('h1')).replace(/\s*Singles\s*$/, ''), task.set) &&
    form.querySelector('select[name="idExpansion"]').value === options[0].value && form.querySelector('select[name="idCategory"]').value === category.value;
  if (!expansionResults && (current.searchParams.get('idExpansion') !== options[0].value || current.searchParams.get('idCategory') !== category.value || current.searchParams.get('searchMode') !== 'v2')) {
    const next = new URL(cardmarketSearchUrl(task));
    // Keep a number-only retry when refining it to the actual expansion option.
    next.searchParams.set('searchString', current.searchParams.get('searchString') ?? next.searchParams.get('searchString'));
    next.searchParams.set('searchMode', 'v2');
    next.searchParams.set('idCategory', category.value);
    next.searchParams.set('idExpansion', options[0].value);
    return { candidates: [], nextUrl: next.href };
  }
  // The normal Grid View link makes the result layout explicit without changing account settings.
  const grid = [...root.querySelectorAll('main a[href]')].find(el => /Grid View/i.test(text(el)));
  if (grid) {
    const nextUrl = safeProductSearchUrl(new URL(grid.getAttribute('href'), href).href);
    if (nextUrl && nextUrl !== href) return { candidates: [], nextUrl };
  }
  const candidates = [...root.querySelectorAll('main a.galleryBox')].flatMap(el => {
    const productUrl = safeCardmarketProduct(new URL(el.getAttribute('href'), href).href);
    const card = identity(text(el.querySelector('h2')));
    const set = el.querySelector('.expansion-symbol[aria-label]')?.getAttribute('aria-label');
    return productUrl && card && set ? [{ ...card, set, productUrl, source: 'browser-search', productImageUrl: safeCardmarketImage(el.querySelector('img')?.getAttribute('src')) }] : [];
  });
  const next = root.querySelector('a[aria-label="Next page"][href]');
  // If the name query misses, retry once by number within this verified expansion.
  // The caller still checks the complete name, expansion and collector number.
  const fallback = new URL(cardmarketSearchUrl(task));
  fallback.searchParams.set('searchString', String(task.number || '').split('/')[0].replace(/^[a-z]+(?=\d)/i, ''));
  fallback.searchParams.set('searchMode', 'v2');
  fallback.searchParams.set('idCategory', category.value);
  fallback.searchParams.set('idExpansion', options[0].value);
  return { candidates, nextUrl: next ? safeProductSearchUrl(new URL(next.getAttribute('href'), href).href) : null, fallbackUrl: fallback.href };
}
