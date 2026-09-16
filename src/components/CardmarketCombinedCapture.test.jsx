import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ app: {}, request: vi.fn(), saveBinding: vi.fn(), saveOffers: vi.fn() }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('@/utils/cardmarketCompanion', () => ({ cardmarketRequest: mocks.request, saveCardmarketBinding: mocks.saveBinding, saveCardmarketOffers: mocks.saveOffers }));
import { CardmarketSyncPanel } from './CardmarketSyncPanel';
import { cardmarketInventoryKey, createCardmarketBinding } from '../utils/cardmarketSync';
import { discoveryUrl } from '../utils/cardmarketDiscovery';

const now = Date.parse('2026-09-16T12:00:00Z');
const firstUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/SM-Black-Star-Promos/Reshiram-Charizard-GX-V1-SM201';
const secondUrl = firstUrl.replace('-V1-', '-V2-');
const card = { entryId: 'sm201', name: 'Reshiram & Charizard-GX', set: 'SM Black Star Promos', number: 'SM201', language: '', condition: 'NM', overridePrice: 200, overridePriceCurrency: 'EUR' };
const candidate = productUrl => ({ name: card.name, set: card.set, number: card.number, productUrl });
const offer = (productUrl, changes = {}) => ({ offerId: 'articleRow1001', seller: 'First printing seller', price: 99, currency: 'EUR', country: 'Finland', sellerType: 'Professional', condition: 'NM', language: 'English', finish: 'non-reverse', firstEdition: false, signed: false, altered: false, comments: '', url: `${productUrl}#articleRow1001`, ...changes });
const preview = (productUrl = firstUrl, changes = {}) => ({
  scope: 'product-preview', source: 'cardmarket-browser', currency: 'EUR', entryId: card.entryId, inventoryKey: cardmarketInventoryKey(card), productUrl,
  productTitle: 'Reshiram & Charizard GX (SM 201)', productImageUrl: null, filteredUrl: discoveryUrl(productUrl, { condition: 'NM' }), capturedAt: new Date(now).toISOString(),
  coverage: { languages: null, minCondition: 'NM', finishes: null, editions: null, signed: false, altered: false }, complete: true, moreAvailable: false,
  offers: [offer(productUrl), offer(productUrl, { offerId: 'articleRow1002', seller: 'Japanese seller', price: 10, language: 'Japanese' }), offer(productUrl, { offerId: 'articleRow1003', seller: 'Reverse seller', price: 20, finish: 'reverse' })], ...changes,
});

let host, root, status, products, report;
const button = name => [...host.querySelectorAll('button')].find(el => el.textContent === name);
const render = () => act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
const listingPreview = () => host.querySelector('[aria-label="Captured listing preview for sm201"]');
const select = (label, value) => {
  const field = [...host.querySelectorAll('article label')].find(el => el.textContent.startsWith(label)).querySelector('select');
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
};
async function confirmMatch() {
  for (const [label, value] of [['Card language', 'English'], ['Cardmarket condition', 'NM'], ['Reverse holo', 'non-reverse'], ['First edition', 'false']]) act(() => select(label, value));
  act(() => [...host.querySelectorAll('article label')].find(el => el.textContent.startsWith('I checked the product')).querySelector('input').click());
  expect(button('Save product match').disabled).toBe(false);
  await act(async () => button('Save product match').click());
  // Firebase's collection subscription delivers the saved binding separately.
  const binding = await mocks.saveBinding.mock.results.at(-1).value;
  mocks.app = { ...mocks.app, collectionItems: [{ ...card, cardmarketBinding: binding }] };
  await render();
  return binding;
}
const expectNoRecapture = () => {
  expect(mocks.request.mock.calls.map(([action]) => action)).not.toContain('start');
  expect(mocks.request.mock.calls.map(([action]) => action)).not.toContain('capture-preview');
};

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.app = { user: { uid: 'test' }, db: {}, collectionItems: [{ ...card }], currency: 'EUR' };
  mocks.request.mockReset(); mocks.saveBinding.mockReset(); mocks.saveOffers.mockReset();
  mocks.saveBinding.mockImplementation(async (_db, _uid, item, choice) => createCardmarketBinding(item, choice));
  mocks.saveOffers.mockResolvedValue({ updatedCount: 1 });
  status = { installed: true, version: '0.3.6', runId: 'previous', reportRevision: 'previous:0', productRunId: 'combined', productRevision: 'combined:1', hasCaptureJob: false, hasSuggestionJob: false,
    capabilities: ['product-suggestions', 'resumable-capture', 'seller-photo-cache', 'resumable-product-search', 'server-error-recovery', 'combined-product-offers'], status: { state: 'complete' } };
  report = { schemaVersion: 1, source: 'cardmarket-browser', runId: 'previous', captures: [] };
  products = { runId: 'combined', results: [{ entryId: card.entryId, inventoryKey: cardmarketInventoryKey(card), candidates: [candidate(firstUrl)], previews: [preview()] }], photos: {} };
  mocks.request.mockImplementation(async action => action === 'status' ? structuredClone(status) : action === 'products' ? structuredClone(products) : action === 'report' ? structuredClone(report) : {});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it('requests links and listings together and displays an unconfirmed read-only preview without inventory writes', async () => {
  await render();
  await act(async () => button('Find links and listings').click());
  expect(mocks.request).toHaveBeenCalledWith('suggest', [{ entryId: card.entryId, name: card.name, set: card.set, number: card.number, language: null, inventoryKey: cardmarketInventoryKey(card), captureOffers: true, condition: 'NM' }]);
  expect(listingPreview().textContent).toContain('3 listings already captured');
  expect(listingPreview().textContent).toContain('First printing seller');
  expect(listingPreview().textContent).toContain('Japanese seller');
  expect(listingPreview().querySelector('input, button, select')).toBeNull();
  expect(host.querySelector('input[type="radio"]')).toBeNull();
  expect(button('Save product match').disabled).toBe(true);
  expect(button('Save 0 market estimates').disabled).toBe(true);
  expect(mocks.saveBinding).not.toHaveBeenCalled();
  expect(mocks.saveOffers).not.toHaveBeenCalled();
  expectNoRecapture();
});

it('makes cached matching prices selectable after confirmation and saves only on explicit price application', async () => {
  await render();
  const binding = await confirmMatch();
  expect(mocks.saveBinding).toHaveBeenCalledWith(mocks.app.db, 'test', expect.objectContaining({ entryId: card.entryId }), expect.objectContaining({ productUrl: firstUrl, language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: false, confirmed: true }));
  expect(host.textContent).toContain('no new capture is needed');
  expect(host.textContent).toContain('1 matching offer from 1 seller');
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(1);
  expect(mocks.saveOffers).not.toHaveBeenCalled();
  expectNoRecapture();
  act(() => host.querySelector('input[type="radio"]').click());
  await act(async () => button('Save 1 market estimate').click());
  expect(mocks.saveOffers).toHaveBeenCalledTimes(1);
  const [db, uid, savedReport, choices] = mocks.saveOffers.mock.calls[0];
  expect(db).toBe(mocks.app.db); expect(uid).toBe('test');
  expect(savedReport).toMatchObject({ schemaVersion: 1, source: 'cardmarket-browser', runId: 'combined', captures: [{ entryId: card.entryId, productUrl: firstUrl, inventoryKey: binding.inventoryKey, filters: { language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: false }, discoveryCoverage: preview().coverage }] });
  expect(choices).toEqual([{ entryId: card.entryId, method: 'selected-offer', offerId: 'articleRow1001', replaceManual: false }]);
  expect(host.textContent).toContain('Your manual selling prices are unchanged.');
  expect(mocks.app.collectionItems[0].overridePrice).toBe(200);
  expectNoRecapture();
});

it('switches candidate previews and derives prices only from the confirmed printing URL', async () => {
  products.results[0].candidates.push(candidate(secondUrl));
  products.results[0].previews.push(preview(secondUrl, { offers: [offer(secondUrl, { offerId: 'articleRow2001', seller: 'Second printing seller', price: 250 })] }));
  await render();
  expect(listingPreview().textContent).toContain('First printing seller');
  expect(listingPreview().textContent).not.toContain('Second printing seller');
  act(() => select('Other product suggestions', secondUrl));
  expect(listingPreview().textContent).toContain('Second printing seller');
  expect(listingPreview().textContent).not.toContain('First printing seller');
  expect(host.querySelector('input[type="url"]').value).toBe(secondUrl);
  await confirmMatch();
  const radios = host.querySelectorAll('input[type="radio"]');
  expect(radios).toHaveLength(1);
  expect(radios[0].closest('label').textContent).toContain('Second printing seller');
  expect(radios[0].closest('label').textContent).not.toContain('First printing seller');
  act(() => radios[0].click());
  await act(async () => button('Save 1 market estimate').click());
  expect(mocks.saveOffers.mock.calls[0][2].captures[0].productUrl).toBe(secondUrl);
  expect(mocks.saveOffers.mock.calls[0][3][0].offerId).toBe('articleRow2001');
  expectNoRecapture();
});

it.each([
  ['incomplete', { complete: false, moreAvailable: true, error: 'The listing preview is incomplete.' }],
  ['stale', { capturedAt: new Date(now - 86400001).toISOString() }],
])('never enables a price from a %s preview, even after confirming the product', async (state, changes) => {
  products.results[0].previews = [preview(firstUrl, changes)];
  await render();
  if (state === 'incomplete') expect(listingPreview().textContent).toContain('The listing preview is incomplete.');
  else expect(listingPreview()).toBeNull();
  await confirmMatch();
  expect(host.querySelector('input[type="radio"]')).toBeNull();
  expect(button('Save 0 market estimates').disabled).toBe(true);
  expect(host.textContent).toContain('Refresh its listings to read offers for these filters.');
  expect(mocks.saveOffers).not.toHaveBeenCalled();
  expectNoRecapture();
});

it('removes selectable prices when a cached preview expires while the panel remains open', async () => {
  products.results[0].previews = [preview(firstUrl, { capturedAt: new Date(now - 86400000 + 1000).toISOString() })];
  await render();
  await confirmMatch();
  act(() => host.querySelector('input[type="radio"]').click());
  expect(button('Save 1 market estimate').disabled).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(listingPreview()).toBeNull();
  expect(host.querySelector('input[type="radio"]')).toBeNull();
  expect(button('Save 0 market estimates').disabled).toBe(true);
  expect(mocks.saveOffers).not.toHaveBeenCalled();
  expectNoRecapture();
});

it('explains when confirmed filters have no matching captured offers without claiming a price is ready', async () => {
  products.results[0].previews = [preview(firstUrl, { offers: [offer(firstUrl, { language: 'Japanese' })] })];
  await render();
  await confirmMatch();
  expect(host.textContent).toContain('No captured offers match these filters. Your current price is unchanged.');
  expect(host.textContent).not.toContain('Its captured listings are ready to choose below');
  expect(host.querySelector('input[type="radio"]')).toBeNull();
  expect(button('Save 0 market estimates').disabled).toBe(true);
  expect(mocks.saveOffers).not.toHaveBeenCalled();
  expectNoRecapture();
});
