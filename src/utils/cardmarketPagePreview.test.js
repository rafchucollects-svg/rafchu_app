import { afterEach, expect, it, vi } from 'vitest';

const productUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8';
const filteredUrl = productUrl + '?language=&minCondition=7&isReverseHolo=&isFirstEd=&isSigned=N&isAltered=N';
const offer = id => `<div class="article-row" id="articleRow${id}"><span class="seller-name"><a href="/en/Pokemon/Users/Test">Test</a></span><div class="product-attributes"><span class="article-condition">NM</span><span aria-label="English"></span></div><div class="price-container">100,00 €</div></div>`;
function fixture({ more = false, disabled = false } = {}) {
  const extra = (name, value) => `<select name="extra[${name}]"><option value="${value}">${value || 'All'}</option></select>`;
  document.body.innerHTML = `<h1>Jolteon (UF 8)</h1><form id="FilterForm"><div><input type="checkbox" name="language[1]" value="1"><label><span>English</span></label></div><select name="minCondition"><option value="7">Poor</option></select>${extra('isReverseHolo', '')}${extra('isFirstEd', '')}${extra('isSigned', 'N')}${extra('isAltered', 'N')}</form>${offer(1)}${more ? `<button ${disabled ? 'disabled' : ''}>Show more results</button>` : ''}`;
}
async function reader(href = filteredUrl) {
  vi.resetModules();
  let listener;
  vi.stubGlobal('location', { href });
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
  fixture({ more: true, disabled: true }); const api = await reader(); vi.useFakeTimers();
  const disabled = api.send('capture-preview', { filteredUrl }); await vi.runAllTimersAsync();
  expect(await disabled).toMatchObject({ ok: true, data: { complete: false, errorCode: 'preview-incomplete', offers: [{ offerId: 'articleRow1' }] } });
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

function paginationFixture(action, options = {}) {
  fixture(options);
  if (action === 'capture-preview') return filteredUrl;
  document.querySelector('[name="language[1]"]').checked = true;
  for (const name of ['isReverseHolo', 'isFirstEd']) document.querySelector(`[name="extra[${name}]"]`).innerHTML = '<option value="N">No</option>';
  return filteredUrl.replace('language=', 'language=1').replace('isReverseHolo=', 'isReverseHolo=N').replace('isFirstEd=', 'isFirstEd=N');
}

it.each(['capture', 'capture-preview'])('%s waits for an initially disabled Show more button', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(() => { button.insertAdjacentHTML('beforebegin', offer(2)); button.remove(); });
  button.onclick = click;
  setTimeout(() => { button.disabled = false; }, 900);
  const pending = api.send(action, { filteredUrl: href });
  await vi.advanceTimersByTimeAsync(800); expect(click).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true, offers: [{ offerId: 'articleRow1' }, { offerId: 'articleRow2' }] } });
  expect(click).toHaveBeenCalledTimes(1);
});

it.each(['capture', 'capture-preview'])('%s lets appended rows settle before clicking Show more again', async action => {
  const href = paginationFixture(action, { more: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button');
  const click = vi.fn(() => {
    button.disabled = true;
    if (click.mock.calls.length === 1) {
      setTimeout(() => button.insertAdjacentHTML('beforebegin', offer(2)), 100);
      setTimeout(() => button.insertAdjacentHTML('beforebegin', offer(3)), 700);
      setTimeout(() => { button.disabled = false; }, 1200);
    } else { button.insertAdjacentHTML('beforebegin', offer(4)); button.remove(); }
  });
  button.onclick = click;
  const pending = api.send(action, { filteredUrl: href });
  await vi.advanceTimersByTimeAsync(1200);
  expect(click).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true } });
  expect(click).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('.article-row')).toHaveLength(4);
});

it.each(['capture', 'capture-preview'])('%s rereads a disappearing disabled button as a completed offer list', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(); button.onclick = click;
  setTimeout(() => { button.insertAdjacentHTML('beforebegin', offer(2)); button.remove(); }, 900);
  const pending = api.send(action, { filteredUrl: href });
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true, offers: [{ offerId: 'articleRow1' }, { offerId: 'articleRow2' }] } });
  expect(click).not.toHaveBeenCalled();
});

it.each(['capture', 'capture-preview'])('%s bounds a permanently disabled offer button without clicking it', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const click = vi.fn(); document.querySelector('button').onclick = click;
  const pending = api.send(action, { filteredUrl: href });
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.ok).toBe(action === 'capture-preview');
  const failure = action === 'capture-preview' ? result.data : result;
  expect(failure.error).toMatch(/did not become ready/);
  if (action === 'capture-preview') expect(failure).toMatchObject({ complete: false, offers: [{ offerId: 'articleRow1' }] });
  expect(click).not.toHaveBeenCalled();
  expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledTimes(40);
});

it.each(['capture', 'capture-preview'])('%s cancels during disabled-button recovery without a later click', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(); button.onclick = click;
  const pending = api.send(action, { filteredUrl: href });
  await vi.advanceTimersByTimeAsync(500); await api.send('cancel'); button.disabled = false;
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: false, error: 'Capture stopped.' });
  expect(click).not.toHaveBeenCalled();
});

it.each(['capture', 'capture-preview'])('%s rejects changed URL filters during disabled-button recovery', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(); button.onclick = click;
  const pending = api.send(action, { filteredUrl: href });
  await vi.advanceTimersByTimeAsync(500);
  location.href = href.replace(/language=[^&]*/, 'language=7'); button.disabled = false;
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: false, error: expect.stringMatching(/reader changed/) });
  expect(click).not.toHaveBeenCalled();
});

it.each(['capture', 'capture-preview'])('%s does not finish while a hidden button awaits its delayed AJAX response', async action => {
  const href = paginationFixture(action, { more: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button');
  button.onclick = () => {
    button.remove();
    setTimeout(() => document.body.insertAdjacentHTML('beforeend', offer(2)), 1400);
  };
  const finished = vi.fn();
  const pending = api.send(action, { filteredUrl: href }).then(result => { finished(); return result; });
  await vi.advanceTimersByTimeAsync(1600);
  expect(finished).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true, offers: [{ offerId: 'articleRow1' }, { offerId: 'articleRow2' }] } });
});

it.each(['capture', 'capture-preview'])('%s waits for an already-loading page after its disabled button disappears', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(); button.onclick = click;
  setTimeout(() => button.remove(), 100);
  setTimeout(() => document.body.insertAdjacentHTML('beforeend', offer(2)), 1400);
  const finished = vi.fn();
  const pending = api.send(action, { filteredUrl: href }).then(result => { finished(); return result; });
  await vi.advanceTimersByTimeAsync(1200);
  expect(finished).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true, offers: [{ offerId: 'articleRow1' }, { offerId: 'articleRow2' }] } });
  expect(click).not.toHaveBeenCalled();
});

it.each(['capture', 'capture-preview'])('%s rejects edited form filters while a disabled button recovers', async action => {
  const href = paginationFixture(action, { more: true, disabled: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(); button.onclick = click;
  const pending = api.send(action, { filteredUrl: href });
  await vi.advanceTimersByTimeAsync(500);
  document.querySelector('[name="language[1]"]').checked = action === 'capture-preview';
  button.disabled = false;
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: false, error: expect.stringMatching(/language/) });
  expect(click).not.toHaveBeenCalled();
});

it.each(['capture', 'capture-preview'])('%s waits for split AJAX batches before treating an absent button as final', async action => {
  const href = paginationFixture(action, { more: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button');
  const click = vi.fn(() => {
    button.remove();
    if (click.mock.calls.length === 1) {
      setTimeout(() => document.body.insertAdjacentHTML('beforeend', offer(2)), 100);
      setTimeout(() => { document.body.insertAdjacentHTML('beforeend', offer(3)); document.body.append(button); }, 1500);
    } else document.body.insertAdjacentHTML('beforeend', offer(4));
  });
  button.onclick = click;
  const finished = vi.fn();
  const pending = api.send(action, { filteredUrl: href }).then(result => { finished(); return result; });
  await vi.advanceTimersByTimeAsync(1800);
  expect(finished).not.toHaveBeenCalled(); expect(click).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  const result = await pending;
  expect(result).toMatchObject({ ok: true, data: { complete: true } });
  expect(result.data.offers.map(row => row.offerId)).toEqual(['articleRow1', 'articleRow2', 'articleRow3', 'articleRow4']);
  expect(click).toHaveBeenCalledTimes(2);
});

it.each(['capture', 'capture-preview'])('%s stabilizes a button that disappears immediately before the next click', async action => {
  const href = paginationFixture(action, { more: true }); const api = await reader(href); vi.useFakeTimers();
  const button = document.querySelector('button'); const click = vi.fn(); button.onclick = click;
  globalThis.chrome.runtime.sendMessage.mockImplementationOnce(async () => {
    queueMicrotask(() => {
      button.remove();
      setTimeout(() => document.body.insertAdjacentHTML('beforeend', offer(2)), 1400);
    });
  });
  const finished = vi.fn();
  const pending = api.send(action, { filteredUrl: href }).then(result => { finished(); return result; });
  await vi.advanceTimersByTimeAsync(1600);
  expect(finished).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ ok: true, data: { complete: true, offers: [{ offerId: 'articleRow1' }, { offerId: 'articleRow2' }] } });
  expect(click).not.toHaveBeenCalled();
});
