import {
  collection,
  getDocs,
  limit as firestoreLimit,
  query as firestoreQuery,
  where,
} from "firebase/firestore";

export function buildCardDatabaseSearchTerms(value) {
  return Array.from(new Set(
    String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(term => term.trim())
      .filter(Boolean),
  )).slice(0, 10);
}

const LOW_SIGNAL_SEARCH_TERMS = new Set([
  "ex", "gx", "v", "vmax", "vstar", "promo", "promos", "set", "card",
  "pokemon", "rare", "holo", "the", "and",
]);

export function selectCardDatabaseQueryTerms(value) {
  const terms = buildCardDatabaseSearchTerms(value);
  const descriptive = terms
    .filter(term => /[a-z]/.test(term) && !LOW_SIGNAL_SEARCH_TERMS.has(term))
    .sort((a, b) => b.length - a.length);
  if (descriptive.length > 0) return [descriptive[0]];

  const numeric = terms.filter(term => /^\d+(?:\/\d+)?$/.test(term));
  if (numeric.length > 0) return [numeric[0]];
  return terms.slice(0, 1);
}

export async function searchCardDatabaseCache(
  db,
  value,
  { maxResults = 50, signal } = {},
) {
  if (!db || signal?.aborted) return [];
  const searchTerms = selectCardDatabaseQueryTerms(value);
  if (searchTerms.length === 0) return [];

  const cacheQuery = firestoreQuery(
    collection(db, "card_database"),
    where("searchTerms", "array-contains-any", searchTerms),
    firestoreLimit(maxResults),
  );
  const snapshot = await getDocs(cacheQuery);
  if (signal?.aborted) return [];
  return snapshot.docs.map(cardDoc => cardDoc.data());
}
