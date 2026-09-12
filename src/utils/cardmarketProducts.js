import { cardmarketTarget, safeCardmarketProduct } from './cardmarketSync.js';

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const cardmarketSearchName = value => String(value || '').replace(/\b(?:1st\s+edition|first\s+edition|unlimited|reverse\s+holo)\b/gi, '').replace(/δ|\bdelta species\b/gi, '').replace(/\s+/g, ' ').trim();
const nameKey = value => normalize(cardmarketSearchName(value));
const numberKey = value => normalize(String(value || '').split('/')[0]).replace(/^([a-z]*)0+(?=\d)/, '$1');
const setKey = value => {
  const key = normalize(value);
  const aliased = ({ 'japanese expedition': 'base expansion pack', expedition: 'expedition base set' })[key] || key;
  return aliased.replace(/^(?:ex|sword shield|sun moon|scarlet violet|xy) (?=\S)/, '');
};
export const sameCardmarketSet = (left, right) => Boolean(setKey(left)) && setKey(left) === setKey(right);
const base = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/';
// Real catalogue URLs checked on Cardmarket, used as a small offline seed.
// Every suggestion still needs the user's product/variant confirmation.
export const CARDMARKET_KNOWN_PRODUCTS = [
  ['Jolteon', 'EX Unseen Forces', '8', 'EX-Unseen-Forces/Jolteon-UF8'],
  ['Jolteon δ Delta Species', 'EX Delta Species', '7', 'EX-Delta-Species/Jolteon-Delta-Species-DS7'],
  ['Dark Vaporeon', 'Legendary Collection', '9', 'Legendary-Collection/Dark-Vaporeon-LC9'],
  ['Mewtwo', 'Legendary Collection', '29', 'Legendary-Collection/Mewtwo-V1-LC29'],
  ['Blastoise', 'Expedition Base Set', '4', 'Expedition-Base-Set/Blastoise-EX4'],
  ['Shining Gyarados', 'Neo Revelation', '65', 'Neo-Revelation/Shining-Gyarados-NR65'],
  ['Shining Steelix', 'Neo Destiny', '112', 'Neo-Destiny/Shining-Steelix-NDE112'],
  ['Charizard', 'Base Expansion Pack', '103', 'Base-Expansion-Pack/Charizard-V2-EC1103', 'Japanese'],
].map(([name, set, number, path, language = 'English']) => ({ name, set, number, productUrl: base + path, language, source: 'catalogue' }));

export function cardmarketSearchUrl(item) {
  const url = new URL('https://www.cardmarket.com/en/Pokemon/Products/Search');
  url.searchParams.set('searchString', `${cardmarketSearchName(item.name)} ${String(item.number || '').split('/')[0]}`.trim());
  return url.href;
}

export function rankCardmarketProducts(item, candidates = []) {
  const target = cardmarketTarget(item);
  const matches = new Map();
  for (const candidate of candidates) {
    const productUrl = safeCardmarketProduct(candidate?.productUrl);
    if (!productUrl || !candidate.name || nameKey(candidate.name) !== nameKey(item.name)) continue;
    const exactNumber = Boolean(numberKey(item.number)) && [candidate.number, candidate.code ? candidate.code + candidate.number : null].some(value => numberKey(value) === numberKey(item.number));
    const exactSet = setKey(candidate.set) === setKey(target.set) && Boolean(setKey(target.set));
    // Other set/number printings are not useful alternatives for this inventory entry.
    if (!exactNumber || !exactSet || (target.language && candidate.language && candidate.language !== target.language)) continue;
    const reason = 'Name, expansion and card number match. Confirm the printing and filters.';
    const result = { ...candidate, productUrl, score: candidate.source === 'catalogue' ? 101 : 100, reason };
    if (!matches.has(productUrl) || matches.get(productUrl).score < result.score) matches.set(productUrl, result);
  }
  return [...matches.values()].sort((a, b) => b.score - a.score || a.productUrl.localeCompare(b.productUrl)).slice(0, 8);
}

export function suggestCardmarketProducts(item, candidates = []) {
  const ranked = rankCardmarketProducts(item, [...candidates, ...CARDMARKET_KNOWN_PRODUCTS]);
  const links = [item.links?.cardmarket, item.cardmarket?.url, item.prices?.cardmarket?.url].map(safeCardmarketProduct).filter(Boolean);
  for (const productUrl of links) {
    if (!ranked.some(row => row.productUrl === productUrl)) ranked.push({ productUrl, name: item.name, set: cardmarketTarget(item).set, number: item.number, source: 'inventory-link', reason: 'Existing inventory link. Check the product and printing before saving.' });
  }
  return ranked;
}
