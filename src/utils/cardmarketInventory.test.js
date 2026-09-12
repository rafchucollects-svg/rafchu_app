import { expect, it } from 'vitest';
import { cardmarketInventoryScope } from './cardmarketInventory';

it('includes ordinary promos and variant cards with current or legacy manual prices', () => {
  const cards = [
    { entryId: 'eevee-a', name: 'Eevee', number: 'BW97', overridePrice: 450 },
    { entryId: 'eevee-b', name: 'Eevee', number: 'BW97', manualPrice: '450.00' },
    { entryId: 'reverse', isReverseHolo: true, overridePrice: 100 },
    { entryId: 'zero', overridePrice: 0 },
  ];
  expect(cardmarketInventoryScope(cards)).toEqual(cards);
});

it('excludes graded and sealed cards even with partial grading metadata or manual prices', () => {
  const cards = [{ isGraded: true }, { grade: '9' }, { gradingCompany: 'PSA' }, { isSealed: true }]
    .map(card => ({ ...card, overridePrice: 450 }));
  expect(cardmarketInventoryScope(cards)).toEqual([]);
  expect(cardmarketInventoryScope(cards, false)).toEqual([]);
});

it('does not mistake missing, malformed or suggested prices for manual prices', () => {
  const cards = [undefined, null, '', ' ', false, 'bad', NaN, Infinity, -10]
    .map(overridePrice => ({ overridePrice, calculatedSuggestedPrice: 100 }));
  expect(cardmarketInventoryScope(cards)).toEqual([]);
  expect(cardmarketInventoryScope(cards, false)).toEqual(cards);
});
