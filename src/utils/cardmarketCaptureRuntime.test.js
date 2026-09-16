import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCaptureRunner, filteredUrl, sameCapturePage } from '../../companion/cardmarket/capture.js';

const task = name => ({ entryId: name, name, binding: { productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4`, inventoryKey: name, condition: 'EX', language: 'English', finish: 'reverse', firstEdition: false } });
let stored, tabs, api, blocked;
beforeEach(() => {
  vi.useFakeTimers(); stored = {}; tabs = new Map(); blocked = new Set();
  api = {
    storage: { local: { set: vi.fn(async patch => { Object.assign(stored, structuredClone(patch)); }) } },
    tabs: {
      query: vi.fn(async () => [...tabs.values()]),
      create: vi.fn(async ({ url }) => { const tab = { id: tabs.size + 10, url, status: 'complete', windowId: 1 }; tabs.set(tab.id, tab); return tab; }),
      get: vi.fn(async id => { if (!tabs.has(id)) throw new Error('Closed tab'); return tabs.get(id); }),
      update: vi.fn(async (id, patch) => { Object.assign(tabs.get(id), patch); return tabs.get(id); }),
      remove: vi.fn(async id => tabs.delete(id)),
      sendMessage: vi.fn(async (id, message) => {
        const tab = tabs.get(id);
        if (message.action === 'ping') return blocked.has(new URL(tab.url).pathname) ? { ok: false, reason: 'verification' } : { ok: true };
        if (message.action === 'cancel') return { ok: true };
        return { ok: true, data: { complete: true, filteredUrl: tab.url, offers: [{ offerId: 'one', price: 100 }] } };
      }),
    },
    windows: { update: vi.fn(async () => {}) },
  };
});
afterEach(() => vi.useRealTimers());
async function finish(promise) { await vi.runAllTimersAsync(); await promise; }

it('accepts verification tokens and reordered queries but never another product or changed filters', () => {
  const url = filteredUrl(task('Blastoise').binding);
  const redirected = new URL(url); redirected.searchParams.sort(); redirected.searchParams.set('__cf_chl_rt_tk', 'test');
  expect(sameCapturePage(redirected.href, url)).toBe(true);
  expect(sameCapturePage(url.replace('language=1', 'language=7'), url)).toBe(false);
  expect(sameCapturePage(url.replace('Blastoise', 'Charizard'), url)).toBe(false);
  expect(sameCapturePage(url + '&language=7', url)).toBe(false);
  expect(sameCapturePage('https://example.com', url)).toBe(false);
});
it('persists completed cards at a verification pause, then resumes the same tab after a worker restart', async () => {
  const tasks = [task('Blastoise'), task('Charizard')];
  blocked.add(new URL(tasks[1].binding.productUrl).pathname);
  await finish(createCaptureRunner(api).run(tasks));
  expect(stored.status.state).toBe('paused');
  expect(stored.captureJob.nextIndex).toBe(1);
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise']);
  expect(api.tabs.create).toHaveBeenCalledTimes(1);
  const id = stored.captureJob.tabId;
  tabs.get(id).url += '&__cf_chl_rt_tk=after-human-verification';
  blocked.clear(); api.tabs.update.mockClear();
  await finish(createCaptureRunner(api).run(null, stored.captureJob));
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(api.tabs.create).toHaveBeenCalledTimes(1);
  expect(stored.captureJob).toBeNull();
  expect(stored.status.state).toBe('complete');
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise', 'Charizard']);
});
it('reuses an already verified matching page and keeps that user-owned tab open', async () => {
  const card = task('Blastoise');
  tabs.set(5, { id: 5, windowId: 1, url: filteredUrl(card.binding) + '&__cf_chl_rt_tk=done', status: 'complete' });
  await finish(createCaptureRunner(api).run([card]));
  expect(api.tabs.create).not.toHaveBeenCalled();
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(api.tabs.remove).not.toHaveBeenCalled();
  expect(stored.report.captures).toHaveLength(1);
});
it('keeps partial offers after a reader failure and stop clears the pending job without losing the report', async () => {
  const runner = createCaptureRunner(api);
  blocked.add(new URL(task('Charizard').binding.productUrl).pathname);
  await finish(runner.run([task('Blastoise'), task('Charizard')]));
  await runner.openReader(stored.captureJob);
  expect(api.windows.update).toHaveBeenCalledWith(1, { focused: true });
  await runner.cancel();
  expect(stored.captureJob).toBeNull();
  expect(stored.report.captures).toHaveLength(1);
});
it('does not accept a capture if the filters changed while the offers were loading', async () => {
  api.tabs.sendMessage.mockImplementation(async (id, message) => message.action === 'ping' ? { ok: true } : { ok: true, data: { complete: true, filteredUrl: tabs.get(id).url.replace('language=1', 'language=7'), offers: [] } });
  await finish(createCaptureRunner(api).run([task('Blastoise')]));
  expect(stored.status.state).toBe('paused');
  expect(stored.report.captures).toEqual([]);
});
it('times out an unreadable page into a resumable pause instead of an indefinite running state', async () => {
  api.tabs.sendMessage.mockResolvedValue({ ok: false });
  await finish(createCaptureRunner(api).run([task('Blastoise')]));
  expect(stored.status).toMatchObject({ state: 'paused', completed: 0, total: 1 });
  expect(stored.status.message).toContain('Resume capture');
  expect(api.tabs.remove).not.toHaveBeenCalled();
});

it('retries an explicit 503 document once and captures the confirmed product with its filters intact', async () => {
  const card = task('Blastoise');
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  let failed = true;
  api.tabs.sendMessage.mockImplementation(async (id, message) => message.action === 'ping' && failed
    ? { ok: false, reason: 'server-error', code: '503' }
    : sendMessage(id, message));
  api.tabs.reload = vi.fn(async () => { failed = false; });
  await finish(createCaptureRunner(api).run([card]));
  expect(api.tabs.reload).toHaveBeenCalledExactlyOnceWith(10);
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(stored.status.state).toBe('complete');
  expect(stored.captureJob).toBeNull();
  expect(stored.report.captures).toMatchObject([
    { entryId: card.entryId, inventoryKey: card.binding.inventoryKey, filteredUrl: filteredUrl(card.binding), offers: [{ offerId: 'one', price: 100 }] },
  ]);
});

it('continues capture when verification clears after two pings without reloading the reader', async () => {
  const card = task('Blastoise');
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  let pings = 0;
  api.tabs.sendMessage.mockImplementation(async (id, message) => message.action === 'ping' && ++pings <= 2
    ? { ok: false, reason: 'verification' }
    : sendMessage(id, message));
  api.tabs.reload = vi.fn(async () => {});
  await finish(createCaptureRunner(api).run([card]));
  expect(pings).toBe(3);
  expect(api.tabs.reload).not.toHaveBeenCalled();
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(stored.status.state).toBe('complete');
  expect(stored.captureJob).toBeNull();
  expect(stored.report.captures).toMatchObject([
    { entryId: card.entryId, inventoryKey: card.binding.inventoryKey, filteredUrl: filteredUrl(card.binding), offers: [{ offerId: 'one', price: 100 }] },
  ]);
});

it('keeps cached image bytes separate from offers and preserves completed prices if photo capture fails', async () => {
  api.storage.local.get = vi.fn(async () => structuredClone(stored));
  const capturePhotos = vi.fn(async () => ({ photos: { 'https://marketplace-article-scans.s3.cardmarket.com/1001/1001.jpg': 'data:image/jpeg;base64,aGVsbG8=' } }));
  await finish(createCaptureRunner(api, capturePhotos).run([task('Blastoise')]));
  expect(stored.status.state).toBe('complete');
  expect(stored.photoCache.runId).toBe(stored.report.runId);
  expect(JSON.stringify(stored.report)).not.toContain('data:image/');
  capturePhotos.mockRejectedValue(new Error('Photo unavailable'));
  await finish(createCaptureRunner(api, capturePhotos).run([task('Charizard')]));
  expect(stored.status.state).toBe('complete');
  expect(stored.report.captures[0].photoWarning).toContain('Original listing links');
  expect(stored.report.captures[0].offers[0].price).toBe(100);
});
