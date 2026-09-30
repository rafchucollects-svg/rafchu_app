import captureHtml from '../../companion/cardladder/capture.html?raw';
import popupHtml from '../../companion/cardladder/popup.html?raw';
import companionBuild from '../../scripts/build-cardladder-companion.mjs?raw';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./cardLadderCompanion.js', () => ({ companionRequest: vi.fn(() => { throw new Error('Packaged reports must use extension messages.'); }) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('the packaged report shows an older last sale beside the two-week high with currency and source', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  document.documentElement.innerHTML = captureHtml;
  const report = {
    schemaVersion: 2, source: 'cardladder-browser', collectionName: 'Inventory', collectionComplete: true, runId: 'test', capturedAt: new Date().toISOString(), startDate: '2026-09-16', endDate: '2026-09-30', currency: 'EUR',
    holdings: [{ holdingId: 'one', name: 'Lugia V', number: '186', set: '2022 Pokemon Silver Tempest', variation: '', gradingCompany: 'BGS', grade: '9.5', currency: 'EUR', complete: true, sales: [], latestSale: { price: 222, soldDate: '2026-09-08', title: 'Lugia V 186 BGS 9.5', type: 'Auction', currency: 'EUR', url: 'https://www.ebay.com/itm/123456789' } }],
  };
  vi.stubGlobal('location', { protocol: 'chrome-extension:' });
  const sendMessage = vi.fn(async message => ({ ok: true, data: message.action === 'report' ? report : { runId: 'test', version: '1.2.0', status: { state: 'complete', message: 'Ready.' } } }));
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  await import('../../companion/cardladder/capture.js');
  await vi.advanceTimersByTimeAsync(0);
  const cells = [...document.querySelectorAll('#rows td')];
  expect(cells[1].textContent).toBe('BGS 9.5');
  expect(cells[4].textContent).toBe('—');
  expect(cells[5].textContent).toContain('EUR');
  expect(cells[5].textContent).toContain('222');
  expect(cells[5].textContent).toContain('Older than the 14-day window');
  expect(cells[5].querySelector('a')).toMatchObject({ href: 'https://www.ebay.com/itm/123456789', textContent: '2026-09-08' });
  expect(document.querySelector('#summary').textContent).toContain('0 with eligible sales');
  expect(sendMessage.mock.calls.every(([message]) => ['status', 'report'].includes(message.action))).toBe(true);
});

it('the extension popup opens its packaged report without broadening permissions', async () => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = popupHtml;
  const create = vi.fn(async () => {});
  vi.stubGlobal('chrome', { runtime: { getURL: path => `chrome-extension://test/${path}`, sendMessage: vi.fn(async () => ({ ok: true, data: { runId: 'test', daily: false } })) }, tabs: { create } });
  await import('../../companion/cardladder/popup.js');
  await vi.advanceTimersByTimeAsync(0);
  const view = document.querySelector('#view-report');
  expect(view.disabled).toBe(false);
  view.click();
  expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test/capture.html', active: true });
  const build = companionBuild;
  expect(build).toContain("'capture'");
  expect(build).toContain("'capture.html'");
});
