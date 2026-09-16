import { materializeCardmarketDiscovery } from './cardmarketDiscovery';
import { summarizeCardmarketOffers } from './cardmarketSync';

// Confirmation selects an already captured product locally. It does not ask
// the companion to revisit Cardmarket or silently alter the saved binding.
export function cardmarketReviewReport(items, report, products, now = Date.now()) {
  let reusedPreview = false;
  const captures = items.flatMap(item => {
    const previous = report?.captures?.find(row => row.entryId === item.entryId);
    const row = products?.results?.find(row => row.entryId === item.entryId);
    const previews = (row?.previews || []).map(snapshot => materializeCardmarketDiscovery(item, snapshot, item.cardmarketBinding, now)).filter(Boolean);
    const preview = previews.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0];
    let previousUsable = false;
    try { previousUsable = ['ready', 'no-offers'].includes(summarizeCardmarketOffers(item, previous, now).status); } catch { /* A reviewed preview may replace an invalid old capture. */ }
    if (preview && (!previousUsable || Date.parse(preview.capturedAt) >= Date.parse(previous.capturedAt))) {
      reusedPreview = true;
      return [{ ...preview, runId: products.runId || report?.runId }];
    }
    return previous ? [{ ...previous, runId: previous.runId || report?.runId }] : [];
  });
  if (!reusedPreview) return report;
  return { schemaVersion: 1, source: 'cardmarket-browser', runId: products.runId || report?.runId,
    captures, photos: { ...report?.photos, ...products.photos } };
}
