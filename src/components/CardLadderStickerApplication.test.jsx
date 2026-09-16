import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ rates: { USD: 1, EUR: 0.92, GBP: 0.79 } }) })));
});
const state = vi.hoisted(() => ({ data: {}, report: null, writes: [] }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({
  user: { uid: 'sticker-test' }, db: {}, collectionItems: state.data.items,
  currency: 'EUR', secondaryCurrency: 'GBP', roundUpPrices: true,
}) }));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal(),
  doc: (_db, collection, uid) => ({ collection, uid }),
  runTransaction: async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => state.data }),
    update: (ref, write) => { state.writes.push({ ref, write }); state.data = { ...state.data, ...write }; },
  }),
}));
vi.mock('@/utils/cardLadderCompanion', async importOriginal => ({
  ...await importOriginal(),
  companionRequest: async action => action === 'report' ? state.report : { installed: true, version: '1.1.1', runId: state.report.runId },
}));
import { CardLadderSyncPanel } from './CardLadderSyncPanel';
import { salesWindow } from '@/utils/cardLadderSales';
import { formatSyncStickerPrice } from '@/utils/syncCurrency';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const capturedAt = new Date().toISOString();
  state.writes = [];
  state.data = { items: [{ entryId: 'owned', name: 'Lugia V', set: 'Silver Tempest', number: '186', isGraded: true,
    gradingCompany: 'PSA', grade: '10', gradedPrice: 1500, gradedPriceCurrency: 'USD', overridePrice: 2000,
    overridePriceCurrency: 'EUR', quantity: 2, buyPrice: 850, buyPriceCurrency: 'EUR' }] };
  state.report = { schemaVersion: 2, source: 'cardladder-browser', currency: 'USD', runId: 'sticker-regression',
    capturedAt, ...salesWindow(capturedAt), collectionName: 'Inventory', collectionComplete: true,
    holdings: [{ holdingId: 'one', name: 'Lugia V', set: 'Silver Tempest', number: '186', gradingCompany: 'PSA',
      grade: '10', currency: 'USD', complete: true, sales: [{ price: 1200.25, currency: 'USD', soldDate: capturedAt.slice(0, 10),
        title: 'Lugia V 186 PSA 10', type: 'Auction', url: 'https://www.ebay.com/itm/12345678' }] }] };
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
afterAll(() => vi.unstubAllGlobals());
const clickButton = async text => {
  const button = [...host.querySelectorAll('button')].find(element => element.textContent === text);
  expect(button, text).toBeTruthy(); expect(button.disabled).toBe(false);
  await act(async () => button.click());
};
const chooseMode = async text => {
  const label = [...host.querySelectorAll('label')].find(element => element.textContent === text);
  expect(label, text).toBeTruthy();
  await act(async () => label.querySelector('input').click());
};
const sticker = () => [...host.querySelectorAll('p')].find(element => element.textContent === 'Current sticker price')?.nextElementSibling?.textContent;

it('writes the sticker through the real save path and inventory valuation after an estimate-only save of the same capture', async () => {
  const originalReport = structuredClone(state.report);
  await act(async () => root.render(<CardLadderSyncPanel />));
  await clickButton('Preview latest capture');
  expect(sticker()).toBe('€2,000.00 (£1,717.39)');
  await chooseMode('Market estimates only');
  await clickButton('Save 1 market estimate');
  expect(state.data.items[0]).toMatchObject({ gradedPrice: 1200.25, gradedPriceCurrency: 'USD', overridePrice: 2000, overridePriceCurrency: 'EUR' });
  expect(sticker()).toBe('€2,000.00 (£1,717.39)');
  await chooseMode('Sticker prices and market estimates');
  await clickButton('Update 1 sticker price');
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].ref).toEqual({ collection: 'collections', uid: 'sticker-test' });
  expect(state.data.items[0]).toMatchObject({ gradedPrice: 1200.25, gradedPriceCurrency: 'USD', overridePrice: 1200.25,
    overridePriceCurrency: 'USD', quantity: 2, buyPrice: 850, buyPriceCurrency: 'EUR' });
  expect(formatSyncStickerPrice(state.data.items[0], { currency: 'EUR', secondaryCurrency: 'GBP', roundUpPrices: true })).toBe('€1,105.00 (£948.20)');
  expect(sticker()).toBe('€1,105.00 (£948.20)');
  expect(state.report).toEqual(originalReport);
});
