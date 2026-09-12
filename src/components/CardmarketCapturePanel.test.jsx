import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ app: {}, request: vi.fn(), save: vi.fn() }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => mocks.app }));
vi.mock('@/utils/cardmarketCompanion', () => ({ cardmarketRequest: mocks.request, saveCardmarketBinding: mocks.save, saveCardmarketOffers: mocks.save }));
import { CardmarketSyncPanel } from './CardmarketSyncPanel';
import { createCardmarketBinding } from '../utils/cardmarketSync';

let host, root, status, report;
const makeCard = name => {
  const card = { entryId: name, name, set: 'Expedition Base Set', number: '4', language: 'English', condition: 'LP', isReverseHolo: true, isUnlimited: true };
  return { ...card, cardmarketBinding: createCardmarketBinding(card, { productUrl: `https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/${name}-EX4`, language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false, confirmed: true }) };
};
const captured = card => ({ entryId: card.entryId, inventoryKey: card.cardmarketBinding.inventoryKey, productUrl: card.cardmarketBinding.productUrl, source: 'cardmarket-browser', currency: 'EUR', complete: true, capturedAt: new Date().toISOString(), filters: card.cardmarketBinding, offers: [{ offerId: 'articleRow100', seller: 'Test seller', sellerType: 'Professional', price: 100, currency: 'EUR', condition: 'EX', language: 'English', finish: 'reverse', firstEdition: false, signed: false, altered: false, url: card.cardmarketBinding.productUrl }] });
const button = name => [...host.querySelectorAll('button')].find(el => el.textContent === name);
beforeEach(() => {
  vi.useFakeTimers(); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.app = { user: { uid: 'test' }, db: {}, collectionItems: [makeCard('Blastoise'), makeCard('Charizard')], currency: 'EUR' };
  mocks.save.mockClear(); mocks.request.mockReset();
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
  expect(button('Apply 1 chosen price').disabled).toBe(false);
  report.captures.push(captured(mocks.app.collectionItems[1]));
  status = { ...status, reportRevision: 'test:2', hasCaptureJob: false, canResume: false, status: { state: 'complete', message: 'Captured 2 products.' } };
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  expect(host.querySelector('input[type="radio"]').checked).toBe(true);
  expect(button('Apply 1 chosen price').disabled).toBe(false);
  expect(button('Resume capture')).toBeUndefined();
  report = { ...report, runId: 'next' }; status = { ...status, runId: 'next', reportRevision: 'next:2' };
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(button('Apply 0 chosen prices').disabled).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});
