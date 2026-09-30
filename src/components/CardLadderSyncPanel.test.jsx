import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
// Keep the real currency/sticker calculations, but pin their external FX
// response before cardHelpers initializes so CI cannot refresh mid-assertion.
vi.hoisted(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ rates: { USD: 1, EUR: 0.92, GBP: 0.79 } }) })));
});
afterAll(() => vi.unstubAllGlobals());
const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), items: [], preferences: {} }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ user: { uid: 'test' }, db: {}, collectionItems: mocks.items, ...mocks.preferences }) }));
vi.mock('@/utils/cardLadderCompanion', () => ({ autoSyncKey: uid => `auto:${uid}`, companionRequest: mocks.request, saveCardLadderReport: mocks.save }));
import { CardLadderSyncPanel } from './CardLadderSyncPanel';
import { salesWindow, createSalesBinding, buildCardLadderRemovals } from '../utils/cardLadderSales';
import { formatCurrency } from '../utils/cardHelpers';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.items = [{ entryId: 'owned', name: 'Lugia V', set: 'Silver Tempest', number: '186', isGraded: true, gradingCompany: 'PSA', grade: '10', gradedPrice: 1500, gradedPriceCurrency: 'USD' }];
  mocks.preferences = { currency: 'EUR', secondaryCurrency: null, roundUpPrices: false };
  mocks.save.mockReset(); mocks.save.mockResolvedValue({ updatedCount: 1, stickerUpdatedCount: 1, addedCount: 0 }); mocks.request.mockReset();
});

it.each(['1.0.4', '1.0.9', '0.9.0'])('shows a download and reload instruction for legacy companion %s', async version => {
  mocks.request.mockResolvedValue({ installed: true, version });
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(host.textContent).toContain(`Connected CardLadder companion: ${version}`);
  const warning = host.querySelector('[aria-label="CardLadder companion update"]');
  expect(warning.textContent).toContain('only supports USD');
  expect(warning.textContent).toContain('reload it in Chrome');
  expect(warning.textContent).toContain('run Sync Inventory again');
  expect(warning.querySelector('a').getAttribute('href')).toBe('/cardladder-companion.zip');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalledWith('start');
});

it.each(['1.1.0', '1.1.1', '1.10.0', '2.0.0'])('shows current companion %s without an obsolete-currency warning', async version => {
  mocks.request.mockResolvedValue({ installed: true, version, status: { message: 'Capture finished.' } });
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(host.textContent).toContain(`Connected CardLadder companion: ${version}`);
  expect(host.textContent).toContain('Capture finished.');
  expect(host.querySelector('[aria-label="CardLadder companion update"]')).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(['1.1.0', '1.1.1'])('explains the BGS and CGC companion update for %s', async version => {
  mocks.request.mockResolvedValue({ installed: true, version });
  await act(async () => root.render(<CardLadderSyncPanel />));
  const warning = host.querySelector('[aria-label="CardLadder grading support update"]');
  expect(warning.textContent).toContain('sync BGS and CGC');
  expect(warning.textContent).toContain('1.2.2');
  expect(warning.textContent).toContain('run Sync Inventory again');
  expect(mocks.request).not.toHaveBeenCalledWith('start');
});

it.each(['1.2.0', '1.2.1', '1.10.0', '2.0.0'])('does not show a grading update notice for %s', async version => {
  mocks.request.mockResolvedValue({ installed: true, version });
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(host.querySelector('[aria-label="CardLadder grading support update"]')).toBeNull();
});

it('shows the capture fix update for companion 1.2.0 and removes it after updating to 1.2.1', async () => {
  mocks.request.mockResolvedValue({ installed: true, version: '1.2.0' });
  await act(async () => root.render(<CardLadderSyncPanel />));
  const warning = host.querySelector('[aria-label="CardLadder capture fix update"]');
  expect(warning.textContent).toContain('1.2.2');
  expect(warning.textContent).toContain('single sale');
  expect(warning.textContent).toContain('3/17');
  expect(warning.querySelector('a').getAttribute('href')).toBe('/cardladder-companion.zip');
  expect(mocks.request).not.toHaveBeenCalledWith('start');

  mocks.request.mockResolvedValue({ installed: true, version: '1.2.1' });
  await act(async () => root.render(<CardLadderSyncPanel key="updated-companion" />));
  expect(host.textContent).toContain('Connected CardLadder companion: 1.2.1');
  expect(host.querySelector('[aria-label="CardLadder capture fix update"]')).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalledWith('start');
});

const legacyReport = (failed = false) => {
  const capturedAt = new Date().toISOString();
  return { schemaVersion: 1, source: 'cardladder-browser', runId: 'legacy', capturedAt, ...salesWindow(capturedAt), collectionName: 'Inventory', collectionComplete: true,
    holdings: [{ holdingId: 'one', name: 'Lugia V', set: 'Silver Tempest', number: '186', gradingCompany: 'PSA', grade: '10', complete: !failed,
      ...(failed ? { error: 'A sale has an unreadable date, currency, price, or link. No price will be applied for this card.' } : {}),
      sales: failed ? [] : [{ price: 1200, currency: 'USD', soldDate: capturedAt.slice(0, 10), title: 'Lugia V 186 PSA 10', type: 'Auction', url: 'https://www.ebay.com/itm/12345678' }] }] };
};

it('explains that a retained failed legacy report still needs a fresh capture after the extension is updated', async () => {
  const report = legacyReport(true);
  mocks.request.mockImplementation(async action => action === 'report' ? report : { installed: true, version: '1.1.1', runId: report.runId });
  await act(async () => root.render(<CardLadderSyncPanel />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Preview latest capture').click());
  const warning = host.querySelector('[aria-label="Older CardLadder capture needs refresh"]');
  expect(warning.textContent).toContain('older reader that only supported USD');
  expect(warning.textContent).toContain('run a fresh Sync Inventory');
  expect(warning.textContent).toContain('Updating the extension keeps the previous report');
  expect(host.querySelector('time').dateTime).toBe(report.capturedAt);
  expect(host.textContent).toContain('EUR per card');
  expect(host.textContent).toContain('Source prices were recorded in USD · legacy USD report');
  expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Update 0 sticker prices').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalledWith('start');
});

it('keeps valid legacy USD reports available for explicit application without a failed-reader warning', async () => {
  const report = legacyReport();
  mocks.request.mockImplementation(async action => action === 'report' ? report : { installed: true, version: '1.1.1', runId: report.runId });
  mocks.save.mockResolvedValue({ updatedCount: 1, addedCount: 0 });
  await act(async () => root.render(<CardLadderSyncPanel />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Preview latest capture').click());
  expect(host.querySelector('[aria-label="Older CardLadder capture needs refresh"]')).toBeNull();
  expect(host.querySelector('time').dateTime).toBe(report.capturedAt);
  expect(host.textContent).toContain('EUR per card');
  expect(host.textContent).toContain('Source prices were recorded in USD · legacy USD report');
  const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Update 1 sticker price');
  expect(apply.disabled).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => apply.click());
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][2]).toBe(report);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it('converts captured and previous prices into the vendor currency before comparing them', async () => {
  const capturedAt = new Date().toISOString();
  const report = { schemaVersion: 2, source: 'cardladder-browser', currency: 'EUR', runId: 'new', capturedAt, ...salesWindow(capturedAt), collectionName: 'Inventory', collectionComplete: true,
    holdings: [{ holdingId: 'one', name: 'Lugia V', set: 'Silver Tempest', number: '186', currency: 'EUR', gradingCompany: 'PSA', grade: '10', complete: true,
      sales: [{ price: 1200, currency: 'EUR', soldDate: capturedAt.slice(0, 10), title: 'Lugia V 186 PSA 10', type: 'Auction', url: 'https://www.ebay.com/itm/12345678' }] }] };
  mocks.request.mockImplementation(async action => action === 'report' ? report : { installed: true, runId: 'new', version: '1.1.0' });
  await act(async () => root.render(<CardLadderSyncPanel />));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Preview latest capture').click());
  expect(host.textContent).toContain('EUR per card');
  expect(host.textContent).toContain(formatCurrency(1200, 'EUR'));
  expect(host.textContent).toContain(formatCurrency(1380, 'EUR'));
  expect(host.textContent).toContain(formatCurrency(-180, 'EUR'));
  expect(host.textContent).not.toContain('Different currencies');
  expect(host.textContent).not.toContain('-300');
  expect(mocks.save).not.toHaveBeenCalled();
});

const amountBeside = label => [...host.querySelectorAll('p')].find(element => element.textContent === label)?.nextElementSibling?.textContent;
const displayed = (primary, secondary, primaryCurrency = 'EUR', secondaryCurrency = 'GBP') => `${formatCurrency(primary, primaryCurrency)} (${formatCurrency(secondary, secondaryCurrency)})`;
const loadReport = async report => {
  mocks.request.mockImplementation(async action => action === 'report' ? report : { installed: true, version: '1.1.1', runId: report.runId });
  await act(async () => root.render(<CardLadderSyncPanel />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Preview latest capture').click());
};

it('shows the last sale separately from the 14-day high and still applies the selected high', async () => {
  const report = legacyReport();
  const high = report.holdings[0].sales[0];
  high.soldDate = report.startDate;
  const latest = { ...high, price: 900, soldDate: report.endDate, url: 'https://www.ebay.com/itm/98765432' };
  report.holdings[0].sales.push(latest);
  await loadReport(report);
  expect(amountBeside('Last matching sale')).toBe(formatCurrency(828, 'EUR'));
  expect(amountBeside('14-day high')).toBe(formatCurrency(1104, 'EUR'));
  const link = [...host.querySelectorAll('a')].find(anchor => anchor.textContent.startsWith('View last sale'));
  expect(link.href).toBe(latest.url);
  expect(link.textContent).toContain(latest.soldDate);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Update 1 sticker price').click());
  expect(mocks.save.mock.calls[0][2]).toBe(report);
  expect(mocks.save.mock.calls[0][5]).toEqual(['one']);
});

it('labels an older last sale as reference and leaves an unpriced card unchanged', async () => {
  const report = legacyReport();
  const recent = report.holdings[0].sales[0];
  report.holdings[0].latestSale = { ...recent, soldDate: '2020-01-01', price: 500 };
  report.holdings[0].sales = [];
  await loadReport(report);
  expect(amountBeside('Last matching sale')).toBe(formatCurrency(460, 'EUR'));
  expect(host.textContent).toContain('Older than 14 days · for reference only');
  expect(amountBeside('14-day high')).toBe('No recent sales');
  expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Update 0 sticker prices').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('offers only the exact normalized BGS grade when linking an unmatched card', async () => {
  const report = legacyReport();
  Object.assign(report.holdings[0], { gradingCompany: 'BGS', grade: '10 Pristine', name: 'Lugia' });
  report.holdings[0].sales[0].title = 'Lugia 186 BGS 10 Pristine';
  mocks.items = [
    { ...mocks.items[0], gradingCompany: 'BGS', grade: '10', entryId: 'gold' },
    { ...mocks.items[0], gradingCompany: 'BGS', grade: '10 Black Label', entryId: 'black' },
    { ...mocks.items[0], gradingCompany: 'CGC', grade: '10', entryId: 'cgc' },
  ];
  await loadReport(report);
  const choices = [...host.querySelectorAll('option')].map(option => option.value);
  expect(choices).toContain('gold');
  expect(choices).not.toContain('black');
  expect(choices).not.toContain('cgc');
});

it('shows the actual rounded inventory sticker beside market prices and follows both current currency preferences', async () => {
  const report = legacyReport();
  const original = structuredClone(report);
  mocks.items[0] = { ...mocks.items[0], overridePrice: 200.25, overridePriceCurrency: 'GBP' };
  mocks.preferences = { currency: 'GBP', secondaryCurrency: 'EUR', roundUpPrices: true };
  await loadReport(report);
  expect(amountBeside('Current sticker price')).toBe(displayed(201, 200.25 / 0.79 * 0.92, 'GBP', 'EUR'));
  expect(amountBeside('Current market estimate')).toBe(displayed(1185, 1380, 'GBP', 'EUR'));
  expect(amountBeside('14-day high')).toBe(displayed(948, 1104, 'GBP', 'EUR'));
  expect(amountBeside('Market estimate change')).toBe(displayed(-237, -276, 'GBP', 'EUR'));
  expect(host.textContent).toContain(`Your current sticker price (${displayed(201, 200.25 / 0.79 * 0.92, 'GBP', 'EUR')}) will be replaced`);
  expect(host.textContent).toContain(`View ${displayed(948, 1104, 'GBP', 'EUR')} sale`);
  mocks.preferences = { currency: 'USD', secondaryCurrency: 'GBP', roundUpPrices: false };
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(amountBeside('Current sticker price')).toBe(displayed(200.25 / 0.79, 200.25, 'USD', 'GBP'));
  expect(amountBeside('14-day high')).toBe(displayed(1200, 948, 'USD', 'GBP'));
  expect(report).toEqual(original);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Update 1 sticker price').click());
  expect(mocks.save.mock.calls[0][2]).toEqual(original);
  expect(mocks.items[0].overridePrice).toBe(200.25);
});

it('uses the inventory selling-price fallback for stickers and omits duplicate secondary currencies', async () => {
  mocks.preferences = { currency: 'EUR', secondaryCurrency: 'EUR', roundUpPrices: true };
  mocks.items[0].gradedPrice = 1500.25;
  await loadReport(legacyReport());
  expect(amountBeside('Current sticker price')).toBe(formatCurrency(1381, 'EUR'));
  expect(amountBeside('Current market estimate')).toBe(formatCurrency(1380.23, 'EUR'));
  expect(amountBeside('14-day high')).toBe(formatCurrency(1104, 'EUR'));
  expect(amountBeside('14-day high')).not.toContain('(');
});

it('converts anomaly statistics and flagged-sale links in the same display currencies', async () => {
  const report = legacyReport();
  const sale = report.holdings[0].sales[0];
  report.holdings[0].sales = [98, 99, 100, 101, 102, 500].map((price, index) => ({ ...sale, price, url: `https://www.ebay.com/itm/1234567${index}` }));
  mocks.preferences.secondaryCurrency = 'GBP';
  await loadReport(report);
  expect(amountBeside('Median')).toBe(displayed(92.46, 79.395));
  expect(amountBeside('Average')).toBe(displayed(1000 / 6 * 0.92, 1000 / 6 * 0.79));
  expect(host.textContent).toContain(`High: ${displayed(460, 395)}`);
  expect(host.textContent).toContain(`Highest unflagged sale: ${displayed(93.84, 80.58)}`);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('converts the optional provider estimate without changing the original value submitted on explicit save', async () => {
  const report = legacyReport();
  report.holdings[0].sales = [];
  report.holdings[0].cardLadderValue = 1250;
  report.holdings[0].cardLadderValueCurrency = 'USD';
  mocks.preferences.secondaryCurrency = 'GBP';
  await loadReport(report);
  expect(amountBeside('CardLadder Value · current provider estimate')).toBe(displayed(1150, 987.5));
  const selectValue = host.querySelector('[aria-label="Use CardLadder Value for Lugia V one"]');
  act(() => selectValue.click());
  expect(amountBeside('Market estimate change')).toBe(displayed(-230, -197.5));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Update 1 sticker price').click());
  expect(mocks.save.mock.calls[0][2].holdings[0]).toMatchObject({ cardLadderValue: 1250, cardLadderValueCurrency: 'USD' });
  expect(mocks.save.mock.calls[0][7]).toEqual(['one']);
});

it('keeps purchase-cost input in the selected vendor currency while preserving its stored currency until edited', async () => {
  const report = legacyReport();
  mocks.items = [];
  mocks.preferences = { currency: 'GBP', secondaryCurrency: 'EUR', roundUpPrices: false };
  await loadReport(report);
  const selector = host.querySelector('[aria-label="Link Lugia V one"]');
  act(() => { selector.value = '__new__'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
  const input = host.querySelector('[aria-label="Purchase cost for Lugia V one"]');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '79');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe('79');
  expect(input.closest('label').textContent).toContain(displayed(79, 92, 'GBP', 'EUR'));
  mocks.preferences = { currency: 'EUR', secondaryCurrency: 'GBP', roundUpPrices: false };
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(input.value).toBe('92.00');
  expect(input.closest('label').textContent).toContain('Purchase cost per card (EUR, optional)');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Add 1 new card').click());
  expect(mocks.save.mock.calls[0][4]).toMatchObject({ one: { buyPrice: '79', buyPriceCurrency: 'GBP' } });
});

const applyFooter = () => host.querySelector('[aria-label="Apply selected CardLadder prices"]');
const mode = label => [...applyFooter().querySelectorAll('label')].find(element => element.textContent === label).querySelector('input');

it('defaults to explicit sticker updates and can apply stickers from the same report after a market-only save', async () => {
  mocks.items[0].overridePrice = 2000;
  mocks.items[0].overridePriceCurrency = 'EUR';
  const report = legacyReport();
  await loadReport(report);
  expect(mode('Sticker prices and market estimates').checked).toBe(true);
  expect(applyFooter().querySelector('button').textContent).toBe('Update 1 sticker price');
  expect(host.textContent).toContain(`New sticker price: ${formatCurrency(1104, 'EUR')}`);
  expect(mocks.save).not.toHaveBeenCalled();
  act(() => mode('Market estimates only').click());
  expect(applyFooter().querySelector('button').textContent).toBe('Save 1 market estimate');
  expect(host.textContent).not.toContain('New sticker price:');
  expect(host.textContent).toContain('remains unchanged with this selection');
  mocks.save.mockResolvedValueOnce({ updatedCount: 1, stickerUpdatedCount: 0, addedCount: 0 });
  await act(async () => applyFooter().querySelector('button').click());
  expect(mocks.save.mock.calls[0][8]).toEqual({ updateStickerPrices: false, removals: [] });
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Saved 1 market estimate. Your manual sticker prices are unchanged.');
  act(() => mode('Sticker prices and market estimates').click());
  await act(async () => applyFooter().querySelector('button').click());
  expect(mocks.save.mock.calls[1][8]).toEqual({ updateStickerPrices: true, removals: [] });
  expect(mocks.save.mock.calls[1][2]).toBe(report);
  expect(mocks.save.mock.calls[1][5]).toEqual(['one']);
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Updated 1 existing sticker price and saved 1 market estimate.');
});

it('shows saving and failed-save feedback beside the action without losing the selected price or mode', async () => {
  let failSave;
  mocks.save.mockImplementationOnce(() => new Promise((_resolve, reject) => { failSave = reject; }));
  await loadReport(legacyReport());
  await act(async () => applyFooter().querySelector('button').click());
  expect(applyFooter().getAttribute('aria-busy')).toBe('true');
  expect(applyFooter().querySelector('button').textContent).toBe('Saving selected prices…');
  expect(applyFooter().querySelector('fieldset').disabled).toBe(true);
  await act(async () => failSave(new Error('Permission denied. Please retry.')));
  expect(applyFooter().querySelector('[role="alert"]').textContent).toBe('Permission denied. Please retry.');
  expect(host.querySelector('[aria-label="Include Lugia V one"]').checked).toBe(true);
  expect(mode('Sticker prices and market estimates').checked).toBe(true);
  expect(applyFooter().querySelector('button').disabled).toBe(false);
  expect(applyFooter().querySelector('button').textContent).toBe('Update 1 sticker price');
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it('counts only eligible prices as sticker updates and labels image-only work separately', async () => {
  const report = legacyReport();
  const imageCard = { ...mocks.items[0], entryId: 'image-card', name: 'Blastoise', number: '4', set: 'Expedition Base Set' };
  const failedCard = { ...mocks.items[0], entryId: 'failed-card', name: 'Eevee', number: '97', set: 'BW Promos' };
  mocks.items.push(imageCard, failedCard);
  report.holdings.push({ ...report.holdings[0], holdingId: 'image', name: imageCard.name, set: imageCard.set, number: imageCard.number, imageUrl: 'https://d1htnxwo4o0jhw.cloudfront.net/blastoise.jpg', sales: [] },
    { ...report.holdings[0], holdingId: 'failed', name: failedCard.name, set: failedCard.set, number: failedCard.number, complete: false, sales: [], error: 'Capture interrupted.' });
  await loadReport(report);
  expect(applyFooter().querySelector('button').textContent).toBe('Update 1 sticker price and fill 1 missing image');
  expect(host.querySelector('[aria-label="Include Eevee failed"]').disabled).toBe(true);
  mocks.save.mockResolvedValueOnce({ updatedCount: 1, stickerUpdatedCount: 1, imageUpdatedCount: 1, addedCount: 0 });
  await act(async () => applyFooter().querySelector('button').click());
  expect(mocks.save.mock.calls[0][5]).toEqual(['one', 'image']);
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Updated 1 existing sticker price and saved 1 market estimate. Filled 1 missing image.');
});

it('does not promise to preserve a legacy manual field that does not control the graded sticker', async () => {
  mocks.items[0] = { ...mocks.items[0], manualPrice: 2000, manualPriceCurrency: 'EUR' };
  await loadReport(legacyReport());
  expect(amountBeside('Current sticker price')).toBe(formatCurrency(1380, 'EUR'));
  act(() => mode('Market estimates only').click());
  expect(host.textContent).toContain('Without a sticker override, the sticker price follows the market estimate.');
  expect(host.textContent).not.toContain(`Your current sticker price (${formatCurrency(1380, 'EUR')}) remains unchanged with this selection.`);
  expect(applyFooter().querySelector('button').textContent).toBe('Save 1 market estimate');
  expect(mocks.save).not.toHaveBeenCalled();
});

const rayquazaCapture = ({ complete = false, latestSaleComplete = true } = {}) => {
  const capturedAt = new Date().toISOString();
  return {
    schemaVersion: 2, source: 'cardladder-browser', currency: 'EUR', runId: 'rayquaza-unpriced',
    capturedAt, ...salesWindow(capturedAt), collectionName: 'Inventory', collectionComplete: true,
    holdings: [{
      holdingId: 'rayquaza-cgc10', name: 'Rayquaza', set: '2004 Pokemon POP Series 1', number: '3/17',
      gradingCompany: 'CGC', grade: '10', currency: 'EUR', complete, latestSaleComplete,
      cardLadderValue: 450, cardLadderValueCurrency: 'EUR',
      error: complete ? null : 'Some sales did not finish loading. No price will be applied for this card.',
      sales: complete ? [] : [{ title: 'Rayquaza 3/17 CGC 10', soldDate: capturedAt.slice(0, 10),
        price: 500, currency: 'EUR', type: 'Auction', url: 'https://www.ebay.com/itm/12345678' }],
    }],
  };
};

const chooseNewRayquaza = () => {
  const selector = host.querySelector('[aria-label="Link Rayquaza rayquaza-cgc10"]');
  act(() => { selector.value = '__new__'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
};
const setInputValue = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

it('adds an incomplete CGC 10 Rayquaza capture with quantity and cost while selecting no market or provider price', async () => {
  const report = rayquazaCapture();
  mocks.items = [];
  mocks.save.mockResolvedValue({ updatedCount: 0, stickerUpdatedCount: 0, addedCount: 1 });
  await loadReport(report);

  expect(host.textContent).toContain('Rayquaza #3/17');
  expect(host.textContent).toContain('CGC 10');
  expect(amountBeside('14-day high')).toBe('Unavailable');
  expect(applyFooter().querySelector('button').disabled).toBe(true);
  const newOption = host.querySelector('[aria-label="Link Rayquaza rayquaza-cgc10"] option[value="__new__"]');
  expect(newOption.textContent).toBe('Add as new without a price — I checked that it is missing');
  expect(host.querySelector('[aria-label="Use CardLadder Value for Rayquaza rayquaza-cgc10"]')).toBeNull();

  chooseNewRayquaza();
  expect(host.textContent).toContain('Its market and sticker prices will stay blank because the sales capture is incomplete.');
  setInputValue(host.querySelector('[aria-label="Quantity for Rayquaza rayquaza-cgc10"]'), '3');
  setInputValue(host.querySelector('[aria-label="Purchase cost for Rayquaza rayquaza-cgc10"]'), '149.95');
  const apply = applyFooter().querySelector('button');
  expect(apply.textContent).toBe('Add 1 new card');
  expect(apply.disabled).toBe(false);
  expect(host.textContent).toContain('Selected: 0 price updates · 1 new card');
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => apply.click());

  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save).toHaveBeenCalledWith({}, 'test', report, {}, {
    'rayquaza-cgc10': { quantity: '3', buyPrice: '149.95', buyPriceCurrency: 'EUR' },
  }, ['rayquaza-cgc10'], false, [], { updateStickerPrices: true, removals: [] });
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Updated 0 existing sticker prices and saved 0 market estimates. Added 1 new card.');
  expect(mocks.request).not.toHaveBeenCalledWith('start');
});

it('selects an incomplete card when Add as new is chosen after Deselect all', async () => {
  mocks.items = [];
  await loadReport(rayquazaCapture());
  act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Deselect all').click());
  const include = host.querySelector('[aria-label="Include Rayquaza rayquaza-cgc10"]');
  expect(include.checked).toBe(false);
  chooseNewRayquaza();
  expect(include.checked).toBe(true);
  expect(applyFooter().querySelector('button').textContent).toBe('Add 1 new card');
  expect(applyFooter().querySelector('button').disabled).toBe(false);
  act(() => include.click());
  expect(include.checked).toBe(false);
  expect(applyFooter().querySelector('button').disabled).toBe(true);
  expect(host.textContent).toContain('Selected: 0 price updates · 0 new cards');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('explains that missing older sales leave a completed 14-day window usable', async () => {
  mocks.items = [];
  const report = rayquazaCapture({ complete: true, latestSaleComplete: false });
  await loadReport(report);
  expect(amountBeside('Last matching sale')).toBe('Unavailable');
  expect(amountBeside('14-day high')).toBe('No recent sales');
  expect(host.textContent).toContain('Older sales did not finish loading. The 14-day window is complete.');
  expect(host.textContent).not.toContain('Capture incomplete');
  const newOption = host.querySelector('[aria-label="Link Rayquaza rayquaza-cgc10"] option[value="__new__"]');
  expect(newOption.textContent).toBe('Add as new — I checked that it is missing');
  expect(host.querySelector('[aria-label="Use CardLadder Value for Rayquaza rayquaza-cgc10"]')).not.toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

const verifiedInventory = (holdings = []) => {
  const report = { ...legacyReport(), schemaVersion: 2, currency: 'USD', runId: 'verified-membership', holdings: holdings.map(holding => ({ ...holding, currency: holding.currency || 'USD' })) };
  report.inventorySnapshot = { version: 1, collectionName: 'Inventory', accountKey: 'a'.repeat(64),
    total: holdings.length, holdingIds: holdings.map(holding => holding.holdingId), verifiedAt: report.capturedAt };
  return report;
};
const linkedRayquaza = (overrides = {}) => {
  const item = { entryId: 'linked-rayquaza', name: 'Rayquaza', set: '2004 Pokemon POP Series 1', number: '3/17',
    isGraded: true, gradingCompany: 'CGC', grade: '10', quantity: 2, buyPrice: 100,
    overridePrice: 450, overridePriceCurrency: 'EUR', ...overrides };
  const binding = createSalesBinding(item, item);
  return { ...item, cardladderData: { holdingId: 'absent-rayquaza', holdingIdentityKey: binding.holdingIdentity,
    inventoryIdentityKey: binding.itemIdentity, inventoryAccountKey: 'a'.repeat(64), linkedAt: Date.now() - 60000 } };
};
const removalCheckbox = () => host.querySelector('[aria-label="Remove Rayquaza linked-rayquaza"]');
const clickNamedButton = text => act(() => [...host.querySelectorAll('button')].find(button => button.textContent === text).click());

it('reviews linked removals unchecked and supports a removal-only save without touching unlinked cards', async () => {
  const linked = linkedRayquaza();
  mocks.items.push(linked);
  const report = verifiedInventory();
  mocks.save.mockResolvedValue({ updatedCount: 0, stickerUpdatedCount: 0, addedCount: 0, removedCount: 1 });
  await loadReport(report);
  const removalPanel = host.querySelector('[aria-label="Cards missing from CardLadder Inventory"]');
  expect(removalPanel.textContent).toContain('Missing from CardLadder Inventory · 1');
  expect(removalPanel.textContent).toContain('Rayquaza #3/17');
  expect(removalPanel.textContent).toContain('CGC 10');
  expect(removalPanel.textContent).toContain('Quantity: 2');
  expect(removalPanel.textContent).not.toContain('Lugia V');
  expect(host.querySelector('[aria-label="CardLadder removal check needs fresh capture"]')).toBeNull();
  expect(removalCheckbox().checked).toBe(false);
  expect(applyFooter().querySelector('button').disabled).toBe(true);

  act(() => removalCheckbox().click());
  expect(host.textContent).toContain('0 new cards · 1 removal');
  expect(applyFooter().textContent).toContain('Saving will remove 1 selected card from Rafchu Inventory.');
  expect(applyFooter().querySelector('button').textContent).toBe('Remove 1 card from Inventory');
  const reviewed = buildCardLadderRemovals(mocks.items, report);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => applyFooter().querySelector('button').click());
  expect(mocks.save).toHaveBeenCalledWith({}, 'test', report, {}, {}, [], false, [],
    { updateStickerPrices: true, removals: reviewed });
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Removed 1 card from Inventory because it is no longer in CardLadder Inventory.');
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Recently deleted');
  expect(removalCheckbox().checked).toBe(false);
  expect(mocks.items[0].entryId).toBe('owned');
});

it('selects and deselects prices and removals together without implicitly selecting removals on load', async () => {
  mocks.items.push(linkedRayquaza());
  const report = verifiedInventory(legacyReport().holdings);
  await loadReport(report);
  expect(host.querySelector('[aria-label="Include Lugia V one"]').checked).toBe(true);
  expect(removalCheckbox().checked).toBe(false);
  clickNamedButton('Select all');
  expect(removalCheckbox().checked).toBe(true);
  expect(applyFooter().querySelector('button').textContent).toBe('Update 1 sticker price and remove 1 card from Inventory');
  clickNamedButton('Deselect all');
  expect(host.querySelector('[aria-label="Include Lugia V one"]').checked).toBe(false);
  expect(removalCheckbox().checked).toBe(false);
  expect(applyFooter().querySelector('button').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(['old-reader', 'incomplete', 'cancelled', 'stale', 'invalid-total', 'missing-account'])('does not propose removals for a %s report', async kind => {
  mocks.items.push(linkedRayquaza());
  const report = verifiedInventory();
  if (kind === 'old-reader') delete report.inventorySnapshot;
  if (kind === 'incomplete') report.collectionComplete = false;
  if (kind === 'cancelled') { report.cancelled = true; delete report.inventorySnapshot; }
  if (kind === 'stale') {
    report.capturedAt = new Date(Date.now() - 2 * 86400000).toISOString();
    Object.assign(report, salesWindow(report.capturedAt));
    report.inventorySnapshot.verifiedAt = report.capturedAt;
  }
  if (kind === 'invalid-total') report.inventorySnapshot.total = 1;
  if (kind === 'missing-account') delete report.inventorySnapshot.accountKey;
  await loadReport(report);
  expect(removalCheckbox()).toBeNull();
  const notice = host.querySelector('[aria-label="CardLadder removal check needs fresh capture"]');
  expect(notice.textContent).toContain('No cards will be removed from this capture.');
  expect(notice.textContent).toContain('companion 1.2.2');
  expect(notice.textContent).toContain('run Sync Inventory again');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('requires a changed inventory item to be selected again before removal', async () => {
  mocks.items.push(linkedRayquaza());
  await loadReport(verifiedInventory());
  act(() => removalCheckbox().click());
  expect(removalCheckbox().checked).toBe(true);
  mocks.items = mocks.items.map(item => item.entryId === 'linked-rayquaza' ? { ...item, quantity: 5 } : item);
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(removalCheckbox().checked).toBe(false);
  expect(applyFooter().querySelector('button').disabled).toBe(true);
  expect(host.querySelector('[aria-label="Cards missing from CardLadder Inventory"]').textContent).toContain('Quantity: 5');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('retains explicit removal choices after a failed save so they can be retried', async () => {
  mocks.items.push(linkedRayquaza());
  let failSave;
  mocks.save.mockImplementationOnce(() => new Promise((_resolve, reject) => { failSave = reject; }));
  await loadReport(verifiedInventory());
  act(() => removalCheckbox().click());
  await act(async () => applyFooter().querySelector('button').click());
  expect(applyFooter().querySelector('button').textContent).toBe('Saving inventory changes…');
  expect(removalCheckbox().disabled).toBe(true);
  await act(async () => failSave(new Error('Could not save. Please retry.')));
  expect(applyFooter().querySelector('[role="alert"]').textContent).toBe('Could not save. Please retry.');
  expect(removalCheckbox().checked).toBe(true);
  expect(removalCheckbox().disabled).toBe(false);
  expect(applyFooter().querySelector('button').textContent).toBe('Remove 1 card from Inventory');
});

it.each([true, false])('saves an explicit link independently of pricing when sales complete is %s', async complete => {
  const holding = rayquazaCapture({ complete }).holdings[0];
  holding.sales = [];
  holding.currency = 'USD';
  holding.cardLadderValueCurrency = 'USD';
  const localCard = { ...linkedRayquaza(), entryId: 'local-rayquaza', name: 'Rayquaza (Holo)', cardladderData: undefined };
  mocks.items = [localCard];
  mocks.save.mockResolvedValue({ updatedCount: 0, stickerUpdatedCount: 0, addedCount: 0, linkedCount: 1 });
  const report = verifiedInventory([holding]);
  await loadReport(report);
  clickNamedButton('Deselect all');
  const selector = host.querySelector('[aria-label="Link Rayquaza rayquaza-cgc10"]');
  act(() => { selector.value = localCard.entryId; selector.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('[aria-label="Include Rayquaza rayquaza-cgc10"]').checked).toBe(true);
  expect(applyFooter().querySelector('button').textContent).toBe('Save 1 link');
  expect(host.textContent).toContain('Save CardLadder link · price unchanged');
  await act(async () => applyFooter().querySelector('button').click());
  expect(mocks.save).toHaveBeenCalledWith({}, 'test', report,
    { 'rayquaza-cgc10': createSalesBinding(localCard, holding) }, {}, ['rayquaza-cgc10'], false, [],
    { updateStickerPrices: true, removals: [] });
  expect(applyFooter().querySelector('[role="status"]').textContent).toContain('Saved 1 CardLadder link.');
});

it('explains that automatic updates remove confirmed linked cards and preserve unlinked cards', async () => {
  localStorage.removeItem('auto:test');
  mocks.request.mockResolvedValue({ installed: true, version: '1.2.2' });
  await act(async () => root.render(<CardLadderSyncPanel />));
  const autoLabel = [...host.querySelectorAll('label')].find(label => label.textContent.includes('Automatically update existing cards'));
  expect(autoLabel.textContent).toContain('remove previously linked cards');
  expect(autoLabel.textContent).toContain('complete, verified CardLadder Inventory capture');
  expect(autoLabel.textContent).toContain('Manually added cards without a CardLadder link are kept.');
  expect(autoLabel.querySelector('input').checked).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(['1.2.1', '1.2.2'])('shows the inventory membership update only for companion 1.2.1 (installed %s)', async version => {
  mocks.request.mockResolvedValue({ installed: true, version });
  await act(async () => root.render(<CardLadderSyncPanel />));
  const notice = host.querySelector('[aria-label="CardLadder inventory removal update"]');
  if (version === '1.2.1') {
    expect(notice.textContent).toContain('Update to companion 1.2.2');
    expect(notice.textContent).toContain('run a fresh Sync Inventory');
    expect(notice.textContent).toContain('Existing captures cannot identify missing cards.');
  } else expect(notice).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not offer cards linked to a different CardLadder account for manual matching', async () => {
  const holding = { ...rayquazaCapture().holdings[0], currency: 'USD', cardLadderValueCurrency: 'USD', sales: [] };
  const foreign = linkedRayquaza({ entryId: 'foreign', name: 'Rayquaza (foreign)' });
  foreign.cardladderData.inventoryAccountKey = 'b'.repeat(64);
  const local = { ...linkedRayquaza({ entryId: 'local', name: 'Rayquaza (local)' }), cardladderData: undefined };
  mocks.items = [foreign, local];
  await loadReport(verifiedInventory([holding]));
  const options = [...host.querySelector('[aria-label="Link Rayquaza rayquaza-cgc10"]').options].map(option => option.value);
  expect(options).toContain('local');
  expect(options).not.toContain('foreign');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('removes a pending removal from the review when the same card is explicitly linked to a current holding', async () => {
  const local = linkedRayquaza({ name: 'Rayquaza (Holo)' });
  mocks.items = [local];
  const holding = { ...rayquazaCapture().holdings[0], currency: 'USD', cardLadderValueCurrency: 'USD', sales: [] };
  await loadReport(verifiedInventory([holding]));
  const checkbox = host.querySelector('[aria-label="Remove Rayquaza (Holo) linked-rayquaza"]');
  expect(checkbox).not.toBeNull();
  act(() => checkbox.click());
  const selector = host.querySelector('[aria-label="Link Rayquaza rayquaza-cgc10"]');
  act(() => { selector.value = local.entryId; selector.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('[aria-label="Cards missing from CardLadder Inventory"]')).toBeNull();
  clickNamedButton('Select all');
  expect(applyFooter().querySelector('button').textContent).toBe('Save 1 link');
  await act(async () => applyFooter().querySelector('button').click());
  expect(mocks.save.mock.calls[0][8].removals).toEqual([]);
});

it('limits Select all to 400 removals and allows the reviewed batch to be reduced', async () => {
  const base = linkedRayquaza();
  mocks.items = Array.from({ length: 401 }, (_, index) => ({ ...base, entryId: `linked-${index}`,
    cardladderData: { ...base.cardladderData, holdingId: `absent-${index}` } }));
  await loadReport(verifiedInventory());
  expect(host.textContent).toContain('You can remove up to 400 cards per save.');
  clickNamedButton('Select all');
  const checkboxes = [...host.querySelectorAll('[aria-label^="Remove Rayquaza "]')];
  expect(checkboxes.filter(input => input.checked)).toHaveLength(400);
  expect(checkboxes[400].checked).toBe(false);
  expect(checkboxes[400].disabled).toBe(true);
  expect(applyFooter().querySelector('button').textContent).toBe('Remove 400 cards from Inventory');
  act(() => checkboxes[0].click());
  expect(checkboxes[400].disabled).toBe(false);
  expect(applyFooter().querySelector('button').textContent).toBe('Remove 399 cards from Inventory');
  expect(mocks.save).not.toHaveBeenCalled();
});
