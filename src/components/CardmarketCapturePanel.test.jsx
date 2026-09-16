import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ app: {}, request: vi.fn(), save: vi.fn() }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('@/utils/cardmarketCompanion', () => ({ cardmarketRequest: mocks.request, saveCardmarketBinding: mocks.save, saveCardmarketOffers: mocks.save }));
import { CardmarketSyncPanel } from './CardmarketSyncPanel';
import { createCardmarketBinding, cardmarketInventoryKey } from '../utils/cardmarketSync';

let host, root, status, report;
const makeCard = name => {
  const card = { entryId: name, name, set: 'Expedition Base Set', number: '4', language: 'English', condition: 'LP', isReverseHolo: true, isUnlimited: true, overridePrice: 120 };
  return { ...card, cardmarketBinding: createCardmarketBinding(card, { productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4`, language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false, confirmed: true }) };
};
const captured = card => ({ entryId: card.entryId, inventoryKey: card.cardmarketBinding.inventoryKey, productUrl: card.cardmarketBinding.productUrl, source: 'cardmarket-browser', currency: 'EUR', complete: true, capturedAt: new Date().toISOString(), filters: card.cardmarketBinding, offers: [{ offerId: 'articleRow100', seller: 'Test seller', sellerType: 'Professional', price: 100, currency: 'EUR', condition: 'EX', language: 'English', finish: 'reverse', firstEdition: false, signed: false, altered: false, url: card.cardmarketBinding.productUrl }] });
const button = name => [...host.querySelectorAll('button')].find(el => el.textContent === name);
beforeEach(() => {
  vi.useFakeTimers(); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.app = { user: { uid: 'test' }, db: {}, collectionItems: [makeCard('Blastoise'), makeCard('Charizard')], currency: 'EUR' };
  mocks.save.mockReset(); mocks.request.mockReset();
  status = { installed: true, version: '0.2.2', reportRevision: 'test:1', runId: 'test', hasCaptureJob: true, canResume: true, capabilities: ['product-suggestions', 'resumable-capture'], status: { state: 'paused', message: 'Charizard · Cardmarket needs browser verification.' } };
  report = { runId: 'test', captures: [captured(mocks.app.collectionItems[0])] };
  mocks.request.mockImplementation(async action => action === 'status' ? status : action === 'report' ? structuredClone(report) : {});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

it('automatically displays partial offers and exposes resume/open controls without writing inventory', async () => {
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(host.textContent).toContain('1 matching offer');
  expect(host.textContent).toContain('Waiting for this card.');
  expect(button('Capture 2 linked cards').disabled).toBe(true);
  await act(async () => button('Open Cardmarket reader').click());
  expect(mocks.request).toHaveBeenCalledWith('open-reader');
  await act(async () => button('Resume capture').click());
  expect(mocks.request).toHaveBeenCalledWith('resume');
  expect(mocks.request).not.toHaveBeenCalledWith('start', expect.anything());
  expect(mocks.save).not.toHaveBeenCalled();
});
it('keeps an offer choice as later cards arrive, and clears choices for a new capture run', async () => {
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  act(() => host.querySelector('input[type="radio"]').click());
  expect(button('Save 1 market estimate').disabled).toBe(false);
  report.captures.push(captured(mocks.app.collectionItems[1]));
  status = { ...status, reportRevision: 'test:2', hasCaptureJob: false, canResume: false, status: { state: 'complete', message: 'Captured 2 products.' } };
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  expect(host.querySelector('input[type="radio"]').checked).toBe(true);
  expect(button('Save 1 market estimate').disabled).toBe(false);
  expect(button('Resume capture')).toBeUndefined();
  report = { ...report, runId: 'next' }; status = { ...status, runId: 'next', reportRevision: 'next:2' };
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(button('Save 0 market estimates').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('saves a market estimate by default and confirms beside the save button that selling prices were preserved', async () => {
  mocks.save.mockResolvedValue({ updatedCount: 1 });
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  act(() => host.querySelector('input[type="radio"]').click());
  await act(async () => button('Save 1 market estimate').click());
  expect(mocks.save).toHaveBeenCalledWith(mocks.app.db, 'test', report, [{ entryId: 'Blastoise', method: 'selected-offer', offerId: 'articleRow100', replaceManual: false }]);
  const footer = host.querySelector('[aria-label="Save chosen Cardmarket prices"]');
  expect(footer.querySelector('[role="status"]').textContent).toContain('Saved 1 Cardmarket market estimate. Your manual selling prices are unchanged.');
  expect(button('Save 0 market estimates').disabled).toBe(true);
});

it('requires the explicit selling-price choice and shows saving and completion beside that action', async () => {
  let finishSave;
  mocks.save.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  act(() => host.querySelector('input[type="radio"]').click());
  const footer = host.querySelector('[aria-label="Save chosen Cardmarket prices"]');
  act(() => footer.querySelector('input[type="checkbox"]').click());
  await act(async () => button('Update 1 selling price').click());
  expect(button('Saving chosen prices…').disabled).toBe(true);
  expect(footer.querySelector('input').disabled).toBe(true);
  expect(footer.querySelector('[role="status"]').textContent).toContain('Saving');
  expect(mocks.save.mock.calls[0][3][0].replaceManual).toBe(true);
  await act(async () => finishSave({ updatedCount: 1 }));
  expect(footer.querySelector('[role="status"]').textContent).toContain('Updated 1 selling price');
});

it('shows failed saves beside the button and preserves the chosen offer for retry', async () => {
  mocks.save.mockRejectedValue(new Error('Permission denied. Please sign in again.'));
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  act(() => host.querySelector('input[type="radio"]').click());
  await act(async () => button('Save 1 market estimate').click());
  const footer = host.querySelector('[aria-label="Save chosen Cardmarket prices"]');
  expect(footer.querySelector('[role="alert"]').textContent).toBe('Permission denied. Please sign in again.');
  expect(host.querySelector('input[type="radio"]').checked).toBe(true);
  expect(button('Save 1 market estimate').disabled).toBe(false);
});

const eevee = entryId => ({ entryId, name: 'Eevee', set: 'Black & White BW Black Star Promos', number: 'BW97', language: 'English', condition: 'NM', overridePrice: 450 });
const linkEevee = card => ({ ...card, cardmarketBinding: createCardmarketBinding(card, { productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/BW-Black-Star-Promos/Eevee-V2-BWBW97', language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: false, confirmed: true }) });
const manualFilter = () => [...host.querySelectorAll('label')].find(label => label.textContent === 'Show manually priced singles only').querySelector('input');
const idle = () => { status = { ...status, hasCaptureJob: false, canResume: false, status: { state: 'complete', message: '' } }; };

it('shows both ordinary Eevee promos by default and requests matches only for unmatched manual singles', async () => {
  idle();
  mocks.app.collectionItems = [makeCard('Blastoise'), eevee('eevee-a'), { ...eevee('eevee-b'), overridePrice: undefined, manualPrice: '450' },
    { ...makeCard('Suggested'), overridePrice: null }, { ...eevee('graded'), grade: '9' }, { ...eevee('sealed'), isSealed: true }];
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(manualFilter().checked).toBe(true);
  expect([...host.querySelectorAll('article h3')].map(el => el.textContent)).toEqual(['Blastoise #4', 'Eevee #BW97', 'Eevee #BW97']);
  expect(host.textContent).toContain('3 manually priced ungraded singles · 1 linked · 2 need a product match');
  expect(host.textContent).not.toContain('Show cards with variant tags only');
  await act(async () => button('Suggest product links').click());
  expect(mocks.request).toHaveBeenCalledWith('suggest', [expect.objectContaining({ entryId: 'eevee-a', number: 'BW97' }), expect.objectContaining({ entryId: 'eevee-b', number: 'BW97' })]);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('captures all linked manual singles including both Eevee entries with non-reverse filters', async () => {
  idle();
  const cards = [makeCard('Blastoise'), linkEevee(eevee('eevee-a')), linkEevee({ ...eevee('eevee-b'), overridePrice: undefined, manualPrice: '450' })];
  mocks.app.collectionItems = [...cards, { ...makeCard('Suggested'), overridePrice: null }, { ...makeCard('Graded'), gradingCompany: 'PSA' }];
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  await act(async () => button('Capture 3 linked cards').click());
  expect(mocks.request).toHaveBeenCalledWith('start', cards.map(card => ({ entryId: card.entryId, name: card.name, binding: card.cardmarketBinding })));
  expect(mocks.save).not.toHaveBeenCalled();
});

it('keeps capture and price choices within the visible manual-price scope', async () => {
  idle();
  const manual = makeCard('Blastoise');
  const suggested = { ...makeCard('Suggested'), overridePrice: null };
  mocks.app.collectionItems = [manual, suggested];
  report = { runId: 'test', captures: [captured(manual), captured(suggested)] };
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  act(() => manualFilter().click());
  expect(button('Capture 2 linked cards')).toBeDefined();
  act(() => host.querySelectorAll('input[type="radio"]')[1].click());
  expect(button('Save 1 market estimate').disabled).toBe(false);
  act(() => manualFilter().click());
  expect(button('Capture 1 linked card')).toBeDefined();
  expect(button('Save 0 market estimates').disabled).toBe(true);
  await act(async () => button('Capture 1 linked card').click());
  expect(mocks.request).toHaveBeenCalledWith('start', [{ entryId: manual.entryId, name: manual.name, binding: manual.cardmarketBinding }]);
});

it('shows each completed product suggestion while search is still running without saving a match', async () => {
  const card = { ...makeCard('Arbok'), cardmarketBinding: undefined, number: '3' };
  mocks.app.collectionItems = [card];
  status = { installed: true, productRunId: 'search', productRevision: 'search:0', status: { state: 'running' } };
  let results = [];
  mocks.request.mockImplementation(async action => action === 'status' ? status : { results });
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  const url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Arbok-EX3';
  results = [{ entryId: card.entryId, inventoryKey: cardmarketInventoryKey(card), candidates: [{ name: card.name, set: card.set, number: card.number, productUrl: url }] }];
  status.productRevision = 'search:1';
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(host.querySelector('input[type="url"]').value).toBe(url);
  expect(button('Save product match').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('shows an incomplete lookup warning even when an exact catalogue link is already suggested', async () => {
  const card = eevee('eevee-a');
  const lookupError = 'Search pagination could not be completed for this card. Review its product link.';
  mocks.app.collectionItems = [card];
  status = { installed: true, productRevision: 'search:1', capabilities: ['resumable-product-search', 'server-error-recovery'], status: { state: 'complete' } };
  mocks.request.mockImplementation(async action => action === 'status' ? status : { results: [
    { entryId: card.entryId, inventoryKey: cardmarketInventoryKey(card), candidates: [], error: lookupError, errorCode: 'search-incomplete' },
  ] });
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(host.querySelector('input[type="url"]').value).toBe('https://www.cardmarket.com/en/Pokemon/Products/Singles/BW-Black-Star-Promos/Eevee-V2-BWBW97');
  const matchForm = host.querySelector('article details');
  expect(matchForm.open).toBe(true);
  expect(matchForm.textContent).toContain('Suggested product');
  expect(matchForm.textContent).toContain(lookupError);
  expect(button('Save product match').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each([
  ['an installed 0.3.4 companion', true, ['resumable-product-search'], true],
  ['a companion with recovery support', true, ['resumable-product-search', 'server-error-recovery'], false],
  ['an older companion without resumable search', true, ['product-suggestions'], false],
  ['an unavailable companion', false, ['resumable-product-search'], false],
])('shows the 0.3.5 recovery update warning appropriately for %s', async (_label, installed, capabilities, expected) => {
  status = { installed, capabilities, status: { state: 'complete' } };
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(host.textContent.includes('Companion 0.3.5 fixes repeated stalls after Cardmarket server errors.')).toBe(expected);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('offers product-search recovery separately from capture and blocks competing runs', async () => {
  status = { installed: true, version: '0.3.4', hasSuggestionJob: true, canResumeSuggestions: true, capabilities: ['product-suggestions', 'resumable-product-search'], status: { state: 'paused', message: 'Finish verification, then resume product search.' } };
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(host.textContent).toContain('Product search paused');
  expect(button('Resume capture')).toBeUndefined();
  expect(button('Capture 2 linked cards').disabled).toBe(true);
  await act(async () => button('Open Cardmarket reader').click());
  expect(mocks.request).toHaveBeenCalledWith('open-reader');
  await act(async () => button('Resume product search').click());
  expect(mocks.request).toHaveBeenCalledWith('resume-suggestions');
  await act(async () => button('Stop search').click());
  expect(mocks.request).toHaveBeenCalledWith('cancel');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('compares the inventory sticker and selected offer in vendor currencies without changing EUR evidence', async () => {
  const card = { ...makeCard('Blastoise'), overridePrice: 100.2, overridePriceCurrency: 'EUR', manualPrice: 999 };
  mocks.app = { ...mocks.app, collectionItems: [card], currency: 'USD', secondaryCurrency: 'GBP', roundUpPrices: true };
  report = { runId: 'test', captures: [captured(card)] };
  mocks.save.mockResolvedValue({ updatedCount: 1 });
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  const sticker = () => host.querySelector('[aria-label="Current sticker price for Blastoise"] p');
  expect(sticker().textContent).toBe('$109.00 (£86.04)');
  const offerLabel = host.querySelector('input[type="radio"]').closest('label');
  expect(offerLabel.textContent).toContain('$108.70 (£85.87)');
  expect(host.querySelector('[aria-label="Selected offer price for Blastoise"]')).toBeNull();
  act(() => host.querySelector('input[type="radio"]').click());
  expect(host.querySelector('[aria-label="Selected offer price for Blastoise"] p').textContent).toBe('$108.70 (£85.87)');
  await act(async () => button('Save 1 market estimate').click());
  expect(mocks.save.mock.calls[0][2].captures[0].offers[0]).toMatchObject({ price: 100, currency: 'EUR' });
  expect(card).toMatchObject({ overridePrice: 100.2, overridePriceCurrency: 'EUR', manualPrice: 999 });
  mocks.app = { ...mocks.app, currency: 'GBP', secondaryCurrency: 'GBP', roundUpPrices: false };
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(sticker().textContent).toBe('£86.04');
  expect(host.querySelector('input[type="radio"]').closest('label').textContent).toContain('£85.87');
  expect(host.querySelector('input[type="radio"]').closest('label').textContent).not.toContain('(');
});

it('shows the current sticker from legacy manual pricing in its stored currency', async () => {
  const card = { ...makeCard('Blastoise'), overridePrice: undefined, manualPrice: 50, manualPriceCurrency: 'GBP' };
  mocks.app = { ...mocks.app, collectionItems: [card], currency: 'USD', secondaryCurrency: 'EUR' };
  report = { runId: 'test', captures: [captured(card)] };
  await act(async () => root.render(<CardmarketSyncPanel onClose={() => {}} />));
  expect(host.querySelector('[aria-label="Current sticker price for Blastoise"] p').textContent).toBe('$63.29 (€58.23)');
  expect(mocks.save).not.toHaveBeenCalled();
});
