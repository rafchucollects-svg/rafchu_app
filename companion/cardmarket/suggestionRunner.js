import { safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
import { rankCardmarketProducts } from '../../src/utils/cardmarketProducts.js';
import { safeProductSearchUrl } from './products.js';
import { findCardmarketProducts, productSearchState } from './productSearch.js';

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
        let candidates = job.cache[identity(task)], error;
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
              let ready = false, verification = false;
              for (let attempt = 0; attempt < 80; attempt++) {
                if (cancelled) throw new Error('Product search stopped.');
                await pause(500);
                const state = await api.tabs.get(tab.id);
                if (state.status !== 'complete' || !readableUrl(state.url)) continue;
                let response;
                try { response = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'ping', mode: 'products' }); } catch { /* Navigation is still completing. */ }
                if (response?.ok) { ready = true; break; }
                if (response?.reason === 'verification') { verification = true; break; }
              }
              if (!ready) throw new Error(verification ? 'Cardmarket needs browser verification. Open the reader, finish verification, then resume product search.' : 'The Cardmarket search page has not loaded. Open the reader, wait for results, then resume product search.');
              const response = await api.tabs.sendMessage(tab.id, { channel: 'rafchu-cardmarket-reader', action: 'products', task });
              if (!response?.ok) throw Object.assign(new Error(response?.error || 'Could not read product suggestions.'), { code: response?.code });
              if (cancelled) throw new Error('Product search stopped.');
              await pause(700);
              return response.data;
            }, job.search, persist);
            job.cache[identity(task)] = candidates;
          }
        } catch (err) {
          if (err.code !== 'expansion-mismatch') throw err;
          candidates = []; error = err.message;
        }
        const old = job.products.results.find(row => row.entryId === task.entryId && row.inventoryKey === task.inventoryKey);
        const result = candidates.length
          ? { entryId: task.entryId, inventoryKey: task.inventoryKey, candidates, searchedAt: new Date().toISOString() }
          : old || { entryId: task.entryId, inventoryKey: task.inventoryKey, candidates: [], searchedAt: new Date().toISOString(), error: error || 'No exact name, expansion and number match found. Your current URL was kept.' };
        job.products.results = job.products.results.filter(row => row.entryId !== task.entryId).concat(result);
        job.nextIndex++; job.search = null; job.products.revision++;
        await persist();
        await pause(700);
      }
      await api.storage.local.set({ suggestionJob: null, products: job.products, status: { state: 'complete', message: `Product suggestions ready for ${job.products.results.length} cards. Review the proposed links before saving matches.` } });
    } catch (error) {
      keepReader = !cancelled;
      await api.storage.local.set({ suggestionJob: cancelled ? null : job, ...(job ? { products: job.products } : {}), status: { state: cancelled ? 'complete' : 'paused', message: error.message, completed: job?.nextIndex || 0, total: job?.tasks.length || 0 } });
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
