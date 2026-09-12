import { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { autoSyncKey, companionRequest, saveCardLadderReport } from '@/utils/cardLadderCompanion';
import { toast } from '@/components/ui/Toaster';

// Runs only while Rafchu is open and the signed-in user opted in on this browser.
export function CardLadderAutoSync() {
  const { user, db } = useApp();
  useEffect(() => {
    if (!user?.uid || !db) return;
    let disposed = false;
    let busy = false;
    let seen = null;
    const poll = async () => {
      if (disposed || busy || localStorage.getItem(autoSyncKey(user.uid)) !== 'true') return;
      busy = true;
      try {
        const state = await companionRequest('status');
        if (disposed || !state.runId || state.runId === seen) return;
        const report = await companionRequest('report');
        if (disposed || localStorage.getItem(autoSyncKey(user.uid)) !== 'true') return;
        const result = await saveCardLadderReport(db, user.uid, report, {}, {}, null, true);
        seen = state.runId;
        if (!disposed && result.updatedCount) toast.success(`CardLadder updated ${result.updatedCount} Inventory prices.`);
        if (!disposed && result.anomalySkippedCount) toast.info(`CardLadder left ${result.anomalySkippedCount} unusual high prices unchanged. Review them in Inventory → Import.`);
      } catch { /* Missing extension/stale reports remain available in the review panel. */ }
      finally { busy = false; }
    };
    void poll();
    const interval = setInterval(poll, 30000);
    window.addEventListener('cardladder-preference', poll);
    return () => { disposed = true; clearInterval(interval); window.removeEventListener('cardladder-preference', poll); };
  }, [user?.uid, db]);
  return null;
}
