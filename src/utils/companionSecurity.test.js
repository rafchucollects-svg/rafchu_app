import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it.each(['cardladder', 'cardmarket'])('%s bridge rejects unrelated origins, local apps and embedded frames before reading capture storage', async name => {
  let listener;
  const get = vi.fn(async () => ({ report: { runId: 'private-report', captures: [] } }));
  vi.stubGlobal('chrome', {
    runtime: { getURL: () => 'chrome-extension://test/', getManifest: () => ({ version: 'test' }), onMessage: { addListener: fn => { listener = fn; } }, onStartup: { addListener: vi.fn() } },
    alarms: { onAlarm: { addListener: vi.fn() } },
    storage: { local: { get } },
  });
  if (name === 'cardladder') await import('../../companion/cardladder/background.js');
  else await import('../../companion/cardmarket/background.js');
  const channel = name === 'cardladder' ? 'rafchu-companion' : 'rafchu-cardmarket';
  for (const sender of [{ url: 'https://attacker.example' }, { url: 'http://localhost:5173' }, { url: 'https://rafchu-tcg-app.web.app.evil.example' }, { url: 'https://rafchu-tcg-app.web.app', frameId: 2 }]) {
    const result = await new Promise(resolve => listener({ channel, action: 'report' }, sender, resolve));
    expect(result.ok).toBe(false);
  }
  expect(get).not.toHaveBeenCalled();
  const result = await new Promise(resolve => listener({ channel, action: 'report' }, { url: 'https://rafchu-tcg-app.web.app/inventory', frameId: 0 }, resolve));
  expect(result).toMatchObject({ ok: true, data: { runId: 'private-report' } });
});
