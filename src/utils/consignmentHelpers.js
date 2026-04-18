/**
 * Consignment helpers
 *
 * A consigned item is physically in the vendor's possession but owned by a
 * third party (the consignor). On sale, proceeds are split:
 *   - consignorPayout: amount owed back to the consignor
 *   - vendorCommission: what the vendor actually earns
 *
 * Accounting implications handled here:
 *   - Consigned items are excluded from vendor inventory value / net worth
 *   - On sale, only the vendor commission counts as vendor revenue
 *   - COGS for consigned sales is 0 (it wasn't the vendor's inventory to cost)
 *
 * v1 supports percentage-split payouts only (covers the overwhelming majority
 * of real consignment deals). Flat and minimum-plus-split models can be added
 * later without breaking the data shape.
 */

import { computeItemMetrics } from "./cardHelpers";

export const DEFAULT_CONSIGNOR_PCT = 80;

// Clamp a consignor split to a sensible range. 0% effectively makes it owned,
// 100% means the vendor takes nothing (an edge case but valid: e.g. a friend
// asking you to sell at cost).
export function clampConsignorPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return DEFAULT_CONSIGNOR_PCT;
  return Math.max(0, Math.min(100, n));
}

export function isConsignedItem(item) {
  if (!item) return false;
  return item.isConsigned === true || item.acquiredVia === "consigned";
}

/**
 * Split a sale price into (consignorPayout, vendorCommission) for a single unit.
 *
 * Returns { consignorPayout, vendorCommission, consignorPct } where
 * consignorPct is the effective percentage actually applied (useful for UI).
 */
export function splitSalePrice(salePrice, consignorPct = DEFAULT_CONSIGNOR_PCT) {
  const price = Number(salePrice) || 0;
  const pct = clampConsignorPct(consignorPct);
  const consignorPayout = (price * pct) / 100;
  return {
    consignorPayout,
    vendorCommission: price - consignorPayout,
    consignorPct: pct,
  };
}

/**
 * Compute payout for a full sale line (quantity-aware).
 * @param {Object} item - The inventory item (must carry .consignment)
 * @param {number} salePricePerUnit - Sale price per unit, in the sale currency
 * @param {number} quantity - Units sold
 */
export function computeSalePayout(item, salePricePerUnit, quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  const pct = item?.consignment?.consignorPct ?? DEFAULT_CONSIGNOR_PCT;
  const { consignorPayout, vendorCommission, consignorPct } = splitSalePrice(
    salePricePerUnit,
    pct
  );
  return {
    consignorPct,
    consignorPayoutPerUnit: consignorPayout,
    vendorCommissionPerUnit: vendorCommission,
    consignorPayoutTotal: consignorPayout * qty,
    vendorCommissionTotal: vendorCommission * qty,
  };
}

/**
 * Roll up inventory totals split by ownership. Mirrors the shape of
 * computeInventoryTotals from cardHelpers so UIs can swap in cleanly.
 *
 * Returns:
 *   {
 *     owned:     { tcg, cmAvg, cmLowest, suggested, count },
 *     consigned: { tcg, cmAvg, cmLowest, suggested, count },
 *     combined:  { tcg, cmAvg, cmLowest, suggested, count }
 *   }
 */
export function computeInventoryTotalsByOwnership(items, userCurrency = "USD") {
  const empty = () => ({ tcg: 0, cmAvg: 0, cmLowest: 0, suggested: 0, count: 0 });
  const owned = empty();
  const consigned = empty();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const stats = computeItemMetrics(item, userCurrency);
    const qty = Number(item.quantity) || 1;
    const bucket = isConsignedItem(item) ? consigned : owned;
    bucket.tcg += stats.tcg * qty;
    bucket.cmAvg += stats.cmAvg * qty;
    bucket.cmLowest += stats.cmLowest * qty;
    bucket.suggested += stats.suggested * qty;
    bucket.count += qty;
  });

  const combined = {
    tcg: owned.tcg + consigned.tcg,
    cmAvg: owned.cmAvg + consigned.cmAvg,
    cmLowest: owned.cmLowest + consigned.cmLowest,
    suggested: owned.suggested + consigned.suggested,
    count: owned.count + consigned.count,
  };

  return { owned, consigned, combined };
}

/**
 * Group consigned items by consignor for aggregate views.
 * Returns a Map<consignorId, { consignorId, consignorName, items[], suggestedValue }>
 * Items without a consignorId fall back to a synthetic key per consignorName
 * so free-text consignors still aggregate.
 */
export function groupConsignedByConsignor(items, userCurrency = "USD") {
  const map = new Map();
  (Array.isArray(items) ? items : [])
    .filter(isConsignedItem)
    .forEach((item) => {
      const info = item.consignment || {};
      const key = info.consignorId || `name:${(info.consignorName || "Unknown").trim().toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          consignorId: info.consignorId || null,
          consignorName: info.consignorName || "Unknown",
          items: [],
          suggestedValue: 0,
          itemCount: 0,
        });
      }
      const entry = map.get(key);
      entry.items.push(item);
      const stats = computeItemMetrics(item, userCurrency);
      const qty = Number(item.quantity) || 1;
      entry.suggestedValue += stats.suggested * qty;
      entry.itemCount += qty;
    });
  return map;
}

/**
 * Produce the consignment payload stored on an item when it is added/edited
 * as consigned. Keeps the shape consistent across add flows.
 */
export function buildConsignmentPayload({
  consignorId = null,
  consignorName = "",
  consignorContact = "",
  consignorPct = DEFAULT_CONSIGNOR_PCT,
  consignorMinimumPrice = null,
  agreementNotes = "",
} = {}) {
  return {
    consignorId: consignorId || null,
    consignorName: (consignorName || "").trim(),
    consignorContact: (consignorContact || "").trim(),
    consignorPct: clampConsignorPct(consignorPct),
    consignorMinimumPrice:
      consignorMinimumPrice != null && !Number.isNaN(Number(consignorMinimumPrice))
        ? Number(consignorMinimumPrice)
        : null,
    agreementNotes: (agreementNotes || "").trim(),
    consignedAt: Date.now(),
    payoutModel: "percent",
  };
}
