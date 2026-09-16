import { safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
import { rankCardmarketProducts } from '../../src/utils/cardmarketProducts.js';
import { safeProductSearchUrl } from './products.js';
import { findCardmarketProducts, productSearchState } from './productSearch.js';
import { waitForCardmarketReader } from './readerWait.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const readableUrl = value => safeProductSearchUrl(value) || safeCardmarketProduct(value);
const identity = task => JSON.stringify([task.name, task.set, task.number, task.language]);

export function createSuggestionRunner(api) {
  let active = false, cancelled = false;
  async function run(tasks, previous) {
    active = true; cancelled = false;
    let job = previous;
    let keepReader = false;
    try {
      if (!job) {
        const stored = await api.storage.local.get('products');
        const results = (stored.products?.results || []).flatMap(row => {
          const task = tasks.find(task => task.entryId === row.entryId && task.inventoryKey === row.inventoryKey);
          const age = Date.now() - Date.parse(row.searchedAt);
          const candidates = task && age >= 0 && age < 86400000 ? rankCardmarketProducts(task, row.candidates) : [];
          return candidates.length ? [{ ...row, candidates }] : [];
        });
        job = { tasks, nextIndex: 0, tabId: null, readerUrl: null, search: null, products: { runId: crypto.randomUUID(), results, revision: 0 }, cache: {} };
      }
      const save = status => api.storage.local.set({ suggestionJob: job, products: job.products, status: { ...status, completed: job.nextIndex, total: job.tasks.length } });
      await save({ state: 'running', message: 'Finding product links. Earlier matching suggestions are kept.' });
      for (; job.nextIndex < job.tasks.length;) {
        if (cancelled) throw new Error('Product search stopped.');
        const task = job.tasks[job.nextIndex];
        const label = `Finding product ${job.nextIndex + 1}/${job.tasks.length} · ${task.name}`;
        const persist = () => save({ state: 'running', message: label });
        let candidates = job.cache[identity(task)], error, errorCode;
        try {
          if (!candidates) {
            job.search ||= productSearchState(task);
            await persist();
            candidates = await findCardmarketProducts(task, async nextUrl => {
              if (cancelled) throw new Error('Product search stopped.');
              let tab = job.tabId ? await api.tabs.get(job.tabId).catch(() => null) : null;
              if (!tab) tab = await api.tabs.create({ url: nextUrl, active: true });
              else if (job.readerUrl !== nextUrl || !readableUrl(tab.url)) tab = await api.tabs.update(tab.id, { url: nextUrl, active: true });
              job.tabId = tab.id; job.readerUrl = nextUrl;
              await persist();
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
        const old = job.products.results.find(row => row.entryId === task.entryId && row.inventoryKey === task.inventoryKey);
        const result = candidates.length
          ? { entryId: task.entryId, inventoryKey: task.inventoryKey, candidates, searchedAt: new Date().toISOString() }
          : old ? { ...old, ...(error ? { error, errorCode } : {}) }
            : { entryId: task.entryId, inventoryKey: task.inventoryKey, candidates: [], searchedAt: new Date().toISOString(), errorCode, error: error || 'No exact name, expansion and number match found. Your current URL was kept.' };
        job.products.results = job.products.results.filter(row => row.entryId !== task.entryId).concat(result);
        job.nextIndex++; job.search = null; job.products.revision++;
        await persist();
        await pause(700);
      }
      const matched = job.products.results.filter(row => row.candidates.length).length;
      const needsReview = job.products.results.filter(row => row.error).length;
      const message = needsReview
        ? `Search queue finished. Suggestions available for ${matched}/${job.tasks.length} cards; ${needsReview} ${needsReview === 1 ? 'card needs' : 'cards need'} review. Earlier matching links were kept. Review the proposed links before saving matches.`
        : `Product suggestions ready for ${matched} cards. Review the proposed links before saving matches.`;
      await api.storage.local.set({ suggestionJob: null, products: job.products, status: { state: 'complete', message } });
    } catch (error) {
      keepReader = !cancelled;
      await api.storage.local.set({ suggestionJob: cancelled ? null : job, ...(job ? { products: job.products } : {}), status: { state: cancelled ? 'complete' : 'paused', message: cancelled ? 'Product search stopped. Completed suggestions are kept.' : error.message, completed: job?.nextIndex || 0, total: job?.tasks.length || 0 } });
    } finally {
      if (job?.tabId && !keepReader) await api.tabs.remove(job.tabId).catch(() => {});
      active = false;
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
    await api.storage.local.set({ suggestionJob: null, status: { state: 'complete', message: 'Product search stopped. Completed suggestions are kept.' } });
  }
  return { run, openReader, cancel, get active() { return active; } };
}
