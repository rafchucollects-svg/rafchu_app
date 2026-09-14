import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let api, stored, listener, readProducts, blocked;
const task = name => ({ entryId: name, inventoryKey: name, name, set: 'Expedition Base Set', number: '4' });
const candidate = name => ({ name, set: 'Expedition Base Set', number: '4', productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4` });
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); stored = {}; blocked = false;
  let tab;
  readProducts = vi.fn(async message => ({ ok: true, data: { candidates: [candidate(message.task.name)], nextUrl: null } }));
  api = {
    runtime: { getManifest: () => ({ version: '0.3.3' }), onMessage: { addListener: fn => { listener = fn; } } },
    storage: { local: {
      get: vi.fn(async () => structuredClone(stored)),
      set: vi.fn(async patch => Object.assign(stored, structuredClone(patch))),
    } },
    tabs: {
      create: vi.fn(async patch => { tab = { ...patch, id: 1, status: 'complete' }; return tab; }),
      update: vi.fn(async (_id, patch) => Object.assign(tab, patch)),
      get: vi.fn(async () => tab),
      remove: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_id, message) => message.action === 'ping' ? { ok: !blocked } : readProducts(message)),
    },
  };
  vi.stubGlobal('chrome', api);
  await import('../../companion/cardmarket/background.js');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const request = (action, tasks) => new Promise(resolve => listener({ channel: 'rafchu-cardmarket', action, tasks }, { url: 'https://rafchu-tcg-app.firebaseapp.com/vendor/inventory' }, resolve));

it('reports an unmatched expansion per card and continues to later cards', async () => {
  readProducts.mockImplementation(async message => message.task.name === 'Unknown'
    ? { ok: false, code: 'expansion-mismatch', error: 'No unique expansion match.' }
    : { ok: true, data: { candidates: [candidate(message.task.name)], nextUrl: null } });
  expect(await request('suggest', [task('Unknown'), task('Blastoise')])).toMatchObject({ ok: true });
  await vi.runAllTimersAsync();
  expect(stored.status.state).toBe('complete');
  expect(stored.products.results).toMatchObject([{ entryId: 'Unknown', error: 'No unique expansion match.' }, { entryId: 'Blastoise', candidates: [candidate('Blastoise')] }]);
});

it('persists and exposes partial suggestions while the next card is waiting, then preserves them on verification failure', async () => {
  await request('suggest', [task('Blastoise'), task('Charizard')]);
  await vi.advanceTimersByTimeAsync(1300);
  expect(stored.status.state).toBe('running');
  expect(stored.products.results.map(row => row.entryId)).toEqual(['Blastoise']);
  expect((await request('status')).data.productRevision).toBe(`${stored.products.runId}:1`);
  blocked = true;
  await vi.runAllTimersAsync();
  expect(stored.status.state).toBe('error');
  expect(stored.status.message).toContain('verification');
  expect(stored.products.results).toHaveLength(1);
  expect(readProducts).toHaveBeenCalledTimes(1);
  expect(api.tabs.remove).not.toHaveBeenCalled();
});

it('searches duplicate identities once and keeps a result for each inventory entry', async () => {
  await request('suggest', [task('Blastoise'), { ...task('Blastoise'), entryId: 'copy-two' }]);
  await vi.runAllTimersAsync();
  expect(readProducts).toHaveBeenCalledTimes(1);
  expect(stored.products.results.map(row => row.entryId)).toEqual(['Blastoise', 'copy-two']);
  expect(api.tabs.remove).toHaveBeenCalledTimes(1);
});
