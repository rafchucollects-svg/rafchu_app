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

export async function searchCardDatabaseCache(
  db,
  value,
  { maxResults = 50, signal } = {},
) {
  if (!db || signal?.aborted) return [];
  const searchTerms = buildCardDatabaseSearchTerms(value);
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
