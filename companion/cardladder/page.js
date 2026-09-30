import { readAccountCurrency, readCollectionRows, readSalesRows, resultCount, textOf } from './dom.js';
import { isComparableSale, saleIdentity } from '../../src/utils/cardLadderSales.js';
import { normalizeGrading, sameGrading } from '../../src/utils/grading.js';
import { readSalesDestination, salesGrading } from './grading.js';

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

const dropdownLabel = element => textOf(element).replace(/arrow_drop_down/g, '').replace(/\s+/g, ' ').trim();

async function holding({ holdingId, gradingCompany, grade }) {
  const expected = salesGrading({ gradingCompany, grade });
  await waitFor(() => new URL(location.href).searchParams.get('cardId') === holdingId && document.querySelector('h1.card-text'), 'collection card');
  const panel = document.querySelector('h1.card-text').closest('.panel') || document.querySelector('h1.card-text').parentElement.parentElement;
  const profile = await waitFor(() => panel.querySelector('.profile-list-item'), 'linked sales profile');
  profile.click();
  await waitFor(() => /^\/profiles\/(?:matched|psa|beckett|cgc)-\d+$/.test(location.pathname) && document.querySelector('.profile-sales-filters'), 'linked card profile');
  // A matched profile has different underlying IDs for PSA, Beckett and CGC.
  // Let CardLadder resolve them through its own rendered sales controls.
  const controls = () => [...document.querySelectorAll('.profile-sales-filters .profile-sales-filter-dropdown')];
  const graderDropdown = controls()[0];
  if (dropdownLabel(graderDropdown?.querySelector('button')) !== expected.graderLabel) {
    graderDropdown?.querySelector('button')?.click();
    const option = await waitFor(() => find('li', expected.graderLabel, controls()[0]), 'profile grading company');
    option.click();
    await waitFor(() => dropdownLabel(controls()[0]?.querySelector('button')) === expected.graderLabel, 'selected profile grading company');
  }
  const exactGrade = element => sameGrading(expected, normalizeGrading(expected.gradingCompany, dropdownLabel(element)));
  const gradeDropdown = controls()[1];
  if (!gradeDropdown) throw new Error('The linked profile has no exact grade selector.');
  if (!exactGrade(gradeDropdown.querySelector('button'))) {
    gradeDropdown.querySelector('button')?.click();
    const option = await waitFor(() => [...controls()[1].querySelectorAll('li')].find(el => visible(el) && exactGrade(el)), 'exact profile grade');
    option.click();
    await waitFor(() => exactGrade(controls()[1]?.querySelector('button')), 'selected exact profile grade');
  }
  const profileUrl = location.href;
  const section = document.querySelector('.profile-sales-filters')?.closest('.profile-sales-row');
  const link = [...(section?.querySelectorAll('a') || [])].find(el => visible(el) && textOf(el).replace(/chevron_right/g, '').trim() === 'View All Sales');
  if (!link) throw new Error('The linked profile has no exact sales link.');
  link.click();
  await waitFor(() => location.pathname === '/sales-history', 'linked profile sales');
  const destination = readSalesDestination(location.href, expected);
  return { profileUrl, salesUrl: destination.salesUrl };
}

async function sales({ startDate, endDate, profileId, gradingCompany, grade, holding, currency }) {
  const expectedGrading = salesGrading({ gradingCompany, grade });
  const checkFilters = () => {
    if (readSalesDestination(location.href, expectedGrading).profileId !== profileId) throw new Error('The selected sales profile changed during capture.');
  };
  checkFilters();
  const root = main();
  await waitFor(() => {
    const content = textOf(root);
    // High-volume profiles can omit the total. Visible sales still let us
    // prove completeness by paging past the cutoff; never infer an empty list.
    const loaded = resultCount(root) !== null || root.querySelector('a.list-item .sales-list-item-info');
    const label = expectedGrading.filterLabel.replace('.', '\\.');
    return new RegExp(`Profile: ${profileId}(?:[,\\s]|$)`).test(content) && content.includes(`Grader: ${expectedGrading.graderLabel}`) && new RegExp(`Grade: ${label}(?:[,\\s]|$)`).test(content) && loaded;
  }, 'exact profile and grade filters');
  const all = new Map();
  let latestSale = null;
  let windowComplete = false;
  let stalledAt = Date.now();
  const result = (latestSaleComplete = true, latestSaleWarning = null) => ({
    complete: true, latestSale, latestSaleComplete, latestSaleWarning,
    sales: [...all.values()].filter(sale => sale.soldDate >= startDate && sale.soldDate <= endDate),
  });
  while (true) {
    if (cancelled) throw new Error('Sync cancelled.');
    checkFilters();
    const before = all.size;
    const page = readSalesRows(root, currency);
    for (let i = 1; i < page.length; i++) if (page[i].soldDate > page[i - 1].soldDate) throw new Error('Sales are not ordered newest first.');
    for (const sale of page) {
      const key = saleIdentity(sale);
      const prior = all.get(key);
      if (prior && (prior.price !== sale.price || prior.soldDate !== sale.soldDate)) throw new Error('Conflicting duplicate sales.');
      all.set(key, sale);
      if (sale.soldDate <= endDate && ['Auction', 'Fixed Price', 'Best Offer'].includes(sale.type) && isComparableSale(sale, holding) &&
          (!latestSale || sale.soldDate > latestSale.soldDate)) latestSale = sale;
    }
    const expected = resultCount(root);
    const exhausted = expected !== null && all.size === expected;
    // The last comparable sale is useful even outside the pricing window.
    // Preserve CardLadder's newest-first order when multiple sales share a date.
    const pastWindow = page.some(sale => sale.soldDate < startDate);
    windowComplete ||= exhausted || pastWindow;
    if (exhausted || (pastWindow && latestSale)) {
      return result();
    }
    if (expected !== null && all.size > expected) throw new Error('Sales changed during capture. Run again.');
    if (all.size >= 10000) {
      if (windowComplete) return result(false, 'The two-week sales window is complete. The last comparable sale could not be verified within the 10,000-sale history limit.');
      throw new Error('Over 10,000 sales loaded for one card. Capture stopped without changing its price.');
    }
    if (all.size > before) stalledAt = Date.now();
    if (Date.now() - stalledAt > 12000) {
      if (windowComplete) return result(false, 'The two-week sales window is complete. Older sales stopped loading before the last comparable sale could be verified.');
      throw new Error('Sales stopped loading before the two-week pricing window could be verified. Price unchanged.');
    }
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
