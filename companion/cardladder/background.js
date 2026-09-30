import { CARD_LADDER_REPORT_VERSION, salesWindow } from '../../src/utils/cardLadderSales.js';
import { isCardLadderCurrency } from '../../src/utils/cardLadderCurrency.js';
import { readSalesDestination, salesGrading } from './grading.js';

const ORIGIN = 'https://app.cardladder.com';
const APP_ORIGINS = new Set(['https://rafchu-tcg-app.firebaseapp.com', 'https://rafchu-tcg-app.web.app']);
let active = null;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const saveStatus = status => chrome.storage.local.set({ status });

function isApp(url) {
  try { return APP_ORIGINS.has(new URL(url).origin); } catch { return false; }
}

async function command(tabId, command, args = {}) {
  let response;
  // Wait for content-script injection after a hard navigation, without repeating actions.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (active?.cancelled) throw new Error('Sync cancelled.');
    try { response = await chrome.tabs.sendMessage(tabId, { channel: 'rafchu-reader', command: 'ping' }); } catch { /* Page loading. */ }
    if (response?.ok) break;
    await pause(400);
  }
  if (!response?.ok) throw new Error('CardLadder did not load. Sign in, then run the sync again.');
  const result = await chrome.tabs.sendMessage(tabId, { channel: 'rafchu-reader', command, ...args });
  if (!result?.ok) throw new Error(result?.error || 'The CardLadder reader stopped.');
  return result.data;
}

async function navigate(tabId, url) {
  if (new URL(url).origin !== ORIGIN) throw new Error('Unexpected reader destination.');
  await chrome.tabs.update(tabId, { url });
  // A fixed delay can ping the previous page's content script while navigation
  // is still pending. Wait for the requested document before sending commands.
  for (let attempt = 0; attempt < 80; attempt++) {
    if (active?.cancelled) throw new Error('Sync cancelled.');
    const tab = await chrome.tabs.get(tabId);
    if (tab.url === url && tab.status === 'complete') return;
    await pause(400);
  }
  throw new Error('CardLadder navigation did not finish. Run the capture again.');
}

function inventoryIds(read) {
  if (!read || !Array.isArray(read.holdings) || !Number.isSafeInteger(read.total) || read.total !== read.holdings.length || read.total > 1000) throw new Error('Inventory membership could not be verified. Run the capture again.');
  const ids = read.holdings.map(holding => holding?.holdingId);
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new Error('Inventory contains unreadable or duplicate holding identifiers.');
  return ids.sort();
}

async function capture() {
  if (active) return { started: false };
  const job = { cancelled: false, tabId: null };
  active = job;
  try {
    const capturedAt = new Date().toISOString();
    const report = { schemaVersion: CARD_LADDER_REPORT_VERSION, source: 'cardladder-browser', collectionName: 'Inventory',
      runId: crypto.randomUUID(), capturedAt, ...salesWindow(capturedAt), collectionComplete: false, holdings: [] };
    await saveStatus({ state: 'running', message: 'Reading CardLadder display currency…', startedAt: capturedAt });
    // CardLadder's modal transitions pause in a never-activated background tab.
    // Use a visible dedicated reader so collection setup can finish reliably.
    const tab = await chrome.tabs.create({ url: `${ORIGIN}/account`, active: true });
    job.tabId = tab.id;
    report.currency = await command(tab.id, 'currency');
    if (!isCardLadderCurrency(report.currency)) throw new Error('Unsupported CardLadder display currency. No capture was saved.');
    const initialAccountKey = await command(tab.id, 'accountKey');
    await navigate(tab.id, `${ORIGIN}/collection`);
    const initialInventory = await command(tab.id, 'inventory', { currency: report.currency });
    const holdingIds = inventoryIds(initialInventory);
    const holdings = initialInventory.holdings;
    report.collectionComplete = true;
    for (let index = 0; index < holdings.length; index++) {
      if (job.cancelled) throw new Error('Sync cancelled.');
      const holding = holdings[index];
      await saveStatus({ state: 'running', current: index + 1, total: holdings.length, message: `Reading ${holding.name} · ${holding.gradingCompany} ${holding.grade}`, startedAt: capturedAt });
      try {
        const grading = salesGrading(holding);
        Object.assign(holding, { gradingCompany: grading.gradingCompany, grade: grading.grade });
        await navigate(tab.id, holding.collectionUrl);
        Object.assign(holding, await command(tab.id, 'holding', { holdingId: holding.holdingId, gradingCompany: holding.gradingCompany, grade: holding.grade }));
        if (holding.error) throw new Error(holding.error);
        const { profileId, salesUrl } = readSalesDestination(holding.salesUrl, holding);
        await navigate(tab.id, salesUrl);
        Object.assign(holding, await command(tab.id, 'sales', { startDate: report.startDate, endDate: report.endDate, profileId, gradingCompany: holding.gradingCompany, grade: holding.grade, holding, currency: report.currency }));
      } catch (error) { holding.complete = false; holding.sales = []; holding.latestSale = null; holding.error = error.message; }
      report.holdings.push(holding);
    }
    if (job.cancelled) throw new Error('Sync cancelled.');
    await saveStatus({ state: 'running', message: 'Verifying complete Inventory membership…', startedAt: capturedAt });
    await navigate(tab.id, `${ORIGIN}/collection`);
    const finalInventory = await command(tab.id, 'inventory', { currency: report.currency });
    const finalIds = inventoryIds(finalInventory);
    if (holdingIds.length !== finalIds.length || holdingIds.some((id, index) => id !== finalIds[index])) throw new Error('Inventory membership changed during capture. The previous report was kept. Run again.');
    const finalRows = new Map(finalInventory.holdings.map(holding => [holding.holdingId, holding]));
    if (holdings.some(holding => ['name', 'number', 'set', 'variation', 'gradingCompany', 'grade'].some(key => holding[key] !== finalRows.get(holding.holdingId)?.[key]))) throw new Error('An Inventory holding changed during capture. The previous report was kept. Run again.');
    await navigate(tab.id, `${ORIGIN}/account`);
    if (await command(tab.id, 'currency') !== report.currency) throw new Error('CardLadder’s display currency changed during capture. Run again without changing it. The previous report was kept.');
    const finalAccountKey = await command(tab.id, 'accountKey');
    if (initialAccountKey && finalAccountKey && initialAccountKey !== finalAccountKey) throw new Error('The CardLadder account changed during capture. The previous report was kept. Run again.');
    if (/^[a-f0-9]{64}$/.test(initialAccountKey || '') && initialAccountKey === finalAccountKey) {
      report.inventorySnapshot = { version: 1, collectionName: 'Inventory', accountKey: initialAccountKey,
        holdingIds, total: holdingIds.length, verifiedAt: new Date().toISOString() };
    } else report.inventorySnapshotWarning = 'The CardLadder source account could not be verified. This capture can update prices and add cards, but cannot reconcile removals.';
    if (job.cancelled) throw new Error('Sync cancelled.');
    // Keep the window fixed at capture start even if the run crosses UTC midnight.
    // Each sales command already excludes dates outside these fixed bounds.
    const failures = report.holdings.filter(holding => !holding.complete).length;
    await chrome.storage.local.set({ report });
    await saveStatus({ state: 'complete', message: `Captured ${holdings.length - failures} of ${holdings.length} holdings in ${report.currency}. ${failures} need attention. Open Rafchu’s multicurrency preview to review.`, finishedAt: new Date().toISOString() });
  } catch (error) {
    await saveStatus({ state: 'error', message: error.message });
  } finally {
    if (job.tabId) { try { await chrome.tabs.remove(job.tabId); } catch { /* Already closed. */ } }
    active = null;
  }
}

async function handle(message, sender) {
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (sender.frameId && sender.frameId !== 0) throw new Error('Embedded companion caller rejected.');
  if (!extensionPage && !isApp(sender.url)) throw new Error('Untrusted companion caller.');
  const stored = await chrome.storage.local.get(['status', 'report', 'daily']);
  if (message.action === 'status') {
    const status = !active && stored.status?.state === 'running' ? { state: 'error', message: 'The previous capture was interrupted. Run it again.' } : stored.status;
    return { installed: true, version: chrome.runtime.getManifest().version, status, runId: stored.report?.runId || null, daily: stored.daily === true };
  }
  if (message.action === 'report') return stored.report || null;
  if (message.action === 'start') { void capture(); return { started: true }; }
  if (message.action === 'cancel') {
    if (active) { active.cancelled = true; if (active.tabId) await chrome.tabs.sendMessage(active.tabId, { channel: 'rafchu-reader', command: 'cancel' }).catch(() => {}); }
    return { cancelled: true };
  }
  // Scheduling can only be changed from the extension's own controls.
  if (extensionPage && message.action === 'daily') {
    await chrome.storage.local.set({ daily: message.enabled === true });
    if (message.enabled) await chrome.alarms.create('inventory-daily', { delayInMinutes: 1440, periodInMinutes: 1440 });
    else await chrome.alarms.clear('inventory-daily');
    return { daily: message.enabled === true };
  }
  throw new Error('Unknown companion action.');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.channel === 'rafchu-reader-progress' && sender.tab?.id === active?.tabId) { respond({ ok: true }); return; }
  if (message.channel !== 'rafchu-companion') return;
  handle(message, sender).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'inventory-daily') void capture(); });
chrome.runtime.onStartup.addListener(async () => {
  const { daily } = await chrome.storage.local.get('daily');
  if (daily && !await chrome.alarms.get('inventory-daily')) await chrome.alarms.create('inventory-daily', { delayInMinutes: 1, periodInMinutes: 1440 });
});
