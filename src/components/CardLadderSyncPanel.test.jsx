import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), items: [] }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ user: { uid: 'test' }, db: {}, collectionItems: mocks.items, currency: 'EUR' }) }));
vi.mock('@/utils/cardLadderCompanion', () => ({ autoSyncKey: uid => `auto:${uid}`, companionRequest: mocks.request, saveCardLadderReport: mocks.save }));
import { CardLadderSyncPanel } from './CardLadderSyncPanel';
import { salesWindow } from '../utils/cardLadderSales';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.items = [{ entryId: 'owned', name: 'Lugia V', set: 'Silver Tempest', number: '186', isGraded: true, gradingCompany: 'PSA', grade: '10', gradedPrice: 1500, gradedPriceCurrency: 'USD' }];
  mocks.save.mockClear(); mocks.request.mockReset();
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
  expect(host.textContent).toContain('USD per card · legacy USD report');
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
  expect(host.textContent).toContain('USD per card · legacy USD report');
  const apply = [...host.querySelectorAll('button')].find(button => button.textContent === 'Apply 1 price update');
  expect(apply.disabled).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => apply.click());
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][2]).toBe(report);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it('labels the captured and existing currencies and never subtracts raw EUR from USD', async () => {
  const capturedAt = new Date().toISOString();
  const report = { schemaVersion: 2, source: 'cardladder-browser', currency: 'EUR', runId: 'new', capturedAt, ...salesWindow(capturedAt), collectionName: 'Inventory', collectionComplete: true,
    holdings: [{ holdingId: 'one', name: 'Lugia V', set: 'Silver Tempest', number: '186', currency: 'EUR', gradingCompany: 'PSA', grade: '10', complete: true,
      sales: [{ price: 1200, currency: 'EUR', soldDate: capturedAt.slice(0, 10), title: 'Lugia V 186 PSA 10', type: 'Auction', url: 'https://www.ebay.com/itm/12345678' }] }] };
  mocks.request.mockImplementation(async action => action === 'report' ? report : { installed: true, runId: 'new', version: '1.1.0' });
  await act(async () => root.render(<CardLadderSyncPanel />));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Preview latest capture').click());
  expect(host.textContent).toContain('EUR per card');
  expect(host.textContent).toMatch(/EUR\s*1,200\.00/);
  expect(host.textContent).toMatch(/USD\s*1,500\.00/);
  expect(host.textContent).toContain('Different currencies');
  expect(host.textContent).not.toContain('-300');
  expect(mocks.save).not.toHaveBeenCalled();
});
