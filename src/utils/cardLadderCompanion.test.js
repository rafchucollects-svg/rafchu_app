import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const firestore = vi.hoisted(() => ({ transaction: { get: vi.fn(), update: vi.fn(), set: vi.fn() } }));
vi.mock('firebase/firestore', () => ({ doc: (_db, collection, uid) => ({ collection, uid }), runTransaction: (_db, callback) => callback(firestore.transaction) }));
import { autoSyncKey, companionRequest, saveCardLadderReport } from './cardLadderCompanion';
import { salesWindow } from './cardLadderSales';

const now = new Date();
const item = { entryId: 'owned', name: 'Lugia V', set: '2022 Pokemon Silver Tempest', number: '186', variation: '', gradingCompany: 'PSA', grade: '10', isGraded: true, gradedPrice: 1230, quantity: 2, buyPrice: 800 };
const report = { schemaVersion: 1, source: 'cardladder-browser', runId: 'one', collectionName: 'Inventory', collectionComplete: true, capturedAt: now.toISOString(), ...salesWindow(now), holdings: [{ holdingId: 'cl-one', name: 'Lugia V', set: item.set, number: '186', variation: '', gradingCompany: 'PSA', grade: '10', complete: true, sales: [{ title: 'Lugia V 186 PSA 10', price: 1525, soldDate: now.toISOString().slice(0, 10), currency: 'USD', type: 'Auction', url: 'https://www.ebay.com/itm/123456789' }] }] };
beforeEach(() => { vi.clearAllMocks(); firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [item] }) }); });
afterEach(() => vi.useRealTimers());

describe('transactional Inventory application', () => {
  it('uses the signed-in user document and latest quantities, without recreating removed cards', async () => {
    const latest = { ...item, quantity: 1, buyPrice: 777, overridePrice: 1900 };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [latest] }) });
    expect(await saveCardLadderReport({}, 'user-1', report)).toMatchObject({ updatedCount: 1 });
    const [ref, write] = firestore.transaction.update.mock.calls[0];
    expect(ref).toEqual({ collection: 'collections', uid: 'user-1' });
    expect(write.items[0]).toMatchObject({ quantity: 1, buyPrice: 777, overridePrice: 1900, gradedPrice: 1525 });
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [] }) });
    await saveCardLadderReport({}, 'user-1', report);
    expect(firestore.transaction.update.mock.calls[1][1].items).toEqual([]);
  });
  it('is idempotent and never rolls prices back to an older capture', async () => {
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [item], cardLadderLastSync: { runId: report.runId, capturedAt: report.capturedAt } }) });
    expect(await saveCardLadderReport({}, 'user-1', report)).toMatchObject({ alreadyApplied: true });
    expect(firestore.transaction.update).not.toHaveBeenCalled();
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [item], cardLadderLastSync: { runId: 'newer', capturedAt: new Date(now.getTime() + 10000).toISOString() } }) });
    expect(await saveCardLadderReport({}, 'user-1', report)).toMatchObject({ alreadyApplied: true });
  });
  it('can create an empty inventory and deduplicates additions against the latest transaction data', async () => {
    firestore.transaction.get.mockResolvedValue({ exists: () => false });
    const additions = { 'cl-one': { quantity: 2, buyPrice: '' } };
    expect(await saveCardLadderReport({}, 'new-user', report, {}, additions)).toMatchObject({ addedCount: 1, updatedCount: 0 });
    const [ref, write, options] = firestore.transaction.set.mock.calls[0];
    expect(ref).toEqual({ collection: 'collections', uid: 'new-user' });
    expect(options).toEqual({ merge: true });
    expect(write.items[0]).toMatchObject({ quantity: 2, gradedPrice: 1525 });
    expect(write.items[0]).not.toHaveProperty('buyPrice');
    // Another tab may add this card after the preview, even after price-only auto-sync.
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: write.items, cardLadderLastSync: write.cardLadderLastSync }) });
    expect(await saveCardLadderReport({}, 'new-user', report, {}, additions)).toMatchObject({ addedCount: 0, skippedAddCount: 1 });
    expect(firestore.transaction.update.mock.calls[0][1].items).toHaveLength(1);
    expect(firestore.transaction.update.mock.calls[0][1].items[0].quantity).toBe(2);
  });
  it('saves only checked rows and permits a later manual selection from the same capture', async () => {
    const first = await saveCardLadderReport({}, 'user-1', report, {}, {}, []);
    expect(first.updatedCount).toBe(0);
    const saved = firestore.transaction.update.mock.calls[0][1];
    expect(saved.items).toEqual([item]);
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => saved });
    expect(await saveCardLadderReport({}, 'user-1', report, {}, {}, ['cl-one'])).toMatchObject({ updatedCount: 1 });
  });
  it('stops an automatic save when manual review turns off automatic updates', async () => {
    localStorage.setItem(autoSyncKey('user-1'), 'false');
    await expect(saveCardLadderReport({}, 'user-1', report, {}, {}, null, true)).rejects.toThrow(/paused/);
    expect(firestore.transaction.update).not.toHaveBeenCalled();
  });
  it('rejects invalid evidence before writing', async () => {
    await expect(saveCardLadderReport({}, '', report)).rejects.toThrow(/Sign in/);
    await expect(saveCardLadderReport({}, 'user-1', { ...report, collectionName: 'PC!' })).rejects.toThrow(/Inventory/);
    expect(firestore.transaction.update).not.toHaveBeenCalled();
  });
});

describe('browser bridge boundaries', () => {
  it('ignores messages from another origin and times out without a companion', async () => {
    vi.useFakeTimers();
    const pending = companionRequest('status', 200);
    const assertion = expect(pending).rejects.toThrow(/Install/);
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://untrusted.example', data: { channel: 'rafchu-companion-response', ok: true } }));
    await vi.advanceTimersByTimeAsync(201);
    await assertion;
  });
});

it('passes manual fallback choices through the transaction and prevents automatic fallback', async () => {
  const input = { ...report, holdings: [{ ...report.holdings[0], sales: [], cardLadderValue: 1100, cardLadderValueCurrency: 'USD' }] };
  await expect(saveCardLadderReport({}, 'user-1', input, {}, {}, ['cl-one'], true, ['cl-one'])).rejects.toThrow(/manual review/);
  expect(firestore.transaction.update).not.toHaveBeenCalled();
  await expect(saveCardLadderReport({}, 'user-1', input, {}, {}, ['cl-one'], false, ['cl-one'])).resolves.toMatchObject({ updatedCount: 1 });
  expect(firestore.transaction.update.mock.calls[0][1].items[0]).toMatchObject({ gradedPrice: 1100, cardladderPricing: { method: 'cardladder-value' } });
});
