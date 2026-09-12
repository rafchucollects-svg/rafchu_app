import { describe, it, expect } from "vitest";
import { mergeItemChanges } from "./inventoryStore";

describe("concurrent inventory changes", () => {
  const card = { entryId: "a", quantity: 1, condition: "NM" };
  it("preserves additions from another device", () => {
    expect(mergeItemChanges([card], [{ ...card, quantity: 2 }], [card, { entryId: "b" }])).toEqual([{ ...card, quantity: 2 }, { entryId: "b" }]);
  });
  it("merges edits to different fields", () => {
    expect(mergeItemChanges([card], [{ ...card, quantity: 2 }], [{ ...card, condition: "LP" }])[0]).toEqual({ ...card, quantity: 2, condition: "LP" });
  });
  it("rejects conflicting edits and deletion of changed cards", () => {
    expect(() => mergeItemChanges([card], [{ ...card, quantity: 2 }], [{ ...card, quantity: 3 }])).toThrow("another device");
    expect(() => mergeItemChanges([card], [], [{ ...card, quantity: 3 }])).toThrow("another device");
  });
  it("allows deletion when stored fields have a different order", () => {
    const imported = { ...card, cardladderData: { grade: "9", prices: { usd: 900, eur: 850 } } };
    const stored = { cardladderData: { prices: { eur: 850, usd: 900 }, grade: "9" }, condition: "NM", quantity: 1, entryId: "a" };
    expect(mergeItemChanges([imported], [], [stored])).toEqual([]);
  });
  it("still rejects deletion when a nested value or array order changes", () => {
    const before = { ...card, prices: { usd: 900 }, sales: [100, 200] };
    expect(() => mergeItemChanges([before], [], [{ ...before, prices: { usd: 950 } }])).toThrow("another device");
    expect(() => mergeItemChanges([before], [], [{ ...before, sales: [200, 100] }])).toThrow("another device");
  });
  it("does not resurrect deleted cards", () => {
    expect(mergeItemChanges([card], [card, { entryId: "b" }], [])).toEqual([{ entryId: "b" }]);
    expect(() => mergeItemChanges([card], [{ ...card, quantity: 2 }], [])).toThrow("removed");
  });
});
