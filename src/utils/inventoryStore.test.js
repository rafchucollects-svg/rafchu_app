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
  it("does not resurrect deleted cards", () => {
    expect(mergeItemChanges([card], [card, { entryId: "b" }], [])).toEqual([{ entryId: "b" }]);
    expect(() => mergeItemChanges([card], [{ ...card, quantity: 2 }], [])).toThrow("removed");
  });
});
