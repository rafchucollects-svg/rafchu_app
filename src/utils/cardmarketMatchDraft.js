import { CARDMARKET_CONDITIONS, cardmarketInventoryKey } from './cardmarketSync';

const SCHEMA_VERSION = 1;
const STORAGE_PREFIX = 'rafchu:cardmarket-match-draft:';

function storageKey(uid, item) {
  if (typeof uid !== 'string' || !uid.trim() || typeof item?.entryId !== 'string' || !item.entryId.trim()) return null;
  return STORAGE_PREFIX + JSON.stringify([uid, item.entryId]);
}

function editableFields(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft) ||
      (draft.customUrl !== null && typeof draft.customUrl !== 'string') ||
      !['', 'English', 'Japanese'].includes(draft.language) ||
      !['', ...CARDMARKET_CONDITIONS].includes(draft.condition) ||
      !['', 'reverse', 'non-reverse'].includes(draft.finish) ||
      !['', 'true', 'false'].includes(draft.firstEdition)) return null;
  // A draft remembers edits, never the review checkbox or an automatic URL.
  return { customUrl: draft.customUrl, language: draft.language, condition: draft.condition,
    finish: draft.finish, firstEdition: draft.firstEdition };
}

export function readCardmarketMatchDraft(uid, item) {
  try {
    const key = storageKey(uid, item);
    if (!key) return null;
    const stored = JSON.parse(globalThis.localStorage.getItem(key));
    if (stored?.schemaVersion !== SCHEMA_VERSION || stored.inventoryKey !== cardmarketInventoryKey(item)) return null;
    return editableFields(stored);
  } catch { return null; }
}

export function writeCardmarketMatchDraft(uid, item, draft) {
  try {
    const key = storageKey(uid, item);
    const fields = editableFields(draft);
    if (!key || !fields) return false;
    globalThis.localStorage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION,
      inventoryKey: cardmarketInventoryKey(item), ...fields }));
    return true;
  } catch { return false; }
}

export function clearCardmarketMatchDraft(uid, item, expectedDraft) {
  try {
    const key = storageKey(uid, item);
    if (!key) return;
    if (expectedDraft !== undefined) {
      const expected = editableFields(expectedDraft);
      const current = readCardmarketMatchDraft(uid, item);
      // A completed save must not delete edits made while it was pending.
      if (!expected || !current || Object.keys(expected).some(field => expected[field] !== current[field])) return;
    }
    globalThis.localStorage.removeItem(key);
  } catch { /* Unavailable browser storage must not block matching. */ }
}
