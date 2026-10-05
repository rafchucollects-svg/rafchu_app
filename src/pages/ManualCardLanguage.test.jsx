import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ rates: {} }) })));
  return { app: {}, manualCard: {}, save: vi.fn(), setDoc: vi.fn(), error: vi.fn() };
});
vi.mock("@/contexts/AppContext", () => ({ useApp: () => mocks.app }));
vi.mock("@/components/ManualCardEntry", () => ({
  ManualCardEntry: ({ onAddCard }) => <button onClick={() => onAddCard(mocks.manualCard)}>Add manual test card</button>,
}));
vi.mock("@/components/CardPhotoScanner", () => ({ CardPhotoScanner: () => null }));
vi.mock("@/components/TransactionDetailsFields", () => ({ TransactionDetailsFields: () => null }));
vi.mock("@/components/ui/Toaster", () => ({ toast: { error: mocks.error, info: vi.fn(), success: vi.fn() } }));
vi.mock("@/utils/inventoryStore", () => ({ saveItemChanges: mocks.save }));
vi.mock("firebase/firestore", () => ({
  doc: (_db, ...parts) => ({ path: parts.join("/") }),
  collection: (_db, ...parts) => ({ path: parts.join("/") }),
  addDoc: vi.fn(async () => ({ id: "test-transaction" })),
  setDoc: mocks.setDoc,
  getDoc: vi.fn(async () => ({ exists: () => false })),
  onSnapshot: (_ref, callback) => { callback({ exists: () => false }); return () => {}; },
}));
vi.mock("@/utils/cardHelpers", async importOriginal => ({
  ...await importOriginal(),
  prepareTransactionRecord: (_db, _uid, entry) => ({ id: "test-transaction", ref: {}, payload: { ...entry, ts: Date.now() } }),
  recordTransaction: async (_db, _uid, entry) => ({ id: "test-transaction", ref: {}, payload: { ...entry, ts: Date.now() } }),
}));
import { BuyCalculator } from "./BuyCalculator";
import { TradeCalculator } from "./TradeCalculator";

let root, host;
const japanese = {
  id: "manual-hungry", entryId: "incoming", baseId: "manual-hungry", name: "Hungry Snorlax",
  set: "Japanese Promos", number: "143", language: "Japanese", isJapanese: true,
  rarity: "Promo", image: "", condition: "NM", quantity: 1, isManualEntry: true,
  manualPrice: 80, manualPriceCurrency: "EUR", buyPct: 70, tradePct: 90, addedAt: 1,
};
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.save.mockReset().mockImplementation(async (_ref, _before, after) => after);
  mocks.setDoc.mockReset().mockResolvedValue(undefined);
  mocks.error.mockReset();
  mocks.manualCard = { ...japanese };
  mocks.app = {
    user: { uid: "test" }, db: {}, currency: "EUR", secondaryCurrency: null, userProfile: {},
    buyItems: [], tradeItems: [], collectionItems: [],
    setBuyItems: vi.fn(), setTradeItems: vi.fn(), setCollectionItems: vi.fn(), triggerQuickAddFeedback: vi.fn(),
  };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); localStorage.clear();
});
afterAll(() => vi.unstubAllGlobals());
function buttons(text) {
  return [...host.querySelectorAll("button")].filter(button => button.textContent.trim().startsWith(text));
}
async function click(text, last = false) {
  const matches = buttons(text);
  expect(matches.length).toBeGreaterThan(0);
  await act(async () => (last ? matches.at(-1) : matches[0]).click());
}

it.each([
  { name: "deal", Component: BuyCalculator, setter: "setBuyItems", language: "Japanese", isJapanese: true },
  { name: "deal", Component: BuyCalculator, setter: "setBuyItems", language: "English", isJapanese: false },
  { name: "trade", Component: TradeCalculator, setter: "setTradeItems", language: "Japanese", isJapanese: true },
  { name: "trade", Component: TradeCalculator, setter: "setTradeItems", language: "English", isJapanese: false },
])("preserves $language when adding a manual card to the $name calculator", async ({ Component, setter, language, isJapanese }) => {
  mocks.manualCard = { ...japanese, language, isJapanese };
  await act(async () => root.render(<Component />));
  await click("Manual Add");
  await click("Add manual test card");
  const added = mocks.app[setter].mock.calls[0][0]([])[0];
  expect(added).toMatchObject({ name: "Hungry Snorlax", language, isJapanese });
});

it.each([
  { name: "deal", Component: BuyCalculator, itemsKey: "buyItems", action: "Finish as Buy", isTrade: false },
  { name: "deal", Component: BuyCalculator, itemsKey: "buyItems", action: "Finish as Trade", isTrade: true },
  { name: "trade", Component: TradeCalculator, itemsKey: "tradeItems", action: "Confirm Buy", isTrade: false },
  { name: "trade", Component: TradeCalculator, itemsKey: "tradeItems", action: "Confirm Trade", isTrade: true },
])("preserves Japanese identity when the $name calculator uses $action", async ({ Component, itemsKey, action, isTrade }) => {
  mocks.app[itemsKey] = [{ ...japanese }];
  mocks.app.collectionItems = [{ entryId: "outgoing", name: "Pikachu", number: "25", set: "Base Set", condition: "NM", language: "English", isJapanese: false, prices: {} }];
  await act(async () => root.render(<Component />));
  await click("Select All");
  await click(action);
  if (isTrade) {
    await click("Select All", true);
    await click("Complete Trade");
  }
  expect(mocks.error).not.toHaveBeenCalled();
  expect(mocks.app.setCollectionItems).toHaveBeenCalledTimes(1);
  expect(mocks.app.setCollectionItems.mock.calls[0][0]).toContainEqual(expect.objectContaining({
    name: "Hungry Snorlax", language: "Japanese", isJapanese: true,
  }));
  if (itemsKey === "buyItems") {
    expect(mocks.save.mock.calls[0][2]).toContainEqual(expect.objectContaining({ language: "Japanese", isJapanese: true }));
  } else {
    expect(mocks.setDoc.mock.calls.find(([ref]) => ref.path === "collections/test")[1].items)
      .toContainEqual(expect.objectContaining({ language: "Japanese", isJapanese: true }));
  }
});
