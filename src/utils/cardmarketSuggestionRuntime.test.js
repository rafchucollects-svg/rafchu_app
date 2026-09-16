import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let api, stored, listener, readProducts, blocked;
const task = name => ({ entryId: name, inventoryKey: name, name, set: 'Expedition Base Set', number: '4' });
const candidate = name => ({ name, set: 'Expedition Base Set', number: '4', productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4` });
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetModules(); stored = {}; blocked = false;
  let tab;
  readProducts = vi.fn(async message => ({ ok: true, data: { candidates: [candidate(message.task.name)], nextUrl: null } }));
  api = {
    runtime: { getManifest: () => ({ version: '0.3.4' }), onMessage: { addListener: fn => { listener = fn; } } },
    storage: { local: {
      get: vi.fn(async () => structuredClone(stored)),
      set: vi.fn(async patch => Object.assign(stored, structuredClone(patch))),
    } },
    tabs: {
      create: vi.fn(async patch => { tab = { ...patch, id: 1, status: 'complete' }; return tab; }),
      update: vi.fn(async (_id, patch) => Object.assign(tab, patch)),
      get: vi.fn(async () => tab),
      remove: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_id, message) => message.action === 'ping' ? { ok: !blocked, ...(blocked ? { reason: 'verification' } : {}) } : readProducts(message)),
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

it.each(['loop', 'limit'])('continues after a pagination %s and marks incomplete results for review', async failure => {
  let pages = 0;
  readProducts.mockImplementation(async message => ({ ok: true, data: message.task.name === 'Charizard'
    ? { candidates: [candidate('Charizard')], nextUrl: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard+4${failure === 'limit' ? `&site=${++pages}` : ''}` }
    : { candidates: [candidate(message.task.name)], nextUrl: null } }));
  await request('suggest', [task('Charizard'), task('Blastoise')]);
  await vi.runAllTimersAsync();
  expect(stored.suggestionJob).toBeNull();
  expect(stored.status.state).toBe('complete');
  expect(stored.status.message).toContain('Suggestions available for 1/2 cards; 1 card needs review');
  expect(stored.products.results).toMatchObject([
    { entryId: 'Charizard', candidates: [], error: expect.stringMatching(/pagination|Too many search pages/) },
    { entryId: 'Blastoise', candidates: [candidate('Blastoise')] },
  ]);
  expect(readProducts).toHaveBeenCalledTimes(failure === 'loop' ? 2 : 9);
});

it('keeps an earlier exact suggestion while reporting that its new search was incomplete', async () => {
  stored.products = { runId: 'earlier', results: [
    { ...task('Charizard'), candidates: [candidate('Charizard')], searchedAt: new Date().toISOString() },
  ] };
  readProducts.mockImplementation(async message => ({ ok: true, data: message.task.name === 'Charizard'
    ? { candidates: [], nextUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard+4' }
    : { candidates: [candidate(message.task.name)], nextUrl: null } }));
  await request('suggest', [task('Charizard'), task('Blastoise')]);
  await vi.runAllTimersAsync();
  expect(stored.status.message).toContain('Suggestions available for 2/2 cards; 1 card needs review');
  expect(stored.products.results).toMatchObject([
    { entryId: 'Charizard', candidates: [candidate('Charizard')], error: expect.stringContaining('pagination') },
    { entryId: 'Blastoise', candidates: [candidate('Blastoise')] },
  ]);
});

it('persists and exposes partial suggestions while the next card is waiting, then preserves them on verification failure', async () => {
  await request('suggest', [task('Blastoise'), task('Charizard')]);
  await vi.advanceTimersByTimeAsync(1300);
  expect(stored.status.state).toBe('running');
  expect(stored.products.results.map(row => row.entryId)).toEqual(['Blastoise']);
  expect((await request('status')).data.productRevision).toBe(`${stored.products.runId}:1`);
  blocked = true;
  await vi.runAllTimersAsync();
  expect(stored.status.state).toBe('paused');
  expect(stored.status.message).toContain('verification');
  expect(stored.products.results).toHaveLength(1);
  expect(readProducts).toHaveBeenCalledTimes(1);
  expect(api.tabs.remove).not.toHaveBeenCalled();
});

it('resumes the unfinished card in the same verified reader after a worker restart', async () => {
  await request('suggest', [task('Blastoise'), task('Charizard')]);
  await vi.advanceTimersByTimeAsync(1300);
  blocked = true;
  await vi.runAllTimersAsync();
  expect(stored.suggestionJob.nextIndex).toBe(1);
  const url = stored.suggestionJob.search.nextUrl;
  const originalRun = stored.products.runId;
  vi.resetModules(); await import('../../companion/cardmarket/background.js');
  expect((await request('status')).data).toMatchObject({ canResumeSuggestions: true, hasSuggestionJob: true });
  api.tabs.update.mockClear(); blocked = false;
  await request('resume-suggestions');
  await vi.runAllTimersAsync();
  expect(stored.suggestionJob).toBeNull();
  expect(stored.status.state).toBe('complete');
  expect(stored.products.runId).toBe(originalRun);
  expect(stored.products.results.map(row => row.entryId)).toEqual(['Blastoise', 'Charizard']);
  expect(api.tabs.create).toHaveBeenCalledTimes(1);
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(url).toContain('Charizard');
});

it('keeps previous exact links when a fresh retry is blocked or returns no matches', async () => {
  stored.products = { runId: 'earlier', results: [
    { ...task('Blastoise'), candidates: [candidate('Blastoise')], searchedAt: new Date().toISOString() },
    { ...task('Charizard'), candidates: [candidate('Charizard')], searchedAt: new Date().toISOString() },
  ] };
  readProducts.mockImplementation(async () => { blocked = true; return { ok: true, data: { candidates: [], nextUrl: null } }; });
  await request('suggest', [task('Blastoise'), task('Charizard')]);
  await vi.runAllTimersAsync();
  expect(stored.products.results).toHaveLength(2);
  expect(stored.products.results.every(row => row.candidates.length === 1)).toBe(true);
  expect(stored.suggestionJob.nextIndex).toBe(1);
  expect(stored.products.revision).toBe(1);
  expect((await request('status')).data.productRevision).toBe(`${stored.products.runId}:1`);
});

it('does not retain expired suggestions or suggestions for changed card identities', async () => {
  stored.products = { results: [
    { ...task('Blastoise'), candidates: [candidate('Blastoise')], searchedAt: new Date(Date.now() - 86400001).toISOString() },
    { ...task('Charizard'), inventoryKey: 'old-identity', candidates: [candidate('Charizard')], searchedAt: new Date().toISOString() },
  ] };
  blocked = true;
  await request('suggest', [task('Blastoise'), task('Charizard')]);
  await vi.runAllTimersAsync();
  expect(stored.products.results).toEqual([]);
});

it('stops a paused search without erasing completed suggestions or leaving a resumable queue', async () => {
  await request('suggest', [task('Blastoise'), task('Charizard')]);
  await vi.advanceTimersByTimeAsync(1300); blocked = true;
  await vi.runAllTimersAsync();
  await request('cancel');
  expect(stored.suggestionJob).toBeNull();
  expect(stored.products.results.map(row => row.entryId)).toEqual(['Blastoise']);
  expect((await request('status')).data.canResumeSuggestions).toBe(false);
});

it('searches duplicate identities once and keeps a result for each inventory entry', async () => {
  await request('suggest', [task('Blastoise'), { ...task('Blastoise'), entryId: 'copy-two' }]);
  await vi.runAllTimersAsync();
  expect(readProducts).toHaveBeenCalledTimes(1);
  expect(stored.products.results.map(row => row.entryId)).toEqual(['Blastoise', 'copy-two']);
  expect(api.tabs.remove).toHaveBeenCalledTimes(1);
});
