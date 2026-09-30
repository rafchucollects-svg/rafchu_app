import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCollectionRows, resultCount } from '../../companion/cardladder/dom.js';
import { readSalesDestination, salesGrading } from '../../companion/cardladder/grading.js';

const ORIGIN = 'https://app.cardladder.com';
const holding = { name: 'Lugia V', number: '186', set: '2022 Pokemon Silver Tempest', variation: '', gradingCompany: 'BGS', grade: '10', currency: 'USD' };
const salesUrl = (grader, grade, id) => `${ORIGIN}/sales-history?filters=grader:${grader}|grade:${grade}|profileId:${id}&sort=date&direction=desc`;

beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

it.each([['1 result', 1], ['0 results', 0], ['1,234 results', 1234]])('reads the rendered result count %s', (text, count) => {
  document.body.textContent = text;
  expect(resultCount(document.body)).toBe(count);
});

it.each([
  ['BGS 10 Pristine', 'BGS', '10'], ['BGS 10 Black Label', 'BGS', '10 Black Label'],
  ['BGS 9.5', 'BGS', '9.5'], ['BGS 3', 'BGS', '3'], ['CGC 10', 'CGC', '10'],
  ['CGC 10 Pristine', 'CGC', '10 Pristine'], ['CGC 10 Perfect', 'CGC', '10 Perfect'],
  ['CGC 8.5', 'CGC', '8.5'], ['CGC 1', 'CGC', '1'],
])('preserves the exact collection grading label %s', (label, company, grade) => {
  document.body.innerHTML = `<a class="card-list-item" href="/collection?cardId=one"><span class="card-name">Lugia V #186</span><span class="card-set">2022 Pokemon Silver Tempest</span><span class="grade-variation-chip">${label}</span></a>`;
  expect(readCollectionRows(document, ORIGIN, 'USD')[0]).toMatchObject({ gradingCompany: company, grade });
});

it.each([
  ['BGS', '10', 'beckett', 'g10p', '10p'], ['BGS', '10 Black Label', 'beckett', 'g10b', '10b'],
  ['BGS', '9.5', 'beckett', 'g9_5', '9.5'], ['BGS', '3', 'beckett', 'g3', '3'],
  ['CGC', '10', 'cgc', 'g10', '10'], ['CGC', '10 Pristine', 'cgc', 'g10pristine', '10pristine'],
  ['CGC', '10 Perfect', 'cgc', 'g10perfect', '10perfect'], ['CGC', '8.5', 'cgc', 'g8_5', '8.5'],
  ['PSA', '8.5', 'psa', 'g8_5', '8.5'],
])('validates exact observed %s %s filter codes', (company, grade, grader, key, label) => {
  const input = { gradingCompany: company, grade };
  expect(salesGrading(input)).toMatchObject({ grader, gradeKey: key, filterLabel: label });
  const url = salesUrl(grader, key, `${grader}-18399267`);
  expect(readSalesDestination(url, input)).toMatchObject({ profileId: `${grader}-18399267`, salesUrl: url });
});

it.each([
  salesUrl('beckett', 'g10b', 'beckett-123'), salesUrl('psa', 'g10', 'psa-123'),
  salesUrl('beckett', 'g10p', 'matched-123'), salesUrl('beckett', 'g10p', 'psa-123'),
  salesUrl('beckett', 'g10p', 'beckett-123').replace('direction=desc', 'direction=asc'),
  salesUrl('beckett', 'g10p', 'beckett-123').replace('sort=date', 'sort=price'),
  salesUrl('beckett', 'g10p', 'beckett-123').replace('|profileId', '|verified:true|profileId'),
  `${salesUrl('beckett', 'g10p', 'beckett-123')}&search=partial`,
  `${salesUrl('beckett', 'g10p', 'beckett-123')}&filters=grader:psa`,
  salesUrl('beckett', 'g10p', 'beckett-123').replace(ORIGIN, 'https://elsewhere.example'),
])('rejects an inexact sales destination %s', url => {
  expect(() => readSalesDestination(url, holding)).toThrow();
});

async function pageReader(url, html) {
  const location = { href: url, pathname: new URL(url).pathname, origin: ORIGIN };
  const move = url => { location.href = url; location.pathname = new URL(url).pathname; };
  document.body.innerHTML = html;
  vi.stubGlobal('location', location);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () { return this.closest('[hidden]') ? [] : [{}]; });
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: document.documentElement });
  let listener;
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: fn => { listener = fn; } }, sendMessage: vi.fn(async () => {}) } });
  await import('../../companion/cardladder/page.js');
  return { move, read: async (command, args) => {
    const response = new Promise(resolve => listener({ channel: 'rafchu-reader', command, ...args }, {}, resolve));
    await vi.advanceTimersByTimeAsync(24000);
    return response;
  } };
}

function profileFixture(reader, destination, selections, grader = 'PSA', grade = '10') {
  document.body.innerHTML = `<section class="profile-sales-row"><h4>Sales</h4><a class="view-sales">View All Sales <i>chevron_right</i></a><div class="profile-sales-filters">
    <div class="profile-sales-filter-dropdown"><button>${grader} <i>arrow_drop_down</i></button><ul hidden><li>PSA</li><li>BECKETT</li><li>CGC</li></ul></div>
    <div class="profile-sales-filter-dropdown"><button>${grade} <i>arrow_drop_down</i></button><ul hidden>${(grader === 'BECKETT' ? ['10 B', '10 P', '9.5', '9', '3'] : ['10 PERFECT', '10 PRISTINE', '10', '9.5', '8.5', '1']).map(label => `<li>${label}</li>`).join('')}</ul></div>
  </div></section>`;
  const dropdowns = [...document.querySelectorAll('.profile-sales-filter-dropdown')];
  dropdowns.forEach((dropdown, index) => {
    dropdown.querySelector('button').onclick = () => { dropdown.querySelector('ul').hidden = false; };
    dropdown.querySelectorAll('li').forEach(li => { li.onclick = () => {
      selections.push(li.textContent);
      profileFixture(reader, destination, selections, index === 0 ? li.textContent : grader, index === 0 ? (li.textContent === 'BECKETT' ? '9.5' : '10') : li.textContent);
    }; });
  });
  document.querySelector('.view-sales').onclick = () => reader.move(destination);
}

describe('rendered profile navigation', () => {
  it.each([
    ['BGS', '10', 'beckett', 'g10p', 'beckett-18399267', ['BECKETT', '10 P']],
    ['BGS', '10 Black Label', 'beckett', 'g10b', 'beckett-18399267', ['BECKETT', '10 B']],
    ['BGS', '3', 'beckett', 'g3', 'beckett-18399267', ['BECKETT', '3']],
    ['CGC', '10 Pristine', 'cgc', 'g10pristine', 'cgc-509150', ['CGC', '10 PRISTINE']],
    ['CGC', '10 Perfect', 'cgc', 'g10perfect', 'cgc-509150', ['CGC', '10 PERFECT']],
    ['CGC', '8.5', 'cgc', 'g8_5', 'cgc-509150', ['CGC', '8.5']],
  ])('follows CardLadder’s own %s %s destination without deriving an ID from matched profiles', async (company, grade, grader, key, id, expectedSelections) => {
    const destination = salesUrl(grader, key, id);
    const reader = await pageReader(`${ORIGIN}/collection?cardId=one`, '<div class="panel"><h1 class="card-text">Lugia V</h1><button class="profile-list-item">Profile</button></div>');
    const selections = [];
    document.querySelector('.profile-list-item').onclick = () => {
      reader.move(`${ORIGIN}/profiles/matched-2637208`);
      profileFixture(reader, destination, selections);
    };
    expect(await reader.read('holding', { holdingId: 'one', gradingCompany: company, grade })).toEqual({ ok: true, data: { profileUrl: `${ORIGIN}/profiles/matched-2637208`, salesUrl: destination } });
    expect(selections).toEqual(expectedSelections);
  });
});

const saleRow = (id, date, title = 'Lugia V 186 BGS 10', price = 100) => `<a class="list-item" href="https://www.ebay.com/itm/${id}"><div class="sales-list-item-info"><div class="item-text">${title}</div></div><div class="stat-item"><label>Date Sold</label><div class="value">${date}</div></div><div class="stat-item"><label>Price</label><div class="value">$${price}</div></div><div class="stat-item"><label>Type</label><div class="value">Auction</div></div></a>`;
const salesFixture = (rows, count = rows.length) => `<div class="sales-history-view"><div>Grade: 10p, Grader: BECKETT, Profile: beckett-18399267 </div><div>${count} results </div>${rows.join('')}</div>`;
const salesArgs = { startDate: '2026-09-16', endDate: '2026-09-30', profileId: 'beckett-18399267', gradingCompany: 'BGS', grade: '10', currency: 'USD', holding };

it('keeps an older last comparable sale separate from the 14-day pricing evidence', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([
    saleRow('123456789', 'Sep 20, 2026', 'Lugia V 186 BGS 10 Black Label', 9999),
    saleRow('223456789', 'Sep 10, 2026', 'Lugia V 186 BGS 10', 200),
    saleRow('323456789', 'Sep 9, 2026'),
  ]));
  const response = await reader.read('sales', salesArgs);
  expect(response.error).toBeUndefined();
  expect(response).toMatchObject({ ok: true, data: { complete: true, latestSale: { soldDate: '2026-09-10', price: 200 }, sales: [{ soldDate: '2026-09-20' }] } });
});

it('continues paging beyond the cutoff when the first old sales are not comparable', async () => {
  const rows = [saleRow('123456789', 'Sep 10, 2026', 'Lugia V 186 BGS 9')];
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture(rows, 3));
  const scroll = vi.fn(() => { document.body.innerHTML = salesFixture([...rows, saleRow('223456789', 'Sep 8, 2026', undefined, 222), saleRow('323456789', 'Sep 7, 2026')]); });
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, set: scroll, get: () => 0 });
  // Preserve the same list root while new rows load, as CardLadder does.
  scroll.mockImplementation(() => { document.querySelector('.sales-history-view').innerHTML = new DOMParser().parseFromString(salesFixture([...rows, saleRow('223456789', 'Sep 8, 2026', undefined, 222), saleRow('323456789', 'Sep 7, 2026')]), 'text/html').body.firstChild.innerHTML; });
  const response = await reader.read('sales', salesArgs);
  expect(response.error).toBeUndefined();
  expect(scroll).toHaveBeenCalled();
  expect(response).toMatchObject({ ok: true, data: { complete: true, latestSale: { soldDate: '2026-09-08', price: 222 }, sales: [] } });
  delete document.documentElement.scrollTop;
});

it('returns no last sale when the fully loaded history has no comparable results', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([saleRow('123456789', 'Sep 10, 2026', 'Lugia V 186 BGS 10 Black Label')]));
  expect(await reader.read('sales', salesArgs)).toMatchObject({ ok: true, data: { complete: true, latestSale: null, sales: [] } });
});

it('fails closed on an inexact grade even when the rendered text says the expected grade', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10b', 'beckett-18399267'), salesFixture([]));
  expect(await reader.read('sales', salesArgs)).toMatchObject({ ok: false, error: expect.stringMatching(/exact grader and grade/) });
});

it('rejects a grade-filter change while paging for the last comparable sale', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([saleRow('123456789', 'Sep 10, 2026', 'Lugia V 186 BGS 9')], 2));
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, set: () => { reader.move(salesUrl('beckett', 'g10b', 'beckett-18399267')); }, get: () => 0 });
  const response = await reader.read('sales', salesArgs);
  expect(response).toMatchObject({ ok: false, error: expect.stringMatching(/exact grader and grade/) });
  delete document.documentElement.scrollTop;
});

it('keeps a proven two-week window when optional older history stalls and marks the last sale unavailable', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([saleRow('123456789', 'Sep 10, 2026', 'Lugia V 186 BGS 9')], 2));
  expect(await reader.read('sales', salesArgs)).toMatchObject({ ok: true, data: { complete: true, sales: [], latestSale: null, latestSaleComplete: false, latestSaleWarning: expect.stringMatching(/Older sales stopped loading/) } });
});

it('fails a stalled capture when the two-week window has not been proven complete', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([saleRow('123456789', 'Sep 20, 2026', 'Lugia V 186 BGS 9')], 2));
  expect(await reader.read('sales', salesArgs)).toMatchObject({ ok: false, error: expect.stringMatching(/two-week pricing window could be verified/) });
});

it('retains the provider’s first sale when comparable sales share a date', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([
    saleRow('923456789', 'Sep 25, 2026', undefined, 200), saleRow('123456789', 'Sep 25, 2026', undefined, 300),
  ]));
  expect(await reader.read('sales', salesArgs)).toMatchObject({ ok: true, data: { latestSale: { price: 200, url: 'https://www.ebay.com/itm/923456789' } } });
});

it('reads the observed single-result CGC 10 Rayquaza history without waiting for more pages', async () => {
  const html = `<div class="sales-history-view"><div>1 result Grade: 10, Grader: CGC, Profile: cgc-516187 (Pop 5) </div>${saleRow('135032596323', 'Apr 27, 2024', 'GEM MINT CGC 10 Rayquaza 3/17 POP Series 1 Pokemon TCG', 130).replace('$130', '€114.40')}</div>`;
  const reader = await pageReader(salesUrl('cgc', 'g10', 'cgc-516187'), html);
  const rayquaza = { name: 'Rayquaza', number: '3/17', set: '2004 Pokemon POP Series 1', variation: '(Non Holo)', gradingCompany: 'CGC', grade: '10', currency: 'EUR' };
  expect(await reader.read('sales', { ...salesArgs, profileId: 'cgc-516187', gradingCompany: 'CGC', grade: '10', currency: 'EUR', holding: rayquaza })).toMatchObject({ ok: true, data: {
    complete: true, sales: [], latestSaleComplete: true, latestSaleWarning: null,
    latestSale: { price: 114.4, soldDate: '2024-04-27', currency: 'EUR', title: 'GEM MINT CGC 10 Rayquaza 3/17 POP Series 1 Pokemon TCG' },
  } });
});

it('establishes no comparable last sale when the single result has the wrong label', async () => {
  const reader = await pageReader(salesUrl('beckett', 'g10p', 'beckett-18399267'), salesFixture([saleRow('123456789', 'Sep 10, 2026', 'Lugia V 186 BGS 10 Black Label')]).replace('1 results', '1 result'));
  expect(await reader.read('sales', salesArgs)).toMatchObject({ ok: true, data: { complete: true, sales: [], latestSale: null, latestSaleComplete: true, latestSaleWarning: null } });
});
