import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCaptureRunner, filteredUrl, sameCapturePage } from '../../companion/cardmarket/capture.js';

const task = name => ({ entryId: name, name, binding: { productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4`, inventoryKey: name, condition: 'EX', language: 'English', finish: 'reverse', firstEdition: false } });
let stored, tabs, api, blocked;
beforeEach(() => {
  vi.useFakeTimers(); stored = {}; tabs = new Map(); blocked = new Set();
  api = {
    storage: { local: { get: vi.fn(async () => structuredClone(stored)), set: vi.fn(async patch => { Object.assign(stored, structuredClone(patch)); }) } },
    tabs: {
      query: vi.fn(async () => [...tabs.values()]),
      create: vi.fn(async ({ url }) => { const tab = { id: tabs.size + 10, url, status: 'complete', windowId: 1 }; tabs.set(tab.id, tab); return tab; }),
      get: vi.fn(async id => { if (!tabs.has(id)) throw new Error('Closed tab'); return tabs.get(id); }),
      update: vi.fn(async (id, patch) => { Object.assign(tabs.get(id), patch); return tabs.get(id); }),
      reload: vi.fn(async () => {}),
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

const paginationFailure = () => ({ ok: false, code: 'preview-incomplete', error: 'Cardmarket did not load the next offer page completely. Current prices were preserved.', data: { complete: false, offers: [{ offerId: 'partial', price: 1 }] } });
function failPaginationFor(name, failures = Infinity) {
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  let attempts = 0;
  api.tabs.sendMessage.mockImplementation(async (id, message) => {
    if (message.action === 'capture' && new URL(tabs.get(id).url).pathname === new URL(task(name).binding.productUrl).pathname && attempts++ < failures) return paginationFailure();
    return sendMessage(id, message);
  });
  return () => attempts;
}

it('retries a stalled product once from a fresh page and saves only its complete second capture', async () => {
  const hooh = task('Ho-Oh'), attempts = failPaginationFor(hooh.name, 1);
  api.tabs.reload.mockImplementation(async id => {
    expect(stored.captureJob.paginationRetry).toMatchObject({ entryId: hooh.entryId, inventoryKey: hooh.binding.inventoryKey, filteredUrl: filteredUrl(hooh.binding), stage: 'attempted' });
    expect(tabs.get(id).url).toBe(filteredUrl(hooh.binding));
    expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise']);
  });
  await finish(createCaptureRunner(api).run([task('Blastoise'), hooh, task('Charizard')]));
  expect(attempts()).toBe(2);
  expect(api.tabs.reload).toHaveBeenCalledExactlyOnceWith(10);
  expect(stored.status).toMatchObject({ state: 'complete', completed: 3, failed: 0, total: 3 });
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise', 'Ho-Oh', 'Charizard']);
  expect(stored.report.captures.every(row => row.complete && row.offers[0].offerId === 'one')).toBe(true);
  expect(stored.report.errors).toEqual([]);
});

it('records a persistent per-card error durably and continues to the next confirmed product', async () => {
  const hooh = task('Ho-Oh'), attempts = failPaginationFor(hooh.name);
  const capturePhotos = vi.fn(async (_api, _tabId, _data, photos) => ({ photos }));
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  api.tabs.sendMessage.mockImplementation(async (id, message) => {
    if (message.action === 'capture' && tabs.get(id).url.includes('/Charizard-')) {
      expect(stored.captureJob.nextIndex).toBe(2);
      expect(stored.captureJob.paginationRetry).toBeUndefined();
      expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise']);
      expect(stored.report.errors).toHaveLength(1);
      expect(stored.status).toMatchObject({ completed: 1, failed: 1, total: 3 });
    }
    return sendMessage(id, message);
  });
  await finish(createCaptureRunner(api, capturePhotos).run([task('Blastoise'), hooh, task('Charizard')]));
  expect(attempts()).toBe(2);
  expect(api.tabs.reload).toHaveBeenCalledTimes(1);
  expect(stored.captureJob).toBeNull();
  expect(stored.status).toMatchObject({ state: 'complete', completed: 2, failed: 1, total: 3 });
  expect(stored.status.message).toContain('2/3 products saved for review; 1 failed');
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise', 'Charizard']);
  expect(stored.report.errors).toEqual([{ entryId: hooh.entryId, inventoryKey: hooh.binding.inventoryKey, name: hooh.name, binding: hooh.binding, failedAt: expect.any(String), error: paginationFailure().error, code: 'preview-incomplete' }]);
  expect(Number.isNaN(Date.parse(stored.report.errors[0].failedAt))).toBe(false);
  expect(capturePhotos).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(stored.report)).not.toContain('partial');
});

it.each(['verification', 'server-error', 'page-unavailable', undefined])('keeps %s reader failures resumable without treating them as per-card pagination errors', async code => {
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  api.tabs.sendMessage.mockImplementation(async (id, message) => message.action === 'capture' && tabs.get(id).url.includes('/Ho-Oh-')
    ? { ok: false, error: 'Reader requires attention.', code }
    : sendMessage(id, message));
  await finish(createCaptureRunner(api).run([task('Blastoise'), task('Ho-Oh'), task('Charizard')]));
  expect(stored.status).toMatchObject({ state: 'paused', completed: 1, failed: 0, total: 3 });
  expect(stored.captureJob.nextIndex).toBe(1);
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise']);
  expect(stored.report.errors).toEqual([]);
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it.each(['verification', 'server-error'])('does not refresh or skip a product if a %s document appears after a pagination response', async reason => {
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  let failed = false;
  api.tabs.sendMessage.mockImplementation(async (id, message) => {
    if (message.action === 'capture') { failed = true; return paginationFailure(); }
    return failed && message.action === 'ping' ? { ok: false, reason } : sendMessage(id, message);
  });
  await finish(createCaptureRunner(api).run([task('Ho-Oh'), task('Charizard')]));
  expect(stored.status).toMatchObject({ state: 'paused', completed: 0, failed: 0, total: 2 });
  expect(stored.captureJob.nextIndex).toBe(0);
  expect(stored.report.errors).toEqual([]);
  expect(api.tabs.reload).not.toHaveBeenCalled();
  expect(api.tabs.update).not.toHaveBeenCalled();
});

it('rechecks verification immediately before refresh and retains the pending retry for Resume', async () => {
  const hooh = task('Ho-Oh');
  failPaginationFor(hooh.name);
  const set = api.storage.local.set.getMockImplementation();
  let challengeIntroduced = false;
  api.storage.local.set.mockImplementation(async patch => {
    await set(patch);
    if (!challengeIntroduced && patch.status?.message.includes('Retrying incomplete offer pages')) {
      challengeIntroduced = true;
      blocked.add(new URL(hooh.binding.productUrl).pathname);
    }
  });
  await finish(createCaptureRunner(api).run([hooh, task('Charizard')]));
  expect(stored.status.state).toBe('paused');
  expect(stored.captureJob.paginationRetry.stage).toBe('pending');
  expect(api.tabs.reload).not.toHaveBeenCalled();
  expect(stored.report.errors).toEqual([]);
  blocked.clear();
  await finish(createCaptureRunner(api).run(null, stored.captureJob));
  expect(api.tabs.reload).toHaveBeenCalledTimes(1);
  expect(stored.status).toMatchObject({ state: 'complete', completed: 1, failed: 1, total: 2 });
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Charizard']);
});

it('keeps the retry budget across a worker restart after refresh and continues when that retry still fails', async () => {
  const hooh = task('Ho-Oh'), attempts = failPaginationFor(hooh.name);
  api.tabs.reload.mockImplementation(async () => blocked.add(new URL(hooh.binding.productUrl).pathname));
  await finish(createCaptureRunner(api).run([task('Blastoise'), hooh, task('Charizard')]));
  expect(stored.status).toMatchObject({ state: 'paused', completed: 1, failed: 0, total: 3 });
  expect(stored.captureJob.paginationRetry.stage).toBe('attempted');
  expect(attempts()).toBe(1);
  expect(api.tabs.reload).toHaveBeenCalledTimes(1);
  const checkpoint = structuredClone(stored.captureJob);
  blocked.clear();
  await finish(createCaptureRunner(api).run(null, checkpoint));
  expect(attempts()).toBe(2);
  expect(api.tabs.reload).toHaveBeenCalledTimes(1);
  expect(stored.status).toMatchObject({ state: 'complete', completed: 2, failed: 1, total: 3 });
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise', 'Charizard']);
  expect(stored.report.errors.map(row => row.entryId)).toEqual(['Ho-Oh']);
});

it('pauses changed filters before retry, and Resume does not overwrite the changed page', async () => {
  const card = task('Ho-Oh'), sendMessage = api.tabs.sendMessage.getMockImplementation();
  api.tabs.sendMessage.mockImplementation(async (id, message) => {
    if (message.action === 'capture') {
      tabs.get(id).url = tabs.get(id).url.replace('language=1', 'language=7');
      return paginationFailure();
    }
    return sendMessage(id, message);
  });
  await finish(createCaptureRunner(api).run([card, task('Charizard')]));
  expect(stored.status.state).toBe('paused');
  expect(stored.status.message).toContain('page or filters changed');
  expect(stored.report.errors).toEqual([]);
  expect(api.tabs.reload).not.toHaveBeenCalled();
  api.tabs.sendMessage.mockClear();
  await finish(createCaptureRunner(api).run(null, stored.captureJob));
  expect(stored.status.state).toBe('paused');
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(api.tabs.sendMessage).not.toHaveBeenCalled();
});

it('bounds a lost recovery-state reply into a pause without refreshing or discarding the card', async () => {
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  let failed = false;
  api.tabs.sendMessage.mockImplementation(async (id, message) => {
    if (message.action === 'capture') { failed = true; return paginationFailure(); }
    return failed && message.action === 'ping' ? new Promise(() => {}) : sendMessage(id, message);
  });
  await finish(createCaptureRunner(api).run([task('Ho-Oh')]));
  expect(stored.status.state).toBe('paused');
  expect(stored.captureJob.nextIndex).toBe(0);
  expect(stored.report.errors).toEqual([]);
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('resumes the legacy 0.3.7 paused schema and preserves its six earlier successes', async () => {
  const earlier = ['Blastoise', 'Charizard', 'Venusaur', 'Pikachu', 'Mew', 'Lugia'].map(task);
  const hooh = task('Ho-Oh'), tasks = [...earlier, hooh, task('Gengar')];
  const captures = earlier.map(card => ({ entryId: card.entryId, inventoryKey: card.binding.inventoryKey, complete: true, filteredUrl: filteredUrl(card.binding), offers: [{ offerId: 'previous', price: 123 }] }));
  tabs.set(5, { id: 5, windowId: 1, status: 'complete', url: filteredUrl(hooh.binding) });
  failPaginationFor(hooh.name);
  await finish(createCaptureRunner(api).run(null, { tasks, nextIndex: 6, tabId: 5, ownsTab: true, report: { schemaVersion: 1, source: 'cardmarket-browser', runId: 'legacy-037', captures: structuredClone(captures) } }));
  expect(stored.report.runId).toBe('legacy-037');
  expect(stored.report.captures.slice(0, 6)).toEqual(captures);
  expect(stored.report.captures[6].entryId).toBe('Gengar');
  expect(stored.report.errors.map(row => row.entryId)).toEqual(['Ho-Oh']);
  expect(stored.status).toMatchObject({ state: 'complete', completed: 7, failed: 1, total: 8 });
  expect(api.tabs.create).not.toHaveBeenCalled();
  expect(api.tabs.reload).toHaveBeenCalledExactlyOnceWith(5);
});

it('advances a legacy checkpoint interrupted between saving one card and opening the next', async () => {
  const tasks = [task('Blastoise'), task('Charizard')];
  tabs.set(5, { id: 5, windowId: 1, status: 'complete', url: filteredUrl(tasks[0].binding) });
  await finish(createCaptureRunner(api).run(null, { tasks, nextIndex: 1, tabId: 5, ownsTab: true, report: { schemaVersion: 1, source: 'cardmarket-browser', runId: 'legacy-037', captures: [{ entryId: 'Blastoise', inventoryKey: 'Blastoise', complete: true, offers: [{ price: 100 }] }] } }));
  expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(5, { url: filteredUrl(tasks[1].binding), active: true });
  expect(stored.status).toMatchObject({ state: 'complete', completed: 2, failed: 0, total: 2 });
});

it('retries only failed cards while retaining earlier successes, unrelated errors and seller photos', async () => {
  const hooh = task('Ho-Oh'), other = task('Charizard');
  const oldError = card => ({ entryId: card.entryId, inventoryKey: card.binding.inventoryKey, name: card.name, binding: card.binding, failedAt: '2026-09-15T10:00:00.000Z', error: 'Previous failure', code: 'preview-incomplete' });
  const oldSuccess = { entryId: 'Blastoise', inventoryKey: 'Blastoise', complete: true, offers: [{ offerId: 'kept', price: 123 }] };
  const report = { schemaVersion: 1, source: 'cardmarket-browser', runId: 'retained-run', revision: 3, captures: [oldSuccess], errors: [oldError(hooh), oldError(other)] };
  const original = structuredClone(report);
  const photos = { 'https://marketplace-article-scans.s3.cardmarket.com/1001/1001.jpg': 'data:image/jpeg;base64,aGVsbG8=' };
  stored.photoCache = { runId: report.runId, images: photos };
  const capturePhotos = vi.fn(async (_api, _id, _data, images) => ({ photos: images }));
  await finish(createCaptureRunner(api, capturePhotos).run([hooh], null, report));
  expect(stored.status).toMatchObject({ state: 'complete', completed: 1, failed: 0, total: 1 });
  expect(stored.report.runId).toBe(report.runId);
  expect(stored.report.revision).toBe(4);
  expect(stored.report.captures[0]).toEqual(oldSuccess);
  expect(stored.report.captures.map(row => row.entryId)).toEqual(['Blastoise', 'Ho-Oh']);
  expect(stored.report.errors).toEqual([oldError(other)]);
  expect(capturePhotos.mock.calls[0][3]).toEqual(photos);
  expect(stored.photoCache.images).toEqual(photos);
  expect(report).toEqual(original);
  expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: filteredUrl(hooh.binding), active: true });
});

it('replaces a repeated failed-card error and increments revision even when result counts do not change', async () => {
  const hooh = task('Ho-Oh');
  failPaginationFor(hooh.name);
  const report = { schemaVersion: 1, source: 'cardmarket-browser', runId: 'retained-run', revision: 2, captures: [{ entryId: 'Blastoise', inventoryKey: 'Blastoise', complete: true, offers: [{ price: 123 }] }], errors: [{ entryId: hooh.entryId, inventoryKey: hooh.binding.inventoryKey, name: hooh.name, binding: hooh.binding, failedAt: '2026-09-15T10:00:00.000Z', error: 'Previous failure', code: 'preview-incomplete' }] };
  await finish(createCaptureRunner(api).run([hooh], null, report));
  expect(stored.status).toMatchObject({ state: 'complete', completed: 0, failed: 1, total: 1 });
  expect(stored.report.captures).toEqual(report.captures);
  expect(stored.report.errors).toHaveLength(1);
  expect(stored.report.errors[0].error).toBe(paginationFailure().error);
  expect(stored.report.errors[0].failedAt).not.toBe(report.errors[0].failedAt);
  expect(stored.report.revision).toBe(3);
  expect(api.tabs.reload).toHaveBeenCalledTimes(1);
});

it('rejects an incomplete success response and preserves the current product for review', async () => {
  const sendMessage = api.tabs.sendMessage.getMockImplementation();
  api.tabs.sendMessage.mockImplementation(async (id, message) => message.action === 'capture'
    ? { ok: true, data: { complete: false, filteredUrl: tabs.get(id).url, offers: [{ offerId: 'partial', price: 1 }] } }
    : sendMessage(id, message));
  await finish(createCaptureRunner(api).run([task('Ho-Oh'), task('Charizard')]));
  expect(stored.status).toMatchObject({ state: 'paused', completed: 0, failed: 0, total: 2 });
  expect(stored.report.captures).toEqual([]);
  expect(stored.report.errors).toEqual([]);
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('honors Stop delivered during the final pre-refresh check', async () => {
  const runner = createCaptureRunner(api), get = api.tabs.get.getMockImplementation();
  failPaginationFor('Ho-Oh');
  let finalChecks = 0;
  api.tabs.get.mockImplementation(async id => {
    if (stored.captureJob?.paginationRetry?.stage === 'attempted' && ++finalChecks === 2) await runner.cancel();
    return get(id);
  });
  await finish(runner.run([task('Ho-Oh'), task('Charizard')]));
  expect(stored.status.state).toBe('stopped');
  expect(stored.captureJob).toBeNull();
  expect(stored.report.captures).toEqual([]);
  expect(stored.report.errors).toEqual([]);
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('rejects a saved retry for a different binding without opening or changing any reader', async () => {
  const card = task('Ho-Oh');
  await finish(createCaptureRunner(api).run(null, { tasks: [card], nextIndex: 0, tabId: null, ownsTab: false, paginationRetry: { entryId: card.entryId, inventoryKey: 'different-binding', filteredUrl: filteredUrl(card.binding), stage: 'pending' }, report: { schemaVersion: 1, source: 'cardmarket-browser', runId: 'saved-run', captures: [] } }));
  expect(stored.status.state).toBe('paused');
  expect(stored.status.message).toContain('saved retry no longer matches');
  expect(api.tabs.create).not.toHaveBeenCalled();
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(api.tabs.reload).not.toHaveBeenCalled();
  expect(stored.report.captures).toEqual([]);
  expect(stored.report.errors).toEqual([]);
});
