import { beforeEach, expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: (_db, collection, uid) => ({ collection, uid }), runTransaction: (_db, callback) => callback(tx) }));
import { saveCardmarketBinding, saveCardmarketOffers } from './cardmarketCompanion';
import { cardmarketInventoryKey, createCardmarketBinding } from './cardmarketSync';
const card = { entryId: 'one', name: 'Jolteon', number: '8', set: 'EX Unseen Forces', condition: 'LP', language: 'English', isReverseHolo: true };
const choice = { productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8', confirmed: true, language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false };
beforeEach(() => vi.clearAllMocks());
it('saves a reviewed binding against current inventory without overwriting concurrent price/cost changes', async () => {
  tx.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [{ ...card, quantity: 3, buyPrice: 45, overridePrice: 90 }] }) });
  await saveCardmarketBinding({}, 'user', card, choice);
  expect(tx.update.mock.calls[0][0]).toEqual({ collection: 'collections', uid: 'user' });
  expect(tx.update.mock.calls[0][1].items[0]).toMatchObject({ quantity: 3, buyPrice: 45, overridePrice: 90, cardmarketBinding: { finish: 'reverse', condition: 'EX' } });
  tx.get.mockResolvedValue({ data: () => ({ items: [{ ...card, isReverseHolo: false }] }) });
  await expect(saveCardmarketBinding({}, 'user', card, choice)).rejects.toThrow(/changed/);
});
it('applies only the selected offer and refuses stale identity before a transaction write', async () => {
  const bound = { ...card, quantity: 2, cardmarketBinding: createCardmarketBinding(card, choice) };
  const offer = { offerId: 'articleRow100', seller: 'Seller', sellerType: 'Professional', price: 100, currency: 'EUR', ...choice, signed: false, altered: false };
  const report = { schemaVersion: 1, source: 'cardmarket-browser', runId: 'test', captures: [{ source: 'cardmarket-browser', entryId: card.entryId, inventoryKey: cardmarketInventoryKey(card), currency: 'EUR', capturedAt: new Date().toISOString(), productUrl: choice.productUrl, filters: choice, complete: true, offers: [offer] }] };
  tx.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [bound] }) });
  await saveCardmarketOffers({}, 'user', report, [{ entryId: card.entryId, method: 'selected-offer', offerId: 'articleRow100', replaceManual: false }]);
  expect(tx.update.mock.calls[0][1].items[0]).toMatchObject({ quantity: 2, cardmarketPricing: { price: 100, selectedOffer: { sellerType: 'Professional' } } });
  tx.update.mockClear();
  tx.get.mockResolvedValue({ exists: () => true, data: () => ({ items: [{ ...bound, condition: 'NM' }] }) });
  await expect(saveCardmarketOffers({}, 'user', report, [{ entryId: card.entryId, method: 'selected-offer', offerId: 'articleRow100', replaceManual: true }])).rejects.toThrow(/Link/);
  expect(tx.update).not.toHaveBeenCalled();
});
