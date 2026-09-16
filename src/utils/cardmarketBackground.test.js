import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const runners = vi.hoisted(() => ({ capture: { active: false, run: vi.fn() }, suggestion: { active: false } }));
vi.mock('../../companion/cardmarket/capture.js', async importOriginal => ({ ...await importOriginal(), createCaptureRunner: () => runners.capture }));
vi.mock('../../companion/cardmarket/suggestionRunner.js', () => ({ createSuggestionRunner: () => runners.suggestion }));

const task = name => ({ entryId: name, name, binding: { productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4`, inventoryKey: name, language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false, confirmed: true } });
const failed = card => ({ entryId: card.entryId, inventoryKey: card.binding.inventoryKey, binding: structuredClone(card.binding), name: card.name, error: 'Next page did not finish.', code: 'pagination-stalled', failedAt: new Date().toISOString() });
let stored, listener, get;
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); runners.capture.active = false; runners.suggestion.active = false;
  stored = { report: { schemaVersion: 1, source: 'cardmarket-browser', runId: 'capture-run', captures: [{ entryId: 'Completed' }], errors: [] }, status: { state: 'complete' } };
  get = vi.fn(async () => structuredClone(stored));
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '0.3.8' }), onMessage: { addListener: fn => { listener = fn; } } },
    storage: { local: { get } },
  });
  await import('../../companion/cardmarket/background.js');
});
afterEach(() => { vi.unstubAllGlobals(); });
const request = (action, tasks, sender = { url: 'https://rafchu-tcg-app.web.app/vendor/inventory' }) => new Promise(resolve => listener({ channel: 'rafchu-cardmarket', action, tasks }, sender, resolve));

it('advertises pagination recovery and publishes a new report revision when only a failure is added or updated', async () => {
  const first = (await request('status')).data;
  expect(first.capabilities).toContain('capture-pagination-recovery');
  stored.report.errors.push(failed(task('Failed')));
  const withFailure = (await request('status')).data;
  expect(withFailure.reportRevision).not.toBe(first.reportRevision);
  stored.report.revision = 1;
  expect((await request('status')).data.reportRevision).not.toBe(withFailure.reportRevision);
});

it('retries the matching failed subset with its existing report and run, preserving successful captures', async () => {
  const retry = task('Failed');
  stored.report.errors = [failed(retry), failed(task('OtherFailure'))];
  expect(await request('retry-failed', [retry])).toMatchObject({ ok: true, data: { started: true } });
  expect(runners.capture.run).toHaveBeenCalledExactlyOnceWith([retry], null, stored.report);
  expect(stored.report.captures).toEqual([{ entryId: 'Completed' }]);
});

it.each([
  ['another card', card => { card.entryId = 'Completed'; }],
  ['another inventory identity', card => { card.binding.inventoryKey = 'changed-card'; }],
  ['another product', card => { card.binding.productUrl = task('Other').binding.productUrl; }],
  ['changed filters', card => { card.binding.condition = 'NM'; }],
  ['an unconfirmed match', card => { card.binding.confirmed = false; }],
])('rejects a retry for %s before starting a reader', async (_label, change) => {
  const retry = task('Failed'); stored.report.errors = [failed(retry)]; change(retry);
  expect(await request('retry-failed', [retry])).toMatchObject({ ok: false });
  expect(runners.capture.run).not.toHaveBeenCalled();
});

it('rejects expired errors, duplicate cards and competing queues', async () => {
  const retry = task('Failed'); stored.report.errors = [failed(retry)];
  expect(await request('retry-failed', [retry, retry])).toMatchObject({ ok: false });
  stored.report.errors[0].failedAt = new Date(Date.now() - 86400001).toISOString();
  expect(await request('retry-failed', [retry])).toMatchObject({ ok: false });
  stored.report.errors = [failed(retry)]; stored.captureJob = { pending: true };
  expect(await request('retry-failed', [retry])).toMatchObject({ ok: false });
  expect(runners.capture.run).not.toHaveBeenCalled();
});

it('rejects retry requests from other origins and embedded frames before reading the report', async () => {
  const retry = task('Failed'); stored.report.errors = [failed(retry)];
  for (const sender of [{ url: 'https://other.example' }, { url: 'https://rafchu-tcg-app.web.app', frameId: 2 }]) {
    expect(await request('retry-failed', [retry], sender)).toMatchObject({ ok: false });
  }
  expect(get).not.toHaveBeenCalled();
  expect(runners.capture.run).not.toHaveBeenCalled();
});
