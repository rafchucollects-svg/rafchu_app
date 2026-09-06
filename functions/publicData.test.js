const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicCard, publicProfile, publicInventory } = require('./publicData');
test('public cards never include private accounting or arbitrary nested fields', () => {
  const result = publicCard({ name: 'Pikachu', buyPrice: 12, notes: 'private', consignorId: 'secret', prices: { cardmarket: { avg7: 20, email: 'secret', normal: { market: 20, notes: 'secret' } } }, cashData: { amount: 20 } });
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal('buyPrice' in result, false);
  assert.equal(result.prices.cardmarket.avg7, 20);
});
test('public inventory omits hidden cards, cash and history', () => {
  const result = publicInventory({ shareEnabled: true, cashData: {}, history: [], items: [{ name: 'Visible' }, { name: 'Hidden', excludeFromSale: true }] }, {});
  assert.deepEqual(result.items.map(x => x.name), ['Visible']);
  assert.equal('cashData' in result, false);
  assert.equal('history' in result, false);
});
test('vendor identity requires active admin-granted access', () => {
  assert.equal(publicProfile({ isVendor: true, email: 'private' }).isVendor, false);
  assert.equal('email' in publicProfile({ email: 'private' }), false);
  assert.equal(publicProfile({ vendorAccess: { enabled: true, status: 'active' } }).isVendor, true);
});
