import { describe, expect, it } from 'vitest';
import { applySalesReport, buildSalesPreview, cardLadderIdentity, createSalesBinding, isComparableSale, parseSaleDate, parseSaleMoney, preserveCardLadderSalesPrice, salesWindow, saleStatistics, safeCardLadderImage, summarizeSales, validateSalesReport } from './cardLadderSales';
import { readCollectionRows, readSalesRows, resultCount } from '../../companion/cardladder/dom';

const now = Date.parse('2026-09-06T21:00:00Z');
const holding = { holdingId: 'lugia-holding', name: 'Lugia V', number: '186', set: '2022 Pokemon Sword & Shield Silver Tempest', variation: 'Alternate Full Art', gradingCompany: 'PSA', grade: '10', complete: true, sales: [] };
const item = { entryId: 'inventory-lugia', name: 'Lugia V', set: 'Sword & Shield Silver Tempest', number: '186', rarity: 'Alternate Full Art', isGraded: true, gradingCompany: 'PSA', grade: '10', source: 'cardladder', quantity: 3, buyPrice: 600, overridePrice: 1700, gradedPrice: 1233.68,
  cardladderData: { playerRaw: 'Lugia V', setRaw: 'Pokemon Sword & Shield Silver Tempest', year: '2022', variation: 'Alternate Full Art', slabSerial: 'SAMPLE-NOT-OWNED' } };
const sale = (price, soldDate, id = `${price}`) => ({ price, soldDate, url: `https://www.ebay.com/itm/${id}`, title: '2022 Pokemon Lugia V 186/195 Alt Art Silver Tempest PSA 10', type: 'Auction', currency: 'USD' });
const report = (sales, extra = {}) => ({ schemaVersion: 1, source: 'cardladder-browser', runId: 'run-1', collectionName: 'Inventory', collectionComplete: true, capturedAt: new Date(now).toISOString(), ...salesWindow(now), holdings: [{ ...holding, sales }], ...extra });

describe('CardLadder individual-sale pricing', () => {
  it('uses the highest individual sale, not averages or current values', () => {
    const result = applySalesReport([item], report([sale(1400, '2026-08-25'), sale(1525, '2026-08-29'), sale(5000, '2026-08-22'), sale(6000, '2026-09-07')]), now);
    expect(result.updatedCount).toBe(1);
    expect(result.items[0]).toMatchObject({ gradedPrice: 1525, gradedPriceCurrency: 'USD', quantity: 3, buyPrice: 600, overridePrice: 1700, cardladderPricing: { saleCount: 2, highSale: { price: 1525, soldDate: '2026-08-29' } } });
  });
  it('includes both date boundaries and rejects malformed dates/money', () => {
    expect(salesWindow(now)).toEqual({ startDate: '2026-08-23', endDate: '2026-09-06' });
    expect(summarizeSales({ ...holding, sales: [sale(100, '2026-08-23'), sale(200, '2026-09-06')] }, salesWindow(now)).saleCount).toBe(2);
    expect(parseSaleDate('Aug 29, 2026')).toBe('2026-08-29');
    for (const date of ['2026-02-31', '13/23/2026', 'unknown']) expect(parseSaleDate(date)).toBeNull();
    expect(parseSaleMoney('$1,525.00')).toBe(1525);
    for (const amount of ['$1.5k', '€1500.00', '$0.00', '$NaN', '$1,23.00', 'A$1500.00']) expect(parseSaleMoney(amount)).toBeNull();
  });
  it('deduplicates listing IDs without combining different sales', () => {
    const first = sale(1500, '2026-08-29', '123456789');
    const duplicate = { ...first, url: `${first.url}?nordt=true&utm_source=cardladder` };
    const result = summarizeSales({ ...holding, sales: [first, duplicate, sale(1500, '2026-08-29', '987654321')] }, salesWindow(now));
    expect(result.saleCount).toBe(2);
    expect(() => summarizeSales({ ...holding, sales: [first, { ...duplicate, price: 9999 }] }, salesWindow(now))).toThrow(/Conflicting/);
  });
  it('excludes lots, incorrect print/grade, and special slabs', () => {
    const good = sale(1500, '2026-08-29');
    expect(isComparableSale({ ...good, title: good.title.replace('PSA 10', 'PSA10') }, holding)).toBe(true);
    for (const title of ['Lugia V 186/195 PSA 9', 'Lugia V 186/195 PSA 10 lot of 2', 'Lugia V 185/195 PSA 10', 'Tatsugiri 186 PSA 10', 'Lugia V 186 CGC 10 pristine', 'Lugia V 186 PSA 10 Japanese', 'Lugia V 186 PSA 10 BGS 9']) expect(isComparableSale({ ...good, title }, holding)).toBe(false);
    const types = ['Auction', 'Fixed Price', 'Best Offer'];
    expect(summarizeSales({ ...holding, sales: types.map((type, i) => ({ ...sale(100 + i, '2026-08-29'), type })) }, salesWindow(now)).saleCount).toBe(3);
  });
  it('never replaces values after a failed capture or a no-sale window', () => {
    expect(applySalesReport([item], report([]), now).items).toEqual([item]);
    const incomplete = report([]); incomplete.holdings[0].complete = false;
    expect(buildSalesPreview([item], incomplete, now)[0].status).toBe('incomplete');
    expect(applySalesReport([item], incomplete, now).items).toEqual([item]);
  });
  it('rejects stale, future, wrong-collection, partial and oversized reports', () => {
    for (const changes of [{ collectionName: 'PC!' }, { collectionComplete: false }, { startDate: '2026-08-01' }, { capturedAt: '2026-09-04T00:00:00Z' }, { capturedAt: '2026-09-07T00:00:00Z' }]) expect(() => validateSalesReport(report([], changes), now)).toThrow();
    expect(() => validateSalesReport(report([], { holdings: Array(1001).fill(holding) }), now)).toThrow();
  });
});

describe('holding matching without certificate numbers', () => {
  it('matches exact print identities across CSV year/set formatting', () => {
    expect(cardLadderIdentity(item)).toBe(cardLadderIdentity(holding, true));
    expect(buildSalesPreview([item], report([sale(1525, '2026-08-29')]), now)[0].status).toBe('ready');
  });
  it('ignores conflicting or copied certificates entirely', () => {
    const input = report([sale(1525, '2026-08-29')]); input.holdings[0].certNumber = 'DIFFERENT';
    expect(buildSalesPreview([item], input, now)[0].status).toBe('ready');
    const wrongCard = { ...item, name: 'Umbreon', cardladderData: { ...item.cardladderData, playerRaw: 'Umbreon', slabSerial: 'DIFFERENT' } };
    expect(buildSalesPreview([wrongCard], input, now)[0].status).toBe('unmatched');
  });
  it('does not match another variation, language, year, grade or grader', () => {
    for (const wrong of [{ ...item, language: 'Japanese' }, { ...item, grade: '9' }, { ...item, gradingCompany: 'BGS' }, { ...item, cardladderData: { ...item.cardladderData, variation: 'Rainbow' } }, { ...item, cardladderData: { ...item.cardladderData, year: '2021' } }]) expect(buildSalesPreview([wrong], report([]), now)[0].status).toBe('unmatched');
  });
  it('requires an explicit link for ambiguous entries, remembers it, and invalidates changed identities', () => {
    const twin = { ...item, entryId: 'twin' };
    const input = report([sale(1525, '2026-08-29')]);
    expect(buildSalesPreview([item, twin], input, now)[0].status).toBe('ambiguous');
    const binding = { [holding.holdingId]: createSalesBinding(item, holding) };
    const result = applySalesReport([item, twin], input, now, binding);
    expect(result.updatedCount).toBe(1);
    expect(result.items[1]).toEqual(twin);
    expect(buildSalesPreview(result.items, input, now)[0].item.entryId).toBe(item.entryId);
    expect(buildSalesPreview([{ ...result.items[0], name: 'Umbreon V' }], input, now)[0].status).toBe('unmatched');
    const changed = { ...item, cardladderData: { ...item.cardladderData, variation: 'Rainbow' } };
    expect(applySalesReport([changed], input, now, binding).updatedCount).toBe(0);
  });
  it('does not let two source holdings claim a single inventory entry', () => {
    const input = report([sale(1525, '2026-08-29')]); input.holdings.push({ ...input.holdings[0], holdingId: 'another-holding' });
    expect(buildSalesPreview([item], input, now).map(row => row.status)).toEqual(['ambiguous', 'ambiguous']);
    expect(applySalesReport([item], input, now).updatedCount).toBe(0);
  });
  it('preserves evidence across CSV imports but does not transplant it into a new grade', () => {
    const priced = applySalesReport([item], report([sale(1525, '2026-08-29')]), now).items[0];
    expect(preserveCardLadderSalesPrice({ ...item, gradedPrice: 999 }, priced).gradedPrice).toBe(1525);
    expect(preserveCardLadderSalesPrice({ ...item, grade: '9', gradedPrice: 500 }, priced).gradedPrice).toBe(500);
    expect(preserveCardLadderSalesPrice({ ...item, gradedPrice: 500, cardladderData: { ...item.cardladderData, variation: 'Rainbow' } }, priced).gradedPrice).toBe(500);
  });
});

describe('rendered CardLadder DOM reader', () => {
  const stat = (label, value) => `<div class="stat-item"><label>${label}</label><div class="value"><span>${value}</span></div></div>`;
  it('reads variant chips separately from PSA grades, without capturing certs', () => {
    document.body.innerHTML = `<div>31 results </div><a class="card-list-item" href="/collection?cardId=holding-1&profile=collection"><div class="card-item-info"><div class="card-set">2021 Pokemon Evolving Skies</div><div class="card-name"><span>Umbreon VMAX</span><span> #215</span></div><div class="chips"><span class="grade-variation-chip variation">Secret</span><span class="grade-variation-chip psa-10">PSA 10</span></div></div></a>`;
    expect(readCollectionRows(document, undefined, 'USD')[0]).toMatchObject({ holdingId: 'holding-1', name: 'Umbreon VMAX', number: '215', variation: 'Secret', gradingCompany: 'PSA', grade: '10' });
    expect(readCollectionRows(document, undefined, 'USD')[0]).not.toHaveProperty('certNumber');
    expect(resultCount(document.body)).toBe(31);
  });
  it('extracts a dated individual sale and ignores shop listings', () => {
    document.body.innerHTML = `<a class="list-item" href="https://www.ebay.com/itm/123456789"><div class="sales-list-item-info"><div class="item-text">Lugia V 186 PSA 10</div><div class="platform-text">eBay - seller</div><i class="verified-icon">verified</i></div>${stat('Date Sold', 'Aug 29, 2026')}${stat('Type', 'Auction')}${stat('Price', '$1,525.00')}</a><a class="list-item">Shop: $9,000</a>`;
    expect(readSalesRows(document, 'USD')).toEqual([expect.objectContaining({ soldDate: '2026-08-29', price: 1525, currency: 'USD', type: 'Auction', verified: true })]);
    document.querySelectorAll('.value span')[2].textContent = '€1,525.00';
    expect(() => readSalesRows(document, 'USD')).toThrow(/could not be read as USD/);
  });
});


describe('reviewed additions from captured holdings', () => {
  it('adds only selected cards, records the high and binding, and never copies certificates', () => {
    const input = report([sale(1525, '2026-08-29')]);
    input.holdings[0].certNumber = 'EXAMPLE-CERT';
    const result = applySalesReport([], input, now, {}, { [holding.holdingId]: { quantity: 3, buyPrice: '600' } });
    expect(result).toMatchObject({ addedCount: 1, updatedCount: 0 });
    expect(result.items[0]).toMatchObject({ quantity: 3, buyPrice: 600, gradedPrice: 1525, isGraded: true, gradingCompany: 'PSA', grade: '10', cardladderData: { holdingId: holding.holdingId }, cardladderPricing: { highSale: { price: 1525 } } });
    expect(JSON.stringify(result.items)).not.toContain('EXAMPLE-CERT');
    expect(buildSalesPreview(result.items, input, now)[0].status).toBe('ready');
    expect(applySalesReport([], input, now).items).toEqual([]);
  });
  it('adds no-sale cards unpriced, keeps unknown costs absent, and links future prices', () => {
    const result = applySalesReport([], report([]), now, {}, { [holding.holdingId]: { quantity: 1, buyPrice: '' } });
    expect(result.items[0].gradedPrice).toBeNull();
    expect(result.items[0]).not.toHaveProperty('buyPrice');
    const later = applySalesReport(result.items, report([sale(100, '2026-08-29')]), now);
    expect(later.updatedCount).toBe(1);
    expect(later.items[0].gradedPrice).toBe(100);
  });
  it('does not duplicate existing or concurrently added cards or overwrite their quantity and cost', () => {
    const additions = { [holding.holdingId]: { quantity: 99, buyPrice: 1 } };
    const result = applySalesReport([item], report([]), now, {}, additions);
    expect(result).toMatchObject({ addedCount: 0, skippedAddCount: 1, items: [item] });
    const first = applySalesReport([], report([]), now, {}, additions);
    const retry = applySalesReport(first.items, report([]), now, {}, additions);
    expect(retry.items).toEqual(first.items);
    expect(retry.addedCount).toBe(0);
  });
  it('rejects invalid quantities, costs, unsupported cards and incomplete captures atomically', () => {
    for (const details of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: '' }, { quantity: 1, buyPrice: -1 }, { quantity: 1, buyPrice: 'bad' }]) {
      expect(() => applySalesReport([], report([]), now, {}, { [holding.holdingId]: details })).toThrow();
    }
    for (const changes of [{ complete: false }, { gradingCompany: 'BGS' }, { number: '' }]) {
      const input = report([]); Object.assign(input.holdings[0], changes);
      expect(() => applySalesReport([], input, now, {}, { [holding.holdingId]: { quantity: 1 } })).toThrow();
    }
  });
});


describe('per-card review selection', () => {
  it('leaves unchecked prices and additions untouched and supports deselect all', () => {
    const input = report([sale(1525, '2026-08-29')]);
    expect(applySalesReport([item], input, now, {}, {}, []).items).toEqual([item]);
    expect(applySalesReport([], input, now, {}, { [holding.holdingId]: { quantity: 2 } }, []).items).toEqual([]);
    expect(applySalesReport([item], input, now, {}, {}, [holding.holdingId]).updatedCount).toBe(1);
    expect(() => applySalesReport([item], input, now, {}, {}, ['not-in-capture'])).toThrow(/selected/);
  });
  it('selects one update without hiding duplicate claims from the safety check', () => {
    const input = report([sale(1525, '2026-08-29')]);
    input.holdings.push({ ...input.holdings[0], holdingId: 'duplicate' });
    expect(applySalesReport([item], input, now, {}, {}, [holding.holdingId]).items).toEqual([item]);
    input.holdings[1] = { ...input.holdings[1], name: 'Umbreon V', sales: [sale(1000, '2026-08-29')] };
    const other = { ...item, entryId: 'other', cardladderData: { ...item.cardladderData, playerRaw: 'Umbreon V' } };
    const result = applySalesReport([item, other], input, now, {}, {}, [holding.holdingId]);
    expect(result.updatedCount).toBe(1);
    expect(result.items[1]).toEqual(other);
  });
});


describe('sale anomaly review', () => {
  const sample = prices => prices.map((price, i) => sale(price, '2026-08-29', String(12340000 + i)));
  it('detects high and low extremes even when the high inflates standard deviation', () => {
    const stats = saleStatistics(sample([98, 99, 100, 101, 102, 500, 10]));
    expect(stats.median).toBe(100);
    expect(stats.standardDeviation).toBeGreaterThan(100);
    expect(stats.anomalies.map(s => [s.price, s.direction])).toEqual([[500, 'high'], [10, 'low']]);
    expect(stats.highIsAnomaly).toBe(true);
    expect(stats.highestUnflagged.price).toBe(102);
  });
  it('handles small samples, normal variation, identical prices and tied medians explicitly', () => {
    expect(saleStatistics(sample([100, 1000]))).toMatchObject({ sufficient: false, anomalies: [] });
    expect(saleStatistics(sample([90, 95, 100, 105, 110])).anomalies).toEqual([]);
    expect(saleStatistics(sample([100, 100, 100, 100, 100]))).toMatchObject({ standardDeviation: 0, anomalies: [] });
    expect(saleStatistics(sample([100, 100, 100, 100, 1000])).anomalies[0]).toMatchObject({ method: 'repeated-price', modifiedZScore: null });
  });
  it('uses only deduplicated, eligible sales in the capture window for its statistics', () => {
    const sales = sample([98, 99, 100, 101, 102]);
    const input = report([...sales, sales[0], sale(9000, '2026-08-01'), { ...sale(8000, '2026-08-29'), title: 'Lugia V 186 PSA 9' }]);
    expect(summarizeSales(input.holdings[0], salesWindow(now)).statistics).toMatchObject({ count: 5, mean: 100, median: 100, anomalies: [] });
  });
  it('skips an anomalous high automatically but permits an explicitly checked manual update', () => {
    const input = report(sample([98, 99, 100, 101, 102, 500]));
    expect(applySalesReport([item], input, now)).toMatchObject({ updatedCount: 0, anomalySkippedCount: 1, items: [item] });
    const approved = applySalesReport([item], input, now, {}, {}, [holding.holdingId]);
    expect(approved.items[0]).toMatchObject({ gradedPrice: 500, cardladderPricing: { statistics: { highIsAnomaly: true } } });
  });
});

describe('CardLadder reference images', () => {
  const imageUrl = 'https://d1htnxwo4o0jhw.cloudfront.net/cert/123/reference.jpg';
  it('imports a displayed thumbnail URL without turning its cert path into card identity', () => {
    document.body.innerHTML = `<a class="card-list-item" href="/collection?cardId=one"><img src="${imageUrl}"><div class="card-name">Lugia V #186</div><div class="grade-variation-chip">PSA 10</div></a>`;
    expect(readCollectionRows(document, undefined, 'USD')[0].imageUrl).toBe(imageUrl);
    const img = document.querySelector('img');
    img.setAttribute('src', 'data:image/gif;base64,placeholder');
    img.setAttribute('data-src', 'https://i.ebayimg.com/images/g/example/card.webp');
    expect(readCollectionRows(document, undefined, 'USD')[0].imageUrl).toBe('https://i.ebayimg.com/images/g/example/card.webp');
    expect(safeCardLadderImage('https://firebasestorage.googleapis.com/v0/b/cardladder-71d53.appspot.com/o/sales%2Fimage?alt=media')).toBeTruthy();
    expect(safeCardLadderImage('https://firebasestorage.googleapis.com/v0/b/other-bucket/o/image')).toBeNull();

    for (const url of ['javascript:alert(1)', 'http://d1htnxwo4o0jhw.cloudfront.net/x.jpg', 'https://untrusted.example/card.jpg', 'https://user:pass@d1htnxwo4o0jhw.cloudfront.net/x.jpg']) expect(safeCardLadderImage(url)).toBeNull();
  });
  it('adds reference images and fills missing ones without sales or overwriting owned photos', () => {
    const input = report([]); input.holdings[0].imageUrl = imageUrl;
    expect(applySalesReport([], input, now, {}, { [holding.holdingId]: { quantity: 1 } }).items[0].image).toBe(imageUrl);
    expect(buildSalesPreview([item], input, now)[0].status).toBe('image-only');
    expect(applySalesReport([item], input, now, {}, {}, [holding.holdingId])).toMatchObject({ imageUpdatedCount: 1, updatedCount: 0, items: [{ gradedPrice: item.gradedPrice, image: imageUrl }] });
    const own = { ...item, image: 'https://images.example/owned.jpg' };
    expect(applySalesReport([own], input, now).items).toEqual([own]);
    expect(applySalesReport([item], input, now, {}, {}, []).items).toEqual([item]);
  });
});

describe('explicit CardLadder Value fallback', () => {
  const fallbackReport = () => report([], { holdings: [{ ...holding, cardLadderValue: 1450, cardLadderValueCurrency: 'USD' }] });
  it('shows the estimate, but leaves all prices untouched without a separate opt-in', () => {
    const input = fallbackReport();
    expect(buildSalesPreview([item], input, now)[0]).toMatchObject({ fallbackValue: 1450, high: null, status: 'no-sales' });
    expect(applySalesReport([item], input, now).items).toEqual([item]);
    expect(applySalesReport([item], input, now, {}, {}, [holding.holdingId]).items).toEqual([item]);
    expect(applySalesReport([item], input, now, {}, {}, [holding.holdingId], [holding.holdingId])).toMatchObject({ updatedCount: 1, items: [{ gradedPrice: 1450, overridePrice: 1700, quantity: 3, buyPrice: 600, cardladderPricing: { method: 'cardladder-value', providerValue: 1450, highSale: null, saleCount: 0 } }] });
  });
  it('requires a complete no-sale window, valid USD estimate, and checked row', () => {
    expect(() => applySalesReport([item], fallbackReport(), now, {}, {}, null, [holding.holdingId])).toThrow(/explicit/);
    expect(() => applySalesReport([item], fallbackReport(), now, {}, {}, [], [holding.holdingId])).toThrow(/explicit/);
    for (const change of [{ complete: false }, { cardLadderValue: 0 }, { cardLadderValue: -1 }, { cardLadderValue: '1450' }, { cardLadderValue: Infinity }, { sales: [sale(1525, '2026-08-29')] }]) {
      const input = fallbackReport(); Object.assign(input.holdings[0], change);
      expect(buildSalesPreview([item], input, now)[0].fallbackValue).toBeNull();
      expect(() => applySalesReport([item], input, now, {}, {}, [holding.holdingId], [holding.holdingId])).toThrow(/no qualifying sales/);
    }
    expect(() => applySalesReport([item], fallbackReport(), now + 86400001, {}, {}, [holding.holdingId], [holding.holdingId])).toThrow(/stale/);
  });
  it('preserves manual prices and currencies and retains provenance across CSV imports', () => {
    const original = { ...item, overridePrice: 1900, overridePriceCurrency: 'EUR', manualPrice: 1850, manualPriceCurrency: 'GBP' };
    const priced = applySalesReport([original], fallbackReport(), now, {}, {}, [holding.holdingId], [holding.holdingId]).items[0];
    expect(priced).toMatchObject({ gradedPrice: 1450, gradedPriceCurrency: 'USD', overridePrice: 1900, overridePriceCurrency: 'EUR', manualPrice: 1850, manualPriceCurrency: 'GBP' });
    expect(preserveCardLadderSalesPrice({ ...item, gradedPrice: 1 }, priced)).toMatchObject({ gradedPrice: 1450, cardladderPricing: { method: 'cardladder-value' } });
  });
  it('supports explicitly added cards and refuses conflicting holding matches', () => {
    const input = fallbackReport();
    const additions = { [holding.holdingId]: { quantity: 2 } };
    expect(applySalesReport([], input, now, {}, additions, [holding.holdingId], [holding.holdingId])).toMatchObject({ addedCount: 1, items: [{ gradedPrice: 1450, quantity: 2 }] });
    expect(applySalesReport([], input, now, {}, additions, [holding.holdingId]).items[0].gradedPrice).toBeNull();
    input.holdings.push({ ...input.holdings[0], holdingId: 'duplicate' });
    expect(applySalesReport([item], input, now, {}, {}, [holding.holdingId], [holding.holdingId]).items).toEqual([item]);
  });
  it('reads the exact Value field instead of profit or an old sale', () => {
    document.body.innerHTML = '<a class="card-list-item" href="/collection?cardId=x"><div class="card-name">Lugia V #186</div><span class="grade-variation-chip">PSA 10</span><div class="stat-item"><label>Profit</label><div class="value">$300.00</div></div><div class="stat-item"><label>Value</label><div class="value">$1,233.68</div></div></a>';
    expect(readCollectionRows(document, undefined, 'USD')[0]).toMatchObject({ cardLadderValue: 1233.68, cardLadderValueCurrency: 'USD' });
    document.querySelectorAll('.value')[1].textContent = '€1,233.68';
    expect(readCollectionRows(document, undefined, 'USD')[0].cardLadderValue).toBeNull();
  });
});
