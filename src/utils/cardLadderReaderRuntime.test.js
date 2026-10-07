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
        if (message.command === 'accountKey') return { ok: true, data: 'a'.repeat(64) };
        if (message.command === 'inventory') return { ok: true, data: { holdings: [structuredClone(holding)], total: 1, verifiedAt: new Date().toISOString() } };
        if (message.command === 'holding') return { ok: true, data: { profileUrl: 'https://app.cardladder.com/profiles/matched-999', salesUrl: 'https://app.cardladder.com/sales-history?filters=grader:psa|grade:g10|profileId:psa-123&sort=date&direction=desc' } };
        if (message.command === 'sales') {
          expect(message).toMatchObject({ startDate: '2026-08-23', endDate: '2026-09-06', profileId: 'psa-123', gradingCompany: 'PSA', grade: '10', currency: 'USD', holding });
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
  expect(chrome.tabs.get).toHaveBeenCalledTimes(15);
  expect(stored.status.state).toBe('complete');
  expect(stored.report).toMatchObject({ collectionComplete: true, endDate: '2026-09-06', currency: 'USD', schemaVersion: 2, holdings: [{ complete: true }], inventorySnapshot: { version: 1, collectionName: 'Inventory', total: 1, holdingIds: ['one'], accountKey: 'a'.repeat(64) } });
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
          return { ok: true, data: { holdings: [], total: 0, verifiedAt: new Date().toISOString() } };
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

async function runMembershipCapture(first, last = first, accountKeys = ['a'.repeat(64), 'a'.repeat(64)], { failSales = [], failFinalRead = false } = {}) {
  vi.useFakeTimers();
  const previousReport = { runId: 'previous-capture' };
  const stored = { report: previousReport };
  let listener, destination, inventoryReads = 0, accountReads = 0;
  const chrome = {
    runtime: { getURL: () => 'chrome-extension://test/', onMessage: { addListener: fn => { listener = fn; } }, onStartup: { addListener: vi.fn() } },
    storage: { local: { get: async () => stored, set: async value => Object.assign(stored, value) } },
    alarms: { onAlarm: { addListener: vi.fn() } },
    tabs: {
      create: vi.fn(async () => ({ id: 1 })), remove: vi.fn(async () => {}),
      update: vi.fn(async (_id, { url }) => { destination = url; }),
      get: async () => ({ url: destination, status: 'complete' }),
      sendMessage: vi.fn(async (_id, message) => {
        if (message.command === 'currency') return { ok: true, data: 'USD' };
        if (message.command === 'accountKey') return { ok: true, data: accountKeys[accountReads++] };
        if (message.command === 'inventory') {
          inventoryReads++;
          if (inventoryReads === 2 && failFinalRead) return { ok: false, error: 'Inventory did not fully load.' };
          const holdings = structuredClone(inventoryReads === 1 ? first : last);
          return { ok: true, data: { holdings, total: holdings.length, verifiedAt: new Date().toISOString() } };
        }
        if (message.command === 'holding') return { ok: true, data: { profileUrl: 'https://app.cardladder.com/profiles/psa-123', salesUrl: 'https://app.cardladder.com/sales-history?filters=grader:psa|grade:g10|profileId:psa-123&sort=date&direction=desc' } };
        if (message.command === 'sales') return failSales.includes(message.holding.holdingId) ? { ok: false, error: 'Sales did not fully load.' } : { ok: true, data: { complete: true, sales: [] } };
        return { ok: true };
      }),
    },
  };
  vi.stubGlobal('chrome', chrome);
  await import('../../companion/cardladder/background.js');
  await new Promise(resolve => listener({ channel: 'rafchu-companion', action: 'start' }, { url: 'chrome-extension://test/popup.html' }, resolve));
  await vi.runAllTimersAsync();
  return { stored, previousReport, inventoryReads, accountReads };
}
const membershipHolding = (id, company = 'PSA') => ({ holdingId: id, name: 'Lugia V', number: '186', set: '2022 Pokemon Silver Tempest', variation: '', currency: 'USD', gradingCompany: company, grade: '10', collectionUrl: `https://app.cardladder.com/collection?cardId=${id}`, complete: false, sales: [] });

it('verifies membership twice and retains unsupported and sales-failed holdings in the proof', async () => {
  const holdings = [membershipHolding('z'), membershipHolding('a', 'SGC'), membershipHolding('b')];
  const { stored, inventoryReads, accountReads } = await runMembershipCapture(holdings, [...holdings].reverse(), undefined, { failSales: ['b'] });
  expect(inventoryReads).toBe(2);
  expect(accountReads).toBe(2);
  expect(stored.report.inventorySnapshot).toMatchObject({ version: 1, collectionName: 'Inventory', accountKey: 'a'.repeat(64), total: 3, holdingIds: ['a', 'b', 'z'] });
  expect(stored.report.holdings).toEqual([expect.objectContaining({ holdingId: 'z', complete: true }), expect.objectContaining({ holdingId: 'a', complete: false }), expect.objectContaining({ holdingId: 'b', complete: false })]);
  expect(Date.parse(stored.report.inventorySnapshot.verifiedAt)).toBeGreaterThanOrEqual(Date.parse(stored.report.capturedAt));
});

it.each([
  [[membershipHolding('a')], [], /membership changed/],
  [[membershipHolding('a')], [membershipHolding('b')], /membership changed/],
  [[membershipHolding('a')], [{ ...membershipHolding('a'), name: 'Different card' }], /holding changed/],
])('keeps the old report when final membership or card identity differs', async (first, last, error) => {
  const { stored, previousReport } = await runMembershipCapture(first, last);
  expect(stored.report).toBe(previousReport);
  expect(stored.status).toMatchObject({ state: 'error', message: expect.stringMatching(error) });
});

it('keeps the old report when final collection enumeration is incomplete', async () => {
  const { stored, previousReport } = await runMembershipCapture([membershipHolding('a')], undefined, undefined, { failFinalRead: true });
  expect(stored.report).toBe(previousReport);
  expect(stored.status).toMatchObject({ state: 'error', message: expect.stringMatching(/did not fully load/) });
});

it('verifies an empty source with two completed enumerations and a stable account scope', async () => {
  const { stored, inventoryReads } = await runMembershipCapture([]);
  expect(inventoryReads).toBe(2);
  expect(stored.report).toMatchObject({ holdings: [], inventorySnapshot: { accountKey: 'a'.repeat(64), total: 0, holdingIds: [] } });
});

it('rejects an account switch instead of comparing a different account’s inventory', async () => {
  const { stored, previousReport } = await runMembershipCapture([], [], ['a'.repeat(64), 'b'.repeat(64)]);
  expect(stored.report).toBe(previousReport);
  expect(stored.status).toMatchObject({ state: 'error', message: expect.stringMatching(/account changed/) });
});

it.each([[null, null], ['a'.repeat(64), null], [null, 'a'.repeat(64)]])('keeps prices/additions available without removal proof when account scope is unreadable: %j', async (firstKey, lastKey) => {
  const { stored } = await runMembershipCapture([membershipHolding('a')], undefined, [firstKey, lastKey]);
  expect(stored.status.state).toBe('complete');
  expect(stored.report.holdings[0].complete).toBe(true);
  expect(stored.report.inventorySnapshot).toBeUndefined();
  expect(stored.report.inventorySnapshotWarning).toMatch(/cannot reconcile removals/);
  expect(stored.status.message).toContain(stored.report.inventorySnapshotWarning);
});
