import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

it('opens a visible reader, waits out old/loading documents, and keeps a fixed window across midnight', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T23:59:59Z'));
  const stored = {};
  let listener;
  let destination = '';
  let navigationPolls = 0;
  let navigationFinished = false;
  const holding = { holdingId: 'one', name: 'Lugia V', number: '186', currency: 'USD', gradingCompany: 'PSA', grade: '10', collectionUrl: 'https://app.cardladder.com/collection?cardId=one' };
  const chrome = {
    runtime: {
      getURL: () => 'chrome-extension://test/', getManifest: () => ({ version: '1.0.2' }),
      onMessage: { addListener: fn => { listener = fn; } }, onStartup: { addListener: vi.fn() },
    },
    storage: { local: { get: async () => stored, set: async values => Object.assign(stored, values) } },
    alarms: { onAlarm: { addListener: vi.fn() } },
    tabs: {
      create: vi.fn(async () => ({ id: 123 })), remove: vi.fn(async () => {}),
      update: vi.fn(async (_id, { url }) => { destination = url; navigationPolls = 0; navigationFinished = false; }),
      get: vi.fn(async () => {
        navigationPolls++;
        if (navigationPolls === 1) return { url: 'https://app.cardladder.com/previous', status: 'complete' };
        if (navigationPolls === 2) return { url: destination, status: 'loading' };
        navigationFinished = true;
        return { url: destination, status: 'complete' };
      }),
      sendMessage: vi.fn(async (_id, message) => {
        if (destination) expect(navigationFinished).toBe(true);
        if (message.command === 'currency') return { ok: true, data: 'USD' };
        if (message.command === 'inventory') return { ok: true, data: [holding] };
        if (message.command === 'holding') return { ok: true, data: { profileUrl: 'https://app.cardladder.com/profiles/psa-123' } };
        if (message.command === 'sales') {
          expect(message).toMatchObject({ startDate: '2026-08-23', endDate: '2026-09-06', profileId: 'psa-123', grade: '10', currency: 'USD' });
          return { ok: true, data: { complete: true, sales: [] } };
        }
        return { ok: true };
      }),
    },
  };
  vi.stubGlobal('chrome', chrome);
  await import('../../companion/cardladder/background.js');
  await new Promise(resolve => listener({ channel: 'rafchu-companion', action: 'start' }, { url: 'chrome-extension://test/popup.html' }, resolve));
  await vi.runAllTimersAsync();
  expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://app.cardladder.com/account', active: true });
  expect(chrome.tabs.get).toHaveBeenCalledTimes(12);
  expect(stored.status.state).toBe('complete');
  expect(stored.report).toMatchObject({ collectionComplete: true, endDate: '2026-09-06', currency: 'USD', schemaVersion: 2, holdings: [{ complete: true }] });
  expect(new Date().toISOString().startsWith('2026-09-07')).toBe(true);
  expect(chrome.tabs.remove).toHaveBeenCalledWith(123);
});

it.each(['EUR', 'CAD'])('pins %s and keeps the previous report if the account currency changes', async currency => {
  vi.useFakeTimers();
  const oldReport = { runId: 'previous-capture' };
  const stored = { report: oldReport };
  let listener, destination, reads = 0;
  const chrome = {
    runtime: { getURL: () => 'chrome-extension://test/', onMessage: { addListener: fn => { listener = fn; } }, onStartup: { addListener: vi.fn() } },
    storage: { local: { get: async () => stored, set: async value => Object.assign(stored, value) } },
    alarms: { onAlarm: { addListener: vi.fn() } },
    tabs: {
      create: vi.fn(async () => ({ id: 1 })), remove: vi.fn(async () => {}),
      update: vi.fn(async (_id, { url }) => { destination = url; }),
      get: async () => ({ url: destination, status: 'complete' }),
      sendMessage: vi.fn(async (_id, message) => {
        if (message.command === 'currency') return { ok: true, data: ++reads === 1 ? currency : 'USD' };
        if (message.command === 'inventory') {
          expect(message.currency).toBe(currency);
          return { ok: true, data: [] };
        }
        return { ok: true };
      }),
    },
  };
  vi.stubGlobal('chrome', chrome);
  await import('../../companion/cardladder/background.js');
  await new Promise(resolve => listener({ channel: 'rafchu-companion', action: 'start' }, { url: 'chrome-extension://test/popup.html' }, resolve));
  await vi.runAllTimersAsync();
  expect(reads).toBe(2);
  expect(stored.report).toBe(oldReport);
  expect(stored.status).toMatchObject({ state: 'error', message: expect.stringMatching(/currency changed/) });
  expect(chrome.tabs.remove).toHaveBeenCalledWith(1);
});
