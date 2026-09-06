// Background pricing and migrations must not restore old quantities, overwrite
// manual edits, or resurrect cards removed while provider calls were in flight.
function mergeBackgroundChanges(before, after, latest) {
  const original = new Map(before.filter(item => item.entryId).map(item => [item.entryId, item]));
  const updates = new Map(after.filter(item => item.entryId).map(item => [item.entryId, item]));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  return latest.map(item => {
    const old = original.get(item.entryId), next = updates.get(item.entryId);
    if (!old || !next) return item;
    if (['cardId','name','set','number','condition','isGraded','gradingCompany','grade'].some(key => !equal(old[key],item[key]))) return item;
    const merged = { ...item };
    for (const key of Object.keys(next)) {
      if (!equal(old[key],next[key]) && equal(old[key],item[key])) merged[key] = next[key];
    }
    return merged;
  });
}
async function saveBackgroundChanges(ref, before, after) {
  await ref.firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    transaction.set(ref, { items: mergeBackgroundChanges(before,after,snapshot.data().items || []) }, { merge:true });
  });
}
module.exports = { mergeBackgroundChanges, saveBackgroundChanges };
