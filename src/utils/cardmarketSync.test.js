import { describe, expect, it } from 'vitest';
import { applyCardmarketCaptures, cardmarketInventoryKey, cardmarketTarget, createCardmarketBinding, parseCardmarketEuro, safeCardmarketProduct, summarizeCardmarketOffers } from './cardmarketSync';
const now = Date.parse('2026-09-07T02:00:00Z');
const url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8';
const base = { entryId: 'jolteon', name: 'Jolteon', set: 'EX Unseen Forces', number: '8', language: 'English', condition: 'LP', isReverseHolo: true, overridePrice: 110, overridePriceCurrency: 'EUR', quantity: 1, buyPrice: 80 };
const match = { productUrl: url, productTitle: 'Jolteon (UF 8)', confirmed: true, language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false };
const item = { ...base, cardmarketBinding: createCardmarketBinding(base, match) };
const offer = (price, seller = `Seller${price}`) => ({ offerId: `articleRow${price}${seller.length}`, price, seller, currency: 'EUR', language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false, signed: false, altered: false, comments: '' });
const capture = (offers = [90, 95, 100, 110, 120, 250].map(p => offer(p))) => ({ entryId: item.entryId, source: 'cardmarket-browser', productUrl: url, currency: 'EUR', capturedAt: new Date(now).toISOString(), inventoryKey: cardmarketInventoryKey(item), filters: { language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false }, complete: true, offers });

describe('Cardmarket identity and variant mapping', () => {
  it('uses reverse/edition tags and exposes the condition-scale translation', () => {
    expect(cardmarketTarget(base)).toMatchObject({ language: 'English', finish: 'reverse', condition: 'EX', conditionNeedsReview: true });
    expect(cardmarketTarget({ ...base, isUnlimited: true }).firstEdition).toBe(false);
    expect(cardmarketTarget({ ...base, isReverseHolo: false }).finish).toBeNull();
  });
  it('requires review for ambiguous, conflicting, or special attributes', () => {
    for (const field of ['isStampedPromo', 'isSealed', 'isAutographed', 'isPokeBall', 'isMasterBall']) {
      expect(cardmarketTarget({ ...base, [field]: true }).issues.length).toBeGreaterThan(0);
      expect(() => createCardmarketBinding({ ...base, [field]: true }, match)).toThrow(/specialist/);
    }
    expect(() => createCardmarketBinding({ ...base, isUnlimited: true, isFirstEdition: true }, match)).toThrow();
    expect(() => createCardmarketBinding(base, { ...match, finish: 'non-reverse' })).toThrow(/conflict/);
    expect(() => createCardmarketBinding(base, { ...match, confirmed: false })).toThrow(/Confirm/);
  });
  it('keeps Japanese printings separate and detects an English/Japanese conflict', () => {
    const jp = { ...base, name: 'Charizard 1st Edition', set: 'Japanese Expedition', number: '103', language: '', isReverseHolo: false, isFirstEdition: true, condition: 'NM' };
    expect(cardmarketTarget(jp)).toMatchObject({ language: 'Japanese', firstEdition: true, condition: 'NM' });
    expect(() => createCardmarketBinding(jp, { ...match, firstEdition: true, finish: 'non-reverse' })).toThrow(/conflict/);
    const wrongLanguage = { ...jp, language: 'English' };
    expect(cardmarketTarget(wrongLanguage)).toMatchObject({ language: 'Japanese' });
    expect(cardmarketTarget(wrongLanguage).issues.join(' ')).toMatch(/language conflicts/);
    expect(createCardmarketBinding(wrongLanguage, { ...match, language: 'Japanese', condition: 'NM', firstEdition: true, finish: 'non-reverse' })).toMatchObject({ language: 'Japanese', inventoryKey: cardmarketInventoryKey(wrongLanguage) });
    expect(wrongLanguage.language).toBe('English');
  });
  it('invalidates a saved link after any meaningful identity or tag edit', () => {
    for (const changes of [{ name: 'Raichu' }, { number: '7' }, { set: 'Delta Species' }, { language: 'Japanese' }, { condition: 'NM' }, { isFirstEdition: true }, { isReverseHolo: false }, { isMasterBall: true }, { isGraded: true }, { tags: ['error'] }]) expect(summarizeCardmarketOffers({ ...item, ...changes }, capture(), now).status).toBe('needs-match');
    expect(summarizeCardmarketOffers({ ...item, quantity: 4, overridePrice: 500 }, capture(), now).status).toBe('ready');
    const reordered = Object.fromEntries(Object.entries(item.cardmarketBinding).reverse());
    expect(summarizeCardmarketOffers({ ...item, cardmarketBinding: reordered }, capture(), now).status).toBe('ready');
  });
  it('accepts only explicit Cardmarket Pokémon single-product URLs and EUR formatting', () => {
    expect(safeCardmarketProduct(`${url}?isReverseHolo=N#offers`)).toBe(url);
    for (const value of ['http://www.cardmarket.com/en/Pokemon/Products/Singles/a/b', 'https://evil.example/en/Pokemon/Products/Singles/a/b', 'https://www.cardmarket.com/en/Pokemon/Cards/Jolteon', 'https://x@www.cardmarket.com/en/Pokemon/Products/Singles/a/b']) expect(safeCardmarketProduct(value)).toBeNull();
    expect(parseCardmarketEuro('1.234,56 €')).toBe(1234.56);
    for (const value of ['$1,234.56', '1,234.56 €', '€1234', '1.2k €', '0,00 €']) expect(parseCardmarketEuro(value)).toBeNull();
  });
});

describe('variant-specific asking-price evidence', () => {
  it('uses one lowest price per seller and computes a median of the five lowest sellers', () => {
    const data = capture([...capture().offers, offer(50, 'Seller90'), offer(800, 'Seller90')]);
    expect(summarizeCardmarketOffers(item, data, now)).toMatchObject({ status: 'ready', lowest: 50, medianLowestFive: 100, sellerCount: 6 });
  });
  it('filters every offer independently, including unknown attributes and graded comments', () => {
    const bad = [{ language: 'German' }, { condition: 'NM' }, { finish: 'non-reverse' }, { firstEdition: true }, { signed: true }, { altered: true }, { firstEdition: undefined }, { comments: 'CGC 8.5 cert' }].map((attrs, i) => ({ ...offer(i + 1), ...attrs }));
    expect(summarizeCardmarketOffers(item, capture([...bad, offer(100)]), now)).toMatchObject({ sellerCount: 1, lowest: 100, excluded: bad.length });
  });
  it('does not turn generic averages, partial scans, wrong filters, or old reports into a price', () => {
    for (const changes of [{ complete: false }, { capturedAt: new Date(now - 86400001).toISOString() }, { capturedAt: new Date(now + 360000).toISOString() }, { currency: 'USD' }, { source: 'cardmarket-api' }, { inventoryKey: 'other' }, { filters: { ...capture().filters, language: 'Japanese' } }]) expect(summarizeCardmarketOffers(item, { ...capture(), ...changes }, now).status).not.toBe('ready');
    expect(summarizeCardmarketOffers(item, capture([]), now)).toMatchObject({ status: 'no-offers', lowest: null, medianLowestFive: null });
    expect(() => summarizeCardmarketOffers(item, capture([offer(NaN)]), now)).toThrow(/unreadable/);
  });
  it('flags thin markets and unusually cheap asks for review', () => {
    expect(summarizeCardmarketOffers(item, capture([10, 90, 100].map(p => offer(p))), now).warnings).toHaveLength(2);
  });
});

describe('explicit application of reviewed Cardmarket estimates', () => {
  const choice = { entryId: item.entryId, method: 'median-lowest-five', replaceManual: true };
  it('leaves unchecked cards untouched and replaces manual prices only explicitly', () => {
    expect(applyCardmarketCaptures([item], [capture()], [], now).items).toEqual([item]);
    const preserved = applyCardmarketCaptures([item], [capture()], [{ ...choice, replaceManual: false }], now).items[0];
    expect(preserved).toMatchObject({ overridePrice: 110, cardmarketPricing: { price: 100, kind: 'asking-price', replacedManual: false } });
    const applied = applyCardmarketCaptures([item], [capture()], [choice], now).items[0];
    expect(applied).toMatchObject({ overridePrice: 100, overridePriceCurrency: 'EUR', buyPrice: 80, quantity: 1, cardmarketPricing: { previousManual: { overridePrice: 110 }, replacedManual: true } });
  });
  it('rechecks current inventory, selection uniqueness, stale evidence, and removed cards', () => {
    expect(() => applyCardmarketCaptures([item], [capture()], [choice, choice], now)).toThrow();
    expect(() => applyCardmarketCaptures([item], [capture(), capture()], [choice], now)).toThrow();
    expect(() => applyCardmarketCaptures([{ ...item, condition: 'MP' }], [capture()], [choice], now)).toThrow();
    expect(() => applyCardmarketCaptures([], [capture()], [choice], now)).toThrow(/removed/);
    expect(() => applyCardmarketCaptures([item], [capture()], [choice], now + 86400001)).toThrow(/expire/);
    expect(() => applyCardmarketCaptures([{ ...item, cardmarketPricing: { capturedAt: new Date(now + 5000).toISOString() } }], [capture()], [choice], now)).toThrow(/newer/);
  });
});

it('supports choosing any matching offer, preserves seller type, and rejects missing or foreign selections', () => {
  const first = { ...offer(90, 'SameSeller'), offerId: 'articleRow1001', sellerType: 'Professional' };
  const second = { ...offer(120, 'SameSeller'), offerId: 'articleRow1002', sellerType: 'Professional' };
  const data = capture([first, second]);
  expect(summarizeCardmarketOffers(item, data, now).offers).toHaveLength(2);
  const choice = { entryId: item.entryId, method: 'selected-offer', offerId: second.offerId, replaceManual: true };
  expect(applyCardmarketCaptures([item], [data], [choice], now).items[0]).toMatchObject({ overridePrice: 120, cardmarketPricing: { method: 'selected-offer', selectedOffer: { offerId: 'articleRow1002', sellerType: 'Professional' } } });
  for (const id of [undefined, 'articleRow999']) expect(() => applyCardmarketCaptures([item], [data], [{ ...choice, offerId: id }], now)).toThrow(/pricing method/);
  expect(summarizeCardmarketOffers(item, capture([{ ...offer(90), comments: 'Bgs9' }, { ...offer(100), comments: 'Global Grading 8' }]), now).offers).toHaveLength(0);
});
