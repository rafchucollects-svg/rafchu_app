import { CARDMARKET_CONDITIONS, cardmarketInventoryKey, createCardmarketBinding, safeCardmarketProduct, summarizeCardmarketOffers } from './cardmarketSync.js';

const filterNames = ['language', 'minCondition', 'isReverseHolo', 'isFirstEd', 'isSigned', 'isAltered'];
const languages = ['English', 'Japanese', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Korean', 'T-Chinese', 'S-Chinese'];
const DAY = 86400000;

export function discoveryUrl(productUrl, target = {}) {
  const product = safeCardmarketProduct(productUrl);
  if (!product) throw new Error('Choose an exact Cardmarket product before reading its listings.');
  const url = new URL(product);
  const condition = CARDMARKET_CONDITIONS.indexOf(target?.condition);
  const filters = {
    language: target?.language === 'English' ? '1' : target?.language === 'Japanese' ? '7' : '',
    minCondition: String(condition < 0 ? CARDMARKET_CONDITIONS.length : condition + 1),
    isReverseHolo: '', isFirstEd: '', isSigned: 'N', isAltered: 'N',
  };
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url.href;
}

export function sameDiscoveryPage(actual, expected) {
  const product = safeCardmarketProduct(actual);
  if (!product || product !== safeCardmarketProduct(expected)) return false;
  const left = new URL(actual).searchParams;
  const right = new URL(expected).searchParams;
  // Blank means an explicitly unrestricted filter. Missing or duplicate keys
  // cannot prove the page kept the requested scope.
  return filterNames.every(key => left.getAll(key).length === 1 && right.getAll(key).length === 1 && left.get(key) === right.get(key));
}

const covers = (values, selected, allowed) => values === null ||
  (Array.isArray(values) && values.length > 0 && values.every(value => allowed.includes(value)) && values.includes(selected));

export function materializeCardmarketDiscovery(item, snapshot, binding = item?.cardmarketBinding, now = Date.now()) {
  if (!item || !binding || !snapshot || !Number.isFinite(now)) return null;
  try {
    const inventoryKey = cardmarketInventoryKey(item);
    const checked = createCardmarketBinding(item, binding);
    if (binding.inventoryKey !== inventoryKey || Object.keys(checked).some(key => checked[key] !== binding[key])) return null;
    const captured = Date.parse(snapshot.capturedAt);
    if (snapshot.scope !== 'product-preview' || snapshot.source !== 'cardmarket-browser' || snapshot.currency !== 'EUR' ||
        typeof snapshot.entryId !== 'string' || !snapshot.entryId || snapshot.entryId !== item.entryId || snapshot.inventoryKey !== inventoryKey ||
        safeCardmarketProduct(snapshot.productUrl) !== binding.productUrl ||
        !Number.isFinite(captured) || captured > now + 300000 || now - captured > DAY ||
        snapshot.complete !== true || snapshot.moreAvailable !== false || snapshot.error ||
        !Array.isArray(snapshot.offers) || snapshot.offers.length > 10000) return null;
    const coverage = snapshot.coverage;
    const condition = CARDMARKET_CONDITIONS.indexOf(coverage?.minCondition);
    if (!coverage || condition < 0 || CARDMARKET_CONDITIONS.indexOf(binding.condition) > condition ||
        !covers(coverage.languages, binding.language, languages) ||
        !covers(coverage.finishes, binding.finish, ['reverse', 'non-reverse']) ||
        !covers(coverage.editions, binding.firstEdition, [true, false]) ||
        coverage.signed !== false || coverage.altered !== false) return null;

    const capture = {
      entryId: item.entryId, inventoryKey, source: snapshot.source, currency: snapshot.currency,
      productUrl: binding.productUrl, productTitle: snapshot.productTitle, productImageUrl: snapshot.productImageUrl,
      filteredUrl: snapshot.filteredUrl, capturedAt: snapshot.capturedAt,
      filters: { language: binding.language, condition: binding.condition, finish: binding.finish, firstEdition: binding.firstEdition },
      discoveryCoverage: coverage, offers: snapshot.offers, complete: true, moreAvailable: false,
      ...(snapshot.photoWarning ? { photoWarning: snapshot.photoWarning } : {}),
    };
    // Confirmation only narrows coverage. The regular summary still verifies
    // each offer, its price and seller before any explicit price application.
    const summary = summarizeCardmarketOffers({ ...item, cardmarketBinding: binding }, capture, now);
    return ['ready', 'no-offers'].includes(summary.status) ? capture : null;
  } catch { return null; }
}
