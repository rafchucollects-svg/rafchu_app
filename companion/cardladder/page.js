import { readAccountCurrency, readAccountUserId, readCollectionRows, readSalesRows, resultCount, textOf } from './dom.js';
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

async function accountKey() {
  if (location.pathname !== '/account') throw new Error('Open CardLadder Account to verify the source account.');
  let userId;
  try { userId = await waitFor(() => readAccountUserId(document), 'the rendered CardLadder User ID', 5000); }
  catch (error) { if (cancelled) throw error; return null; }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cardladder-user-id:${userId}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function inventory({ currency }) {
  const header = await waitFor(() => document.querySelector('h1.secondary-font'), 'collection name');
  const collectionDropdown = header.parentElement.querySelector('.dropdown');
  const collectionButton = collectionDropdown?.querySelector('button');
  if (!collectionButton) throw new Error('Could not verify the Inventory collection selector.');
  collectionButton.click();
  await waitFor(() => visible(collectionDropdown.querySelector('.dropdown-content')) || visible(collectionDropdown.querySelector('ul')), 'collection choices');
  const choices = [...collectionDropdown.querySelectorAll('li')].filter(el => visible(el) && [...el.querySelectorAll('span')].some(span => textOf(span).toLowerCase() === 'inventory'));
  const alreadySelected = textOf(header).toLowerCase() === 'inventory';
  // The selected collection is omitted from CardLadder's menu. Another entry
  // named Inventory would make the name-based source scope ambiguous.
  if (choices.length !== (alreadySelected ? 0 : 1)) throw new Error('Could not identify one unique Inventory collection. Check for duplicate collection names.');
  if (!alreadySelected) {
    choices[0].click();
    await waitFor(() => textOf(header).toLowerCase() === 'inventory', 'Inventory selection');
  } else collectionButton.click();
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
  const listButton = find('button', 'list', root);
  if (!listButton) throw new Error('Could not verify Inventory list view.');
  listButton.click();
  const cards = await waitFor(() => root.querySelector('.collection-cards-view'), 'Inventory list');
  const checkState = () => {
    if (location.pathname !== '/collection' || !document.contains(cards) || textOf(header).toLowerCase() !== 'inventory') throw new Error('The selected collection changed during capture.');
    const searches = [...root.querySelectorAll('[contenteditable="true"], input[type="search"]')].filter(visible);
    if (searches.some(search => String(search.value || textOf(search)).trim())) throw new Error('Clear the Inventory search before syncing.');
    if ([...root.querySelectorAll('.modal')].some(visible)) throw new Error('Collection filter controls changed during capture. Run again.');
    const summary = cards.querySelector('.filter-results');
    if (!summary || !visible(summary)) return null;
    const label = textOf(summary).replace(/\s+/g, ' ').trim();
    if (!/^[\d,]+ results?$/.test(label)) throw new Error('Collection filters changed during capture. Run again.');
    const count = resultCount(summary);
    if (!Number.isSafeInteger(count) || count < 0 || count > 1000) throw new Error('This version supports up to 1,000 Inventory holdings.');
    return count;
  };
  const loadedEmpty = () => visible(cards.querySelector('.results .empty-state')) &&
    ![...cards.querySelectorAll('.results .spinner, .results [aria-busy="true"]')].some(visible);
  // A transient "0 results" is rendered before the collection loads. Require
  // its explicit empty state, then a stable count; a second hard-navigation
  // enumeration in the worker independently verifies empty membership.
  let stableCount = null;
  let stableSince = Date.now();
  const expected = await waitFor(() => {
    const count = checkState();
    if (count === null || (count === 0 && !loadedEmpty())) { stableCount = null; stableSince = Date.now(); return false; }
    if (count !== stableCount) { stableCount = count; stableSince = Date.now(); }
    return Date.now() - stableSince >= 1600 ? { count } : false;
  }, 'stable unfiltered Inventory results');
  const rows = new Map();
  let stalledAt = Date.now();
  let completeSince = null;
  while (true) {
    if (checkState() !== expected.count) throw new Error('Collection count changed during capture. Run again.');
    const before = rows.size;
    for (const row of readCollectionRows(cards, location.origin, currency)) {
      if (!row.holdingId || new URL(row.collectionUrl).origin !== location.origin) throw new Error('An Inventory holding has an unreadable identifier.');
      const previous = rows.get(row.holdingId);
      if (previous && ['name', 'number', 'set', 'variation', 'gradingCompany', 'grade'].some(key => previous[key] !== row[key])) throw new Error('An Inventory holding changed during capture. Run again.');
      rows.set(row.holdingId, row);
    }
    if (rows.size > expected.count) throw new Error('Collection changed during capture. Run again.');
    const noLoader = ![...cards.querySelectorAll('.results .spinner, .results [aria-busy="true"]')].some(visible);
    if (rows.size === expected.count && noLoader && (expected.count > 0 || loadedEmpty())) {
      completeSince ??= Date.now();
      if (Date.now() - completeSince >= 1600) return { holdings: [...rows.values()], total: expected.count, verifiedAt: new Date().toISOString() };
    } else completeSince = null;
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
  const commands = { currency, accountKey, inventory, holding, sales };
  if (message.command === 'ping') { respond({ ok: true }); return; }
  const action = commands[message.command];
  if (!action) return;
  // Keep the MV3 worker alive during long, paginated UI reads.
  const heartbeat = setInterval(() => chrome.runtime.sendMessage({ channel: 'rafchu-reader-progress' }).catch(() => {}), 10000);
  action(message).then(data => respond({ ok: true, data })).catch(error => respond({ ok: false, error: error.message })).finally(() => clearInterval(heartbeat));
  return true;
});
