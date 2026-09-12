import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn(), items: [] }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ user: { uid: 'test' }, db: {}, collectionItems: mocks.items, currency: 'EUR' }) }));
vi.mock('@/utils/cardLadderCompanion', () => ({ autoSyncKey: uid => `auto:${uid}`, companionRequest: mocks.request, saveCardLadderReport: mocks.save }));
import { CardLadderSyncPanel } from './CardLadderSyncPanel';
import { salesWindow } from '../utils/cardLadderSales';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.items = [{ entryId: 'owned', name: 'Lugia V', set: 'Silver Tempest', number: '186', isGraded: true, gradingCompany: 'PSA', grade: '10', gradedPrice: 1500, gradedPriceCurrency: 'USD' }];
  mocks.save.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it('labels the captured and existing currencies and never subtracts raw EUR from USD', async () => {
  const capturedAt = new Date().toISOString();
  const report = { schemaVersion: 2, source: 'cardladder-browser', currency: 'EUR', runId: 'new', capturedAt, ...salesWindow(capturedAt), collectionName: 'Inventory', collectionComplete: true,
    holdings: [{ holdingId: 'one', name: 'Lugia V', set: 'Silver Tempest', number: '186', currency: 'EUR', gradingCompany: 'PSA', grade: '10', complete: true,
      sales: [{ price: 1200, currency: 'EUR', soldDate: capturedAt.slice(0, 10), title: 'Lugia V 186 PSA 10', type: 'Auction', url: 'https://www.ebay.com/itm/12345678' }] }] };
  mocks.request.mockImplementation(async action => action === 'report' ? report : { installed: true, runId: 'new', version: '1.1.0' });
  await act(async () => root.render(<CardLadderSyncPanel />));
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Preview latest capture').click());
  expect(host.textContent).toContain('EUR per card');
  expect(host.textContent).toMatch(/EUR\s*1,200\.00/);
  expect(host.textContent).toMatch(/USD\s*1,500\.00/);
  expect(host.textContent).toContain('Different currencies');
  expect(host.textContent).not.toContain('-300');
  expect(mocks.save).not.toHaveBeenCalled();
});
