import { afterEach, expect, it, vi } from 'vitest';

const productUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8';
const filteredUrl = productUrl + '?language=&minCondition=7&isReverseHolo=&isFirstEd=&isSigned=N&isAltered=N';
const offer = id => `<div class="article-row" id="articleRow${id}"><span class="seller-name"><a href="/en/Pokemon/Users/Test">Test</a></span><div class="product-attributes"><span class="article-condition">NM</span><span aria-label="English"></span></div><div class="price-container">100,00 €</div></div>`;
function fixture({ more = false, disabled = false } = {}) {
  const extra = (name, value) => `<select name="extra[${name}]"><option value="${value}">${value || 'All'}</option></select>`;
  document.body.innerHTML = `<h1>Jolteon (UF 8)</h1><form id="FilterForm"><div><input type="checkbox" name="language[1]" value="1"><label><span>English</span></label></div><select name="minCondition"><option value="7">Poor</option></select>${extra('isReverseHolo', '')}${extra('isFirstEd', '')}${extra('isSigned', 'N')}${extra('isAltered', 'N')}</form>${offer(1)}${more ? `<button ${disabled ? 'disabled' : ''}>Show more results</button>` : ''}`;
}
async function reader() {
  vi.resetModules();
  let listener;
  vi.stubGlobal('location', { href: filteredUrl });
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: fn => { listener = fn; } }, sendMessage: vi.fn(async () => ({})) } });
  await import('../../companion/cardmarket/page.js');
  return { send: (action, params = {}) => new Promise(resolve => listener({ channel: 'rafchu-cardmarket-reader', action, ...params }, {}, resolve)) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('returns a complete listing preview and requires the requested discovery page', async () => {
  fixture(); const api = await reader();
  expect(await api.send('capture-preview', { filteredUrl })).toMatchObject({ ok: true, data: { scope: 'product-preview', complete: true, offers: [{ offerId: 'articleRow1' }] } });
  expect(await api.send('capture-preview', { filteredUrl: filteredUrl.replace('language=', 'language=7') })).toMatchObject({ ok: false, error: expect.stringMatching(/reader changed/) });
});

it('preserves partial offers when the next listing page is unavailable or does not load', async () => {
  fixture({ more: true, disabled: true }); const api = await reader();
  expect(await api.send('capture-preview', { filteredUrl })).toMatchObject({ ok: true, data: { complete: false, errorCode: 'preview-incomplete', offers: [{ offerId: 'articleRow1' }] } });
  document.querySelector('button').disabled = false;
  vi.useFakeTimers();
  const pending = api.send('capture-preview', { filteredUrl });
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: false, error: expect.stringMatching(/did not load/), offers: [{ offerId: 'articleRow1' }] } });
});

it('collects more listings but never stores a result after cancellation or navigation', async () => {
  fixture({ more: true }); const api = await reader(); vi.useFakeTimers();
  document.querySelector('button').onclick = event => { event.target.insertAdjacentHTML('beforebegin', offer(2)); event.target.remove(); };
  let pending = api.send('capture-preview', { filteredUrl });
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true, offers: [{ offerId: 'articleRow1' }, { offerId: 'articleRow2' }] } });
  fixture({ more: true });
  pending = api.send('capture-preview', { filteredUrl });
  await api.send('cancel'); await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: false, error: 'Capture stopped.' });
  fixture({ more: true });
  document.querySelector('button').onclick = () => { location.href = filteredUrl.replace('language=', 'language=7'); };
  pending = api.send('capture-preview', { filteredUrl });
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: false, error: expect.stringMatching(/reader changed/) });
});

it('caps broad offer pagination at twenty pages while preserving the partial preview', async () => {
  fixture({ more: true }); const api = await reader(); vi.useFakeTimers(); let id = 1;
  document.querySelector('button').onclick = event => event.target.insertAdjacentHTML('beforebegin', offer(++id));
  const pending = api.send('capture-preview', { filteredUrl });
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result).toMatchObject({ ok: true, data: { complete: false, errorCode: 'preview-incomplete', error: expect.stringMatching(/page limit/) } });
  expect(result.data.offers).toHaveLength(21);
});

it('keeps at most 1,000 offers when an unrestricted page is too large', async () => {
  fixture();
  document.body.insertAdjacentHTML('beforeend', Array.from({ length: 1000 }, (_, index) => offer(index + 2)).join(''));
  const api = await reader();
  const result = await api.send('capture-preview', { filteredUrl });
  expect(result).toMatchObject({ ok: true, data: { complete: false, moreAvailable: true, errorCode: 'preview-incomplete', error: expect.stringMatching(/1,000/) } });
  expect(result.data.offers).toHaveLength(1000);
});

it.each([
  ['verification', '<h1>www.cardmarket.com</h1><h2>Performing security verification</h2>'],
  ['server-error', '<h1>503 Service Unavailable</h1>'],
])('pauses the exact preview on mid-pagination %s', async (code, content) => {
  fixture({ more: true }); const api = await reader(); vi.useFakeTimers();
  document.querySelector('button').onclick = () => { document.body.innerHTML = content; };
  const pending = api.send('capture-preview', { filteredUrl });
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result).toMatchObject({ ok: false, code });
  expect(result.data).toBeUndefined();
});
