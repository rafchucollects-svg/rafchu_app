#!/usr/bin/env node
/**
 * One-shot heal: deduplicate diverging price snapshots in user inventories.
 *
 * Background:
 *   The daily price refresher (functions/index.js) used to fall back to each
 *   inventory entry's own `prices` snapshot whenever the central
 *   `card_database/{cardKey}` doc had `prices: null`. Two entries sharing a
 *   cardKey but added at different times therefore kept divergent snapshots
 *   forever, producing different displayed prices for the same card.
 *
 *   The cloud function has been fixed to canonicalize `prices` per cardKey on
 *   each refresh, but the bad data already sitting in user inventories needs
 *   to be healed once. This script does that pass without waiting for the
 *   next scheduled run.
 *
 * What it does:
 *   For every doc in `collections` and `collector_collections`:
 *     1. Group items by generateCardKey(item).
 *     2. For each cardKey group, pick a canonical `prices` snapshot:
 *          a) Central card_database[cardKey].prices when usable, else
 *          b) the freshest non-empty snapshot among the user's own entries.
 *     3. Apply that canonical snapshot to every entry sharing the cardKey.
 *     4. Only stamp `pricesLastUpdated = now` for case (a). Case (b)
 *        preserves the original timestamp because no actual refresh happened.
 *
 * Auth:
 *   Uses Application Default Credentials (the same auth `gcloud` already
 *   has configured locally). No service account key required.
 *
 * Usage:
 *   node scripts/heal-inventory-duplicates.js                # dry run
 *   node scripts/heal-inventory-duplicates.js --apply        # writes changes
 *   node scripts/heal-inventory-duplicates.js --apply --user <uid>
 *
 * Safe to re-run; idempotent.
 */

import { execSync } from 'node:child_process';
import process from 'node:process';

const PROJECT_ID = 'rafchu-tcg-app';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const APPLY = process.argv.includes('--apply');
const DUPLICATES_ONLY = process.argv.includes('--duplicates-only');
const userArgIdx = process.argv.indexOf('--user');
const FILTER_USER = userArgIdx > -1 ? process.argv[userArgIdx + 1] : null;

function generateCardKey(card) {
  const name = String(card.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const set = String(card.set || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const number = String(card.number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${name}-${set}-${number}`;
}

function hasUsablePrices(prices) {
  if (!prices || typeof prices !== 'object') return false;
  const tcg = prices.tcgplayer || {};
  const cm = prices.cardmarket || {};
  const candidates = [
    tcg.market_price, tcg.mid_price,
    cm.avg30, cm.avg7, cm.average,
    cm.lowest_near_mint, cm.lowest, cm.lowest_listing,
    prices.us?.market, prices.eu?.avg, prices.eu?.low,
    prices.justtcg?.price,
  ];
  return candidates.some(v => Number(v) > 0);
}

// ---- Firestore REST helpers ----

async function getAccessToken() {
  return execSync('gcloud auth application-default print-access-token').toString().trim();
}

let TOKEN = null;
async function fetchJson(url, options = {}) {
  if (!TOKEN) TOKEN = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${url}\n${body}`);
  }
  return res.json();
}

// Convert Firestore JSON values <-> plain JS.
function unwrap(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = unwrap(val);
    return out;
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unwrap);
  return v;
}

function wrap(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(wrap) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = wrap(v);
    return { mapValue: { fields } };
  }
  throw new Error(`Cannot wrap value: ${typeof value} ${value}`);
}

async function listDocs(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${FIRESTORE_BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const data = await fetchJson(url);
    for (const d of data.documents || []) {
      const id = d.name.split('/').pop();
      const fields = {};
      for (const [k, v] of Object.entries(d.fields || {})) fields[k] = unwrap(v);
      docs.push({ id, fields });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function patchItems(collection, docId, items) {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}?updateMask.fieldPaths=items`;
  const body = { fields: { items: wrap(items) } };
  await fetchJson(url, { method: 'PATCH', body: JSON.stringify(body) });
}

// ---- Healing logic (mirrors functions/index.js) ----

function buildCanonicalSnapshots(items, cardCacheMap) {
  const groups = new Map();
  for (const item of items) {
    const key = generateCardKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const nowIso = new Date().toISOString();
  const snapshots = new Map();

  for (const [key, group] of groups) {
    const cached = cardCacheMap.get(key);

    if (cached && hasUsablePrices(cached.prices)) {
      snapshots.set(key, {
        prices: cached.prices,
        image: cached.image || null,
        pricesLastUpdated: nowIso,
        source: 'central',
      });
      continue;
    }

    let best = null;
    for (const it of group) {
      if (!hasUsablePrices(it.prices)) continue;
      const ts = it.pricesLastUpdated ? Date.parse(it.pricesLastUpdated) : 0;
      if (!best || ts > best.ts) {
        best = {
          ts,
          prices: it.prices,
          image: it.image || null,
          pricesLastUpdated: it.pricesLastUpdated || null,
        };
      }
    }
    if (best) {
      snapshots.set(key, {
        prices: best.prices,
        image: best.image,
        pricesLastUpdated: best.pricesLastUpdated,
        source: 'self',
      });
    }
  }

  return snapshots;
}

function pricesShortHash(p) {
  if (!p) return 'null';
  const tcg = p.tcgplayer || {};
  const cm = p.cardmarket || {};
  return [tcg.market_price, tcg.mid_price, cm.avg30, cm.avg7, cm.lowest_near_mint].join('|');
}

function healDoc(items, cardCacheMap) {
  const canonical = buildCanonicalSnapshots(items, cardCacheMap);

  // Count entries per cardKey so we can optionally restrict to true duplicates.
  const entryCountByKey = new Map();
  for (const item of items) {
    const k = generateCardKey(item);
    entryCountByKey.set(k, (entryCountByKey.get(k) || 0) + 1);
  }

  // Only flag an entry as needing heal when the underlying price data actually
  // changes. We deliberately do NOT touch entries whose prices already match
  // the canonical snapshot — `pricesLastUpdated` is the daily refresher's
  // job, not this one-shot heal's. This keeps writes surgical and avoids
  // unnecessary churn on already-correct rows.
  const changes = [];
  const newItems = items.map((item) => {
    const key = generateCardKey(item);
    const c = canonical.get(key);
    if (!c) return item;
    if (DUPLICATES_ONLY && (entryCountByKey.get(key) || 0) <= 1) return item;

    const beforeHash = pricesShortHash(item.prices);
    const afterHash = pricesShortHash(c.prices);
    if (beforeHash === afterHash) return item;

    changes.push({
      entryId: item.entryId,
      name: item.name,
      set: item.set,
      number: item.number,
      cardKey: key,
      source: c.source,
      before: beforeHash,
      after: afterHash,
    });
    return {
      ...item,
      prices: c.prices,
      pricesLastUpdated: c.pricesLastUpdated,
    };
  });
  return { newItems, changes };
}

// ---- Main ----

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes)'}`);
  if (FILTER_USER) console.log(`Filtering to user: ${FILTER_USER}`);

  console.log('\nLoading card_database...');
  const cardDocs = await listDocs('card_database');
  const cardCacheMap = new Map(cardDocs.map(d => [d.id, d.fields]));
  console.log(`  ${cardCacheMap.size} cards loaded`);

  for (const collectionName of ['collections', 'collector_collections']) {
    console.log(`\n=== Scanning ${collectionName} ===`);
    const docs = await listDocs(collectionName);
    let totalChanges = 0;
    let touchedDocs = 0;

    for (const doc of docs) {
      if (FILTER_USER && doc.id !== FILTER_USER) continue;
      const items = doc.fields.items;
      if (!Array.isArray(items) || items.length === 0) continue;

      const { newItems, changes } = healDoc(items, cardCacheMap);
      if (changes.length === 0) continue;

      touchedDocs++;
      totalChanges += changes.length;

      console.log(`\n  [${doc.id}] ${changes.length} entries to heal:`);
      for (const c of changes.slice(0, 10)) {
        console.log(`    - ${c.name} ${c.set} #${c.number}  src=${c.source}  ${c.before}  =>  ${c.after}`);
      }
      if (changes.length > 10) console.log(`    ...and ${changes.length - 10} more`);

      if (APPLY) {
        await patchItems(collectionName, doc.id, newItems);
        console.log(`    written.`);
      }
    }

    console.log(`\n  ${collectionName}: ${touchedDocs} doc(s) ${APPLY ? 'updated' : 'would be updated'}, ${totalChanges} entr${totalChanges === 1 ? 'y' : 'ies'} ${APPLY ? 'healed' : 'would be healed'}`);
  }

  if (!APPLY) console.log('\n(Dry run — re-run with --apply to write changes.)');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
