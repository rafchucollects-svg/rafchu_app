// Shared by the app and the browser companion. No credentials or provider API.
import { isCardLadderCurrency } from './cardLadderCurrency.js';
export const CARD_LADDER_REPORT_VERSION = 2;
const DAY = 86400000;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const numberOf = value => normalize(value).replace(/^0+(?=\d)/, '');

// Certificate numbers in CardLadder may belong to the example sale, not the
// user's slab. They are deliberately never read or used as matching evidence.
export function cardLadderIdentity(item, isHolding = false) {
  const raw = isHolding ? {} : item.cardladderData || {};
  const set = String(raw.setRaw || (typeof item.set === 'string' ? item.set : item.set?.name) || '');
  const year = String(raw.year || item.year || /\b(?:19|20)\d{2}\b/.exec(set)?.[0] || '');
  const setKey = normalize(set).replace(/\b(?:19|20)\d{2}\b/g, '').replace(/\bpokemon\b/g, '').replace(/\s+/g, ' ').trim();
  const language = normalize(item.language || (/japanese|japan/i.test(set) ? 'Japanese' : 'English'));
  return JSON.stringify([normalize(raw.playerRaw || item.name), setKey, year, numberOf(item.number),
    normalize(raw.variation ?? item.variation ?? item.rarity), language, normalize(item.gradingCompany), String(item.grade)]);
}

export function createSalesBinding(item, holding) {
  return { entryId: item.entryId, itemIdentity: inventoryFingerprint(item), holdingIdentity: cardLadderIdentity(holding, true) };
}

function inventoryFingerprint(item) {
  // Also watch editable app fields, even when an old CSV snapshot is retained.
  return JSON.stringify([cardLadderIdentity(item), normalize(item.name),
    normalize(typeof item.set === 'string' ? item.set : item.set?.name), normalize(item.rarity), normalize(item.variant), normalize(item.language)]);
}

export function salesWindow(now = Date.now()) {
  const end = new Date(now);
  if (!Number.isFinite(end.getTime())) throw new Error('Invalid capture date.');
  // CardLadder exposes sale dates, not times. Match its two-week calendar window.
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return { startDate: new Date(endDay - 14 * DAY).toISOString().slice(0, 10), endDate: new Date(endDay).toISOString().slice(0, 10) };
}

export function parseSaleDate(value) {
  const text = String(value || '').trim();
  let parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) {
    const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/.exec(text);
    if (!match) return null;
    parts = [text, match[3], String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[1]) + 1).padStart(2, '0'), match[2].padStart(2, '0')];
  }
  const iso = `${parts[1]}-${parts[2]}-${parts[3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseSaleMoney(value) {
  // Reject abbreviated/foreign/ambiguous values rather than invent a USD price.
  const text = String(value || '').trim();
  if (!/^(?:US\$|\$|USD\s+)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?$/.test(text)) return null;
  const amount = Number(text.replace(/^(?:US\$|\$|USD\s+)\s*/, '').replace(/,/g, ''));
  return amount > 0 && Number.isFinite(amount) ? amount : null;
}

export function safeSaleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safeCardLadderImage(value) {
  const safe = safeSaleUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const supported = url.hostname === 'd1htnxwo4o0jhw.cloudfront.net' ||
    (url.hostname === 'i.ebayimg.com' && url.pathname.startsWith('/images/')) ||
    (url.hostname === 'firebasestorage.googleapis.com' && url.pathname.startsWith('/v0/b/cardladder-71d53.appspot.com/o/'));
  return supported && !url.port ? safe : null;
}

// Potential anomalies, not a claim that a transaction was invalid. MAD guards
// against a large sale inflating the mean/SD and masking itself (NIST EDA 1.3.5.17).
export function saleStatistics(sales) {
  const prices = sales.map(sale => sale.price).sort((a, b) => a - b);
  const count = prices.length;
  if (!count) return null;
  const medianOf = values => values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const median = medianOf(prices);
  const mean = prices.reduce((total, price) => total + price, 0) / count;
  const standardDeviation = count > 1 ? Math.sqrt(prices.reduce((total, price) => total + (price - mean) ** 2, 0) / (count - 1)) : null;
  const mad = medianOf(prices.map(price => Math.abs(price - median)).sort((a, b) => a - b));
  const sufficient = count >= 5;
  const anomalies = sufficient ? sales.flatMap(sale => {
    const zScore = standardDeviation > 0 ? (sale.price - mean) / standardDeviation : null;
    const modifiedZScore = mad > 0 ? 0.6745 * (sale.price - median) / mad : null;
    // With a tied median/MAD of zero there is no finite robust z-score. Require
    // a material 25% deviation from that repeated price as a labeled heuristic.
    const method = Math.abs(zScore || 0) > 3 ? 'standard-deviation' : Math.abs(modifiedZScore || 0) > 3.5 ? 'median-deviation' : mad === 0 && Math.abs(sale.price - median) / median >= 0.25 ? 'repeated-price' : null;
    return method ? [{ ...sale, direction: sale.price > median ? 'high' : 'low', method, zScore, modifiedZScore }] : [];
  }) : [];
  const flagged = new Set(anomalies.map(saleIdentity));
  const highest = [...sales].sort((a, b) => b.price - a.price)[0];
  const unflagged = sales.filter(sale => !flagged.has(saleIdentity(sale))).sort((a, b) => b.price - a.price);
  return { count, mean, median, standardDeviation, mad, sufficient, anomalies,
    highIsAnomaly: flagged.has(saleIdentity(highest)), highestUnflagged: sufficient ? unflagged[0] || null : null };
}

export function saleIdentity(sale) {
  const url = new URL(sale.url);
  const ebayId = /\/itm\/(?:[^/]+\/)?(\d+)/.exec(url.pathname)?.[1];
  if (/(^|\.)ebay\.[a-z.]+$/.test(url.hostname) && ebayId) return `ebay:${ebayId}`;
  // Preserve distinct auction lots; ignore only tracking parameters.
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|mk|campid|toolid|nordt|rt|orig_cvip)/.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.href;
}

export function isComparableSale(sale, holding) {
  const title = ` ${normalize(sale.title)} `;
  if (/\b(lot|bundle|reprint|replica|proxy|signed|autograph|qualifier|oc|mk)\b/.test(title)) return false;
  const grader = normalize(holding.gradingCompany);
  const grade = normalize(holding.grade);
  // Require an explicit correct grade, and reject conflicting grade statements.
  const grades = [...title.matchAll(/\b(psa|bgs|cgc|sgc)\s*(\d+(?:\s+\d)?)(?=\s)/g)];
  if (!grades.some(m => m[1] === grader && m[2] === grade)) return false;
  if (grades.some(m => m[1] !== grader || m[2] !== grade)) return false;
  if (/\b(black label|pristine|perfect)\b/.test(title)) return false;
  const name = normalize(holding.name).split(' ').filter(word => !['full','art','fa','holo'].includes(word));
  if (!name.length || !name.every(word => title.includes(` ${word} `))) return false;
  const number = numberOf(holding.number);
  if (!number || !normalize(sale.title).split(' ').some(word => numberOf(word) === number)) return false;
  if (/\b(1st edition|first edition)\b/.test(title) && !/\b(1st|first)\b/.test(normalize(holding.variation))) return false;
  if (/\b(japanese|japan|jpn|jp)\b/.test(title) && !/japanese|japan/.test(normalize(holding.set))) return false;
  return true;
}

export function summarizeSales(holding, window) {
  if (holding.complete !== true) return { status: 'incomplete', saleCount: 0, high: null };
  const currency = holding.currency || 'USD';
  if (!isCardLadderCurrency(currency)) throw new Error('Unsupported capture currency. Run a new capture.');
  const eligible = new Map();
  let excluded = 0;
  for (const sale of holding.sales || []) {
    if (!parseSaleDate(sale.soldDate) || !safeSaleUrl(sale.url) || sale.currency !== currency ||
        typeof sale.price !== 'number' || !Number.isFinite(sale.price) || sale.price <= 0) throw new Error('Invalid sale evidence. Capture this card again.');
    if (sale.soldDate < window.startDate || sale.soldDate > window.endDate) continue;
    if (!['Auction', 'Fixed Price', 'Best Offer'].includes(sale.type) || !isComparableSale(sale, holding)) { excluded++; continue; }
    const id = saleIdentity(sale);
    const previous = eligible.get(id);
    if (previous && (previous.price !== sale.price || previous.soldDate !== sale.soldDate)) throw new Error('Conflicting duplicate sale records. Capture this card again.');
    eligible.set(id, sale);
  }
  const sales = [...eligible.values()].sort((a, b) => b.price - a.price || b.soldDate.localeCompare(a.soldDate));
  return { status: sales.length ? 'ready' : 'no-sales', currency, saleCount: sales.length, excluded, high: sales[0] || null, statistics: saleStatistics(sales) };
}

export function validateSalesReport(report, now = Date.now()) {
  if (!report || ![1, CARD_LADDER_REPORT_VERSION].includes(report.schemaVersion) || report.source !== 'cardladder-browser' ||
      report.collectionName !== 'Inventory' || typeof report.runId !== 'string' || !report.runId ||
      !Array.isArray(report.holdings) || report.holdings.length > 1000 || report.collectionComplete !== true) throw new Error('Expected a complete Inventory report from the CardLadder companion.');
  const captured = Date.parse(report.capturedAt);
  if (!Number.isFinite(captured) || captured > now + 5 * 60000 || now - captured > DAY) throw new Error('This report is stale. Run the companion again (reports expire after 24 hours).');
  const window = salesWindow(captured);
  if (report.startDate !== window.startDate || report.endDate !== window.endDate) throw new Error('The report must use the 14-day window ending on its capture date.');
  const ids = new Set();
  const currency = report.schemaVersion === 1 ? 'USD' : report.currency;
  if (!isCardLadderCurrency(currency) || (report.schemaVersion === 1 && report.currency && report.currency !== 'USD')) throw new Error('Invalid report currency. Run a new capture.');
  let count = 0;
  for (const holding of report.holdings) {
    if (!holding || typeof holding.holdingId !== 'string' || !holding.holdingId || ids.has(holding.holdingId) ||
        !Array.isArray(holding.sales) || !holding.name || !holding.gradingCompany || !holding.grade) throw new Error('Invalid or duplicate collection holding.');
    ids.add(holding.holdingId);
    if ((report.schemaVersion === 2 && holding.currency !== currency) ||
        (holding.currency && holding.currency !== currency) ||
        holding.sales.some(sale => sale.currency !== currency) ||
        (holding.cardLadderValue != null && holding.cardLadderValueCurrency !== currency)) throw new Error('Mixed or missing capture currencies. Run a new capture without changing CardLadder’s display currency.');
    count += holding.sales.length;
    if (count > 50000) throw new Error('Report exceeds the 50,000-sale limit.');
  }
  return window;
}

// Provider estimate is a separate, explicitly selected fallback, never a sale.
export function cardLadderFallbackValue(holding, summary) {
  const value = holding.cardLadderValue;
  return holding.complete === true && summary.saleCount === 0 && isCardLadderCurrency(holding.cardLadderValueCurrency) && holding.cardLadderValueCurrency === (holding.currency || 'USD') &&
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function buildSalesPreview(items, report, now = Date.now(), bindings = {}) {
  const window = validateSalesReport(report, now);
  const used = new Set();
  return report.holdings.map(holding => {
    const summary = summarizeSales(holding, window);
    const sameGrade = item => item.isGraded && normalize(item.gradingCompany) === normalize(holding.gradingCompany) && String(item.grade) === String(holding.grade);
    const identity = cardLadderIdentity(holding, true);
    const binding = bindings[holding.holdingId];
    const previouslyLinked = items.filter(item => item.cardladderData?.holdingId === holding.holdingId);
    let candidates = binding ? items.filter(item => sameGrade(item) && item.entryId === binding.entryId &&
      inventoryFingerprint(item) === binding.itemIdentity && identity === binding.holdingIdentity) : [];
    if (!binding) candidates = previouslyLinked.filter(item => sameGrade(item) &&
      item.cardladderData?.holdingIdentityKey === identity && item.cardladderData?.inventoryIdentityKey === inventoryFingerprint(item));
    // Exact print/grade identity only. A manual link resolves naming differences.
    if (!binding && !previouslyLinked.length && !candidates.length) candidates = items.filter(item => sameGrade(item) && cardLadderIdentity(item) === identity);
    const item = candidates.length === 1 ? candidates[0] : null;
    const status = !item ? (candidates.length ? 'ambiguous' : 'unmatched') : used.has(item.entryId) ? 'ambiguous' : summary.status === 'no-sales' && !item.image && safeCardLadderImage(holding.imageUrl) ? 'image-only' : summary.status;
    if (item) used.add(item.entryId);
    return { holding, item, ...summary, currency: holding.currency || 'USD', status, fallbackValue: cardLadderFallbackValue(holding, summary), locked: Boolean(item && (item.overridePrice != null || item.manualPrice != null)), previousPrice: item?.gradedPrice ?? null, previousCurrency: item?.gradedPriceCurrency || 'USD' };
  }).map((row, _index, rows) => row.item && rows.filter(other => other.item?.entryId === row.item.entryId).length > 1 ? { ...row, status: 'ambiguous' } : row);
}

export function canAddCardLadderHolding(items, holding) {
  return holding.complete === true && holding.gradingCompany === 'PSA' && /^\d+(?:\.\d+)?$/.test(holding.grade) &&
    ['name', 'number', 'set'].every(key => typeof holding[key] === 'string' && holding[key].trim()) &&
    !items.some(item => item.cardladderData?.holdingId === holding.holdingId ||
      item.entryId === `cardladder-holding-${encodeURIComponent(holding.holdingId)}` ||
      (item.isGraded && cardLadderIdentity(item) === cardLadderIdentity(holding, true)));
}

function newCardLadderItem(holding, details, now) {
  const quantity = Number(details.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) throw new Error('New cards need a whole-number quantity between 1 and 100,000.');
  const hasCost = details.buyPrice != null && String(details.buyPrice).trim() !== '';
  const buyPrice = hasCost ? Number(details.buyPrice) : null;
  const buyPriceCurrency = details.buyPriceCurrency || 'USD';
  if (hasCost && (!Number.isFinite(buyPrice) || buyPrice < 0 || !/^(USD|EUR|GBP|SEK|NOK|DKK|ISK|CAD|AUD|CNY|JPY|SGD|PHP|MXN|NZD|HKD)$/.test(buyPriceCurrency))) throw new Error('Purchase cost must be non-negative and have a supported currency.');
  const item = {
    entryId: `cardladder-holding-${encodeURIComponent(holding.holdingId)}`,
    name: holding.name, set: holding.set, number: holding.number, rarity: holding.variation || '',
    language: /japanese|japan/i.test(holding.set) ? 'Japanese' : 'English',
    image: safeCardLadderImage(holding.imageUrl) || '', condition: 'NM', quantity, addedAt: now, source: 'cardladder', acquiredVia: 'cardladder',
    isGraded: true, gradingCompany: holding.gradingCompany, grade: holding.grade,
    gradedPrice: null, gradedPriceCurrency: holding.currency || 'USD',
    ...(hasCost ? { buyPrice, buyPriceCurrency } : {}),
    cardladderData: { playerRaw: holding.name, setRaw: holding.set, variation: holding.variation || '',
      holdingId: holding.holdingId, holdingIdentityKey: cardLadderIdentity(holding, true), importedAt: now },
  };
  item.cardladderData.inventoryIdentityKey = inventoryFingerprint(item);
  return item;
}

export function applySalesReport(items, report, now = Date.now(), bindings = {}, additions = {}, selectedHoldingIds = null, valueHoldingIds = [], options = {}) {
  validateSalesReport(report, now);
  if (!options || typeof options !== 'object' || Array.isArray(options) || (options.updateStickerPrices !== undefined && typeof options.updateStickerPrices !== 'boolean')) throw new Error('Choose a valid CardLadder price application mode.');
  const updateStickerPrices = options.updateStickerPrices === true;
  if (updateStickerPrices && selectedHoldingIds === null) throw new Error('Sticker prices require an explicit checked selection.');
  if (selectedHoldingIds !== null && !Array.isArray(selectedHoldingIds)) throw new Error('Invalid selection. Reload the preview.');
  const selected = selectedHoldingIds === null ? null : new Set(selectedHoldingIds);
  if (selected && [...selected].some(id => !report.holdings.some(h => h.holdingId === id))) throw new Error('Invalid selected holding. Reload the preview.');
  if (!Array.isArray(valueHoldingIds)) throw new Error('Invalid CardLadder Value selection.');
  const valueSelection = new Set(valueHoldingIds);
  if (valueSelection.size && (!selected || [...valueSelection].some(id => !selected.has(id)))) throw new Error('CardLadder Value requires an explicit checked selection.');
  for (const id of valueSelection) {
    const holding = report.holdings.find(h => h.holdingId === id);
    if (!holding || cardLadderFallbackValue(holding, summarizeSales(holding, salesWindow(report.capturedAt))) == null) throw new Error('CardLadder Value is only available after a complete capture with no qualifying sales.');
  }
  const merged = [...items];
  const addedIds = new Set();
  let skippedAddCount = 0;
  for (const [holdingId, details] of Object.entries(additions)) {
    if (selected && !selected.has(holdingId)) continue;
    const holding = report.holdings.find(candidate => candidate.holdingId === holdingId);
    if (!holding || holding.complete !== true) throw new Error('Only completely captured holdings can be added.');
    if (bindings[holdingId]) throw new Error('Choose either an existing card or a new card for each holding.');
    if (!canAddCardLadderHolding(merged, holding)) {
      if (merged.some(item => item.cardladderData?.holdingId === holdingId ||
          (item.isGraded && cardLadderIdentity(item) === cardLadderIdentity(holding, true)))) { skippedAddCount++; continue; }
      throw new Error('This holding cannot be added. Refresh the preview and check its card identity.');
    }
    const item = newCardLadderItem(holding, details, now);
    merged.push(item); addedIds.add(item.entryId);
  }
  const rows = buildSalesPreview(merged, report, now, bindings);
  // If multiple source holdings claim one app entry, update neither.
  const claims = new Map();
  for (const row of rows) if (row.item) claims.set(row.item.entryId, (claims.get(row.item.entryId) || 0) + 1);
  const updates = new Map(rows.filter(row => (row.status === 'ready' || (['no-sales', 'image-only'].includes(row.status) && valueSelection.has(row.holding.holdingId))) && (selected ? selected.has(row.holding.holdingId) : !row.statistics?.highIsAnomaly) && claims.get(row.item.entryId) === 1).map(row => [row.item.entryId, row]));
  const imageUpdates = new Map(rows.filter(row => ['ready', 'image-only', 'no-sales'].includes(row.status) && (!selected || selected.has(row.holding.holdingId)) && !row.item.image && safeCardLadderImage(row.holding.imageUrl) && claims.get(row.item.entryId) === 1).map(row => [row.item.entryId, safeCardLadderImage(row.holding.imageUrl)]));
  return {
    updatedCount: [...updates.keys()].filter(id => !addedIds.has(id)).length,
    stickerUpdatedCount: updateStickerPrices ? [...updates.keys()].filter(id => !addedIds.has(id)).length : 0,
    addedCount: addedIds.size, skippedAddCount, imageUpdatedCount: imageUpdates.size,
    anomalySkippedCount: rows.filter(row => row.status === 'ready' && row.statistics?.highIsAnomaly && !selected).length,
    items: merged.map(item => {
      if (imageUpdates.has(item.entryId)) item = { ...item, image: imageUpdates.get(item.entryId) };
      const row = updates.get(item.entryId);
      if (!row) return item;
      const usesValue = valueSelection.has(row.holding.holdingId);
      const price = usesValue ? row.fallbackValue : row.high.price;
      return { ...item, gradedPrice: price, gradedPriceCurrency: row.currency,
        ...(updateStickerPrices ? { overridePrice: price, overridePriceCurrency: row.currency } : {}),
        cardladderData: { ...item.cardladderData, holdingId: row.holding.holdingId,
          holdingIdentityKey: cardLadderIdentity(row.holding, true), inventoryIdentityKey: inventoryFingerprint(item) },
        cardladderPricing: { ...(updateStickerPrices ? { stickerUpdated: true, stickerAppliedAt: new Date(now).toISOString(), previousOverride: { overridePrice: item.overridePrice ?? null, overridePriceCurrency: item.overridePriceCurrency ?? null } } : {}), method: usesValue ? 'cardladder-value' : 'highest-sale-14d', providerValue: usesValue ? row.fallbackValue : null, source: 'cardladder-browser', currency: row.currency,
          runId: report.runId, capturedAt: report.capturedAt, startDate: report.startDate, endDate: report.endDate,
          saleCount: row.saleCount, excludedCount: row.excluded, profileUrl: row.holding.profileUrl || null,
          statistics: row.statistics ? { count: row.statistics.count, mean: row.statistics.mean, median: row.statistics.median, standardDeviation: row.statistics.standardDeviation, highIsAnomaly: row.statistics.highIsAnomaly, highAnomalyCount: row.statistics.anomalies.filter(sale => sale.direction === 'high').length, lowAnomalyCount: row.statistics.anomalies.filter(sale => sale.direction === 'low').length } : null,
          gradingCompany: item.gradingCompany, grade: item.grade,
          highSale: row.high ? { price: row.high.price, currency: row.high.currency, soldDate: row.high.soldDate, url: row.high.url, title: row.high.title, type: row.high.type, verified: row.high.verified === true } : null } };
    }),
  };
}

export function preserveCardLadderSalesPrice(incoming, existing) {
  if (!['highest-sale-14d', 'cardladder-value'].includes(existing?.cardladderPricing?.method) ||
      cardLadderIdentity(incoming) !== cardLadderIdentity(existing)) return incoming;
  return { ...incoming, gradedPrice: existing.gradedPrice, gradedPriceCurrency: existing.gradedPriceCurrency,
    cardladderPricing: existing.cardladderPricing,
    cardladderData: { ...incoming.cardladderData, ...(existing.cardladderData?.holdingId ? {
      holdingId: existing.cardladderData.holdingId, holdingIdentityKey: existing.cardladderData.holdingIdentityKey || null,
      inventoryIdentityKey: existing.cardladderData.inventoryIdentityKey || null } : {}) } };
}
