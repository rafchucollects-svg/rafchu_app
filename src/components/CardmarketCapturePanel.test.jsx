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
