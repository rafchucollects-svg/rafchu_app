import { collection, doc, getDocs, getDoc, runTransaction, setDoc, serverTimestamp } from "firebase/firestore";
import { validateReview } from "./reconciliation.js";

const entries = (db, name, uid) => collection(db, name, uid, "entries");
const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);

export async function loadReconciliation(db, uid) {
  const [sources, reviews, draft] = await Promise.all([
    getDocs(entries(db, "reconciliation_sources", uid)),
    getDocs(entries(db, "reconciliations", uid)),
    getDoc(doc(entries(db, "reconciliation_drafts", uid), "current")),
  ]);
  return {
    sources: sources.docs.map((snap) => ({ ...snap.data(), id: snap.id })).sort((a, b) => b.date - a.date),
    reviews: reviews.docs.map((snap) => ({ ...snap.data(), id: snap.id })).sort((a, b) => b.finalizedAt - a.finalizedAt),
    draft: draft.exists() ? draft.data() : null,
  };
}

export async function importReconciliationSources(db, uid, sources) {
  let added = 0;
  // Small atomic chunks make repeated uploads safe and stay under rule access limits.
  for (let offset = 0; offset < sources.length; offset += 8) {
    const group = sources.slice(offset, offset + 8);
    added += await runTransaction(db, async (transaction) => {
      const refs = group.map((source) => doc(entries(db, "reconciliation_sources", uid), source.id));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      let count = 0;
      snapshots.forEach((snap, index) => {
        if (!snap.exists()) { transaction.set(refs[index], { ...group[index], importedAt: serverTimestamp() }); count++; }
      });
      return count;
    });
  }
  return added;
}

export function saveReconciliationDraft(db, uid, draft) {
  return setDoc(doc(entries(db, "reconciliation_drafts", uid), "current"), { ...draft, updatedAt: serverTimestamp() });
}

export async function finalizeReconciliation(db, uid, review) {
  validateReview(review);
  const auditRef = doc(entries(db, "reconciliations", uid));
  return runTransaction(db, async (transaction) => {
    const sourceRefs = review.sources.map((source) => doc(entries(db, "reconciliation_sources", uid), source.id));
    const claimRefs = review.sources.map((source) => doc(entries(db, "reconciliation_claims", uid), source.id));
    const txRefs = review.transactions.map((tx) => doc(entries(db, "transactions", uid), tx.id));
    const [sources, claims, txs] = await Promise.all([
      Promise.all(sourceRefs.map((ref) => transaction.get(ref))),
      Promise.all(claimRefs.map((ref) => transaction.get(ref))),
      Promise.all(txRefs.map((ref) => transaction.get(ref))),
    ]);
    if (claims.some((claim) => claim.exists())) throw new Error("A payment has already been finalized. Refresh before reviewing again.");
    if (sources.some((snap) => !snap.exists()) || txs.some((snap) => !snap.exists())) throw new Error("A source or app transaction no longer exists. Refresh the page.");
    const currentTransactions = txs.map((snap) => ({ ...snap.data(), id: snap.id }));
    if (currentTransactions.some((tx, index) => canonical(tx) !== canonical(review.transactions[index]))) throw new Error("An app transaction changed while you were reviewing it. Refresh and review the new values.");
    const currentSources = sources.map((snap) => ({ ...snap.data(), id: snap.id }));
    const { total, changes } = validateReview({ ...review, sources: currentSources, transactions: currentTransactions });
    const finalizedAt = Date.now();
    const audit = { schemaVersion: 1, status: "finalized", reviewer: uid, createdAt: serverTimestamp(), finalizedAt,
      sourceIds: currentSources.map((source) => source.id), transactionIds: currentTransactions.map((tx) => tx.id),
      sources: currentSources, changes, currency: review.currency, rates: review.rates, total,
      classification: review.classification, note: review.note.trim(), evidence: review.evidence.trim(),
    };
    // Preserve complete before/after snapshots, but keep below Firestore's document limit.
    if (new TextEncoder().encode(JSON.stringify(audit)).length > 800000) throw new Error("This group is too large. Reconcile fewer records together.");
    transaction.set(auditRef, audit);
    claimRefs.forEach((ref) => transaction.set(ref, { reconciliationId: auditRef.id, createdAt: serverTimestamp() }));
    changes.forEach(({ after }, index) => {
      const { id: _id, ...data } = after;
      transaction.set(txRefs[index], { ...data, reconciliationId: auditRef.id });
    });
    return auditRef.id;
  });
}
