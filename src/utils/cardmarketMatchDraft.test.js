import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearCardmarketMatchDraft, readCardmarketMatchDraft, writeCardmarketMatchDraft } from './cardmarketMatchDraft';

const item = { entryId: 'hungry-snorlax', name: 'Hungry Snorlax', set: 'Unknown Set', number: '143', language: 'English', condition: 'NM' };
const draft = { customUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Promos/Hungry-Snorlax',
  language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: 'false' };
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('restores an unfinished manual match after a fresh read without restoring confirmation', () => {
  expect(writeCardmarketMatchDraft('owner', item, { ...draft, confirmed: true, confirmedUrl: draft.customUrl })).toBe(true);
  expect(readCardmarketMatchDraft('owner', { ...item })).toEqual(draft);
  const stored = JSON.parse(localStorage.getItem(localStorage.key(0)));
  expect(stored.schemaVersion).toBe(1);
  expect(stored.inventoryKey).toEqual(expect.any(String));
  expect(stored).not.toHaveProperty('confirmed');
  expect(stored).not.toHaveProperty('confirmedUrl');
});

it('retains empty, incomplete and null manual URLs and unselected filters', () => {
  for (const customUrl of [null, '', 'https://www.cardmarket.com/en/Pokemon/Products/']) {
    const unfinished = { customUrl, language: '', condition: '', finish: '', firstEdition: '' };
    expect(writeCardmarketMatchDraft('owner', item, unfinished)).toBe(true);
    expect(readCardmarketMatchDraft('owner', item)).toEqual(unfinished);
  }
});

it('isolates drafts by user and inventory entry and clears only the selected draft', () => {
  const otherItem = { ...item, entryId: 'other-card' };
  writeCardmarketMatchDraft('owner', item, draft);
  expect(readCardmarketMatchDraft('another-user', item)).toBeNull();
  expect(readCardmarketMatchDraft('owner', otherItem)).toBeNull();
  writeCardmarketMatchDraft('another-user', item, { ...draft, customUrl: null });
  writeCardmarketMatchDraft('owner', otherItem, draft);
  clearCardmarketMatchDraft('owner', item);
  expect(readCardmarketMatchDraft('owner', item)).toBeNull();
  expect(readCardmarketMatchDraft('another-user', item)?.customUrl).toBeNull();
  expect(readCardmarketMatchDraft('owner', otherItem)).toEqual(draft);
});

it('clears only the submitted draft when a pending save completes', () => {
  writeCardmarketMatchDraft('owner', item, draft);
  const submittedDraft = readCardmarketMatchDraft('owner', item);
  const newerDraft = { ...draft, customUrl: draft.customUrl + '-V2' };
  writeCardmarketMatchDraft('owner', item, newerDraft);
  clearCardmarketMatchDraft('owner', item, submittedDraft);
  expect(readCardmarketMatchDraft('owner', item)).toEqual(newerDraft);
  clearCardmarketMatchDraft('owner', item, newerDraft);
  expect(readCardmarketMatchDraft('owner', item)).toBeNull();
});

it('retains later drafts when no draft was submitted or the inventory identity changed', () => {
  const submittedDraft = readCardmarketMatchDraft('owner', item);
  expect(submittedDraft).toBeNull();
  writeCardmarketMatchDraft('owner', item, draft);
  clearCardmarketMatchDraft('owner', item, submittedDraft);
  expect(readCardmarketMatchDraft('owner', item)).toEqual(draft);
  const changedItem = { ...item, condition: 'LP' };
  writeCardmarketMatchDraft('owner', changedItem, draft);
  clearCardmarketMatchDraft('owner', item, draft);
  expect(readCardmarketMatchDraft('owner', changedItem)).toEqual(draft);
  clearCardmarketMatchDraft('owner', item, null);
  expect(readCardmarketMatchDraft('owner', changedItem)).toEqual(draft);
});

it('rejects a draft after card identity or printing changes while retaining it after a price change', () => {
  writeCardmarketMatchDraft('owner', item, draft);
  for (const update of [{ name: 'Snorlax' }, { set: 'A known expansion' }, { number: '144' },
    { language: 'Japanese' }, { condition: 'LP' }, { isReverseHolo: true }, { isFirstEdition: true }]) {
    expect(readCardmarketMatchDraft('owner', { ...item, ...update })).toBeNull();
  }
  expect(readCardmarketMatchDraft('owner', { ...item, overridePrice: 400, quantity: 2 })).toEqual(draft);
});

it('does not write or retrieve a draft without a user and stable entry ID', () => {
  for (const [uid, card] of [[null, item], ['', item], [' ', item], [123, item], ['owner', {}], ['owner', null]]) {
    expect(writeCardmarketMatchDraft(uid, card, draft)).toBe(false);
    expect(readCardmarketMatchDraft(uid, card)).toBeNull();
    expect(() => clearCardmarketMatchDraft(uid, card)).not.toThrow();
  }
  expect(localStorage.length).toBe(0);
});

it('ignores malformed JSON, unknown schemas, and invalid editable fields', () => {
  writeCardmarketMatchDraft('owner', item, draft);
  const key = localStorage.key(0);
  const stored = JSON.parse(localStorage.getItem(key));
  for (const value of ['not-json', 'null', '[]', '{}', JSON.stringify({ ...stored, schemaVersion: 2 }),
    JSON.stringify({ ...stored, inventoryKey: null }), JSON.stringify({ ...stored, customUrl: {} }),
    JSON.stringify({ ...stored, firstEdition: false })]) {
    localStorage.setItem(key, value);
    expect(readCardmarketMatchDraft('owner', item)).toBeNull();
  }
});

it('rejects invalid field values without replacing a previously saved draft', () => {
  writeCardmarketMatchDraft('owner', item, draft);
  for (const patch of [{ customUrl: undefined }, { customUrl: 123 }, { language: 'German' },
    { condition: 'Near Mint' }, { finish: 'foil' }, { firstEdition: false }]) {
    expect(writeCardmarketMatchDraft('owner', item, { ...draft, ...patch })).toBe(false);
    expect(readCardmarketMatchDraft('owner', item)).toEqual(draft);
  }
});

it('fails safely when browser storage rejects access, writes, or deletion', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Access denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Access denied'); });
  expect(readCardmarketMatchDraft('owner', item)).toBeNull();
  expect(writeCardmarketMatchDraft('owner', item, draft)).toBe(false);
  expect(() => clearCardmarketMatchDraft('owner', item)).not.toThrow();
});
