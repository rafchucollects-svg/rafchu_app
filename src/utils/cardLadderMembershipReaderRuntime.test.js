import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readAccountUserId } from '../../companion/cardladder/dom.js';

const ORIGIN = 'https://app.cardladder.com';
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); delete document.documentElement.scrollTop; });

const row = (id, label = 'PSA 10', name = 'Lugia V') => `<a class="card-list-item" href="/collection?cardId=${id}"><span class="card-name">${name} #186</span><span class="card-set">2022 Pokemon Silver Tempest</span><span class="grade-variation-chip">${label}</span></a>`;
function inventoryHtml(count, rows = [], { empty = false, loading = false } = {}) {
  return `<div class="collection-view"><div><h1 class="secondary-font">Inventory</h1><div class="dropdown"><button id="collections">expand_more</button><ul hidden><li><span>Create New Collection</span></li></ul></div></div><button id="filters">tune</button><div class="modal" hidden><button id="clear">Clear</button><button>Apply</button></div><button>list</button>
    <div class="collection-cards-view"><div contenteditable="true"></div><div class="filter-results">${count} ${count === 1 ? 'result' : 'results'}</div><div class="results"><div class="empty-state" ${empty ? '' : 'hidden'}><h3>There are no results with your filters</h3><p>Try adjusting your filters</p></div><div class="list">${rows.join('')}</div><div class="infinite-scroll" ${loading ? '' : 'hidden'}><span class="spinner"></span></div></div></div></div>`;
}

async function reader(html, pathname = '/collection') {
  document.body.innerHTML = html;
  vi.stubGlobal('location', { href: `${ORIGIN}${pathname}`, origin: ORIGIN, pathname });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () { return this.closest('[hidden]') ? [] : [{}]; });
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: document.documentElement });
  let listener;
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: fn => { listener = fn; } }, sendMessage: vi.fn(async () => {}) } });
  if (document.querySelector('#filters')) {
    document.querySelector('#collections').onclick = () => { const list = document.querySelector('.dropdown ul'); list.hidden = !list.hidden; };
    document.querySelector('#filters').onclick = () => { document.querySelector('.modal').hidden = false; };
    document.querySelector('#clear').onclick = () => { document.querySelector('.modal').hidden = true; };
  }
  await import('../../companion/cardladder/page.js');
  return async (command = 'inventory') => {
    const response = new Promise(resolve => listener({ channel: 'rafchu-reader', command, currency: 'USD' }, {}, resolve));
    await vi.advanceTimersByTimeAsync(30000);
    return response;
  };
}

it('enumerates unsupported and raw holdings as present, independently of sales support', async () => {
  const read = await reader(inventoryHtml(3, [row('a', 'SGC 8'), row('b', 'RAW'), row('c', 'CGC 10')]));
  const response = await read();
  expect(response).toMatchObject({ ok: true, data: { total: 3, holdings: [{ holdingId: 'a', gradingCompany: 'SGC' }, { holdingId: 'b', gradingCompany: 'RAW' }, { holdingId: 'c', gradingCompany: 'CGC' }] } });
  expect(response.data.holdings.every(holding => holding.complete === false)).toBe(true);
});

it('waits out a transient zero before returning a real one-card collection', async () => {
  const read = await reader(inventoryHtml(0));
  setTimeout(() => {
    document.querySelector('.filter-results').textContent = '1 result';
    document.querySelector('.list').innerHTML = row('one');
  }, 5000);
  expect(await read()).toMatchObject({ ok: true, data: { total: 1, holdings: [{ holdingId: 'one' }] } });
});

it('requires an explicit loaded empty state before verifying an empty Inventory', async () => {
  const read = await reader(inventoryHtml(0, [], { empty: true }));
  expect(await read()).toMatchObject({ ok: true, data: { total: 0, holdings: [] } });
});

it.each([{ empty: false }, { empty: true, loading: true }])('does not treat unresolved zero results as an empty Inventory: %j', async flags => {
  const read = await reader(inventoryHtml(0, [], flags));
  expect(await read()).toMatchObject({ ok: false, error: expect.stringMatching(/stable unfiltered Inventory results/) });
});

it('loads every page before verifying membership', async () => {
  const read = await reader(inventoryHtml(2, [row('a')], { loading: true }));
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, get: () => 0, set: () => {
    document.querySelector('.list').innerHTML = row('a') + row('b', 'BGS 9');
    document.querySelector('.infinite-scroll').hidden = true;
  } });
  expect(await read()).toMatchObject({ ok: true, data: { total: 2, holdings: [{ holdingId: 'a' }, { holdingId: 'b' }] } });
});

it('never verifies a partial collection when pagination stalls', async () => {
  const read = await reader(inventoryHtml(2, [row('a')], { loading: true }));
  expect(await read()).toMatchObject({ ok: false, error: expect.stringMatching(/Inventory did not fully load/) });
});

it.each([
  ['count', () => { document.querySelector('.filter-results').textContent = '3 results'; }, /count changed/],
  ['filter', () => { document.querySelector('.filter-results').textContent = '2 results Category: Pokemon'; }, /filters changed/],
  ['search', () => { document.querySelector('[contenteditable]').textContent = 'Lugia'; }, /Clear the Inventory search/],
  ['collection', () => { document.querySelector('h1').textContent = 'Another collection'; }, /selected collection changed/],
])('rejects a %s change while reading membership', async (_label, mutate, error) => {
  const read = await reader(inventoryHtml(2, [row('a')], { loading: true }));
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, get: () => 0, set: mutate });
  expect(await read()).toMatchObject({ ok: false, error: expect.stringMatching(error) });
});

it('rejects missing holding identifiers instead of treating the entry as absent', async () => {
  const read = await reader(inventoryHtml(1, [row('')]));
  expect(await read()).toMatchObject({ ok: false, error: expect.stringMatching(/unreadable identifier/) });
});

it('hashes the observed User ID section locally and never returns its raw identifier', async () => {
  const syntheticId = 'SYNTHETICUserId12345678901234';
  const html = `<div class="account"><h4 class="secondary-font">User ID</h4><div class="align"><span>${syntheticId}</span><button class="icon-button"><i>content_copy</i></button></div></div>`;
  const read = await reader(html, '/account');
  vi.stubGlobal('crypto', webcrypto);
  expect(readAccountUserId(document)).toBe(syntheticId);
  const response = await read('accountKey');
  expect(response).toEqual({ ok: true, data: createHash('sha256').update(`cardladder-user-id:${syntheticId}`).digest('hex') });
  expect(JSON.stringify(response)).not.toContain(syntheticId);
});

it.each(['USER ID', '  USER\n  ID  '])('verifies the account when its User ID label is rendered as %j', async renderedLabel => {
  const syntheticId = 'SYNTHETICUserId12345678901234';
  const html = `<div class="account"><h4 class="secondary-font">User ID</h4><div class="align"><span>${syntheticId}</span><button><i>content_copy</i></button></div></div>`;
  const read = await reader(html, '/account');
  // jsdom does not apply CSS text-transform to innerText. Reproduce the
  // uppercase rendered text observed on CardLadder's Account page.
  Object.defineProperty(document.querySelector('h4'), 'innerText', { value: renderedLabel });
  vi.stubGlobal('crypto', webcrypto);
  expect(readAccountUserId(document)).toBe(syntheticId);
  const response = await read('accountKey');
  expect(response).toEqual({ ok: true, data: createHash('sha256').update(`cardladder-user-id:${syntheticId}`).digest('hex') });
  expect(JSON.stringify(response)).not.toContain(syntheticId);
});

it.each([
  '<h4>Display Name</h4><div><span>SYNTHETICUserId12345678901234</span></div>',
  '<h4>USER ID</h4><div><span>Loading…</span></div><h4>Customer ID</h4><div><span>SYNTHETICUserId12345678901234</span></div>',
  '<h4>User ID</h4><div><span>SYNTHETICUserId12345678901234</span></div><h4>USER ID</h4><div><span>SYNTHETICDifferentId12345678</span></div>',
])('does not infer account scope from a different or ambiguous account field', section => {
  document.body.innerHTML = `<div class="account">${section}</div>`;
  expect(readAccountUserId(document)).toBeNull();
});

it('returns no account key when the rendered User ID is unavailable', async () => {
  const read = await reader('<div class="account"><h4>User ID</h4><div class="align"><span>Loading…</span></div></div>', '/account');
  expect(await read('accountKey')).toEqual({ ok: true, data: null });
});

it('rejects duplicate collections named Inventory before producing membership evidence', async () => {
  const read = await reader(inventoryHtml(0, [], { empty: true }));
  document.querySelector('.dropdown ul').insertAdjacentHTML('beforeend', '<li><span>Inventory</span></li>');
  expect(await read()).toMatchObject({ ok: false, error: expect.stringMatching(/duplicate collection names/) });
});

it('allows the selected Inventory when the opened collection menu has no other choices', async () => {
  const read = await reader(inventoryHtml(0, [], { empty: true }));
  document.querySelector('.dropdown ul').replaceChildren();
  expect(await read()).toMatchObject({ ok: true, data: { total: 0, holdings: [] } });
});
