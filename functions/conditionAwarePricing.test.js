const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveConditionAwarePrice,
  selectBestCard,
} = require('./conditionAwarePricing');

const charizard = {
  id: 'pokemon-sm-burning-shadows-charizard-gx-secret-rainbow-rare',
  name: 'Charizard GX (Secret)',
  set_name: 'SM - Burning Shadows',
  number: '150/147',
  rarity: 'Rainbow Rare',
  tcgplayerId: '138497',
  variants: [
    { id: 'dmg', condition: 'Damaged', printing: 'Holofoil', language: 'English', price: 162.69, tcgplayerSkuId: '3442763' },
    { id: 'hp', condition: 'Heavily Played', printing: 'Holofoil', language: 'English', price: 197.25, tcgplayerSkuId: '3442762' },
    { id: 'mp', condition: 'Moderately Played', printing: 'Holofoil', language: 'English', price: 293.07, tcgplayerSkuId: '3442761' },
    { id: 'lp', condition: 'Lightly Played', printing: 'Holofoil', language: 'English', price: 380.39, tcgplayerSkuId: '3442760' },
    { id: 'nm', condition: 'Near Mint', printing: 'Holofoil', language: 'English', price: 616.13, tcgplayerSkuId: '3442759' },
  ],
};

const blastoise = {
  id: 'pokemon-expedition-blastoise-37-rare',
  name: 'Blastoise (37)',
  set_name: 'Expedition',
  number: '037/165',
  rarity: 'Rare',
  tcgplayerId: '83890',
  variants: [
    { id: 'normal-lp', condition: 'Lightly Played', printing: 'Normal', language: 'English', price: 51.6, tcgplayerSkuId: '1197205' },
    { id: 'normal-nm', condition: 'Near Mint', printing: 'Normal', language: 'English', price: 87, tcgplayerSkuId: '1189859' },
    { id: 'reverse-hp', condition: 'Heavily Played', printing: 'Reverse Holofoil', language: 'English', price: 73.34, tcgplayerSkuId: '2892362' },
    { id: 'reverse-mp', condition: 'Moderately Played', printing: 'Reverse Holofoil', language: 'English', price: 95.24, tcgplayerSkuId: '2892361' },
    { id: 'reverse-lp', condition: 'Lightly Played', printing: 'Reverse Holofoil', language: 'English', price: 161.81, tcgplayerSkuId: '2892360' },
    { id: 'reverse-nm', condition: 'Near Mint', printing: 'Reverse Holofoil', language: 'English', price: null, tcgplayerSkuId: '2892359' },
  ],
};

test('uses the exact Burning Shadows Charizard condition variant', () => {
  const result = resolveConditionAwarePrice(charizard, { condition: 'HP' });

  assert.equal(result.status, 'exact');
  assert.equal(result.selectedPrinting, 'Holofoil');
  assert.equal(result.price.amount, 197.25);
  assert.equal(result.price.tcgplayerSkuId, '3442762');
  assert.equal(result.price.confidence, 'high');
});

test('requires printing confirmation when one card has normal and reverse variants', () => {
  const result = resolveConditionAwarePrice(blastoise, { condition: 'LP' });

  assert.equal(result.status, 'printing-confirmation-required');
  assert.equal(result.price, null);
  assert.deepEqual(
    result.printingOptions.map((option) => option.value),
    ['Normal', 'Reverse Holofoil'],
  );
});

test('maps the Rafchu reverse-holo alias to the exact Expedition reverse SKU', () => {
  const result = resolveConditionAwarePrice(blastoise, {
    condition: 'LP',
    printing: 'reverse-holo',
  });

  assert.equal(result.status, 'exact');
  assert.equal(result.selectedPrinting, 'Reverse Holofoil');
  assert.equal(result.price.amount, 161.81);
  assert.equal(result.price.tcgplayerSkuId, '2892360');
});

test('labels a missing exact condition as an estimate with a wide range', () => {
  const result = resolveConditionAwarePrice(blastoise, {
    condition: 'NM',
    printing: 'reverse-holo',
  });

  assert.equal(result.status, 'estimated');
  assert.equal(result.price.confidence, 'low');
  assert.equal(result.price.observedCondition, 'Lightly Played');
  assert.ok(result.price.estimateRange.low < result.price.amount);
  assert.ok(result.price.estimateRange.high > result.price.amount);
});

test('provider ID wins over a fuzzy text match', () => {
  const selected = selectBestCard(
    [{ ...charizard, tcgplayerId: '999' }, blastoise],
    { name: 'something else', tcgplayerId: '83890' },
  );

  assert.equal(selected.card.id, blastoise.id);
  assert.equal(selected.confidence, 'exact-provider-id');
});
