import { describe, expect, it } from 'vitest';
import { CARD_LADDER_CURRENCIES, currencyFromAccountLabel, formatCardLadderMoney, parseCardLadderMoney } from './cardLadderCurrency';
import { applySalesReport, buildSalesPreview, preserveCardLadderSalesPrice, salesWindow, validateSalesReport } from './cardLadderSales';
import { readAccountCurrency, readCollectionRows, readSalesRows } from '../../companion/cardladder/dom';
import { computeItemMetrics, convertCurrency } from './cardHelpers';

const now = Date.parse('2026-09-11T19:00:00Z');
const item = { entryId: 'lugia', name: 'Lugia V', set: 'Silver Tempest', number: '186', gradingCompany: 'PSA', grade: '10', isGraded: true, quantity: 2, gradedPrice: 1500, gradedPriceCurrency: 'USD', buyPrice: 800, buyPriceCurrency: 'GBP', overridePrice: 1700, overridePriceCurrency: 'EUR' };
const makeReport = currency => ({ schemaVersion: 2, source: 'cardladder-browser', runId: 'currency-test', capturedAt: new Date(now).toISOString(), ...salesWindow(now), currency, collectionName: 'Inventory', collectionComplete: true,
  holdings: [{ holdingId: 'one', name: 'Lugia V', set: 'Silver Tempest', number: '186', gradingCompany: 'PSA', grade: '10', complete: true, currency, cardLadderValue: 1000, cardLadderValueCurrency: currency,
    sales: [{ title: 'Lugia V 186 PSA 10', price: 1200, currency, soldDate: '2026-09-10', type: 'Auction', url: 'https://www.ebay.com/itm/123456789' }] }] });

describe('CardLadder display currencies', () => {
  it.each(Object.entries(CARD_LADDER_CURRENCIES))('reads the selected %s account preference and its price symbols', (code, { label, tokens }) => {
    document.body.innerHTML = `<div class="input"><label>Currency</label><div class="value">${label}</div></div><ul><li>United States Dollar ($)</li></ul>`;
    expect(readAccountCurrency(document)).toBe(code);
    expect(currencyFromAccountLabel(label)).toBe(code);
    for (const token of tokens) {
      expect(parseCardLadderMoney(`${token}1,234.56`, code)).toBe(1234.56);
      expect(parseCardLadderMoney(`1.234,56 ${token}`, code)).toBe(1234.56);
    }
  });
  it('rejects ambiguous currency symbols without the account setting', () => {
    for (const value of ['$100', '¥100', 'kr100', '€100']) expect(parseCardLadderMoney(value)).toBeNull();
    expect(currencyFromAccountLabel('Dollar ($)')).toBeNull();
    expect(() => readSalesRows(document)).toThrow(/display currency/);
  });
  it('supports grouping and decimal formats while rejecting malformed, foreign and abbreviated values', () => {
    for (const value of ['€1,234.56', '1.234,56 €', '1 234,56 EUR', 'EUR 1\u202f234.56', "€1'234.56"]) expect(parseCardLadderMoney(value, 'EUR')).toBe(1234.56);
    expect(parseCardLadderMoney('¥154,250', 'JPY')).toBe(154250);
    for (const value of ['$12', 'EUR 12 USD', '€1,23,45', '€1.2k', '€NaN', '€-1', '€0', '€1,234 567', '€1,234.567.89', '€1,23.45', '12', '€12€']) expect(parseCardLadderMoney(value, 'EUR')).toBeNull();
    expect(parseCardLadderMoney('A$123', 'CAD')).toBeNull();
    expect(formatCardLadderMoney(100, 'CAD')).toContain('CAD');
    expect(formatCardLadderMoney(100, 'USD')).toContain('USD');
  });
  it('reads the observed EUR sales format and records the currency on sales and provider values', () => {
    document.body.innerHTML = '<a class="list-item" href="https://www.ebay.com/itm/278362996830"><div class="sales-list-item-info"><div class="item-text">Lugia V 186 PSA 10</div></div><div class="stat-item"><label>Date Sold</label><div class="value">Sep 11, 2026</div></div><div class="stat-item"><label>Price</label><div class="value">€5.12</div></div><div class="stat-item"><label>Type</label><div class="value">Fixed Price</div></div></a>';
    expect(readSalesRows(document, 'EUR')[0]).toMatchObject({ soldDate: '2026-09-11', price: 5.12, currency: 'EUR' });
    expect(() => readSalesRows(document, 'USD')).toThrow(/read as USD/);
    document.body.innerHTML = '<a class="card-list-item" href="/collection?cardId=one"><div class="card-name">Lugia V #186</div><div class="stat-item"><label>Value</label><div class="value">€989.69</div></div></a>';
    expect(readCollectionRows(document, undefined, 'EUR')[0]).toMatchObject({ currency: 'EUR', cardLadderValue: 989.69, cardLadderValueCurrency: 'EUR' });
  });
});

describe('multicurrency inventory evidence', () => {
  it.each(Object.keys(CARD_LADDER_CURRENCIES))('saves %s amounts without relabelling or overwriting manual prices/costs', currency => {
    const input = makeReport(currency);
    expect(buildSalesPreview([item], input, now)[0]).toMatchObject({ currency, previousCurrency: 'USD', previousPrice: 1500, status: 'ready' });
    const saved = applySalesReport([item], input, now).items[0];
    expect(saved).toMatchObject({ gradedPrice: 1200, gradedPriceCurrency: currency, overridePrice: 1700, overridePriceCurrency: 'EUR', buyPrice: 800, buyPriceCurrency: 'GBP', quantity: 2,
      cardladderPricing: { currency, highSale: { currency, price: 1200 } } });
    expect(preserveCardLadderSalesPrice({ ...item, gradedPrice: 1 }, saved).gradedPriceCurrency).toBe(currency);
    const unpriced = { ...saved, overridePrice: null };
    expect(computeItemMetrics(unpriced, currency).suggested).toBe(1200);
    expect(computeItemMetrics(unpriced, 'EUR').suggested).toBeCloseTo(convertCurrency(1200, 'EUR', currency));
  });
  it('preserves fallback opt-in and captures purchase cost in the explicitly selected currency', () => {
    const input = makeReport('EUR'); input.holdings[0].sales = [];
    expect(applySalesReport([item], input, now).items).toEqual([item]);
    const chosen = applySalesReport([item], input, now, {}, {}, ['one'], ['one']).items[0];
    expect(chosen).toMatchObject({ gradedPrice: 1000, gradedPriceCurrency: 'EUR', cardladderPricing: { method: 'cardladder-value', currency: 'EUR', highSale: null } });
    const added = applySalesReport([], input, now, {}, { one: { quantity: 1, buyPrice: '650', buyPriceCurrency: 'GBP' } }, ['one'], ['one']).items[0];
    expect(added).toMatchObject({ buyPrice: 650, buyPriceCurrency: 'GBP', gradedPriceCurrency: 'EUR' });
  });
  it('fails closed for mixed, missing and unsupported currencies, including legacy reports', () => {
    for (const mutate of [r => { r.currency = 'CAD'; }, r => { delete r.currency; }, r => { r.holdings[0].sales[0].currency = 'USD'; }, r => { r.holdings[0].cardLadderValueCurrency = 'USD'; }, r => { delete r.holdings[0].currency; }, r => { r.schemaVersion = 1; }]) {
      const input = makeReport('EUR'); mutate(input);
      expect(() => applySalesReport([item], input, now)).toThrow(/currenc/);
    }
    expect(() => validateSalesReport(makeReport('XYZ'), now)).toThrow(/currency/);
    const legacy = makeReport('USD'); legacy.schemaVersion = 1; delete legacy.currency; delete legacy.holdings[0].currency;
    expect(applySalesReport([item], legacy, now).items[0].gradedPriceCurrency).toBe('USD');
  });
});
