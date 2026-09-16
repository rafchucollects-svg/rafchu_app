import { describe, expect, it } from 'vitest';
import { discoveryUrl, materializeCardmarketDiscovery, sameDiscoveryPage } from './cardmarketDiscovery.js';
import { cardmarketInventoryKey, createCardmarketBinding, summarizeCardmarketOffers } from './cardmarketSync.js';

const now = Date.parse('2026-09-16T10:00:00Z');
const product = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8';
const card = { entryId: 'jolteon', name: 'Jolteon', set: 'EX Unseen Forces', number: '8', condition: 'LP', language: '', overridePrice: 110 };
const choice = { productUrl: product, productTitle: 'Jolteon (UF 8)', confirmed: true, language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false };
const binding = createCardmarketBinding(card, choice);
const item = { ...card, cardmarketBinding: binding };
const offer = (changes = {}) => ({ offerId: 'articleRow1001', seller: 'Seller', price: 100, currency: 'EUR', language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false, signed: false, altered: false, comments: '', ...changes });
const snapshot = (changes = {}) => ({
  scope: 'product-preview', source: 'cardmarket-browser', currency: 'EUR', entryId: card.entryId, inventoryKey: cardmarketInventoryKey(card),
  productUrl: product, productTitle: choice.productTitle, productImageUrl: null, filteredUrl: discoveryUrl(product), capturedAt: new Date(now).toISOString(),
  coverage: { languages: null, minCondition: 'PO', finishes: null, editions: null, signed: false, altered: false },
  offers: [offer()], complete: true, moreAvailable: false, ...changes,
});

describe('Cardmarket discovery navigation', () => {
  it('requests known language and minimum condition while leaving printing choices open', () => {
    const url = new URL(discoveryUrl(`${product}?isFirstEd=Y#offers`, { language: 'English', condition: 'EX', finish: 'reverse', firstEdition: true }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ language: '1', minCondition: '3', isReverseHolo: '', isFirstEd: '', isSigned: 'N', isAltered: 'N' });
    expect(url.hash).toBe('');
    expect(new URL(discoveryUrl(product, { language: 'Japanese', condition: 'NM' })).searchParams.get('language')).toBe('7');
  });
  it('broadens missing or unsupported hints and rejects non-product URLs', () => {
    for (const target of [undefined, {}, null, { language: 'Unknown', condition: 'Unknown' }]) {
      const params = new URL(discoveryUrl(product, target)).searchParams;
      expect(params.get('language')).toBe('');
      expect(params.get('minCondition')).toBe('7');
    }
    for (const url of ['https://evil.example/product', 'https://www.cardmarket.com/en/Pokemon/Products/Search', 'not a URL']) expect(() => discoveryUrl(url)).toThrow(/exact Cardmarket product/);
  });
  it('tolerates verification tokens and ordering but requires every exact filter once', () => {
    const expected = discoveryUrl(product);
    const reordered = new URL(expected);
    reordered.searchParams.sort();
    reordered.searchParams.set('verification_token', 'test');
    expect(sameDiscoveryPage(reordered.href, expected)).toBe(true);
    for (const key of ['language', 'minCondition', 'isReverseHolo', 'isFirstEd', 'isSigned', 'isAltered']) {
      const missing = new URL(expected); missing.searchParams.delete(key);
      const duplicate = new URL(expected); duplicate.searchParams.append(key, duplicate.searchParams.get(key));
      const changed = new URL(expected); changed.searchParams.set(key, 'changed');
      for (const actual of [missing.href, duplicate.href, changed.href]) expect(sameDiscoveryPage(actual, expected)).toBe(false);
      expect(sameDiscoveryPage(missing.href, missing.href)).toBe(false);
    }
    expect(sameDiscoveryPage(expected.replace('Jolteon-UF8', 'Jolteon-V2-UF8'), expected)).toBe(false);
    expect(sameDiscoveryPage('not a URL', expected)).toBe(false);
  });
});

describe('confirmed Cardmarket discovery reuse', () => {
  it('materializes already collected offers only after explicit product and filter confirmation', () => {
    const data = snapshot();
    expect(materializeCardmarketDiscovery(card, data, undefined, now)).toBeNull();
    expect(materializeCardmarketDiscovery(item, data, { ...binding, confirmed: false }, now)).toBeNull();
    const capture = materializeCardmarketDiscovery(item, data, undefined, now);
    expect(capture).toMatchObject({ productUrl: product, filteredUrl: data.filteredUrl, filters: { language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false }, discoveryCoverage: data.coverage, complete: true });
    expect(capture).not.toHaveProperty('scope');
    expect(summarizeCardmarketOffers(item, capture, now)).toMatchObject({ status: 'ready', lowest: 100 });
    expect(card).not.toHaveProperty('cardmarketBinding');
    expect(item.overridePrice).toBe(110);
    expect(data).not.toHaveProperty('filters');
  });
  it('never reuses another entry, printing, or changed inventory identity', () => {
    for (const changes of [{ entryId: 'another' }, { inventoryKey: 'old' }, { productUrl: product.replace('Jolteon-UF8', 'Jolteon-V2-UF8') }]) expect(materializeCardmarketDiscovery(item, snapshot(changes), undefined, now)).toBeNull();
    for (const changes of [{ language: 'Japanese' }, { condition: 'NM' }, { isReverseHolo: true }, { number: '9' }]) expect(materializeCardmarketDiscovery({ ...item, ...changes }, snapshot(), undefined, now)).toBeNull();
    expect(materializeCardmarketDiscovery(item, snapshot(), { ...binding, inventoryKey: 'old' }, now)).toBeNull();
    expect(materializeCardmarketDiscovery(item, snapshot(), { ...binding, productUrl: `${product}?language=1` }, now)).toBeNull();
  });
  it('requires a fresh complete EUR browser snapshot', () => {
    const invalid = [{ scope: 'confirmed' }, { source: 'cardmarket-api' }, { currency: 'USD' }, { capturedAt: 'unknown' }, { capturedAt: new Date(now - 86400001).toISOString() }, { capturedAt: new Date(now + 300001).toISOString() }, { complete: false }, { complete: 'true' }, { moreAvailable: true }, { moreAvailable: undefined }, { moreAvailable: 'false' }, { error: 'Pagination failed' }, { offers: null }];
    for (const changes of invalid) expect(materializeCardmarketDiscovery(item, snapshot(changes), undefined, now)).toBeNull();
    expect(materializeCardmarketDiscovery(item, snapshot({ capturedAt: new Date(now - 86400000).toISOString() }), undefined, now)).not.toBeNull();
    expect(materializeCardmarketDiscovery(item, snapshot(), undefined, NaN)).toBeNull();
  });
  it('reuses only coverage containing the exact confirmed language and printing', () => {
    const full = snapshot().coverage;
    const covered = { ...full, languages: ['English', 'Japanese'], finishes: ['reverse', 'non-reverse'], editions: [true, false], minCondition: 'EX' };
    expect(materializeCardmarketDiscovery(item, snapshot({ coverage: covered }), undefined, now)).not.toBeNull();
    const invalid = [{ languages: ['Japanese'] }, { finishes: ['non-reverse'] }, { editions: [true] }, { minCondition: 'NM' }, { minCondition: 'invalid' }, { minCondition: 7 }, { signed: true }, { altered: true }];
    for (const changes of invalid) expect(materializeCardmarketDiscovery(item, snapshot({ coverage: { ...full, ...changes } }), undefined, now)).toBeNull();
  });
  it('never treats absent or malformed coverage as unrestricted', () => {
    for (const coverage of [undefined, null, {}, { ...snapshot().coverage, languages: undefined }, { ...snapshot().coverage, languages: [] }, { ...snapshot().coverage, languages: 'English' }, { ...snapshot().coverage, languages: ['English', 7] }, { ...snapshot().coverage, finishes: ['reverse', 'unknown'] }, { ...snapshot().coverage, editions: ['false'] }, { ...snapshot().coverage, signed: undefined }, { ...snapshot().coverage, altered: undefined }]) {
      expect(materializeCardmarketDiscovery(item, snapshot({ coverage }), undefined, now)).toBeNull();
    }
  });
  it('keeps independent offer validation after filtering broad evidence locally', () => {
    const offers = [offer(), offer({ offerId: 'articleRow1002', price: 20, language: 'Japanese' }), offer({ offerId: 'articleRow1003', price: 30, finish: 'non-reverse' }), offer({ offerId: 'articleRow1004', price: 40, firstEdition: true }), offer({ offerId: 'articleRow1005', price: 50, condition: 'NM' }), offer({ offerId: 'articleRow1006', price: 60, comments: 'CGC 9' })];
    const capture = materializeCardmarketDiscovery(item, snapshot({ offers }), undefined, now);
    expect(summarizeCardmarketOffers(item, capture, now)).toMatchObject({ status: 'ready', lowest: 100, excluded: 5 });
    expect(materializeCardmarketDiscovery(item, snapshot({ offers: [offer({ price: NaN })] }), undefined, now)).toBeNull();
    expect(materializeCardmarketDiscovery(item, snapshot({ offers: [offer({ offerId: 'unreadable' })] }), undefined, now)).toBeNull();
    expect(materializeCardmarketDiscovery(item, snapshot({ offers: [] }), undefined, now)).toMatchObject({ offers: [], complete: true });
  });
});
