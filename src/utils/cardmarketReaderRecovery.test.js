import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cardmarketReaderState } from '../../companion/cardmarket/readerState.js';
import { waitForCardmarketReader } from '../../companion/cardmarket/readerWait.js';

let api, cancelled, options;
beforeEach(() => {
  vi.useFakeTimers(); cancelled = false; document.title = ''; document.body.innerHTML = '';
  api = { tabs: {
    get: vi.fn(async () => ({ status: 'complete', url: 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Eevee' })),
    sendMessage: vi.fn(async () => ({ ok: true })), reload: vi.fn(async () => {}),
  } };
  options = { tabId: 1, mode: 'products', acceptsUrl: url => url.startsWith('https://www.cardmarket.com/'), cancelled: () => cancelled, resumeLabel: 'Resume product search', onProgress: vi.fn(async () => {}) };
});
afterEach(() => vi.useRealTimers());
const run = () => waitForCardmarketReader(api, options).then(() => ({ ok: true }), error => ({ error }));
async function finish(promise) { await vi.runAllTimersAsync(); return promise; }

it.each([
  ['503 Service Unavailable', '503 Service Unavailable', '503'],
  ['cardmarket.com | 524: A timeout occurred', 'A timeout occurred Error code 524', '524'],
  ['502 Bad Gateway', 'Bad Gateway', '502'],
])('recognizes server error document %s', (title, heading, code) => {
  document.title = title; document.body.innerHTML = '<h1></h1>'; document.querySelector('h1').textContent = heading;
  expect(cardmarketReaderState(document, 'products')).toEqual({ ok: false, reason: 'server-error', code });
});

it('does not confuse card numbers or seller text with a failed document', () => {
  document.body.innerHTML = '<h1>Card (503) - Singles</h1><form id="FilterForm"></form><p>Seller comment: service unavailable, security verification</p>';
  expect(cardmarketReaderState(document)).toEqual({ ok: true });
});

it('prioritizes a verification page over any stale result form', () => {
  document.title = 'Just a moment...'; document.body.innerHTML = '<h1>www.cardmarket.com</h1><h2>Performing security verification</h2><form id="SearchResultForm"></form>';
  expect(cardmarketReaderState(document, 'products')).toEqual({ ok: false, reason: 'verification' });
});

it('retries a server error once and reads the recovered page', async () => {
  let failed = true;
  api.tabs.sendMessage.mockImplementation(async () => failed ? { ok: false, reason: 'server-error', code: '503' } : { ok: true });
  api.tabs.reload.mockImplementation(async () => { failed = false; });
  expect(await finish(run())).toEqual({ ok: true });
  expect(api.tabs.reload).toHaveBeenCalledExactlyOnceWith(1);
  expect(options.onProgress).toHaveBeenCalledWith(expect.stringContaining('503'));
});

it('does not loop reloads when the server remains unavailable', async () => {
  api.tabs.sendMessage.mockResolvedValue({ ok: false, reason: 'server-error', code: '524' });
  const result = await finish(run());
  expect(api.tabs.reload).toHaveBeenCalledTimes(1);
  expect(result.error).toMatchObject({ code: 'server-error' });
  expect(result.error.message).toContain('524');
});

it('allows automatic verification to finish on the same page', async () => {
  api.tabs.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'verification' }).mockResolvedValueOnce({ ok: false, reason: 'verification' }).mockResolvedValue({ ok: true });
  expect(await finish(run())).toEqual({ ok: true });
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('pauses a persistent verification challenge without refreshing or interacting with it', async () => {
  api.tabs.sendMessage.mockResolvedValue({ ok: false, reason: 'verification' });
  const result = await finish(run());
  expect(result.error).toMatchObject({ code: 'verification' });
  expect(result.error.message).toContain('Resume product search');
  expect(api.tabs.reload).not.toHaveBeenCalled();
  expect(options.onProgress).toHaveBeenCalledTimes(1);
});

it('does not reload if a server error changes to verification during the retry delay', async () => {
  api.tabs.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'server-error', code: '503' }).mockResolvedValue({ ok: false, reason: 'verification' });
  expect((await finish(run())).error.code).toBe('verification');
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('bounds a lost content-script reply instead of hanging forever', async () => {
  api.tabs.sendMessage.mockImplementation(() => new Promise(() => {}));
  expect((await finish(run())).error.code).toBe('page-unavailable');
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('never reads or reloads a page with different capture filters', async () => {
  options.acceptsUrl = () => false;
  expect((await finish(run())).error.code).toBe('page-unavailable');
  expect(api.tabs.sendMessage).not.toHaveBeenCalled();
  expect(api.tabs.reload).not.toHaveBeenCalled();
});

it('cancels during the retry delay without reloading', async () => {
  api.tabs.sendMessage.mockResolvedValue({ ok: false, reason: 'server-error', code: '503' });
  const promise = run();
  await vi.advanceTimersByTimeAsync(600); cancelled = true;
  expect((await finish(promise)).error.message).toContain('stopped');
  expect(api.tabs.reload).not.toHaveBeenCalled();
});
