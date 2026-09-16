import { expect, it } from 'vitest';
import { cardmarketReviewReport } from './cardmarketReview';
import { applyCardmarketCaptures, cardmarketInventoryKey, createCardmarketBinding } from './cardmarketSync';
import { discoveryUrl } from './cardmarketDiscovery';

const now = Date.parse('2026-09-16T12:00:00Z');
const productUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/BW-Black-Star-Promos/Eevee-V2-BWBW97';
const item = { entryId: 'eevee', name: 'Eevee', set: 'BW Black Star Promos', number: 'BW97', language: 'English', condition: 'NM', overridePrice: 100 };
const binding = createCardmarketBinding(item, { productUrl, language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: false, confirmed: true });
const linked = { ...item, cardmarketBinding: binding };
const offer = { offerId: 'articleRow100', seller: 'Example', price: 90, currency: 'EUR', language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: false, signed: false, altered: false };
const snapshot = { scope: 'product-preview', source: 'cardmarket-browser', currency: 'EUR', entryId: item.entryId, inventoryKey: cardmarketInventoryKey(item), productUrl, filteredUrl: discoveryUrl(productUrl), capturedAt: new Date(now).toISOString(), coverage: { languages: null, minCondition: 'PO', finishes: null, editions: null, signed: false, altered: false }, offers: [offer], complete: true, moreAvailable: false };
const products = { runId: 'discovery-one', results: [{ entryId: item.entryId, inventoryKey: snapshot.inventoryKey, previews: [snapshot] }], photos: {} };

it('keeps the original report untouched before explicit product confirmation', () => {
  const report = { runId: 'regular', captures: [] };
  expect(cardmarketReviewReport([item], report, products, now)).toBe(report);
  expect(cardmarketReviewReport([item], null, products, now)).toBeNull();
});

it('reuses listings after confirmation and preserves broad capture provenance on explicit price application', () => {
  const report = cardmarketReviewReport([linked], null, products, now);
  expect(report).toMatchObject({ schemaVersion: 1, source: 'cardmarket-browser', runId: products.runId, captures: [{ productUrl, filters: { language: 'English', condition: 'NM', finish: 'non-reverse', firstEdition: false } }] });
  const applied = applyCardmarketCaptures([linked], report.captures, [{ entryId: item.entryId, method: 'selected-offer', offerId: offer.offerId, replaceManual: false }], now, report.runId);
  expect(applied.items[0].overridePrice).toBe(100);
  expect(applied.items[0].cardmarketPricing).toMatchObject({ price: 90, discoveryCoverage: snapshot.coverage, filters: report.captures[0].filters });
});

it('keeps a newer normal capture and does not replace it with older discovery evidence', () => {
  const capture = { ...snapshot, capturedAt: new Date(now + 1000).toISOString(), filters: binding };
  const report = { runId: 'regular', captures: [capture] };
  expect(cardmarketReviewReport([linked], report, products, now + 1000)).toBe(report);
});

it('combines distinct entries into one review without dropping existing captures', () => {
  const other = { ...linked, entryId: 'another' };
  const prior = { ...snapshot, entryId: other.entryId, filters: binding };
  const report = cardmarketReviewReport([linked, other], { runId: 'regular', captures: [prior], photos: { prior: 'photo' } }, products, now);
  expect(report.captures.map(row => row.entryId)).toEqual(['eevee', 'another']);
  expect(report.photos).toEqual({ prior: 'photo' });
});

it('preserves each capture run when applying mixed discovery and existing report entries', () => {
  const other = { ...linked, entryId: 'another' };
  const prior = { ...snapshot, entryId: other.entryId, filters: binding };
  const report = cardmarketReviewReport([linked, other], { runId: 'regular', captures: [prior] }, products, now);
  expect(report.captures.map(row => row.runId)).toEqual(['discovery-one', 'regular']);
  const choices = [linked, other].map(card => ({ entryId: card.entryId, method: 'selected-offer', offerId: offer.offerId, replaceManual: false }));
  const applied = applyCardmarketCaptures([linked, other], report.captures, choices, now, report.runId);
  expect(applied.items.map(card => card.cardmarketPricing.runId)).toEqual(['discovery-one', 'regular']);
  const recomposed = cardmarketReviewReport([linked, other], report, { ...products, runId: 'discovery-two' }, now);
  expect(recomposed.captures.map(row => row.runId)).toEqual(['discovery-two', 'regular']);
});

it('never reuses incomplete, changed-product, or expired discovery snapshots', () => {
  for (const changed of [{ complete: false }, { productUrl: productUrl.replace('V2', 'V3') }, { capturedAt: new Date(now - 86400001).toISOString() }]) {
    expect(cardmarketReviewReport([linked], null, { ...products, results: [{ ...products.results[0], previews: [{ ...snapshot, ...changed }] }] }, now)).toBeNull();
  }
});

it('keeps the original capture run when a later search retains an earlier preview', () => {
  const retained = { ...snapshot, discoveryRunId: 'original-discovery' };
  const newerProducts = { ...products, runId: 'later-retry', results: [{ ...products.results[0], previews: [retained] }] };
  const report = cardmarketReviewReport([linked], null, newerProducts, now);
  expect(report.captures[0].runId).toBe('original-discovery');
  const applied = applyCardmarketCaptures([linked], report.captures, [{ entryId: item.entryId, method: 'selected-offer', offerId: offer.offerId, replaceManual: false }], now, report.runId);
  expect(applied.items[0].cardmarketPricing.runId).toBe('original-discovery');
});
