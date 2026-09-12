import { doc, runTransaction } from 'firebase/firestore';
import { applySalesReport } from './cardLadderSales';

export function companionRequest(action, timeout = 4000) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
    const receive = event => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== 'rafchu-companion-response' || event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok) resolve(event.data.data);
      else reject(new Error(event.data.error || 'Companion request failed.'));
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Install the CardLadder companion, then reload this app tab.')); }, timeout);
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'rafchu-companion-request', requestId, action }, window.location.origin);
  });
}

export const autoSyncKey = uid => `rafchu-cardladder-auto:${uid}`;

export async function saveCardLadderReport(db, uid, report, bindings = {}, additions = {}, selectedHoldingIds = null, automatic = false, valueHoldingIds = []) {
  if (automatic && valueHoldingIds.length) throw new Error('CardLadder Value requires manual review.');
  if (!uid) throw new Error('Sign in to update your Inventory.');
  return runTransaction(db, async transaction => {
    const ref = doc(db, 'collections', uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() && !Object.keys(additions).length) throw new Error('Choose cards to add in the capture preview first.');
    const data = snapshot.exists() ? snapshot.data() : {};
    const last = data.cardLadderLastSync;
    if (last && (Date.parse(last.capturedAt) > Date.parse(report.capturedAt) ||
        (last.runId === report.runId && !Object.keys(bindings).length && !Object.keys(additions).length && selectedHoldingIds === null))) return { updatedCount: 0, addedCount: 0, alreadyApplied: true };
    const result = applySalesReport(data.items || [], report, Date.now(), bindings, additions, selectedHoldingIds, valueHoldingIds);
    if (automatic && localStorage.getItem(autoSyncKey(uid)) !== 'true') throw new Error('Automatic updates paused for manual review.');
    const write = { items: result.items,
      cardLadderLastSync: { runId: report.runId, capturedAt: report.capturedAt, appliedAt: new Date().toISOString(), updatedCount: result.updatedCount, addedCount: result.addedCount, imageUpdatedCount: result.imageUpdatedCount, anomalySkippedCount: result.anomalySkippedCount } };
    if (snapshot.exists()) transaction.update(ref, write);
    else transaction.set(ref, write, { merge: true });
    return { updatedCount: result.updatedCount, addedCount: result.addedCount, skippedAddCount: result.skippedAddCount, imageUpdatedCount: result.imageUpdatedCount, anomalySkippedCount: result.anomalySkippedCount, alreadyApplied: false };
  });
}
