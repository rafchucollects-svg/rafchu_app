import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ item: {}, latest: [], set: vi.fn(), remove: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ user: { uid: 'test' }, db: {} }) }));
vi.mock('@/components/ui/Toaster', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('firebase/firestore', () => ({
  collection: (...args) => args.slice(1).join('/'), doc: (...args) => args.filter(arg => typeof arg === 'string').join('/'),
  limit: vi.fn(), orderBy: vi.fn(), query: vi.fn(),
  getDocs: async () => ({ docs: [{ id: 'gone', data: () => ({ item: mocks.item }) }] }),
  runTransaction: async (_db, callback) => callback({
    get: async ref => ({ exists: () => true, data: () => ref.endsWith('/trash/gone') ? { item: mocks.item } : { items: mocks.latest } }),
    set: mocks.set, delete: mocks.remove,
  }),
}));
import { InventoryTrash } from './InventoryTrash';

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); mocks.latest = [];
  mocks.item = { entryId: 'gone', name: 'Rayquaza', set: 'POP Series 1', quantity: 2, buyPrice: 75 };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

async function restore() {
  await act(async () => root.render(<InventoryTrash collectionName="collections" />));
  await act(async () => host.querySelector('button').click());
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Restore').click());
}

it('preserves the restored card and records when a linked card was restored', async () => {
  mocks.item.cardladderData = { holdingId: 'cl-gone', inventoryAccountKey: 'account', linkedAt: 123 };
  const before = Date.now();
  await restore();
  const restored = mocks.set.mock.calls[0][1].items[0];
  expect(restored).toMatchObject(mocks.item);
  expect(restored.cardladderData.membershipRestoredAt).toBeGreaterThanOrEqual(before);
  expect(mocks.item.cardladderData).not.toHaveProperty('membershipRestoredAt');
  expect(mocks.remove).toHaveBeenCalledWith('collections/test/trash/gone');
});

it('restores an unlinked card without adding CardLadder metadata', async () => {
  await restore();
  expect(mocks.set.mock.calls[0][1].items).toEqual([mocks.item]);
  expect(mocks.success).toHaveBeenCalledWith('Card restored');
});

it('does not overwrite a card that has already been restored', async () => {
  mocks.latest = [{ ...mocks.item, quantity: 5 }];
  await restore();
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith('This card is already in your inventory.');
});
