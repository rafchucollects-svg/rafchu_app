import { safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const filterNames = ['language', 'minCondition', 'isReverseHolo', 'isSigned', 'isFirstEd', 'isAltered'];
export function filteredUrl(binding) {
  const url = new URL(safeCardmarketProduct(binding.productUrl));
  const condition = ['MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'].indexOf(binding.condition) + 1;
  if (!condition || !['English', 'Japanese'].includes(binding.language) || !['reverse', 'non-reverse'].includes(binding.finish) || typeof binding.firstEdition !== 'boolean') throw new Error('Confirm the product filters in Rafchu first.');
  for (const [key, value] of Object.entries({ language: binding.language === 'Japanese' ? '7' : '1', minCondition: String(condition), isReverseHolo: binding.finish === 'reverse' ? 'Y' : 'N', isSigned: 'N', isFirstEd: binding.firstEdition ? 'Y' : 'N', isAltered: 'N' })) url.searchParams.set(key, value);
  return url.href;
}

// Verification can reorder the query or append its own token. The product and
// every requested offer filter must still match before reading the DOM.
export function sameCapturePage(actual, expected) {
  if (!safeCardmarketProduct(actual) || safeCardmarketProduct(actual) !== safeCardmarketProduct(expected)) return false;
  const left = new URL(actual).searchParams, right = new URL(expected).searchParams;
  return filterNames.every(key => left.getAll(key).length === 1 && left.get(key) === right.get(key));
}

export function createCaptureRunner(api, capturePhotos) {
  let active = false, cancelled = false, readerId = null;
  async function run(tasks, previous) {
    active = true; cancelled = false;
    const job = previous || { tasks, nextIndex: 0, tabId: null, ownsTab: false, report: { schemaVersion: 1, source: 'cardmarket-browser', runId: crypto.randomUUID(), captures: [] } };
    let photoCache = { runId: job.report.runId, images: {} };
    const save = status => api.storage.local.set({ captureJob: job, report: job.report, status: { ...status, completed: job.report.captures.length, total: job.tasks.length } });
    try {
      if (capturePhotos) {
        const savedPhotos = previous ? (await api.storage.local.get('photoCache')).photoCache : null;
        if (savedPhotos?.runId === job.report.runId) photoCache = savedPhotos;
        else await api.storage.local.set({ photoCache });
      }
      await save({ state: 'running', message: `Reading ${job.tasks.length} confirmed products…` });
      for (; job.nextIndex < job.tasks.length;) {
        if (cancelled) throw new Error('Capture stopped.');
        const task = job.tasks[job.nextIndex];
        const url = filteredUrl(task.binding);
        let tab = job.tabId ? await api.tabs.get(job.tabId).catch(() => null) : null;
        // Reuse a previously opened, identically filtered page (including one
        // the user just verified), without closing their tab when finished.
        if (!tab && job.nextIndex === 0) {
          tab = (await api.tabs.query({ url: 'https://www.cardmarket.com/*' })).find(candidate => sameCapturePage(candidate.url, url));
          if (tab) job.ownsTab = false;
        }
        if (!tab) { tab = await api.tabs.create({ url, active: true }); job.ownsTab = true; }
        else if (!sameCapturePage(tab.url, url)) tab = await api.tabs.update(tab.id, { url, active: true });
        job.tabId = readerId = tab.id;
        const label = `${job.nextIndex + 1}/${job.tasks.length} · ${task.name}`;
        await save({ state: 'running', message: `${label} · Waiting for Cardmarket…` });
        let ready = false, verification = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          if (cancelled) throw new Error('Capture stopped.');
          await pause(500);
          const state = await api.tabs.get(tab.id);
          if (state.status !== 'complete' || !sameCapturePage(state.url, url)) continue;
          let response;
          try { response = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'ping' }); } catch { /* Navigation is still completing. */ }
          if (response?.ok) { ready = true; break; }
          if (response?.reason === 'verification') { verification = true; break; }
        }
        if (!ready) throw new Error(verification ? 'Cardmarket needs browser verification. Open the reader, finish verification, then click Resume capture.' : 'The Cardmarket product has not loaded. Open the reader, wait for the offers, then click Resume capture.');
        await save({ state: 'running', message: `${label} · Reading offers…` });
        const result = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'capture' });
        if (!result?.ok) throw new Error(result?.error || 'Cardmarket capture failed.');
        if (cancelled) throw new Error('Capture stopped.');
        if (!result.data?.complete || !sameCapturePage(result.data.filteredUrl, url)) throw new Error('The page or filters changed during capture. Restore the confirmed filters in the reader, then resume.');
        if (capturePhotos) {
          await save({ state: 'running', message: `${label} · Saving seller-photo previews in this browser…` });
          try {
            const cached = await capturePhotos(api, tab.id, result.data, photoCache.images, () => cancelled);
            const nextCache = { runId: job.report.runId, updatedAt: new Date().toISOString(), images: cached.photos };
            await api.storage.local.set({ photoCache: nextCache });
            photoCache = nextCache;
            if (cached.warning) result.data.photoWarning = cached.warning;
          } catch { result.data.photoWarning = 'Could not save local photo previews. Original listing links are still available.'; }
        }
        if (cancelled) throw new Error('Capture stopped.');
        job.report.captures.push({ ...result.data, entryId: task.entryId, inventoryKey: task.binding.inventoryKey });
        job.nextIndex++;
        await save({ state: 'running', message: `Captured ${job.report.captures.length}/${job.tasks.length} products. You can review completed offers now.` });
        await pause(1200);
      }
      await api.storage.local.set({ captureJob: null, report: job.report, status: { state: 'complete', message: `Captured ${job.report.captures.length} products. Choose offers below; no prices were applied.` } });
      if (job.ownsTab && job.tabId) await api.tabs.remove(job.tabId).catch(() => {});
    } catch (error) {
      if (cancelled) await api.storage.local.set({ captureJob: null, report: job.report, status: { state: 'stopped', message: `Capture stopped. ${job.report.captures.length} completed products are available to review.` } });
      else await save({ state: 'paused', message: `${job.tasks[job.nextIndex]?.name || 'Capture'} · ${error.message} ${job.report.captures.length}/${job.tasks.length} products saved for review.` });
    } finally { active = false; readerId = null; }
  }
  return {
    get active() { return active; },
    run,
    async cancel() {
      cancelled = true;
      if (readerId) await api.tabs.sendMessage(readerId, { channel: 'rafchu-cardmarket-reader', action: 'cancel' }).catch(() => {});
      if (!active) await api.storage.local.set({ captureJob: null, status: { state: 'stopped', message: 'Capture stopped. Completed offers are still available to review.' } });
    },
    async openReader(job) {
      const tab = job?.tabId ? await api.tabs.get(job.tabId).catch(() => null) : null;
      if (!tab || !sameCapturePage(tab.url, filteredUrl(job.tasks[job.nextIndex].binding))) throw new Error('The reader was closed or changed. Click Resume capture to reopen the confirmed product.');
      await api.tabs.update(tab.id, { active: true });
      await api.windows.update(tab.windowId, { focused: true });
    },
  };
}
