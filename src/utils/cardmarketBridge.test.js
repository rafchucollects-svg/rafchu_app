import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('forwards product-search resume through the real extension bridge', async () => {
  vi.resetModules();
  let receive;
  vi.spyOn(window, 'addEventListener').mockImplementation((_type, listener) => { receive = listener; });
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const send = vi.fn(async () => ({ ok: true, data: { started: true } }));
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  await import('../../companion/cardmarket/bridge.js');
  const data = { channel: 'rafchu-cardmarket-request', requestId: 'resume-test', action: 'resume-suggestions' };
  await receive({ source: window, origin: location.origin, data });
  expect(send).toHaveBeenCalledWith({ channel: 'rafchu-cardmarket', action: 'resume-suggestions' });
  expect(post).toHaveBeenCalledWith({ channel: 'rafchu-cardmarket-response', requestId: 'resume-test', ok: true, data: { started: true } }, location.origin);
  send.mockClear();
  await receive({ source: window, origin: 'https://other.example', data });
  await receive({ source: null, origin: location.origin, data });
  expect(send).not.toHaveBeenCalled();
});

it('forwards the failed-card retry tasks only from the trusted page', async () => {
  vi.resetModules();
  let receive;
  vi.spyOn(window, 'addEventListener').mockImplementation((_type, listener) => { receive = listener; });
  vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  const send = vi.fn(async () => ({ ok: true, data: { started: true } }));
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  await import('../../companion/cardmarket/bridge.js');
  const tasks = [{ entryId: 'failed-card', binding: { inventoryKey: 'current-card' } }];
  const data = { channel: 'rafchu-cardmarket-request', requestId: 'retry-test', action: 'retry-failed', tasks };
  await receive({ source: window, origin: location.origin, data });
  expect(send).toHaveBeenCalledWith({ channel: 'rafchu-cardmarket', action: 'retry-failed', tasks });
  send.mockClear();
  await receive({ source: window, origin: 'https://other.example', data });
  await receive({ source: null, origin: location.origin, data });
  expect(send).not.toHaveBeenCalled();
});
