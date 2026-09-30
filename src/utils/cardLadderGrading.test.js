import { describe, expect, it } from 'vitest';
import { applySalesReport, buildSalesPreview, cardLadderIdentity, createSalesBinding, isComparableSale, salesWindow, summarizeSales } from './cardLadderSales';

const now = Date.parse('2026-09-30T12:00:00Z');
const window = salesWindow(now);
const base = { holdingId: 'lugia', name: 'Lugia V', number: '186', set: 'Silver Tempest', variation: '', currency: 'EUR', complete: true };
const sale = (label, price = 100, soldDate = '2026-09-29', id = '12345678') => ({ title: `Lugia V 186/195 ${label}`, price, soldDate, currency: 'EUR', type: 'Auction', url: `https://www.ebay.com/itm/${id}` });
const capture = holding => ({ schemaVersion: 2, source: 'cardladder-browser', runId: 'grades', collectionName: 'Inventory', collectionComplete: true, currency: 'EUR', capturedAt: new Date(now).toISOString(), ...window, holdings: [holding] });
const itemFor = holding => ({ ...holding, entryId: 'owned', isGraded: true, quantity: 3, buyPrice: 65, overridePrice: 80, gradedPrice: 70 });

describe('general BGS and CGC sync', () => {
  it.each(['BGS', 'CGC'])('adds and updates every numeric %s grade while preserving costs and stickers', company => {
    for (let value = 1; value <= 10; value += 0.5) {
      const grade = String(value);
      const holding = { ...base, gradingCompany: company, grade, sales: [sale(`${company} ${grade}`)] };
      const report = capture(holding);
      const result = applySalesReport([itemFor(holding)], report, now);
      expect(result.updatedCount, `${company} ${grade}`).toBe(1);
      expect(result.items[0]).toMatchObject({ gradingCompany: company, grade, gradedPrice: 100, quantity: 3, buyPrice: 65, overridePrice: 80 });
      const added = applySalesReport([], report, now, {}, { lugia: { quantity: 2 } });
      expect(added.addedCount).toBe(1);
      expect(added.items[0]).toMatchObject({ gradingCompany: company, grade, gradedPrice: 100, quantity: 2 });
    }
  });

  it.each([
    ['BGS', '10', 'BGS Pristine 10'],
    ['BGS', '10', 'Beckett 10 Gold Label'],
    ['BGS', '10 Black Label', 'BGS 10 Black Label'],
    ['BGS', '10 Black Label', 'BGS 10 BL'],
    ['BGS', '10 Black Label', 'BGS 10 Blacklabel'],
    ['CGC', '10', 'CGC Gem Mint 10'],
    ['CGC', '10 Pristine', 'CGC Pristine 10'],
    ['CGC', '10 Perfect', 'CGC 10 Perfect'],
    ['CGC', '10 Pristine', 'CGC Pristine10'],
    ['CGC', '10 Perfect', 'CGC Perfect10'],
  ])('keeps %s %s comparable with its exact sale tier', (gradingCompany, grade, label) => {
    const holding = { ...base, gradingCompany, grade, sales: [sale(label)] };
    expect(summarizeSales(holding, window).high?.price).toBe(100);
    expect(applySalesReport([], capture(holding), now, {}, { lugia: { quantity: 1 } }).items[0]).toMatchObject({ gradingCompany, grade });
  });

  it.each([
    ['BGS', '9.5', 'BGS 9'], ['BGS', '9', 'BGS 9.5'],
    ['BGS', '10', 'BGS 10 Black Label'], ['BGS', '10 Black Label', 'BGS 10 Pristine'],
    ['BGS', '10', 'BGS 10 BL'], ['BGS', '10', 'BGS 10 Blacklabel'],
    ['BGS', '10', 'BGS 10B'], ['BGS', '10 Black Label', 'BGS 10 Gold Label Black Label'],
    ['BGS', '10', 'BGS 10 (B)'], ['BGS', '10', 'BGS 10 [B]'],
    ['BGS', '10', 'BGS 10 (Black)'], ['BGS', '10', 'BGS 10: Black'],
    ['CGC', '10', 'CGC 10 Pristine'], ['CGC', '10 Pristine', 'CGC 10'],
    ['CGC', '10', 'CGC Pristine10'], ['CGC', '10', 'CGC Perfect10'],
    ['CGC', '10 Pristine', 'CGC 10 Gem Mint Pristine'],
    ['CGC', '10 Perfect', 'CGC 10 Pristine'], ['CGC', '9.5', 'CGC 10'],
    ['CGC', '8', 'CGC 8 PSA 10'], ['BGS', '8', 'BGS 8 CGC 8'],
  ])('rejects %s %s versus %s', (gradingCompany, grade, label) => {
    expect(isComparableSale(sale(label), { ...base, gradingCompany, grade })).toBe(false);
  });

  it('normalizes grade aliases in matching without binding different tiers', () => {
    const holding = { ...base, gradingCompany: 'BGS', grade: '10 Pristine', sales: [sale('BGS 10 Pristine')] };
    const item = itemFor({ ...holding, gradingCompany: 'Beckett', grade: 10 });
    expect(cardLadderIdentity(item)).toBe(cardLadderIdentity(holding, true));
    expect(buildSalesPreview([item], capture(holding), now)[0].status).toBe('ready');
    const black = { ...item, grade: '10 Black Label' };
    const binding = { lugia: createSalesBinding(black, holding) };
    expect(applySalesReport([black], capture(holding), now, binding).updatedCount).toBe(0);
    expect(buildSalesPreview([black], capture(holding), now)[0].status).toBe('unmatched');
  });

  it('does not apply provider values from unknown qualifiers or unsupported graders', () => {
    for (const [gradingCompany, grade] of [['CGC', '10 Unknown'], ['BGS', '9 Black Label'], ['SGC', '10']]) {
      const holding = { ...base, gradingCompany, grade, sales: [], cardLadderValue: 999, cardLadderValueCurrency: 'EUR' };
      expect(buildSalesPreview([itemFor(holding)], capture(holding), now)[0].fallbackValue).toBeNull();
      expect(() => applySalesReport([], capture(holding), now, {}, { lugia: { quantity: 1 } })).toThrow();
    }
  });
});

describe('last matching sale as pricing context', () => {
  const holding = { ...base, gradingCompany: 'CGC', grade: '9.5' };
  it('shows the newest comparable sale separately from the highest sale', () => {
    const latest = sale('CGC 9.5', 75, '2026-09-29', '11');
    const high = sale('CGC 9.5', 150, '2026-09-20', '22');
    const summary = summarizeSales({ ...holding, sales: [high, sale('CGC 10', 999, '2026-09-30'), latest] }, window);
    expect(summary.high).toEqual(high);
    expect(summary.latestSale).toEqual(latest);
    expect(summary.saleCount).toBe(2);
  });

  it('shows an older last sale without using it as a 14-day high or applying it automatically', () => {
    const latestSale = sale('CGC 9.5', 250, '2026-08-05');
    const captured = { ...holding, sales: [], latestSale };
    expect(summarizeSales(captured, window)).toMatchObject({ latestSale, status: 'no-sales', high: null, saleCount: 0, statistics: null });
    const item = itemFor(captured);
    expect(applySalesReport([item], capture(captured), now).items).toEqual([item]);
  });

  it('rejects corrupted last-sale evidence and mismatched grades', () => {
    for (const change of [{ title: 'Lugia V 186 CGC 10' }, { url: 'javascript:alert(1)' }, { price: -1 }, { soldDate: '2026-10-01' }, { currency: 'USD' }]) {
      expect(() => summarizeSales({ ...holding, sales: [], latestSale: { ...sale('CGC 9.5'), ...change } }, window)).toThrow();
    }
    const record = sale('CGC 9.5');
    expect(() => summarizeSales({ ...holding, sales: [record], latestSale: { ...record, price: 101 } }, window)).toThrow(/Conflicting/);
  });

  it('keeps older report support and suppresses context from incomplete captures', () => {
    expect(summarizeSales({ ...holding, sales: [sale('CGC 9.5')] }, window).latestSale?.price).toBe(100);
    expect(summarizeSales({ ...holding, complete: false, sales: [], latestSale: sale('CGC 9.5') }, window).latestSale).toBeNull();
  });
});

describe('Rayquaza fractional card numbers and unpriced additions', () => {
  const rayquaza = { ...base, holdingId: 'rayquaza', name: 'Rayquaza', number: '3/17', set: '2004 Pokemon POP Series 1', variation: 'Non Holo', gradingCompany: 'CGC', grade: '10' };
  const raySale = title => ({ ...sale('CGC 10', 114.40, '2024-04-27', '135032596323'), title });
  it.each([
    'GEM MINT CGC 10 Rayquaza 3/17 POP Series 1 Pokemon TCG',
    'Rayquaza #003/017 CGC 10',
    'Rayquaza #3 CGC 10',
  ])('recognizes the card number in %s', title => {
    expect(isComparableSale(raySale(title), rayquaza)).toBe(true);
  });
  it.each([
    'Rayquaza 17/3 CGC 10', 'Rayquaza 3/18 CGC 10', 'Rayquaza 4/17 CGC 10',
    'Rayquaza 17 CGC 10', 'Rayquaza CGC 10', 'Rayquaza 3/17 CGC 9.5',
  ])('rejects a different or missing number/grade in %s', title => {
    expect(isComparableSale(raySale(title), rayquaza)).toBe(false);
  });
  it('does not mistake the grade for a card number and preserves alphanumeric numbers', () => {
    expect(isComparableSale(raySale('Rayquaza #9 CGC 3'), { ...rayquaza, grade: '3' })).toBe(false);
    for (const title of ['Rayquaza TG03 CGC 10', 'Rayquaza TG3/TG30 CGC 10']) {
      expect(isComparableSale(raySale(title), { ...rayquaza, number: 'TG03' })).toBe(true);
    }
  });
  it('adds an explicitly selected incomplete capture without any market/sticker evidence', () => {
    const partial = { ...rayquaza, complete: false, sales: [raySale('Rayquaza 3/17 CGC 10')], latestSale: raySale('Rayquaza 3/17 CGC 10'), cardLadderValue: 999, cardLadderValueCurrency: 'EUR' };
    const report = capture(partial);
    const details = { rayquaza: { quantity: 2, buyPrice: 80, buyPriceCurrency: 'EUR' } };
    const result = applySalesReport([], report, now, {}, details, ['rayquaza'], [], { updateStickerPrices: true });
    expect(result).toMatchObject({ addedCount: 1, updatedCount: 0, stickerUpdatedCount: 0 });
    const item = result.items[0];
    expect(item).toMatchObject({ name: 'Rayquaza', number: '3/17', gradingCompany: 'CGC', grade: '10', gradedPrice: null, quantity: 2, buyPrice: 80 });
    expect(item).not.toHaveProperty('overridePrice');
    expect(item).not.toHaveProperty('cardladderPricing');
    expect(buildSalesPreview(result.items, report, now)[0]).toMatchObject({ status: 'incomplete', high: null, latestSale: null, fallbackValue: null });
    expect(applySalesReport([], report, now, {}, details, []).items).toEqual([]);
    const retry = applySalesReport(result.items, report, now, {}, details, ['rayquaza']);
    expect(retry).toMatchObject({ addedCount: 0, skippedAddCount: 1, items: result.items });
    const fresh = capture({ ...partial, complete: true, latestSale: null, sales: [{ ...raySale('Rayquaza 3/17 CGC 10'), soldDate: '2026-09-29' }] });
    const priced = applySalesReport(result.items, fresh, now);
    expect(priced.items[0]).toMatchObject({ entryId: item.entryId, gradedPrice: 114.40, quantity: 2, buyPrice: 80 });
    expect(priced.addedCount).toBe(0);
  });
  it('retains the distinction between a complete pricing window and incomplete older history', () => {
    expect(summarizeSales({ ...rayquaza, sales: [], latestSale: null, latestSaleComplete: false }, window)).toMatchObject({ status: 'no-sales', latestSale: null, latestSaleComplete: false, high: null });
  });
});
