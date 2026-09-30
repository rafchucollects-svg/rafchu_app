import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const firestore = vi.hoisted(() => ({ transaction: { get: vi.fn(), update: vi.fn(), set: vi.fn() } }));
vi.mock('firebase/firestore', () => ({ doc: (_db, collection, uid) => ({ collection, uid }), serverTimestamp: () => 'SERVER_TIME', runTransaction: (_db, callback) => callback(firestore.transaction) }));
import { autoSyncKey, companionRequest, saveCardLadderReport } from './cardLadderCompanion';
import { applySalesReport, buildCardLadderRemovals, salesWindow } from './cardLadderSales';

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

describe('reviewed additions after incomplete sales capture', () => {
  const partialSale = { ...report.holdings[0].sales[0], title: 'Rayquaza 3/17 CGC 10', price: 9000, url: 'https://www.ebay.com/itm/987654321' };
  const incomplete = { holdingId: 'cl-rayquaza', name: 'Rayquaza', set: 'Dragon Vault', number: '3/17', variation: '',
    gradingCompany: 'CGC', grade: '10', complete: false, sales: [partialSale], latestSale: partialSale,
    cardLadderValue: 8000, cardLadderValueCurrency: 'USD', error: 'Sales stopped loading.' };
  const input = { ...report, holdings: [...report.holdings, incomplete] };
  const additions = { [incomplete.holdingId]: { quantity: 2, buyPrice: '125', buyPriceCurrency: 'EUR' } };
  const selected = [incomplete.holdingId];
  const options = { updateStickerPrices: true };

  it('requires manual review for additions before starting an automatic transaction', async () => {
    localStorage.setItem(autoSyncKey('user-1'), 'true');
    await expect(saveCardLadderReport({}, 'user-1', input, {}, additions, selected, true)).rejects.toThrow(/Adding cards requires manual review/);
    expect(firestore.transaction.get).not.toHaveBeenCalled();
    expect(firestore.transaction.update).not.toHaveBeenCalled();
    expect(firestore.transaction.set).not.toHaveBeenCalled();
  });

  it('allows an unpriced manual addition after the same capture was applied automatically, then safely retries', async () => {
    const latest = { ...item, overridePrice: 1900, buyPrice: 777, quantity: 3 };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [latest] }) });
    localStorage.setItem(autoSyncKey('user-1'), 'true');
    expect(await saveCardLadderReport({}, 'user-1', input, {}, {}, null, true)).toMatchObject({ updatedCount: 1, addedCount: 0 });
    const automaticWrite = firestore.transaction.update.mock.calls[0][1];

    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => automaticWrite });
    expect(await saveCardLadderReport({}, 'user-1', input, {}, additions, selected, false, [], options)).toMatchObject({
      addedCount: 1, updatedCount: 0, stickerUpdatedCount: 0, alreadyApplied: false,
    });
    const manualWrite = firestore.transaction.update.mock.calls[1][1];
    expect(manualWrite.items[0]).toEqual(automaticWrite.items[0]);
    expect(manualWrite.items).toHaveLength(2);
    const added = manualWrite.items[1];
    expect(added).toMatchObject({ gradingCompany: 'CGC', grade: '10', gradedPrice: null, quantity: 2,
      buyPrice: 125, buyPriceCurrency: 'EUR', cardladderData: { holdingId: incomplete.holdingId } });
    expect(added).not.toHaveProperty('overridePrice');
    expect(added).not.toHaveProperty('cardladderPricing');

    // A repeat save reads any intervening manual changes and keeps those values.
    const changed = { ...added, quantity: 4, buyPrice: 130, gradedPrice: 300, overridePrice: 350 };
    const concurrentWrite = { ...manualWrite, items: [manualWrite.items[0], changed] };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => concurrentWrite });
    expect(await saveCardLadderReport({}, 'user-1', input, {}, additions, selected, false, [], options)).toMatchObject({
      addedCount: 0, skippedAddCount: 1, updatedCount: 0, stickerUpdatedCount: 0,
    });
    expect(firestore.transaction.update.mock.calls[2][1].items).toEqual(concurrentWrite.items);
  });

  it.each(['holding-id', 'card-identity'])('deduplicates a concurrent incomplete addition by %s without changing prices or costs', async match => {
    const concurrent = { entryId: 'added-by-another-tab', name: incomplete.name, set: incomplete.set, number: incomplete.number,
      variation: '', isGraded: true, gradingCompany: 'CGC', grade: '10', quantity: 5,
      gradedPrice: 400, gradedPriceCurrency: 'EUR', overridePrice: 450, buyPrice: 200,
      ...(match === 'holding-id' ? { cardladderData: { holdingId: incomplete.holdingId } } : {}) };
    const latestItems = [item, concurrent];
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: latestItems,
      cardLadderLastSync: { runId: input.runId, capturedAt: input.capturedAt } }) });
    expect(await saveCardLadderReport({}, 'user-1', input, {}, additions, selected, false, [], options)).toMatchObject({
      addedCount: 0, skippedAddCount: 1, updatedCount: 0, stickerUpdatedCount: 0,
    });
    expect(firestore.transaction.update.mock.calls[0][1].items).toEqual(latestItems);
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

describe('transactional sticker-price application', () => {
  const mode = { updateStickerPrices: true };
  it('reads the latest override for provenance and preserves costs, quantity and legacy manual prices', async () => {
    const latest = { ...item, overridePrice: 1850, overridePriceCurrency: 'EUR', manualPrice: 1800, manualPriceCurrency: 'GBP', buyPrice: 777, buyPriceCurrency: 'EUR', quantity: 1 };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [latest] }) });
    const result = await saveCardLadderReport({}, 'user-1', report, {}, {}, ['cl-one'], false, [], mode);
    expect(result).toMatchObject({ updatedCount: 1, stickerUpdatedCount: 1 });
    const written = firestore.transaction.update.mock.calls[0][1];
    expect(written.items[0]).toMatchObject({ overridePrice: 1525, overridePriceCurrency: 'USD', gradedPrice: 1525, manualPrice: 1800, manualPriceCurrency: 'GBP', buyPrice: 777, buyPriceCurrency: 'EUR', quantity: 1, cardladderPricing: { previousOverride: { overridePrice: 1850, overridePriceCurrency: 'EUR' } } });
    expect(written.cardLadderLastSync.stickerUpdatedCount).toBe(1);
  });

  it('allows the same capture to update stickers after an earlier market-only application', async () => {
    const latest = { ...item, overridePrice: 1900, overridePriceCurrency: 'EUR' };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [latest] }) });
    expect(await saveCardLadderReport({}, 'user-1', report)).toMatchObject({ updatedCount: 1, stickerUpdatedCount: 0 });
    const marketOnly = firestore.transaction.update.mock.calls[0][1];
    expect(marketOnly.items[0].overridePrice).toBe(1900);
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => marketOnly });
    expect(await saveCardLadderReport({}, 'user-1', report, {}, {}, ['cl-one'], false, [], mode)).toMatchObject({ stickerUpdatedCount: 1, alreadyApplied: false });
    expect(firestore.transaction.update.mock.calls[1][1].items[0]).toMatchObject({ overridePrice: 1525, overridePriceCurrency: 'USD', cardladderPricing: { previousOverride: { overridePrice: 1900, overridePriceCurrency: 'EUR' } } });
  });

  it('rejects automatic sticker updates and missing checked selections before starting a transaction', async () => {
    localStorage.setItem(autoSyncKey('user-1'), 'true');
    await expect(saveCardLadderReport({}, 'user-1', report, {}, {}, ['cl-one'], true, [], mode)).rejects.toThrow(/manual review/);
    await expect(saveCardLadderReport({}, 'user-1', report, {}, {}, null, false, [], mode)).rejects.toThrow(/explicit checked selection/);
    expect(firestore.transaction.get).not.toHaveBeenCalled();
    expect(firestore.transaction.update).not.toHaveBeenCalled();
  });

  it('leaves automatic market refreshes unchanged and never rolls stickers back to an older capture', async () => {
    const latest = { ...item, overridePrice: 1900, overridePriceCurrency: 'EUR' };
    localStorage.setItem(autoSyncKey('user-1'), 'true');
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [latest] }) });
    expect(await saveCardLadderReport({}, 'user-1', report, {}, {}, null, true)).toMatchObject({ updatedCount: 1, stickerUpdatedCount: 0 });
    expect(firestore.transaction.update.mock.calls[0][1].items[0].overridePrice).toBe(1900);
    firestore.transaction.update.mockClear();
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [latest], cardLadderLastSync: { runId: 'newer', capturedAt: new Date(now.getTime() + 10000).toISOString() } }) });
    expect(await saveCardLadderReport({}, 'user-1', report, {}, {}, ['cl-one'], false, [], mode)).toMatchObject({ alreadyApplied: true, stickerUpdatedCount: 0 });
    expect(firestore.transaction.update).not.toHaveBeenCalled();
  });

  it('passes the explicitly chosen provider fallback through to both market and sticker values', async () => {
    const input = { ...report, holdings: [{ ...report.holdings[0], sales: [], cardLadderValue: 1100, cardLadderValueCurrency: 'USD' }] };
    expect(await saveCardLadderReport({}, 'user-1', input, {}, {}, ['cl-one'], false, ['cl-one'], mode)).toMatchObject({ stickerUpdatedCount: 1 });
    expect(firestore.transaction.update.mock.calls[0][1].items[0]).toMatchObject({ gradedPrice: 1100, overridePrice: 1100, overridePriceCurrency: 'USD', cardladderPricing: { method: 'cardladder-value' } });
  });
});

describe('transactional CardLadder membership reconciliation', () => {
  const accountKey = 'a'.repeat(64);
  const proof = input => ({ ...input, inventorySnapshot: { version: 1, collectionName: 'Inventory', accountKey,
    holdingIds: input.holdings.map(holding => holding.holdingId).sort(), total: input.holdings.length, verifiedAt: input.capturedAt } });
  const present = proof(report);
  const missing = proof({ ...report, runId: 'membership-next', holdings: [] });
  const linked = () => applySalesReport([], present, now.getTime() - 1000, {}, { 'cl-one': { quantity: 2, buyPrice: 75 } }).items[0];

  it('moves a manually selected absent link to restorable trash in the same transaction', async () => {
    const card = { ...linked(), overridePrice: 1800, notes: 'Preserve this evidence' };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [card, item] }) });
    const removals = buildCardLadderRemovals([card, item], missing);
    expect(removals).toHaveLength(1);
    expect(await saveCardLadderReport({}, 'user-1', missing, {}, {}, [], false, [], { removals })).toMatchObject({ removedCount: 1 });
    expect(firestore.transaction.set).toHaveBeenCalledWith({ collection: 'trash', uid: card.entryId }, { item: card, deletedAt: 'SERVER_TIME' });
    const write = firestore.transaction.update.mock.calls[0][1];
    expect(write.items).toEqual([item]);
    expect(write.cardLadderLastSync.removedCount).toBe(1);
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => write });
    expect(await saveCardLadderReport({}, 'user-1', missing, {}, {}, [], false, [], { removals })).toMatchObject({ removedCount: 0 });
    expect(firestore.transaction.set).toHaveBeenCalledTimes(1);
    expect(firestore.transaction.update.mock.calls[1][1].items).toEqual([item]);
    // Restoring or reusing the ID is different from an already absent row.
    const restored = { ...card, cardladderData: { ...card.cardladderData, membershipRestoredAt: Date.now() + 1 } };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ ...write, items: [item, restored] }) });
    await expect(saveCardLadderReport({}, 'user-1', missing, {}, {}, [], false, [], { removals })).rejects.toThrow(/selected removal changed/);
    expect(firestore.transaction.set).toHaveBeenCalledTimes(1);
  });

  it('automatically removes matching scoped links once, preserving unscoped and other-account cards', async () => {
    const scoped = linked();
    const legacy = { ...scoped, entryId: 'legacy', cardladderData: { ...scoped.cardladderData, inventoryAccountKey: undefined } };
    const other = { ...scoped, entryId: 'other', cardladderData: { ...scoped.cardladderData, inventoryAccountKey: 'b'.repeat(64) } };
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [scoped, legacy, other] }) });
    localStorage.setItem(autoSyncKey('user-1'), 'true');
    expect(await saveCardLadderReport({}, 'user-1', missing, {}, {}, null, true)).toMatchObject({ removedCount: 1 });
    const write = firestore.transaction.update.mock.calls[0][1];
    expect(write.items).toEqual([legacy, other]);
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => write });
    expect(await saveCardLadderReport({}, 'user-1', missing, {}, {}, null, true)).toMatchObject({ alreadyApplied: true, removedCount: 0 });
    expect(firestore.transaction.set).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent edits before any inventory or trash write', async () => {
    const card = linked();
    const removals = buildCardLadderRemovals([card], missing);
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [{ ...card, buyPrice: 95 }] }) });
    await expect(saveCardLadderReport({}, 'user-1', missing, {}, {}, [], false, [], { removals })).rejects.toThrow(/selected removal changed/);
    expect(firestore.transaction.update).not.toHaveBeenCalled();
    expect(firestore.transaction.set).not.toHaveBeenCalled();
  });

  it('permits reviewed removal after a price-only save from the same run', async () => {
    const card = linked();
    firestore.transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [card], cardLadderLastSync: { runId: missing.runId, capturedAt: missing.capturedAt } }) });
    expect(await saveCardLadderReport({}, 'user-1', missing, {}, {}, null, false, [], { removals: buildCardLadderRemovals([card], missing) })).toMatchObject({ removedCount: 1, alreadyApplied: false });
  });
});
