import { safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
import { cardmarketSearchUrl, rankCardmarketProducts } from '../../src/utils/cardmarketProducts.js';
import { safeProductSearchUrl } from './products.js';
import { createCaptureRunner, filteredUrl } from './capture.js';
import { captureSellerPhotos } from './photoCapture.js';
const captureRunner = createCaptureRunner(chrome, captureSellerPhotos);
const appOrigins = new Set(['https://rafchu-tcg-app.firebaseapp.com', 'https://rafchu-tcg-app.web.app']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let active = false;
let cancelled = false;
async function suggest(tasks) {
  active = true; cancelled = false;
  const products = { runId: crypto.randomUUID(), results: [] };
  let tab; let keepReader = false;
  const cache = new Map();
  try {
    for (const [index, task] of tasks.entries()) {
      if (cancelled) throw new Error('Suggestion search stopped.');
      await chrome.storage.local.set({ status: { state: 'running', message: `Finding product ${index + 1}/${tasks.length} · ${task.name}` } });
      const key = JSON.stringify([task.name, task.set, task.number, task.language]);
      let candidates = cache.get(key);
      if (!candidates) {
        candidates = [];
        let nextUrl = cardmarketSearchUrl(task);
        const seen = new Set();
        for (let page = 0; nextUrl && page < 8; page++) {
          if (cancelled) throw new Error('Suggestion search stopped.');
          if (!safeProductSearchUrl(nextUrl) || seen.has(nextUrl)) throw new Error('Search pagination could not be completed. Retry suggestions.');
          seen.add(nextUrl);
          if (!tab) tab = await chrome.tabs.create({ url: nextUrl, active: true });
          else await chrome.tabs.update(tab.id, { url: nextUrl, active: true });
          let ready = false;
          for (let attempt = 0; attempt < 120; attempt++) {
            if (cancelled) throw new Error('Suggestion search stopped.');
            await pause(500);
            const state = await chrome.tabs.get(tab.id);
            if (state.status !== 'complete' || !(safeProductSearchUrl(state.url) || safeCardmarketProduct(state.url))) continue;
            try { ready = (await chrome.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'ping', mode: 'products' }))?.ok; } catch { /* Navigation is still completing. */ }
            if (ready) break;
          }
          if (!ready) throw new Error('Open the Cardmarket search reader, complete verification, then retry suggestions.');
          const response = await chrome.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'products', task });
          if (!response?.ok) throw new Error(response?.error || 'Could not read product suggestions.');
          candidates.push(...response.data.candidates);
          nextUrl = response.data.nextUrl;
          if (nextUrl) await pause(700);
        }
        if (nextUrl) throw new Error('Too many search pages. Use a more precise card name or expansion.');
        candidates = rankCardmarketProducts(task, candidates);
        cache.set(key, candidates);
      }
      products.results.push({ entryId: task.entryId, inventoryKey: task.inventoryKey, candidates, searchedAt: new Date().toISOString(), ...(!candidates.length ? { error: 'No exact name, expansion and number match found. Your current URL was kept.' } : {}) });
      await pause(700);
    }
    await chrome.storage.local.set({ products, status: { state: 'complete', message: `Product suggestions ready for ${products.results.length} cards. Review the proposed links before saving matches.` } });
  } catch (error) {
    keepReader = true;
    await chrome.storage.local.set({ products, status: { state: 'error', message: error.message } });
  } finally {
    if (tab && !keepReader) await chrome.tabs.remove(tab.id).catch(() => {});
    active = false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.channel === 'rafchu-cardmarket-progress') { respond({ ok: true }); return; }
  if (message.channel !== 'rafchu-cardmarket') return;
  (async () => {
    try {
      if ((sender.frameId && sender.frameId !== 0) || !sender.url || !appOrigins.has(new URL(sender.url).origin)) throw new Error('Untrusted Cardmarket companion caller.');
      const stored = await chrome.storage.local.get(['status', 'report', 'products', 'captureJob']);
      let data;
      if (message.action === 'status') data = { installed: true, version: chrome.runtime.getManifest().version, runId: stored.report?.runId, productRunId: stored.products?.runId, reportRevision: stored.report ? `${stored.report.runId}:${stored.report.captures.length}` : null, canResume: Boolean(stored.captureJob && !captureRunner.active), hasCaptureJob: Boolean(stored.captureJob), capabilities: ['product-suggestions', 'resumable-capture', 'seller-photo-cache', 'promo-product-lookup'], status: !active && !captureRunner.active && stored.status?.state === 'running' ? { state: stored.captureJob ? 'paused' : 'error', message: stored.captureJob ? 'Capture interrupted. Resume to continue from the last completed card.' : 'Search interrupted. Retry suggestions.' } : stored.status };
      else if (message.action === 'products') data = stored.products || null;
      else if (message.action === 'suggest') {
        if (active || captureRunner.active || stored.captureJob) throw new Error('Finish or stop the current Cardmarket capture first.');
        if (!Array.isArray(message.tasks) || !message.tasks.length || message.tasks.length > 100 || message.tasks.some(task => !task.entryId || !task.inventoryKey || typeof task.name !== 'string' || !task.name.trim() || typeof task.set !== 'string' || !task.set.trim() || !task.number)) throw new Error('Choose up to 100 cards with names, expansions and numbers.');
        void suggest(message.tasks); data = { started: true };
      }
      else if (message.action === 'report') {
        const cache = (await chrome.storage.local.get('photoCache')).photoCache;
        const fresh = cache?.runId === stored.report?.runId && Date.now() - Date.parse(cache.updatedAt) < 86400000;
        data = stored.report ? { ...stored.report, photos: fresh ? cache.images : {} } : null;
      }
      else if (message.action === 'cancel') { cancelled = true; await captureRunner.cancel(); data = { cancelled: true }; }
      else if (message.action === 'open-reader') { await captureRunner.openReader(stored.captureJob); data = { opened: true }; }
      else if (message.action === 'resume') {
        if (active || captureRunner.active) throw new Error('A Cardmarket task is already running.');
        if (!stored.captureJob) throw new Error('No paused capture. Start capturing linked cards.');
        void captureRunner.run(null, stored.captureJob); data = { started: true };
      }
      else if (message.action === 'start') {
        if (active || captureRunner.active || stored.captureJob) throw new Error('Resume or stop the current capture first.');
        if (!Array.isArray(message.tasks) || !message.tasks.length || message.tasks.length > 100 || message.tasks.some(task => !task.entryId || !task.binding?.inventoryKey || !safeCardmarketProduct(task.binding.productUrl))) throw new Error('Select up to 100 confirmed products.');
        message.tasks.forEach(task => filteredUrl(task.binding));
        void captureRunner.run(message.tasks); data = { started: true };
      } else throw new Error('Unknown Cardmarket action.');
      respond({ ok: true, data });
    } catch (error) { respond({ ok: false, error: error.message }); }
  })();
  return true;
});
