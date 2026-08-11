import { describe, expect, it } from "vitest";
import {
  mergePendingDeals,
  normalizePendingDeal,
  readPendingDealsFromStorage,
} from "./pendingDealHelpers";

describe("pending deal helpers", () => {
  it("normalizes legacy trade items for the unified calculator", () => {
    const deal = normalizePendingDeal({
      id: 12,
      date: "2026-08-11T10:00:00.000Z",
      items: [{ id: "card-1", tradePct: 80, name: "Charizard" }],
    });

    expect(deal.items[0]).toMatchObject({
      entryId: "card-1-pending-12-0",
      baseId: "card-1",
      buyPct: 80,
      quantity: 1,
    });
  });

  it("merges remote, legacy, and local copies without duplicating the same deal", () => {
    const shared = {
      id: 1,
      date: "2026-08-11T10:00:00.000Z",
      description: "Convention trade",
      totalValue: 500,
      items: [{ id: "card-1", name: "Charizard", quantity: 1 }],
    };
    const unique = {
      id: 2,
      date: "2026-08-11T11:00:00.000Z",
      description: "Second deal",
      items: [{ id: "card-2", name: "Blastoise" }],
    };

    const merged = mergePendingDeals([[shared], [{ ...shared }], [unique]], 70);
    expect(merged).toHaveLength(2);
    expect(merged.map((deal) => deal.id)).toEqual([1, 2]);
  });

  it("creates deterministic recovery IDs for old deals without IDs", () => {
    const legacyDeal = {
      date: "2026-08-11T12:00:00.000Z",
      description: "Recovered mobile",
      items: [{ id: "card-3", name: "Rayquaza" }],
    };

    expect(normalizePendingDeal(legacyDeal).id).toBe(normalizePendingDeal(legacyDeal).id);
  });

  it("reads both current and legacy local storage keys", () => {
    const data = new Map([
      ["buy_pending_user-1", JSON.stringify([{ id: "buy" }])],
      ["trade_pending_user-1", JSON.stringify([{ id: "trade" }])],
    ]);
    const storage = { getItem: (key) => data.get(key) || null };

    expect(readPendingDealsFromStorage(storage, "user-1")).toEqual({
      buyDeals: [{ id: "buy" }],
      tradeDeals: [{ id: "trade" }],
    });
  });
});
