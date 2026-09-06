const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeBackgroundChanges } = require('./inventoryUpdates');
test('price refresh preserves quantity, edits, additions, and deletions made during provider calls', () => {
  const before=[{entryId:'a',quantity:1,prices:{value:10}},{entryId:'b',quantity:1}];
  const after=[{entryId:'a',quantity:1,prices:{value:20}},{entryId:'b',quantity:1}];
  const latest=[{entryId:'a',quantity:2,prices:{value:10}},{entryId:'c',quantity:1}];
  assert.deepEqual(mergeBackgroundChanges(before,after,latest),[{entryId:'a',quantity:2,prices:{value:20}},{entryId:'c',quantity:1}]);
  assert.equal(mergeBackgroundChanges(before,after,[{entryId:'a',quantity:2,prices:{value:30}}])[0].prices.value,30);
});
