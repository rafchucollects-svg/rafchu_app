import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  items: [],
  ladderRequest: vi.fn(),
  marketRequest: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({
  user: { uid: 'inventory-import-test' }, db: null,
  collectionItems: mocks.items, collectionSearch: '', currency: 'EUR',
}) }));
vi.mock('@/utils/cardLadderCompanion', () => ({
  autoSyncKey: uid => `auto:${uid}`,
  companionRequest: mocks.ladderRequest,
  saveCardLadderReport: mocks.save,
}));
vi.mock('@/utils/cardmarketCompanion', () => ({
  cardmarketRequest: mocks.marketRequest,
  saveCardmarketBinding: mocks.save,
  saveCardmarketOffers: mocks.save,
}));
import { MyInventory } from './MyInventory';

let root, host;
const button = name => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === name);
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.ladderRequest.mockReset().mockResolvedValue({ installed: false });
  mocks.marketRequest.mockReset().mockResolvedValue({ installed: false });
  mocks.save.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<MyInventory />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('opens Cardmarket setup from inventory even before the companion is installed', async () => {
  expect(button('Cardmarket Sync')).toBeDefined();
  await act(async () => button('Cardmarket Sync').click());
  expect(host.querySelector('a[href="/cardmarket-companion.zip"]')).not.toBeNull();
  expect(mocks.marketRequest.mock.calls.map(([action]) => action)).toEqual(['status']);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('opens both CardLadder CSV import and price sync from the inventory Import button', async () => {
  await act(async () => button('Import').click());
  expect(host.querySelector('input[accept*=".csv"]')).not.toBeNull();
  expect(host.querySelector('section[aria-label="CardLadder price sync"]')).not.toBeNull();
  expect(host.querySelector('a[href="/cardladder-companion.zip"]')).not.toBeNull();
  expect(button('Sync Inventory').disabled).toBe(true);
  expect(mocks.ladderRequest.mock.calls.map(([action]) => action)).toEqual(['status']);
  expect(mocks.save).not.toHaveBeenCalled();
});
