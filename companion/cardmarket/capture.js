import { safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
import { waitForCardmarketReader } from './readerWait.js';
import { writeCompanionStorage, STORAGE_PHOTO_WARNING } from './storage.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const filterNames = ['language', 'minCondition', 'isReverseHolo', 'isSigned', 'isFirstEd', 'isAltered'];
const sameEntry = (row, task) => row.entryId === task.entryId && row.inventoryKey === task.binding.inventoryKey;
const changedPage = () => new Error('The page or filters changed during capture. Restore the confirmed filters in the reader, then resume.');
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
  async function run(tasks, previous, retainedReport) {
    active = true; cancelled = false;
    const job = previous || { tasks, nextIndex: 0, tabId: null, ownsTab: false, report: retainedReport ? structuredClone(retainedReport) : { schemaVersion: 1, source: 'cardmarket-browser', runId: crypto.randomUUID(), captures: [], errors: [] } };
    // Existing 0.3.7 checkpoints contain only successful captures.
    job.report.errors ||= [];
    job.report.revision ??= 0;
    let photoCache = { runId: job.report.runId, images: {} };
    const counts = () => ({ completed: job.tasks.filter(task => job.report.captures.some(row => sameEntry(row, task))).length, failed: job.tasks.filter(task => job.report.errors.some(row => sameEntry(row, task))).length, total: job.tasks.length });
    const summary = () => { const { completed, failed, total } = counts(); return `${completed}/${total} products saved for review; ${failed} failed.`; };
    const save = status => api.storage.local.set({ captureJob: job, report: job.report, status: { ...status, ...counts() } });
    const checkCancelled = () => { if (cancelled) throw new Error('Capture stopped.'); };
    // A pagination error must not refresh a challenge or silently restore a
    // changed product/filter. Check both the URL and the current document, and
    // bound a lost content-script reply just as the normal reader wait does.
    const checkRecoveryPage = async (tabId, url) => {
      checkCancelled();
      let current = await api.tabs.get(tabId);
      if (!sameCapturePage(current.url, url)) throw changedPage();
      let timer, state;
      try {
        state = current.status === 'complete' ? await Promise.race([
          api.tabs.sendMessage(tabId, { channel: 'rafchu-cardmarket-reader', action: 'ping' }).catch(() => null),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); }),
        ]) : null;
      } finally { clearTimeout(timer); }
      checkCancelled();
      current = await api.tabs.get(tabId);
      checkCancelled();
      if (!sameCapturePage(current.url, url)) throw changedPage();
      if (state?.reason === 'verification') throw Object.assign(new Error('Cardmarket needs browser verification. Open the reader, finish verification, then click Resume capture.'), { code: 'verification' });
      if (state?.reason === 'server-error') throw Object.assign(new Error('Cardmarket returned a server error. Earlier results are saved. Try Resume capture when Cardmarket recovers.'), { code: 'server-error' });
      if (current.status !== 'complete' || !state?.ok) throw Object.assign(new Error('The Cardmarket page has not loaded. Open the reader, wait for results, then click Resume capture.'), { code: 'page-unavailable' });
    };
    try {
      if (capturePhotos) {
        const savedPhotos = previous || retainedReport ? (await api.storage.local.get('photoCache')).photoCache : null;
        if (savedPhotos?.runId === job.report.runId) photoCache = savedPhotos;
        else photoCache = (await writeCompanionStorage(api, { photoCache }, { photoWrite: true })).photoCache;
      }
      await save({ state: 'running', message: `Reading ${job.tasks.length} confirmed products…` });
      for (; job.nextIndex < job.tasks.length;) {
        checkCancelled();
        const task = job.tasks[job.nextIndex];
        const url = filteredUrl(task.binding);
        if (job.paginationRetry && (!sameEntry(job.paginationRetry, task) || job.paginationRetry.filteredUrl !== url || !['pending', 'attempted'].includes(job.paginationRetry.stage))) {
          throw new Error('The saved retry no longer matches this confirmed product and filters. Stop this capture and start again.');
        }
        let tab = job.tabId ? await api.tabs.get(job.tabId).catch(() => null) : null;
        let openedFresh = false;
        // Reuse a previously opened, identically filtered page (including one
        // the user just verified), without closing their tab when finished.
        if (!tab && job.nextIndex === 0) {
          tab = (await api.tabs.query({ url: 'https://www.cardmarket.com/*' })).find(candidate => sameCapturePage(candidate.url, url));
          if (tab) job.ownsTab = false;
        }
        if (!tab) { tab = await api.tabs.create({ url, active: true }); job.ownsTab = true; openedFresh = true; }
        else if (!sameCapturePage(tab.url, url)) {
          // Advance only from the page we last opened. Legacy workers could
          // stop between cards before navigating to their saved nextIndex.
          const priorTask = job.tasks[job.nextIndex - 1];
          const priorUrl = job.readerUrl || (priorTask && job.report.captures.some(row => sameEntry(row, priorTask)) ? filteredUrl(priorTask.binding) : null);
          if (job.paginationRetry || !priorUrl || priorUrl === url || !sameCapturePage(tab.url, priorUrl)) throw changedPage();
          tab = await api.tabs.update(tab.id, { url, active: true }); openedFresh = true;
        }
        job.tabId = readerId = tab.id;
        job.readerUrl = url;
        const label = `${job.nextIndex + 1}/${job.tasks.length} · ${task.name}`;
        const waitForReader = () => waitForCardmarketReader(api, {
          tabId: tab.id, acceptsUrl: actual => sameCapturePage(actual, url),
          cancelled: () => cancelled, resumeLabel: 'Resume capture',
          onProgress: message => save({ state: 'running', message: `${label} · ${message}` }),
        });
        await save({ state: 'running', message: `${label} · Waiting for Cardmarket…` });
        await waitForReader();
        if (job.paginationRetry?.stage === 'pending') {
          await checkRecoveryPage(tab.id, url);
          // Reserve the single retry durably before refreshing. If the worker
          // stops after this write, Resume cannot keep refreshing this card.
          job.paginationRetry.stage = 'attempted';
          await save({ state: 'running', message: `${label} · Retrying incomplete offer pages once from a fresh load…` });
          if (!openedFresh) {
            try { await checkRecoveryPage(tab.id, url); }
            catch (error) { job.paginationRetry.stage = 'pending'; throw error; }
            await api.tabs.reload(tab.id);
            await waitForReader();
          }
        }
        await save({ state: 'running', message: `${label} · Reading offers…` });
        const result = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'capture' });
        checkCancelled();
        if (!result?.ok) {
          const error = Object.assign(new Error(result?.error || 'Cardmarket capture failed.'), { code: result?.code });
          if (error.code !== 'preview-incomplete') throw error;
          await checkRecoveryPage(tab.id, url);
          if (!job.paginationRetry) {
            job.paginationRetry = { entryId: task.entryId, inventoryKey: task.binding.inventoryKey, filteredUrl: url, stage: 'pending' };
            await save({ state: 'running', message: `${label} · Offer pagination stalled. Retrying this product once…` });
            continue;
          }
          // Incomplete offers never enter the price report. A persistent
          // per-product failure must not block the remaining confirmed cards.
          job.report.errors = job.report.errors.filter(row => !sameEntry(row, task)).concat({ entryId: task.entryId, inventoryKey: task.binding.inventoryKey, name: task.name, binding: structuredClone(task.binding), failedAt: new Date().toISOString(), error: error.message, code: error.code });
          job.report.revision++;
          job.nextIndex++;
          delete job.paginationRetry;
          await save({ state: 'running', message: `${task.name} could not be captured after one retry. Continuing. ${summary()}` });
          await pause(1200);
          continue;
        }
        if (!result.data?.complete || !sameCapturePage(result.data.filteredUrl, url)) throw changedPage();
        if (capturePhotos) {
          await save({ state: 'running', message: `${label} · Saving seller-photo previews in this browser…` });
          try {
            const cached = await capturePhotos(api, tab.id, result.data, photoCache.images, () => cancelled);
            const nextCache = { runId: job.report.runId, updatedAt: new Date().toISOString(), images: cached.photos };
            const saved = await writeCompanionStorage(api, { photoCache: nextCache }, { photoWrite: true });
            photoCache = saved.photoCache;
            if (cached.warning || saved.photosEvicted) result.data.photoWarning = [cached.warning, saved.photosEvicted && STORAGE_PHOTO_WARNING].filter(Boolean).join(' ');
          } catch { result.data.photoWarning = 'Could not save local photo previews. Original listing links are still available.'; }
        }
        if (cancelled) throw new Error('Capture stopped.');
        job.report.captures = job.report.captures.filter(row => !sameEntry(row, task)).concat({ ...result.data, entryId: task.entryId, inventoryKey: task.binding.inventoryKey });
        job.report.errors = job.report.errors.filter(row => !sameEntry(row, task));
        job.report.revision++;
        delete job.paginationRetry;
        job.nextIndex++;
        await save({ state: 'running', message: summary() });
        await pause(1200);
      }
      await api.storage.local.set({ captureJob: null, report: job.report, status: { state: 'complete', message: `Capture finished. ${summary()} Choose completed offers below; no prices were applied.`, ...counts() } });
      if (job.ownsTab && job.tabId) await api.tabs.remove(job.tabId).catch(() => {});
    } catch (error) {
      if (cancelled) await api.storage.local.set({ captureJob: null, report: job.report, status: { state: 'stopped', message: `Capture stopped. ${summary()}`, ...counts() } });
      else await save({ state: 'paused', message: `${job.tasks[job.nextIndex]?.name || 'Capture'} · ${error.message} ${summary()}` });
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
      if (!tab) throw new Error('The reader was closed. Click Resume capture to reopen the confirmed product.');
      if (!sameCapturePage(tab.url, filteredUrl(job.tasks[job.nextIndex].binding))) throw changedPage();
      await api.tabs.update(tab.id, { active: true });
      await api.windows.update(tab.windowId, { focused: true });
    },
  };
}
