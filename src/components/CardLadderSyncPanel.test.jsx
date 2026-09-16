import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), items: [], preferences: {} }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ user: { uid: 'test' }, db: {}, collectionItems: mocks.items, ...mocks.preferences }) }));
vi.mock('@/utils/cardLadderCompanion', () => ({ autoSyncKey: uid => `auto:${uid}`, companionRequest: mocks.request, saveCardLadderReport: mocks.save }));
import { CardLadderSyncPanel } from './CardLadderSyncPanel';
import { salesWindow } from '../utils/cardLadderSales';
import { formatCurrency } from '../utils/cardHelpers';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.items = [{ entryId: 'owned', name: 'Lugia V', set: 'Silver Tempest', number: '186', isGraded: true, gradingCompany: 'PSA', grade: '10', gradedPrice: 1500, gradedPriceCurrency: 'USD' }];
  mocks.preferences = { currency: 'EUR', secondaryCurrency: null, roundUpPrices: false };
  mocks.save.mockReset(); mocks.save.mockResolvedValue({ updatedCount: 1, addedCount: 0 }); mocks.request.mockReset();
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
  expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Apply 0 price updates').disabled).toBe(true);
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
  const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply 1 price update');
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
  expect(host.textContent).toContain(`Your current sticker price (${displayed(201, 200.25 / 0.79 * 0.92, 'GBP', 'EUR')}) remains active`);
  expect(host.textContent).toContain(`View ${displayed(948, 1104, 'GBP', 'EUR')} sale`);
  mocks.preferences = { currency: 'USD', secondaryCurrency: 'GBP', roundUpPrices: false };
  await act(async () => root.render(<CardLadderSyncPanel />));
  expect(amountBeside('Current sticker price')).toBe(displayed(200.25 / 0.79, 200.25, 'USD', 'GBP'));
  expect(amountBeside('14-day high')).toBe(displayed(1200, 948, 'USD', 'GBP'));
  expect(report).toEqual(original);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply 1 price update').click());
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
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply 1 price update').click());
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
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent.startsWith('Apply ') && button.textContent.includes('add 1 new card')).click());
  expect(mocks.save.mock.calls[0][4]).toMatchObject({ one: { buyPrice: '79', buyPriceCurrency: 'GBP' } });
});
