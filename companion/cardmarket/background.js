import { safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
import { createCaptureRunner, filteredUrl } from './capture.js';
import { createSuggestionRunner } from './suggestionRunner.js';
import { captureSellerPhotos } from './photoCapture.js';
const captureRunner = createCaptureRunner(chrome, captureSellerPhotos);
const suggestionRunner = createSuggestionRunner(chrome);
const appOrigins = new Set(['https://rafchu-tcg-app.firebaseapp.com', 'https://rafchu-tcg-app.web.app']);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.channel === 'rafchu-cardmarket-progress') { respond({ ok: true }); return; }
  if (message.channel !== 'rafchu-cardmarket') return;
  (async () => {
    try {
      if ((sender.frameId && sender.frameId !== 0) || !sender.url || !appOrigins.has(new URL(sender.url).origin)) throw new Error('Untrusted Cardmarket companion caller.');
      const stored = await chrome.storage.local.get(['status', 'report', 'products', 'captureJob', 'suggestionJob']);
      let data;
      if (message.action === 'status') data = { installed: true, version: chrome.runtime.getManifest().version, runId: stored.report?.runId, productRunId: stored.products?.runId, productRevision: stored.products ? `${stored.products.runId}:${stored.products.revision ?? stored.products.results.length}` : null, reportRevision: stored.report ? `${stored.report.runId}:${stored.report.captures.length}` : null, canResume: Boolean(stored.captureJob && !captureRunner.active), hasCaptureJob: Boolean(stored.captureJob), hasSuggestionJob: Boolean(stored.suggestionJob), canResumeSuggestions: Boolean(stored.suggestionJob && !suggestionRunner.active), capabilities: ['product-suggestions', 'resumable-capture', 'seller-photo-cache', 'promo-product-lookup', 'resilient-product-search', 'resumable-product-search'], status: !suggestionRunner.active && !captureRunner.active && stored.status?.state === 'running' ? { state: stored.captureJob || stored.suggestionJob ? 'paused' : 'error', message: stored.captureJob ? 'Capture interrupted. Resume to continue from the last completed card.' : stored.suggestionJob ? 'Product search interrupted. Resume to continue from the unfinished card.' : 'Search interrupted. Retry suggestions.' } : stored.status };
      else if (message.action === 'products') data = stored.products || null;
      else if (message.action === 'suggest') {
        if (suggestionRunner.active || captureRunner.active || stored.captureJob || stored.suggestionJob) throw new Error('Resume or stop the current Cardmarket task first.');
        if (!Array.isArray(message.tasks) || !message.tasks.length || message.tasks.length > 100 || message.tasks.some(task => !task.entryId || !task.inventoryKey || typeof task.name !== 'string' || !task.name.trim() || typeof task.set !== 'string' || !task.set.trim() || !task.number)) throw new Error('Choose up to 100 cards with names, expansions and numbers.');
        void suggestionRunner.run(message.tasks); data = { started: true };
      }
      else if (message.action === 'report') {
        const cache = (await chrome.storage.local.get('photoCache')).photoCache;
        const fresh = cache?.runId === stored.report?.runId && Date.now() - Date.parse(cache.updatedAt) < 86400000;
        data = stored.report ? { ...stored.report, photos: fresh ? cache.images : {} } : null;
      }
      else if (message.action === 'cancel') { if (suggestionRunner.active || stored.suggestionJob) await suggestionRunner.cancel(); else await captureRunner.cancel(); data = { cancelled: true }; }
      else if (message.action === 'open-reader') { if (stored.suggestionJob) await suggestionRunner.openReader(stored.suggestionJob); else await captureRunner.openReader(stored.captureJob); data = { opened: true }; }
      else if (message.action === 'resume-suggestions') {
        if (suggestionRunner.active || captureRunner.active || stored.captureJob) throw new Error('A Cardmarket task is already running.');
        if (!stored.suggestionJob) throw new Error('No paused product search.');
        void suggestionRunner.run(null, stored.suggestionJob); data = { started: true };
      }
      else if (message.action === 'resume') {
        if (suggestionRunner.active || captureRunner.active || stored.suggestionJob) throw new Error('A Cardmarket task is already running.');
        if (!stored.captureJob) throw new Error('No paused capture. Start capturing linked cards.');
        void captureRunner.run(null, stored.captureJob); data = { started: true };
      }
      else if (message.action === 'start') {
        if (suggestionRunner.active || captureRunner.active || stored.captureJob || stored.suggestionJob) throw new Error('Resume or stop the current capture first.');
        if (!Array.isArray(message.tasks) || !message.tasks.length || message.tasks.length > 100 || message.tasks.some(task => !task.entryId || !task.binding?.inventoryKey || !safeCardmarketProduct(task.binding.productUrl))) throw new Error('Select up to 100 confirmed products.');
        message.tasks.forEach(task => filteredUrl(task.binding));
        void captureRunner.run(message.tasks); data = { started: true };
      } else throw new Error('Unknown Cardmarket action.');
      respond({ ok: true, data });
    } catch (error) { respond({ ok: false, error: error.message }); }
  })();
  return true;
});
