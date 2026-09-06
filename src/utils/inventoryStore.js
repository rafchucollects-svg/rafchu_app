import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Apply only the user's edits to the latest version. Never replace unrelated
// changes, resurrect deleted cards, or silently overwrite a conflicting edit.
export function mergeItemChanges(before, after, latest) {
  const previous = new Map(before.map(item => [item.entryId, item]));
  const desired = new Map(after.map(item => [item.entryId, item]));
  const current = new Map(latest.map(item => [item.entryId, item]));
  if ([...before, ...after, ...latest].some(item => !item.entryId)) {
    throw new Error("Some cards are still loading their IDs. Refresh before saving.");
  }
  for (const [id, old] of previous) {
    const next = desired.get(id);
    const live = current.get(id);
    if (equal(old, next)) continue;
    if (!next) {
      if (live && !equal(old, live)) throw new Error("This card changed on another device. Refresh before deleting it.");
      current.delete(id);
      continue;
    }
    if (!live) throw new Error("This card was removed on another device. Refresh before saving.");
    const merged = { ...live };
    for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (equal(old[key], next[key])) continue;
      if (!equal(old[key], live[key]) && !equal(next[key], live[key])) {
        throw new Error("This card changed on another device. Refresh and try again.");
      }
      if (key in next) merged[key] = next[key];
      else delete merged[key];
    }
    current.set(id, merged);
  }
  for (const [id, next] of desired) {
    if (previous.has(id)) continue;
    if (current.has(id) && !equal(current.get(id), next)) throw new Error("A card with this ID already exists. Refresh and try again.");
    current.set(id, next);
  }
  return [...current.values()];
}

export async function saveItemChanges(ref, before, after, metadata = {}, deal = null) {
  window.dispatchEvent(new CustomEvent("rafchu:save-state", { detail: "Saving…" }));
  try {
    const result = await runTransaction(ref.firestore, async transaction => {
      const snapshot = await transaction.get(ref);
      const latest = snapshot.data()?.items || [];
      const pendingRef = deal?.pendingId != null ? doc(ref.firestore, "pendingDeals", ref.id) : null;
      const pending = pendingRef ? await transaction.get(pendingRef) : null;
      const items = mergeItemChanges(before, after, latest);
      const removed = latest.filter(item => !items.some(next => next.entryId === item.entryId));
      for (const item of deal ? [] : removed) {
        transaction.set(doc(ref, "trash", item.entryId), { item, deletedAt: serverTimestamp() });
      }
      transaction.set(ref, { ...metadata, items }, { merge: true });
      if (deal) transaction.set(deal.ref, deal.payload);
      if (pendingRef) transaction.set(pendingRef, {
        buyDeals: (pending.data()?.buyDeals || []).filter(entry => entry.id !== deal.pendingId),
        pendingDealsUpdatedAt: Date.now(),
      }, { merge: true });
      return items;
    });
    window.dispatchEvent(new CustomEvent("rafchu:save-state", { detail: "Saved" }));
    return result;
  } catch (error) {
    window.dispatchEvent(new CustomEvent("rafchu:save-state", { detail: "Save failed — try again" }));
    throw error;
  }
}
