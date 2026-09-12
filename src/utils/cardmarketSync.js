import { TCG_TO_CARDMARKET_CONDITION } from './conditionMappings.js';

// Variant-aware Cardmarket sync core. All prices are EUR asking prices, not sales.
const clean = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const setName = item => typeof item.set === 'string' ? item.set : item.set?.name || '';
export const CARDMARKET_CONDITIONS = ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'];
export const CARDMARKET_VARIANT_FLAGS = ['isReverseHolo', 'isStampedPromo', 'isSealed', 'isAutographed', 'isFirstEdition', 'isPokeBall', 'isMasterBall', 'isUnlimited'];
const conditionCodes = { Mint: 'MT', 'Near Mint': 'NM', Excellent: 'EX', Good: 'GD', 'Light Played': 'LP', Played: 'PL', Poor: 'PO' };
export const cardmarketCondition = value => conditionCodes[TCG_TO_CARDMARKET_CONDITION[value]] || null;
const DAY = 86400000;

export function cardmarketInventoryKey(item) {
  // Any identity, language, condition, or variant edit invalidates the old match.
  return JSON.stringify([clean(item.name), clean(setName(item)), clean(item.number), clean(item.language),
    clean(item.condition), Boolean(item.isJapanese), Boolean(item.isGraded), clean(item.grade), clean(item.gradingCompany),
    clean(item.variant), clean(item.variation), clean(item.rarity),
    CARDMARKET_VARIANT_FLAGS.map(key => Boolean(item[key])),
    (Array.isArray(item.tags) ? item.tags : []).map(clean).sort()]);
}

export function cardmarketTarget(item) {
  const issues = [];
  if (item.isGraded || item.gradingCompany || item.grade) issues.push('Graded cards are handled by CardLadder.');
  if (!item.name || !setName(item) || !item.number) issues.push('Confirm the card name, expansion, and collector number.');
  const japaneseSet = item.isJapanese || /\bjapanese\b|\bjapan\b|\bjp\b/i.test(setName(item));
  const storedLanguageConflict = /^english$/i.test(item.language || '') && japaneseSet;
  const language = storedLanguageConflict || /^japanese$/i.test(item.language || '') || (!item.language && japaneseSet) ? 'Japanese' : /^english$/i.test(item.language || '') ? 'English' : !item.language ? null : item.language;
  if (!language) issues.push('Confirm the card language.');
  else if (!['English', 'Japanese'].includes(language)) issues.push('This pilot supports English and Japanese.');
  if (storedLanguageConflict) issues.push('The language conflicts with the Japanese expansion. Confirm Japanese for this match; the stored Inventory language will remain unchanged.');
  if (item.isFirstEdition && item.isUnlimited) issues.push('Both 1st Edition and Unlimited are tagged.');
  if (item.isPokeBall && item.isMasterBall) issues.push('Both Poké Ball and Master Ball are tagged.');
  if (item.isSealed) issues.push('Sealed cards need a separate product or confirmed offer details.');
  if (item.isAutographed) issues.push('Autographed cards need individual review.');
  if (item.isStampedPromo) issues.push('Confirm the specific stamp/product; Stamped Promo alone is not precise enough.');
  if (item.isPokeBall || item.isMasterBall) issues.push('Confirm the specific ball-pattern product; Reverse Holo alone is not enough.');
  const condition = cardmarketCondition(item.condition) || null;
  if (!condition) issues.push('Confirm the condition in Cardmarket’s scale.');
  return { name: item.name, set: setName(item), number: String(item.number || ''), language,
    finish: item.isMasterBall ? 'master-ball' : item.isPokeBall ? 'poke-ball' : item.isReverseHolo ? 'reverse' : null,
    firstEdition: item.isFirstEdition ? true : item.isUnlimited ? false : null,
    condition, conditionNeedsReview: item.condition !== 'NM', issues };
}

export function safeCardmarketProduct(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://www.cardmarket.com' || url.username || url.password ||
        !/^\/en\/Pokemon\/Products\/Singles\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return null;
    // Filters are stored as explicit binding fields, never inherited silently.
    url.search = ''; url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}

export function safeCardmarketImage(value, kind = 'product') {
  try {
    const url = new URL(value);
    const host = kind === 'seller' ? 'marketplace-article-scans.s3.cardmarket.com' : 'product-images.s3.cardmarket.com';
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function createCardmarketBinding(item, choice) {
  const productUrl = safeCardmarketProduct(choice?.productUrl);
  if (!item.name || !setName(item) || !item.number || !productUrl || choice.confirmed !== true) throw new Error('Confirm the exact Cardmarket product before linking.');
  const target = cardmarketTarget(item);
  // Special collectible attributes cannot be silently collapsed into generic offers.
  if (item.isGraded || item.grade || item.gradingCompany || item.isAutographed || item.isSealed || item.isStampedPromo || item.isMasterBall || item.isPokeBall || (item.isFirstEdition && item.isUnlimited)) throw new Error('This card needs a specialist variant match.');
  if (!['English', 'Japanese'].includes(choice.language) || !CARDMARKET_CONDITIONS.includes(choice.condition) ||
      !['reverse', 'non-reverse'].includes(choice.finish) || typeof choice.firstEdition !== 'boolean') throw new Error('Confirm language, condition, reverse status, and edition.');
  if ((target.language && target.language !== choice.language) || (target.finish && target.finish !== choice.finish) ||
      (target.firstEdition !== null && target.firstEdition !== choice.firstEdition)) throw new Error('The selected filters conflict with the inventory tags.');
  if (choice.language === 'English' && /\bjapanese\b|\bjapan\b|\bjp\b/i.test(target.set)) throw new Error('Use the Japanese product page for this expansion.');
  return { productUrl, productTitle: String(choice.productTitle || '').slice(0, 300), inventoryKey: cardmarketInventoryKey(item),
    language: choice.language, condition: choice.condition, finish: choice.finish, firstEdition: choice.firstEdition,
    confirmed: true };
}

export function parseCardmarketEuro(value) {
  const text = String(value || '').replace(/\u00a0/g, ' ').trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\s*€$/.test(text)) return null;
  const amount = Number(text.replace(/\s*€$/, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function bindingMatches(item, binding) {
  if (!binding || binding.inventoryKey !== cardmarketInventoryKey(item)) return false;
  try { const checked = createCardmarketBinding(item, binding); return Object.keys(checked).every(key => checked[key] === binding[key]); } catch { return false; }
}

export function summarizeCardmarketOffers(item, capture, now = Date.now()) {
  const binding = item.cardmarketBinding;
  if (!bindingMatches(item, binding)) return { status: 'needs-match', reason: 'Link and confirm this card’s exact product and filters.', offers: [] };
  const captured = Date.parse(capture?.capturedAt);
  if (!Number.isFinite(captured) || captured > now + 300000 || now - captured > DAY) return { status: 'stale', reason: 'Capture prices again; reports expire after 24 hours.', offers: [] };
  const filters = capture.filters;
  if (capture.source !== 'cardmarket-browser' || capture.currency !== 'EUR' || capture.inventoryKey !== binding.inventoryKey ||
      safeCardmarketProduct(capture.productUrl) !== binding.productUrl || !filters ||
      ['language', 'condition', 'finish', 'firstEdition'].some(key => filters[key] !== binding[key])) return { status: 'mismatch', reason: 'The capture does not match the confirmed product and filters.', offers: [] };
  if (capture.complete !== true || !Array.isArray(capture.offers) || capture.offers.length > 10000) return { status: 'incomplete', reason: 'The matching offer capture is incomplete.', offers: [] };
  const sellers = new Map();
  const eligible = new Map();
  let excluded = 0;
  for (const offer of capture.offers) {
    if (typeof offer.price !== 'number' || !Number.isFinite(offer.price) || offer.price <= 0 || offer.currency !== 'EUR' ||
        typeof offer.seller !== 'string' || !offer.seller.trim() || typeof offer.offerId !== 'string' || !/^articleRow\d+$/.test(offer.offerId)) throw new Error('An offer contains unreadable price or seller evidence.');
    // Each rendered offer must independently verify all of its attributes.
    if (offer.language !== binding.language || offer.condition !== binding.condition || offer.finish !== binding.finish ||
        offer.firstEdition !== binding.firstEdition || offer.signed !== false || offer.altered !== false ||
        /\b(?:(?:psa|bgs|cgc|sgc)(?=\b|\d)|beckett|graded|grading|slab|proxy|replica|reprint|lot|bundle|signed|autograph\b)/i.test(offer.comments || '')) { excluded++; continue; }
    const duplicate = eligible.get(offer.offerId);
    if (duplicate && (duplicate.price !== offer.price || duplicate.seller !== offer.seller)) throw new Error('Conflicting duplicate offer evidence.');
    eligible.set(offer.offerId, offer);
    const seller = clean(offer.seller);
    const previous = sellers.get(seller);
    if (!previous || offer.price < previous.price) sellers.set(seller, offer);
  }
  // One lowest eligible offer per seller so a large stock count cannot dominate.
  const offers = [...sellers.values()].sort((a, b) => a.price - b.price);
  const lowestFive = offers.slice(0, 5);
  const median = lowestFive.length ? lowestFive.length % 2 ? lowestFive[(lowestFive.length - 1) / 2].price : (lowestFive[lowestFive.length / 2 - 1].price + lowestFive[lowestFive.length / 2].price) / 2 : null;
  const warnings = [];
  if (offers.length < 5) warnings.push(`Only ${offers.length} matching ${offers.length === 1 ? 'seller' : 'sellers'}; review this thin market.`);
  if (offers.length >= 3 && offers[0].price < offers[2].price * 0.5) warnings.push('The lowest offer is less than half the third-lowest; review its details.');
  return { status: offers.length ? 'ready' : 'no-offers', offers: [...eligible.values()].sort((a, b) => a.price - b.price), lowestFive, sellerCount: offers.length, excluded,
    lowest: offers[0]?.price ?? null, medianLowestFive: median == null ? null : Math.round(median * 100) / 100, warnings };
}

export function applyCardmarketCaptures(items, captures, choices, now = Date.now(), runId = '') {
  if (!Array.isArray(items) || !Array.isArray(captures) || !Array.isArray(choices)) throw new Error('Invalid Cardmarket review.');
  const byId = new Map();
  for (const choice of choices) {
    if (!choice?.entryId || byId.has(choice.entryId) || typeof choice.replaceManual !== 'boolean') throw new Error('Confirm each inventory selection and manual-price choice once.');
    byId.set(choice.entryId, choice);
  }
  let updatedCount = 0;
  const result = items.map(item => {
    const choice = byId.get(item.entryId);
    if (!choice) return item;
    const matches = captures.filter(capture => capture.entryId === item.entryId);
    if (matches.length !== 1) throw new Error('Expected exactly one capture for each selected card.');
    const capture = matches[0];
    const summary = summarizeCardmarketOffers(item, capture, now);
    if (summary.status !== 'ready') throw new Error(summary.reason || 'No matching offers; current price was preserved.');
    const previousCapture = Date.parse(item.cardmarketPricing?.capturedAt);
    if (previousCapture > Date.parse(capture.capturedAt)) throw new Error('A newer Cardmarket price is already saved.');
    const selectedOffer = choice.method === 'selected-offer' && typeof choice.offerId === 'string' ? summary.offers.find(offer => offer.offerId === choice.offerId) : null;
    const price = choice.method === 'selected-offer' ? selectedOffer?.price : choice.method === 'median-lowest-five' ? summary.medianLowestFive : choice.method === 'lowest' ? summary.lowest : null;
    if (!(price > 0)) throw new Error('Choose a supported pricing method.');
    updatedCount++;
    const previousManual = { overridePrice: item.overridePrice ?? null, overridePriceCurrency: item.overridePriceCurrency ?? null, manualPrice: item.manualPrice ?? null, manualPriceCurrency: item.manualPriceCurrency ?? null };
    return { ...item, cardmarketPricing: { source: 'cardmarket-browser', method: choice.method, kind: 'asking-price', price, currency: 'EUR', runId,
      capturedAt: capture.capturedAt, appliedAt: new Date(now).toISOString(), inventoryKey: cardmarketInventoryKey(item), productUrl: capture.productUrl,
      filters: capture.filters, productImageUrl: safeCardmarketImage(capture.productImageUrl), selectedOffer: selectedOffer || null, sellerCount: summary.sellerCount, lowest: summary.lowest, medianLowestFive: summary.medianLowestFive,
      warnings: summary.warnings, evidence: summary.lowestFive, replacedManual: choice.replaceManual, previousManual },
      ...(choice.replaceManual ? { overridePrice: price, overridePriceCurrency: 'EUR' } : {}) };
  });
  if ([...byId.keys()].some(id => !items.some(item => item.entryId === id))) throw new Error('A selected card was removed. Refresh the review.');
  return { items: result, updatedCount };
}

// Accepted estimates remain until refreshed, but never move to a changed variant.
export function acceptedCardmarketPrice(item) {
  const pricing = item?.cardmarketPricing;
  return pricing?.source === 'cardmarket-browser' && pricing.kind === 'asking-price' && pricing.currency === 'EUR' &&
    pricing.inventoryKey === cardmarketInventoryKey(item) && bindingMatches(item, item.cardmarketBinding) && pricing.productUrl === item.cardmarketBinding.productUrl &&
    ['language', 'condition', 'finish', 'firstEdition'].every(key => pricing.filters?.[key] === item.cardmarketBinding[key]) &&
    typeof pricing.price === 'number' && Number.isFinite(pricing.price) && pricing.price > 0 ? pricing.price : null;
}
