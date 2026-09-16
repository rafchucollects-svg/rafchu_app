import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSuggestionRunner } from '../../companion/cardmarket/suggestionRunner.js';
import { discoveryUrl } from './cardmarketDiscovery.js';

const base = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Crystal-Guardians/';
const task = (entryId = 'charizard', changes = {}) => ({ entryId, inventoryKey: `identity:${entryId}`, name: 'Charizard', set: 'EX Crystal Guardians', number: '4', language: 'English', condition: 'EX', captureOffers: true, ...changes });
const candidate = (suffix = 'Charizard-CG4') => ({ name: 'Charizard', set: 'EX Crystal Guardians', number: '4', productUrl: base + suffix });
const preview = (target, product = candidate().productUrl, changes = {}) => ({
  scope: 'product-preview', source: 'cardmarket-browser', productUrl: product, filteredUrl: discoveryUrl(product, target), currency: 'EUR', capturedAt: new Date().toISOString(),
  coverage: { languages: ['English', 'Japanese'].includes(target.language) ? [target.language] : null, minCondition: target.condition || 'PO', finishes: null, editions: null, signed: false, altered: false },
  offers: [{ offerId: 'articleRow1', price: 120, currency: 'EUR', seller: 'seller' }], complete: true, moreAvailable: false, ...changes,
});
let api, stored, readProducts, readPreview, photos, tab, runner;
beforeEach(() => {
  vi.useFakeTimers(); stored = {}; tab = null;
  readProducts = vi.fn(async () => ({ ok: true, data: { candidates: [candidate()], nextUrl: null } }));
  readPreview = vi.fn(async message => ({ ok: true, data: preview(message.task, message.productUrl) }));
  photos = vi.fn(async (_api, _tabId, _capture, existing) => ({ photos: { ...existing, 'fixture-seller-photo': 'fixture-photo-data' } }));
  api = {
    storage: { local: { get: vi.fn(async () => structuredClone(stored)), set: vi.fn(async patch => Object.assign(stored, structuredClone(patch))) } },
    tabs: {
      create: vi.fn(async patch => { tab = { ...patch, id: 1, status: 'complete' }; return tab; }),
      get: vi.fn(async () => tab), update: vi.fn(async (_id, patch) => Object.assign(tab, patch)), remove: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_id, message) => message.action === 'ping' ? { ok: true } : message.action === 'products' ? readProducts(message) : message.action === 'capture-preview' ? readPreview(message) : { ok: true }),
    },
  };
  runner = createSuggestionRunner(api, photos);
});
afterEach(() => vi.useRealTimers());
async function finish(tasks, previous) { const pending = runner.run(tasks, previous); await vi.runAllTimersAsync(); await pending; }

it('publishes the product link and captures its listings in one queue without overwriting confirmed captures or photos', async () => {
  stored.report = { runId: 'confirmed', captures: [{ productUrl: 'previous-confirmed-product' }] };
  stored.photoCache = { runId: 'confirmed', images: { preserved: 'confirmed-photo' } };
  readPreview.mockImplementation(async message => {
    expect(stored.products.results[0]).toMatchObject({ entryId: 'charizard', candidates: [candidate()], previews: [] });
    expect(stored.suggestionJob.offerStage.nextCandidateIndex).toBe(0);
    return { ok: true, data: preview(message.task, message.productUrl) };
  });
  await finish([task()]);
  expect(stored.status.state).toBe('complete');
  expect(stored.status.message).toContain('complete listing previews for 1/1');
  expect(stored.products.results[0].previews).toMatchObject([{ entryId: 'charizard', inventoryKey: 'identity:charizard', complete: true, scope: 'product-preview' }]);
  expect(readProducts).toHaveBeenCalledTimes(1); expect(readPreview).toHaveBeenCalledTimes(1);
  expect(stored.report).toEqual({ runId: 'confirmed', captures: [{ productUrl: 'previous-confirmed-product' }] });
  expect(stored.photoCache).toEqual({ runId: 'confirmed', images: { preserved: 'confirmed-photo' } });
  expect(stored.previewPhotoCache).toMatchObject({ runId: stored.products.runId, images: { 'fixture-seller-photo': 'fixture-photo-data' } });
  expect(stored.suggestionJob).toBeNull();
});

it('resumes the exact unfinished printing after a worker restart without searching or recapturing earlier printings', async () => {
  const second = candidate('Charizard-V2-CG4');
  readProducts.mockResolvedValue({ ok: true, data: { candidates: [second, candidate()], nextUrl: null } });
  readPreview.mockImplementation(async message => message.productUrl === second.productUrl ? { ok: false, code: 'verification', error: 'Complete verification.' } : { ok: true, data: preview(message.task, message.productUrl) });
  await finish([task()]);
  expect(stored.status.state).toBe('paused');
  expect(stored.suggestionJob.offerStage.nextCandidateIndex).toBe(1);
  expect(stored.products.results[0].previews).toHaveLength(1);
  const runId = stored.products.runId, currentUrl = tab.url;
  const previous = structuredClone(stored.suggestionJob);
  api.tabs.update.mockClear();
  runner = createSuggestionRunner(api, photos);
  readPreview.mockImplementation(async message => ({ ok: true, data: preview(message.task, message.productUrl) }));
  await finish(null, previous);
  expect(stored.products.runId).toBe(runId); expect(stored.previewPhotoCache.runId).toBe(runId);
  expect(stored.products.results[0].previews.map(row => row.productUrl)).toEqual([candidate().productUrl, second.productUrl]);
  expect(readProducts).toHaveBeenCalledTimes(1); expect(readPreview).toHaveBeenCalledTimes(3);
  expect(api.tabs.update).not.toHaveBeenCalled(); expect(tab.url).toBe(currentUrl);
});

it('reuses capture evidence for duplicate product/filter coverage and attaches it to each inventory entry', async () => {
  await finish([task(), task('copy'), task('different-condition', { condition: 'NM' })]);
  expect(readProducts).toHaveBeenCalledTimes(1);
  expect(readPreview).toHaveBeenCalledTimes(2);
  expect(photos).toHaveBeenCalledTimes(2);
  expect(stored.products.results.map(row => row.previews[0].entryId)).toEqual(['charizard', 'copy', 'different-condition']);
  expect(stored.products.results.map(row => row.previews[0].inventoryKey)).toEqual(['identity:charizard', 'identity:copy', 'identity:different-condition']);
  expect(stored.products.results.map(row => row.previews[0].coverage.minCondition)).toEqual(['EX', 'EX', 'NM']);
});

it('keeps distinct printing previews and continues the queue after incomplete listings', async () => {
  readProducts.mockResolvedValue({ ok: true, data: { candidates: [candidate(), candidate('Charizard-V2-CG4')], nextUrl: null } });
  readPreview.mockImplementation(async message => ({ ok: true, data: preview(message.task, message.productUrl, message.productUrl === candidate().productUrl ? { complete: false, moreAvailable: true, error: 'Listing pagination ended early.' } : {}) }));
  await finish([task(), task('copy')]);
  expect(stored.status.state).toBe('complete');
  expect(stored.products.results.every(row => row.previews.length === 2)).toBe(true);
  expect(stored.products.results[0].previewErrors).toEqual([{ productUrl: candidate().productUrl, error: 'Listing pagination ended early.' }]);
  expect(stored.products.results[0].previews.map(row => row.complete)).toEqual([false, true]);
  expect(readPreview).toHaveBeenCalledTimes(2);
});

it('retains fresh previous preview evidence and its photos when a retry fails, with a visible error', async () => {
  const old = preview(task(), candidate().productUrl, { entryId: task().entryId, inventoryKey: task().inventoryKey });
  stored.products = { runId: 'earlier', results: [{ ...task(), candidates: [candidate()], previews: [old], searchedAt: new Date().toISOString() }] };
  stored.previewPhotoCache = { runId: 'earlier', images: { retained: 'photo' }, updatedAt: new Date().toISOString() };
  readPreview.mockResolvedValue({ ok: false, error: 'Could not read the offer table.' });
  await finish([task()]);
  expect(stored.status.state).toBe('complete');
  expect(stored.products.results[0].previews).toEqual([{ ...old, discoveryRunId: 'earlier' }]);
  expect(stored.products.results[0].previewErrors[0].error).toContain('offer table');
  expect(stored.previewPhotoCache).toMatchObject({ runId: stored.products.runId, images: { retained: 'photo' } });
});

it.each(['stale', 'identity', 'coverage', 'product'])('does not reuse %s preview evidence from an earlier run', async invalid => {
  const previous = preview(task(), candidate().productUrl, { entryId: task().entryId, inventoryKey: task().inventoryKey });
  if (invalid === 'stale') previous.capturedAt = new Date(Date.now() - 86400001).toISOString();
  if (invalid === 'identity') previous.inventoryKey = 'changed-card';
  if (invalid === 'coverage') previous.coverage.minCondition = 'NM';
  if (invalid === 'product') previous.productUrl = candidate('Charizard-V2-CG4').productUrl;
  stored.products = { results: [{ ...task(), candidates: [candidate()], previews: [previous], searchedAt: new Date().toISOString() }] };
  readPreview.mockResolvedValue({ ok: false, error: 'Could not read the offer table.' });
  await finish([task()]);
  expect(stored.products.results[0].previews).toEqual([]);
});

it('does not let an invalid listing response erase its valid product link', async () => {
  readPreview.mockImplementation(async message => ({ ok: true, data: preview(message.task, candidate('Wrong-product-CG4').productUrl) }));
  await finish([task()]);
  expect(stored.status.state).toBe('complete');
  expect(stored.products.results[0].candidates).toMatchObject([candidate()]);
  expect(stored.products.results[0].previews).toEqual([]);
  expect(stored.products.results[0].previewErrors[0].error).toContain('does not match');
});

it('captures catalogue printings first using the same priority as the app', async () => {
  const blastoise = task('blastoise', { name: 'Blastoise', set: 'Expedition Base Set', language: 'English' });
  const catalogue = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Blastoise-EX4';
  const alternative = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Blastoise-EX4-V2';
  readProducts.mockResolvedValue({ ok: true, data: { candidates: [{ name: 'Blastoise', set: 'Expedition Base Set', number: '4', productUrl: alternative }], nextUrl: null } });
  await finish([blastoise]);
  expect(readPreview.mock.calls.map(([message]) => message.productUrl)).toEqual([catalogue, alternative]);
  expect(stored.products.results[0].candidates[0].source).toBe('catalogue');
});

it('retains complete earlier listings when a fresh retry is only partial', async () => {
  const earlier = preview(task(), candidate().productUrl, { entryId: task().entryId, inventoryKey: task().inventoryKey });
  stored.products = { runId: 'earlier', results: [{ ...task(), candidates: [candidate()], previews: [earlier], searchedAt: new Date().toISOString() }] };
  readPreview.mockImplementation(async message => ({ ok: true, data: preview(message.task, message.productUrl, { complete: false, moreAvailable: true, error: 'Could not read more listings.' }) }));
  await finish([task()]);
  expect(stored.products.results[0].previews).toEqual([{ ...earlier, discoveryRunId: 'earlier' }]);
  expect(stored.products.results[0].previewErrors).toHaveLength(1);
});

it('forwards cancellation to the active reader and preserves links and earlier printing previews', async () => {
  const second = candidate('Charizard-V2-CG4');
  let release;
  readProducts.mockResolvedValue({ ok: true, data: { candidates: [candidate(), second], nextUrl: null } });
  readPreview.mockImplementation(async message => message.productUrl === second.productUrl
    ? new Promise(resolve => { release = resolve; }) : { ok: true, data: preview(message.task, message.productUrl) });
  const pending = runner.run([task()]);
  await vi.runAllTimersAsync();
  expect(stored.products.results[0].previews).toHaveLength(1);
  expect(release).toBeTypeOf('function');
  await runner.cancel();
  expect(api.tabs.sendMessage).toHaveBeenCalledWith(1, { channel: 'rafchu-cardmarket-reader', action: 'cancel' });
  release({ ok: false, error: 'Capture cancelled.' });
  await pending;
  expect(stored.suggestionJob).toBeNull();
  expect(stored.products.results[0].candidates).toHaveLength(2);
  expect(stored.products.results[0].previews).toHaveLength(1);
});

it('retains a fresh earlier printing when a new search only returns another exact printing', async () => {
  const oldCandidate = candidate('Charizard-V2-CG4');
  const earlier = preview(task(), oldCandidate.productUrl, { entryId: task().entryId, inventoryKey: task().inventoryKey });
  stored.products = { runId: 'earlier', results: [{ ...task(), candidates: [oldCandidate], previews: [earlier], searchedAt: new Date().toISOString() }] };
  readPreview.mockImplementation(async message => message.productUrl === oldCandidate.productUrl ? { ok: false, error: 'Could not read listings.' } : { ok: true, data: preview(message.task, message.productUrl) });
  await finish([task()]);
  expect(stored.products.results[0].candidates).toHaveLength(2);
  expect(stored.products.results[0].previews).toContainEqual({ ...earlier, discoveryRunId: 'earlier' });
});

it.each([
  ['absent variant controls', { finishes: ['non-reverse'], editions: [false] }],
  ['fixed No edition', { finishes: null, editions: [false] }],
  ['fixed No reverse', { finishes: ['non-reverse'], editions: null }],
])('accepts the reader’s explicit restricted coverage for %s', async (_label, observed) => {
  readPreview.mockImplementation(async message => {
    const captured = preview(message.task, message.productUrl);
    captured.coverage = { ...captured.coverage, ...observed };
    return { ok: true, data: captured };
  });
  await finish([task()]);
  expect(stored.status.state).toBe('complete');
  expect(stored.products.results[0].previews[0].coverage).toMatchObject(observed);
  expect(stored.products.results[0].previewErrors).toEqual([]);
});

it.each([{ finishes: ['unknown'] }, { editions: [] }, { editions: ['false'] }])('rejects ambiguous or invalid restricted coverage %j', async observed => {
  readPreview.mockImplementation(async message => {
    const captured = preview(message.task, message.productUrl);
    captured.coverage = { ...captured.coverage, ...observed };
    return { ok: true, data: captured };
  });
  await finish([task()]);
  expect(stored.products.results[0].previews).toEqual([]);
  expect(stored.products.results[0].previewErrors).toHaveLength(1);
});

it('stores previews once and rebuilds duplicate reuse after resuming a compact checkpoint', async () => {
  let failed = false;
  readProducts.mockImplementation(async message => {
    if (message.task.name === 'Waiting' && !failed) { failed = true; return { ok: false, code: 'verification', error: 'Complete verification.' }; }
    return { ok: true, data: { candidates: [candidate()], nextUrl: null } };
  });
  const tasks = [task(), task('waiting', { name: 'Waiting' }), task('copy')];
  await finish(tasks);
  expect(stored.status.state).toBe('paused');
  expect(stored.suggestionJob).not.toHaveProperty('products');
  expect(stored.suggestionJob).not.toHaveProperty('previewCache');
  expect(stored.suggestionJob.productsRunId).toBe(stored.products.runId);
  expect(JSON.stringify(stored.suggestionJob)).not.toContain('articleRow1');
  runner = createSuggestionRunner(api, photos);
  await finish(null, structuredClone(stored.suggestionJob));
  expect(stored.status.state).toBe('complete');
  expect(readPreview).toHaveBeenCalledTimes(1);
  expect(stored.products.results.find(row => row.entryId === 'copy').previews[0].discoveryRunId).toBe(stored.products.runId);
});

it('resumes an installed legacy job with embedded results and converts the next checkpoint to compact storage', async () => {
  readPreview.mockResolvedValueOnce({ ok: false, code: 'verification', error: 'Complete verification.' });
  await finish([task()]);
  const legacy = { ...stored.suggestionJob, products: structuredClone(stored.products), previewCache: {} };
  delete legacy.productsRunId;
  delete stored.products;
  let compactObserved = false;
  readPreview.mockImplementation(async message => {
    compactObserved = !stored.suggestionJob.products && !stored.suggestionJob.previewCache;
    return { ok: true, data: preview(message.task, message.productUrl) };
  });
  runner = createSuggestionRunner(api, photos);
  await finish(null, legacy);
  expect(compactObserved).toBe(true);
  expect(stored.products.runId).toBe(legacy.products.runId);
  expect(stored.products.results[0].previews).toHaveLength(1);
});

it('skips an oversized printing with a visible error, retains saved prices, and continues later candidates and duplicates', async () => {
  const oversized = candidate('Charizard-V2-CG4'), later = candidate('Charizard-V3-CG4');
  stored.report = { runId: 'confirmed', captures: [{ price: 80 }] };
  readProducts.mockResolvedValue({ ok: true, data: { candidates: [candidate(), oversized, later], nextUrl: null } });
  readPreview.mockImplementation(async message => ({ ok: true, data: preview(message.task, message.productUrl,
    message.productUrl === oversized.productUrl ? { offers: Array.from({ length: 1000 }, (_,i) => ({ offerId: `articleRow${i}`, comments: 'x'.repeat(11_000) })) } : {}) }));
  await finish([task(), task('copy')]);
  expect(stored.status.state).toBe('complete');
  expect(stored.suggestionJob).toBeNull();
  expect(readPreview).toHaveBeenCalledTimes(3);
  for (const row of stored.products.results) {
    expect(row.previews.map(p => p.productUrl)).toEqual([candidate().productUrl, later.productUrl]);
    expect(row.previewErrors).toEqual([{ productUrl: oversized.productUrl, error: expect.stringContaining('storage') }]);
  }
  expect(stored.report).toEqual({ runId: 'confirmed', captures: [{ price: 80 }] });
});

it('skips a printing when Chrome rejects its checkpoint instead of retrying its oversized payload', async () => {
  const write = api.storage.local.set.getMockImplementation();
  let quotaFailures = 0;
  api.storage.local.set.mockImplementation(async patch => {
    if (patch.products?.results?.some(row => row.previews?.length)) { quotaFailures++; throw new Error('QUOTA_BYTES quota exceeded'); }
    return write(patch);
  });
  await finish([task()]);
  expect(quotaFailures).toBe(1);
  expect(stored.suggestionJob).toBeNull();
  expect(stored.status.state).toBe('complete');
  expect(stored.products.results[0].previews).toEqual([]);
  expect(stored.products.results[0].previewErrors[0].error).toContain('storage');
});

it('saves only a small final status on an initial quota rejection and keeps the previous products intact', async () => {
  stored.products = { runId: 'earlier', results: [{ ...task(), candidates: [candidate()], searchedAt: new Date().toISOString() }] };
  const previousProducts = structuredClone(stored.products);
  const write = api.storage.local.set.getMockImplementation();
  let rejectedWrites = 0;
  api.storage.local.set.mockImplementation(async patch => {
    if (patch.products) { rejectedWrites++; throw new Error('QUOTA_BYTES quota exceeded'); }
    return write(patch);
  });
  await finish([task()]);
  expect(rejectedWrites).toBe(1);
  expect(stored.products).toEqual(previousProducts);
  expect(stored.suggestionJob).toBeNull();
  expect(stored.status).toMatchObject({ state: 'complete', message: expect.stringContaining('storage is full') });
  expect(readPreview).not.toHaveBeenCalled();
});
