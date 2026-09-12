import { CARD_LADDER_REPORT_VERSION, salesWindow } from '../../src/utils/cardLadderSales.js';
import { isCardLadderCurrency } from '../../src/utils/cardLadderCurrency.js';

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
    await navigate(tab.id, `${ORIGIN}/collection`);
    const holdings = await command(tab.id, 'inventory', { currency: report.currency });
    report.collectionComplete = true;
    for (let index = 0; index < holdings.length; index++) {
      if (job.cancelled) throw new Error('Sync cancelled.');
      const holding = holdings[index];
      await saveStatus({ state: 'running', current: index + 1, total: holdings.length, message: `Reading ${holding.name} · ${holding.gradingCompany} ${holding.grade}`, startedAt: capturedAt });
      try {
        // This release uses the PSA profile URL mapping verified against CardLadder.
        if (holding.gradingCompany !== 'PSA' || !/^\d+(?:\.\d+)?$/.test(holding.grade)) throw new Error('This release supports numeric PSA grades. This holding was skipped.');
        await navigate(tab.id, holding.collectionUrl);
        Object.assign(holding, await command(tab.id, 'holding', { holdingId: holding.holdingId }));
        if (holding.error) throw new Error(holding.error);
        const id = /\/profiles\/(?:psa|matched)-(\d+)/.exec(new URL(holding.profileUrl).pathname)?.[1];
        if (!id) throw new Error('No supported exact PSA profile link.');
        const profileId = `psa-${id}`;
        const url = new URL(`${ORIGIN}/sales-history`);
        url.searchParams.set('filters', `grader:psa|grade:g${holding.grade}|profileId:${profileId}`);
        url.searchParams.set('sort', 'date');
        url.searchParams.set('direction', 'desc');
        await navigate(tab.id, url.href);
        Object.assign(holding, await command(tab.id, 'sales', { startDate: report.startDate, endDate: report.endDate, profileId, grade: holding.grade, currency: report.currency }));
      } catch (error) { holding.complete = false; holding.sales = []; holding.error = error.message; }
      report.holdings.push(holding);
    }
    if (job.cancelled) throw new Error('Sync cancelled.');
    await navigate(tab.id, `${ORIGIN}/account`);
    if (await command(tab.id, 'currency') !== report.currency) throw new Error('CardLadder’s display currency changed during capture. Run again without changing it. The previous report was kept.');
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
