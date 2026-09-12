import { readAccountCurrency, readCollectionRows, readSalesRows, resultCount, textOf } from './dom.js';
import { saleIdentity } from '../../src/utils/cardLadderSales.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
const find = (selector, text, root = document) => [...root.querySelectorAll(selector)].find(el => visible(el) && textOf(el).replace(/\s+/g, ' ').toLowerCase() === text.toLowerCase());
let cancelled = false;

async function waitFor(read, label, timeout = 22000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (cancelled) throw new Error('Sync cancelled.');
    const result = read();
    if (result) return result;
    await pause(350);
  }
  throw new Error(`Could not read ${label}. Check CardLadder login and try again.`);
}

function main() { return document.querySelector('.collection-view, .sales-history-view') || document.querySelector('#content') || document.body; }
function scrollResults(root) {
  // CardLadder currently uses document scrolling; also support a nested list.
  for (let el = root; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 10) el.scrollTop = el.scrollHeight;
  }
  document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
}

async function currency() {
  if (location.pathname !== '/account') throw new Error('Open CardLadder Account to read the display currency.');
  return waitFor(() => readAccountCurrency(document), 'display currency in Account → Display Settings');
}

async function inventory({ currency }) {
  const header = await waitFor(() => document.querySelector('h1.secondary-font'), 'collection name');
  if (textOf(header).toLowerCase() !== 'inventory') {
    header.parentElement.querySelector('.dropdown button')?.click();
    const choice = await waitFor(() => [...header.parentElement.querySelectorAll('li')].find(el => visible(el) && [...el.querySelectorAll('span')].some(span => textOf(span).toLowerCase() === 'inventory')), 'Inventory collection');
    choice.click();
    await waitFor(() => textOf(header).toLowerCase() === 'inventory', 'Inventory selection');
  }
  // Clear collection filters through CardLadder's UI before measuring completeness.
  const root = main();
  const filterButton = find('button', 'tune', root);
  if (!filterButton) throw new Error('Could not verify collection filters.');
  filterButton.click();
  const clear = await waitFor(() => find('button', 'Clear', root), 'collection filter controls');
  // Let the filter dialog finish initializing before changing its draft values.
  await pause(700);
  clear.click();
  await pause(700);
  // CardLadder can leave the cleared draft open; commit it with its Apply button.
  if (visible(clear)) {
    const apply = find('button', 'Apply', clear.closest('.modal') || root);
    if (!apply) throw new Error('Could not apply cleared collection filters.');
    apply.click();
  }
  await waitFor(() => !visible(clear), 'cleared collection filters');
  await pause(700);
  // A text search is separate from filters: never silently read a searched subset.
  const search = [...root.querySelectorAll('[contenteditable="true"], input[type="search"]')].find(visible);
  if (search && (search.value || textOf(search))) throw new Error('Clear the Inventory search before syncing.');
  const listButton = find('button', 'list', root);
  listButton?.click();
  await waitFor(() => resultCount(root) !== null, 'Inventory result count');
  const expected = resultCount(root);
  if (expected > 1000) throw new Error('This version supports up to 1,000 Inventory holdings.');
  const rows = new Map();
  let stalledAt = Date.now();
  while (true) {
    if (textOf(header).toLowerCase() !== 'inventory') throw new Error('The selected collection changed during capture.');
    const before = rows.size;
    for (const row of readCollectionRows(root, location.origin, currency)) rows.set(row.holdingId, row);
    if (rows.size === expected) return [...rows.values()];
    if (rows.size > expected) throw new Error('Collection changed during capture. Run again.');
    if (rows.size > before) stalledAt = Date.now();
    if (Date.now() - stalledAt > 12000) throw new Error('Inventory did not fully load. No partial collection will be imported.');
    scrollResults(root);
    await pause(800);
    if (cancelled) throw new Error('Sync cancelled.');
  }
}

async function holding({ holdingId }) {
  await waitFor(() => new URL(location.href).searchParams.get('cardId') === holdingId && document.querySelector('h1.card-text'), 'collection card');
  const panel = document.querySelector('h1.card-text').closest('.panel') || document.querySelector('h1.card-text').parentElement.parentElement;
  const profile = await waitFor(() => panel.querySelector('.profile-list-item'), 'linked sales profile');
  profile.click();
  await waitFor(() => /\/profiles\/(?:matched|psa)-\d+/.test(location.pathname), 'linked card profile');
  // Wait for CardLadder's automatic PSA -> matched profile redirect to settle.
  await pause(800);
  return { profileUrl: location.href };
}

async function sales({ startDate, endDate, profileId, grade, currency }) {
  const root = main();
  await waitFor(() => {
    const content = textOf(root);
    // High-volume profiles can omit the total. Visible sales still let us
    // prove completeness by paging past the cutoff; never infer an empty list.
    const loaded = resultCount(root) !== null || root.querySelector('a.list-item .sales-list-item-info');
    return content.includes(`Profile: ${profileId}`) && content.includes('Grader: PSA') && new RegExp(`Grade: ${grade.replace('.', '\\.')}(?:[,\\s]|$)`).test(content) && loaded;
  }, 'exact profile and grade filters');
  const current = new URL(location.href);
  const filters = new Set((current.searchParams.get('filters') || '').split('|'));
  if (filters.size !== 3 || !filters.has(`profileId:${profileId}`) || !filters.has('grader:psa') || !filters.has(`grade:g${grade}`) || current.searchParams.get('sort') !== 'date' || current.searchParams.get('direction') !== 'desc') throw new Error('Unexpected sales filters or sorting.');
  const all = new Map();
  let stalledAt = Date.now();
  while (true) {
    if (cancelled) throw new Error('Sync cancelled.');
    const before = all.size;
    const page = readSalesRows(root, currency);
    for (let i = 1; i < page.length; i++) if (page[i].soldDate > page[i - 1].soldDate) throw new Error('Sales are not ordered newest first.');
    for (const sale of page) {
      const key = saleIdentity(sale);
      const prior = all.get(key);
      if (prior && (prior.price !== sale.price || prior.soldDate !== sale.soldDate)) throw new Error('Conflicting duplicate sales.');
      all.set(key, sale);
    }
    const expected = resultCount(root);
    if (page.some(sale => sale.soldDate < startDate) || (expected !== null && all.size === expected)) {
      return { complete: true, sales: [...all.values()].filter(sale => sale.soldDate >= startDate && sale.soldDate <= endDate) };
    }
    if (all.size >= 10000) throw new Error('Over 10,000 sales loaded for one card. Capture stopped without changing its price.');
    if (all.size > before) stalledAt = Date.now();
    if (Date.now() - stalledAt > 12000) throw new Error('Sales stopped loading before the 14-day cutoff. Price unchanged.');
    scrollResults(root);
    await pause(900);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.channel !== 'rafchu-reader') return;
  if (message.command === 'cancel') { cancelled = true; respond({ ok: true }); return; }
  cancelled = false;
  const commands = { currency, inventory, holding, sales };
  if (message.command === 'ping') { respond({ ok: true }); return; }
  const action = commands[message.command];
  if (!action) return;
  // Keep the MV3 worker alive during long, paginated UI reads.
  const heartbeat = setInterval(() => chrome.runtime.sendMessage({ channel: 'rafchu-reader-progress' }).catch(() => {}), 10000);
  action(message).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message })).finally(() => clearInterval(heartbeat));
  return true;
});
