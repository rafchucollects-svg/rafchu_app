import { doc, runTransaction } from 'firebase/firestore';
import { applyCardmarketCaptures, cardmarketInventoryKey, createCardmarketBinding } from './cardmarketSync';

export function cardmarketRequest(action, tasks, timeout = 5000) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
    const receive = event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'rafchu-cardmarket-response' || event.data.requestId !== requestId) return;
      cleanup(); if (event.data.ok) resolve(event.data.data); else reject(new Error(event.data.error || 'Cardmarket companion error.'));
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Load the Cardmarket companion, then refresh this Rafchu tab.')); }, timeout);
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'rafchu-cardmarket-request', requestId, action, ...(tasks ? { tasks } : {}) }, location.origin);
  });
}

export async function saveCardmarketBinding(db, uid, item, choice) {
  if (!uid) throw new Error('Sign in to link your Inventory.');
  const expected = cardmarketInventoryKey(item);
  return runTransaction(db, async transaction => {
    const ref = doc(db, 'collections', uid);
    const snapshot = await transaction.get(ref);
    const items = snapshot.data()?.items || [];
    const current = items.find(row => row.entryId === item.entryId);
    if (!current || cardmarketInventoryKey(current) !== expected) throw new Error('This card changed. Reopen its match form.');
    const binding = createCardmarketBinding(current, choice);
    transaction.update(ref, { items: items.map(row => row.entryId === current.entryId ? { ...row, cardmarketBinding: binding } : row) });
    return binding;
  });
}

export async function saveCardmarketOffers(db, uid, report, choices) {
  if (!uid) throw new Error('Sign in to update Inventory.');
  if (report?.schemaVersion !== 1 || report.source !== 'cardmarket-browser' || !report.runId || !Array.isArray(report.captures) || report.captures.length > 100 || !choices?.length) throw new Error('Choose offers from a Cardmarket capture first.');
  return runTransaction(db, async transaction => {
    const ref = doc(db, 'collections', uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Inventory no longer exists.');
    const result = applyCardmarketCaptures(snapshot.data().items || [], report.captures, choices, Date.now(), report.runId);
    transaction.update(ref, { items: result.items, cardmarketLastSync: { runId: report.runId, appliedAt: new Date().toISOString(), updatedCount: result.updatedCount } });
    return result;
  });
}
