function stableHash(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function itemSignature(item) {
  return [
    item?.baseId || item?.id || "",
    item?.name || "",
    item?.set || "",
    item?.number || "",
    item?.condition || "",
    item?.gradingCompany || "",
    item?.grade || "",
    item?.quantity || 1,
  ].map((value) => String(value).trim().toLowerCase()).join("|");
}

export function pendingDealSignature(deal) {
  const items = Array.isArray(deal?.items) ? deal.items : [];
  return [
    deal?.date || "",
    deal?.description || "",
    deal?.totalValue ?? "",
    ...items.map(itemSignature).sort(),
  ].join("::");
}

export function normalizePendingDeal(deal, defaultPct = 70) {
  if (!deal || typeof deal !== "object") return null;
  const signature = pendingDealSignature(deal);
  const id = deal.id ?? `recovered-${stableHash(signature)}`;
  const addedAt = Date.parse(deal.date || "") || Date.now();
  const items = (Array.isArray(deal.items) ? deal.items : []).map((item, index) => ({
    ...item,
    entryId: item?.entryId || `${item?.baseId || item?.id || "card"}-pending-${id}-${index}`,
    baseId: item?.baseId || item?.id || "",
    quantity: Number(item?.quantity) || 1,
    buyPct: item?.buyPct ?? item?.tradePct ?? defaultPct,
    addedAt: item?.addedAt || addedAt,
  }));

  return {
    ...deal,
    id,
    date: deal.date || new Date(addedAt).toISOString(),
    description: String(deal.description || "Pending deal").slice(0, 20),
    totalValue: Number(deal.totalValue) || 0,
    items,
  };
}

export function mergePendingDeals(dealLists, defaultPct = 70) {
  const merged = new Map();

  (Array.isArray(dealLists) ? dealLists : []).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((rawDeal) => {
      const deal = normalizePendingDeal(rawDeal, defaultPct);
      if (!deal) return;
      const key = pendingDealSignature(deal);
      const current = merged.get(key);
      if (!current || JSON.stringify(deal).length > JSON.stringify(current).length) {
        merged.set(key, deal);
      }
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = Date.parse(a.date || "") || 0;
    const bTime = Date.parse(b.date || "") || 0;
    return aTime - bTime;
  });
}

export function readPendingDealsFromStorage(storage, uid) {
  if (!storage || !uid) return { buyDeals: [], tradeDeals: [] };
  const read = (key) => {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return {
    buyDeals: read(`buy_pending_${uid}`),
    tradeDeals: read(`trade_pending_${uid}`),
  };
}
