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
