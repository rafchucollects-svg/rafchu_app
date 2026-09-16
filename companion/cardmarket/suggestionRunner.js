import { safeCardmarketProduct, CARDMARKET_CONDITIONS } from '../../src/utils/cardmarketSync.js';
import { rankCardmarketProducts, CARDMARKET_KNOWN_PRODUCTS } from '../../src/utils/cardmarketProducts.js';
import { discoveryUrl, sameDiscoveryPage } from '../../src/utils/cardmarketDiscovery.js';
import { safeProductSearchUrl } from './products.js';
import { findCardmarketProducts, productSearchState } from './productSearch.js';
import { waitForCardmarketReader } from './readerWait.js';
import { writeCompanionStorage, isCompanionStorageFull, STORAGE_PHOTO_WARNING } from './storage.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const readableUrl = value => safeProductSearchUrl(value) || safeCardmarketProduct(value);
const identity = task => JSON.stringify([task.name, task.set, task.number, task.language]);
const fresh = value => { const age = Date.now() - Date.parse(value); return age >= 0 && age < 86400000; };
const recoverable = error => ['verification', 'server-error', 'page-unavailable'].includes(error.code);
const coverageList = (value, allowed) => value === null || (Array.isArray(value) && value.length > 0 && value.every(item => allowed.includes(item)) && new Set(value).size === value.length);

function checkedPreview(data, task, productUrl, url) {
  const coverage = data?.coverage;
  if (data?.scope !== 'product-preview' || data.source !== 'cardmarket-browser' || data.currency !== 'EUR' ||
      safeCardmarketProduct(data.productUrl) !== productUrl || !sameDiscoveryPage(data.filteredUrl, url) ||
      !fresh(data.capturedAt) || typeof data.complete !== 'boolean' || !Array.isArray(data.offers) || data.offers.length > 1000 ||
      !coverage || !coverageList(coverage.languages, ['English', 'Japanese']) || !CARDMARKET_CONDITIONS.includes(coverage.minCondition) ||
      !coverageList(coverage.finishes, ['reverse', 'non-reverse']) || !coverageList(coverage.editions, [true, false]) ||
      coverage.signed !== false || coverage.altered !== false ||
      JSON.stringify(coverage.languages) !== JSON.stringify(['English', 'Japanese'].includes(task.language) ? [task.language] : null) ||
      coverage.minCondition !== (CARDMARKET_CONDITIONS.includes(task.condition) ? task.condition : 'PO') ||
      (data.complete && (data.moreAvailable !== false || data.error)) ||
      (data.entryId != null && data.entryId !== task.entryId) || (data.inventoryKey != null && data.inventoryKey !== task.inventoryKey)) {
    throw new Error('The listing preview does not match this product and inventory card. Retry its listings after reviewing the match.');
  }
  return { ...data, productUrl, entryId: task.entryId, inventoryKey: task.inventoryKey };
}

function retainedPreviews(row, task, candidates, runId) {
  return (Array.isArray(row?.previews) ? row.previews : []).flatMap(preview => {
    const productUrl = safeCardmarketProduct(preview?.productUrl);
    if (!candidates.some(candidate => candidate.productUrl === productUrl)) return [];
    try { return [checkedPreview({ ...preview, discoveryRunId: preview.discoveryRunId || runId }, task, productUrl, discoveryUrl(productUrl, task))]; } catch { return []; }
  });
}

function compactJob(job) {
  const { products, previewCache: _previewCache, ...checkpoint } = job;
  return { ...checkpoint, productsRunId: products.runId };
}

function previewCacheFromProducts(products) {
  const cache = {};
  for (const row of products.results || []) for (const preview of row.previews || []) {
    if (preview.discoveryRunId !== products.runId || !fresh(preview.capturedAt)) continue;
    const evidence = { ...preview };
    delete evidence.entryId; delete evidence.inventoryKey;
    cache[preview.filteredUrl] = evidence;
  }
  return cache;
}

export function createSuggestionRunner(api, capturePhotos) {
  let active = false, cancelled = false, readerId = null;
  async function run(tasks, previous) {
    active = true; cancelled = false;
    let job = previous;
    let keepReader = false;
    let photoCache;
    try {
      const stored = await api.storage.local.get(['products', 'previewPhotoCache']);
      if (job && !job.products) {
        if (!job.productsRunId || stored.products?.runId !== job.productsRunId) throw new Error('The saved listing task no longer matches its results. Stop this search and start again.');
        job = { ...job, products: stored.products };
      }
      if (!job) {
        const results = (stored.products?.results || []).flatMap(row => {
          const task = tasks.find(task => task.entryId === row.entryId && task.inventoryKey === row.inventoryKey);
          const candidates = task && fresh(row.searchedAt) ? rankCardmarketProducts(task, row.candidates) : [];
          return candidates.length ? [{ ...row, candidates, ...(task.captureOffers ? { previews: retainedPreviews(row, task, candidates, stored.products?.runId) } : {}) }] : [];
        });
        job = { tasks, nextIndex: 0, tabId: null, readerUrl: null, search: null, products: { runId: crypto.randomUUID(), results, revision: 0 }, cache: {}, previewCache: {}, offerStage: null };
      }
      if (previous) for (const row of job.products.results) for (const preview of row.previews || []) {
        preview.discoveryRunId ||= job.products.runId;
      }
      readerId = job.tabId;
      // Old jobs embedded full products/cache values. Accept those once, then
      // persist only the cursor and rebuild duplicate reuse from the one store.
      job.previewCache ||= previous ? previewCacheFromProducts(job.products) : {};
      job.previewFailures ||= {};
      const combined = job.tasks.some(task => task.captureOffers === true);
      const previousPhotos = stored.previewPhotoCache;
      const photoRun = previous ? job.products.runId : stored.products?.runId;
      photoCache = { runId: job.products.runId, updatedAt: new Date().toISOString(), images: previousPhotos && previousPhotos.runId === photoRun && fresh(previousPhotos.updatedAt) ? previousPhotos.images : {} };
      if (combined) photoCache = (await writeCompanionStorage(api, { previewPhotoCache: photoCache, suggestionJob: compactJob(job), products: job.products })).previewPhotoCache;
      const save = async status => {
        const saved = await writeCompanionStorage(api, { suggestionJob: compactJob(job), products: job.products, status: { ...status, completed: job.nextIndex, total: job.tasks.length } });
        if (saved.previewPhotoCache) photoCache = saved.previewPhotoCache;
      };
      const putResult = result => {
        job.products.results = job.products.results.filter(row => row.entryId !== result.entryId).concat(result);
        job.products.revision++;
      };
      const openPage = async (url, acceptsUrl, persist) => {
        if (cancelled) throw new Error('Product search stopped.');
        let tab = job.tabId ? await api.tabs.get(job.tabId).catch(() => null) : null;
        if (!tab) tab = await api.tabs.create({ url, active: true });
        else if (job.readerUrl !== url || !acceptsUrl(tab.url)) tab = await api.tabs.update(tab.id, { url, active: true });
        job.tabId = readerId = tab.id; job.readerUrl = url;
        await persist();
        return tab;
      };
      await save({ state: 'running', message: combined ? 'Finding product links and reading their listings. Earlier matching results are kept.' : 'Finding product links. Earlier matching suggestions are kept.' });
      for (; job.nextIndex < job.tasks.length;) {
        if (cancelled) throw new Error('Product search stopped.');
        const task = job.tasks[job.nextIndex];
        const label = `Finding product ${job.nextIndex + 1}/${job.tasks.length} · ${task.name}`;
        const persist = () => save({ state: 'running', message: label });
        let result = job.products.results.find(row => row.entryId === task.entryId && row.inventoryKey === task.inventoryKey);
        if (!job.offerStage) {
          let candidates = job.cache[identity(task)], error, errorCode;
          try {
            if (!candidates) {
              job.search ||= productSearchState(task);
              await persist();
              candidates = await findCardmarketProducts(task, async nextUrl => {
                const tab = await openPage(nextUrl, readableUrl, persist);
                await waitForCardmarketReader(api, {
                  tabId: tab.id, mode: 'products', acceptsUrl: readableUrl, cancelled: () => cancelled,
                  resumeLabel: 'Resume product search',
                  onProgress: message => save({ state: 'running', message: `${label} · ${message}` }),
                });
                const response = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'products', task });
                if (!response?.ok) throw Object.assign(new Error(response?.error || 'Could not read product suggestions.'), { code: response?.code });
                if (cancelled) throw new Error('Product search stopped.');
                await pause(700);
                return response.data;
              }, job.search, persist);
              job.cache[identity(task)] = candidates;
            }
          } catch (err) {
            if (!['expansion-mismatch', 'search-incomplete'].includes(err.code)) throw err;
            candidates = []; error = err.message; errorCode = err.code;
          }
          // Use exactly the same catalogue priority as the app. Every distinct
          // printing stays separate and still requires product confirmation.
          if (task.captureOffers) candidates = rankCardmarketProducts(task, [...candidates, ...(result?.candidates || []), ...CARDMARKET_KNOWN_PRODUCTS]);
          const old = result;
          result = candidates.length
            ? { entryId: task.entryId, inventoryKey: task.inventoryKey, candidates, searchedAt: new Date().toISOString(), ...(error ? { error, errorCode } : {}) }
            : old ? { ...old, ...(error ? { error, errorCode } : {}) }
              : { entryId: task.entryId, inventoryKey: task.inventoryKey, candidates: [], searchedAt: new Date().toISOString(), errorCode, error: error || 'No exact name, expansion and number match found. Your current URL was kept.' };
          if (task.captureOffers) {
            result.previews = retainedPreviews(old, task, result.candidates, stored.products?.runId);
            result.previewErrors = [];
            job.offerStage = { entryId: task.entryId, inventoryKey: task.inventoryKey, nextCandidateIndex: 0 };
            job.search = null;
            putResult(result);
            // Publish the link before any listing page can pause this task.
            await persist();
          }
        }
        if (task.captureOffers && job.offerStage) {
          if (job.offerStage.entryId !== task.entryId || job.offerStage.inventoryKey !== task.inventoryKey || !result) throw new Error('The saved listing task no longer matches this inventory card. Stop this search and start again.');
          for (; job.offerStage.nextCandidateIndex < result.candidates.length;) {
            if (cancelled) throw new Error('Product search stopped.');
            const productUrl = result.candidates[job.offerStage.nextCandidateIndex].productUrl;
            const url = discoveryUrl(productUrl, task);
            const offerLabel = `${job.nextIndex + 1}/${job.tasks.length} · ${task.name} · Reading listings ${job.offerStage.nextCandidateIndex + 1}/${result.candidates.length}`;
            const persistOffer = () => save({ state: 'running', message: offerLabel });
            const earlierPreview = result.previews.find(row => row.productUrl === productUrl);
            try {
              if (job.previewFailures[url]) throw new Error(job.previewFailures[url]);
              let preview = job.previewCache[url];
              if (preview && !fresh(preview.capturedAt)) preview = null;
              if (!preview) {
                const tab = await openPage(url, actual => sameDiscoveryPage(actual, url), persistOffer);
                await waitForCardmarketReader(api, {
                  tabId: tab.id, acceptsUrl: actual => sameDiscoveryPage(actual, url), cancelled: () => cancelled,
                  resumeLabel: 'Resume product search', onProgress: message => save({ state: 'running', message: `${offerLabel} · ${message}` }),
                });
                const response = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'capture-preview', task, productUrl, filteredUrl: url });
                if (!response?.ok) throw Object.assign(new Error(response?.error || 'Could not read this product’s listings.'), { code: response?.code });
                if (cancelled) throw new Error('Product search stopped.');
                preview = { ...checkedPreview(response.data, task, productUrl, url), discoveryRunId: job.products.runId };
                if (capturePhotos) {
                  try {
                    const cached = await capturePhotos(api, tab.id, preview, photoCache.images, () => cancelled);
                    photoCache = { runId: job.products.runId, updatedAt: new Date().toISOString(), images: cached.photos };
                    const saved = await writeCompanionStorage(api, { previewPhotoCache: photoCache }, { photoWrite: true });
                    photoCache = saved.previewPhotoCache;
                    if (cached.warning || saved.photosEvicted) preview.photoWarning = [cached.warning, saved.photosEvicted && STORAGE_PHOTO_WARNING].filter(Boolean).join(' ');
                  } catch { preview.photoWarning = 'Could not save local photo previews. Original listing links are still available.'; }
                }
                if (cancelled) throw new Error('Product search stopped.');
                // Cache only the capture evidence: inventory attachments are
                // assigned separately for each duplicate inventory entry.
                const evidence = { ...preview };
                delete evidence.entryId; delete evidence.inventoryKey;
                job.previewCache[url] = evidence;
              }
              preview = checkedPreview({ ...preview, discoveryRunId: preview.discoveryRunId || job.products.runId }, task, productUrl, url);
              const oldPreview = result.previews.find(row => row.productUrl === productUrl);
              if (preview.complete || !oldPreview?.complete) result.previews = result.previews.filter(row => row.productUrl !== productUrl).concat(preview);
              result.previewErrors = result.previewErrors.filter(row => row.productUrl !== productUrl);
              if (!preview.complete) result.previewErrors.push({ productUrl, error: preview.error || 'Only part of this product’s listings could be read. Retry listings before applying a price.' });
            } catch (error) {
              if (cancelled || recoverable(error)) throw error;
              result.previewErrors = result.previewErrors.filter(row => row.productUrl !== productUrl).concat({ productUrl, error: error.message });
            }
            job.offerStage.nextCandidateIndex++;
            putResult(result);
            try { await persistOffer(); }
            catch (error) {
              if (!isCompanionStorageFull(error)) throw error;
              // Keep the last durable evidence, mark this candidate as needing
              // a smaller capture, and advance instead of offering a Resume
              // action that repeats the same oversized write forever.
              const warning = 'This listing preview exceeds available browser storage. Earlier listings are kept. Review the match and capture a smaller selection with confirmed filters.';
              result.previews = result.previews.filter(row => row.productUrl !== productUrl).concat(earlierPreview ? [earlierPreview] : []);
              result.previewErrors = result.previewErrors.filter(row => row.productUrl !== productUrl).concat({ productUrl, error: warning });
              delete job.previewCache[url];
              job.previewFailures[url] = warning;
              putResult(result);
              await persistOffer();
            }
            await pause(700);
          }
        }
        job.nextIndex++; job.search = null; job.offerStage = null;
        // Link-only callers retain their original revision/progress contract.
        if (!task.captureOffers) putResult(result);
        await persist();
        await pause(700);
      }
      const matched = job.products.results.filter(row => row.candidates.length).length;
      const needsReview = job.products.results.filter(row => row.error || row.previewErrors?.length).length;
      const withListings = job.products.results.filter(row => row.previews?.some(preview => preview.complete && fresh(preview.capturedAt))).length;
      const message = combined
        ? `Search queue finished. Links available for ${matched}/${job.tasks.length} cards; complete listing previews for ${withListings}/${job.tasks.length}.${needsReview ? ` ${needsReview} ${needsReview === 1 ? 'card needs' : 'cards need'} review.` : ''} Confirm the product and filters to use captured listings; no prices were applied.`
        : needsReview
          ? `Search queue finished. Suggestions available for ${matched}/${job.tasks.length} cards; ${needsReview} ${needsReview === 1 ? 'card needs' : 'cards need'} review. Earlier matching links were kept. Review the proposed links before saving matches.`
          : `Product suggestions ready for ${matched} cards. Review the proposed links before saving matches.`;
      await writeCompanionStorage(api, { suggestionJob: null, products: job.products, status: { state: 'complete', message } });
    } catch (error) {
      const full = isCompanionStorageFull(error);
      keepReader = !cancelled && !full;
      // The latest successful checkpoint is already durable. Never repeat an
      // oversized job/results write from the error handler. A tiny status write
      // leaves prior evidence intact even if storage cannot fit another offer.
      await writeCompanionStorage(api, {
        ...(cancelled || full ? { suggestionJob: null } : {}),
        status: { state: cancelled || full ? 'complete' : 'paused',
          message: cancelled ? 'Product search stopped. Completed links and listing previews are kept.'
            : full ? 'Search stopped because local preview storage is full. Completed results are kept. Review them and capture a smaller selection with confirmed filters.' : error.message,
          completed: job?.nextIndex || 0, total: job?.tasks.length || 0 },
      }, { reserveBytes: 0 });
    } finally {
      if (job?.tabId && !keepReader) await api.tabs.remove(job.tabId).catch(() => {});
      active = false; readerId = null;
    }
  }
  async function openReader(job) {
    if (!job) throw new Error('No paused product search.');
    let tab = job.tabId ? await api.tabs.get(job.tabId).catch(() => null) : null;
    if (tab) await api.tabs.update(tab.id, { active: true });
    else {
      tab = await api.tabs.create({ url: job.search?.nextUrl || job.readerUrl, active: true });
      job.tabId = tab.id;
      await api.storage.local.set({ suggestionJob: job });
    }
    if (tab.windowId != null) await api.windows.update(tab.windowId, { focused: true });
  }
  async function cancel() {
    cancelled = true;
    if (readerId) await api.tabs.sendMessage(readerId, { channel: 'rafchu-cardmarket-reader', action: 'cancel' }).catch(() => {});
    await api.storage.local.set({ suggestionJob: null, status: { state: 'complete', message: 'Product search stopped. Completed links and listing previews are kept.' } });
  }
  return { run, openReader, cancel, get active() { return active; } };
}
