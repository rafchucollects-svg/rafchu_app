import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ app: { db: {}, user: { uid: "reviewer" } }, load: vi.fn(), finalize: vi.fn(), save: vi.fn(), getDocs: vi.fn(), importSources: vi.fn(), automatic: vi.fn() }));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => mocks.app }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), getDocs: mocks.getDocs }));
vi.mock("@/utils/reconciliationStore", () => ({ loadReconciliation: mocks.load, finalizeReconciliation: mocks.finalize, saveReconciliationDraft: mocks.save, importReconciliationSources: mocks.importSources, automaticallyReconcile: mocks.automatic }));
import { Reconciliation } from "./Reconciliation";

let container, root, loaded;
const click = async (element) => act(async () => element.click());
const button = (text) => [...container.querySelectorAll("button")].find((element) => element.textContent.includes(text));
const select = async (label, value) => act(async () => {
  const element = container.querySelector(`[aria-label="${label}"]`);
  element.value = value; element.dispatchEvent(new Event("change", { bubbles: true }));
});
const render = () => act(async () => root.render(<MemoryRouter><Reconciliation /></MemoryRouter>));
const upload = async (files) => {
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
};
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  const ts = Date.parse("2026-06-15");
  loaded = { sources: [
    { id: "p", kind: "payment", provider: "SumUp", reference: "synthetic", amount: 110, currency: "EUR", date: ts, description: "Pikachu" },
    { id: "q", kind: "payment", provider: "Wise", reference: "second", amount: -75, currency: "EUR", date: ts - 86400000, description: "Sample venue" },
  ], reviews: [], draft: null };
  mocks.load.mockImplementation(async () => loaded);
  mocks.getDocs.mockResolvedValue({ docs: [{ id: "sale", data: () => ({ type: "sale", ts, totalValue: 100, currency: "EUR", itemsOut: [{ name: "Pikachu", quantity: 1, unitPrice: 100 }] }) }] });
  mocks.finalize.mockImplementation(async (_db, _uid, review) => { loaded = { ...loaded, reviews: [...loaded.reviews, { ...review, sourceIds: review.sources.map((s) => s.id), id: "saved", changes: [], finalizedAt: ts }] }; return "saved"; });
  mocks.save.mockResolvedValue(); mocks.automatic.mockResolvedValue(0); mocks.importSources.mockResolvedValue(1);
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

describe("guided payment review", () => {
  it("opens one payment, proposes the statement amount, saves and advances", async () => {
    await render();
    expect(container.querySelector('[aria-label="Review one payment"]').textContent).toContain("110.00 EUR");
    await click(container.querySelector('[aria-label="Choose Pikachu"]'));
    expect(container.querySelector('[aria-label="Final amount for Pikachu"]').value).toBe("110");
    expect(container.textContent).toContain("Saving will update");
    await click(button("Save and next"));
    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(mocks.finalize.mock.calls[0][2]).toMatchObject({ amounts: { sale: "110" }, resolutionMode: "manual" });
    expect(mocks.finalize.mock.calls[0][2].evidence).toContain("SumUp statement reference synthetic");
    expect(container.querySelector('[aria-label="Review one payment"]').textContent).toContain("Sample venue");
    expect(container.textContent).toContain("Payment saved");
    expect(document.activeElement.textContent).toContain("Review next");
  });
  it("shows validation beside Save and next instead of silently disabling it", async () => {
    await render(); await click(button("Save and next"));
    expect(container.querySelector('[role="alert"]').textContent).toContain("Choose the app transactions");
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it("keeps the selected recommendation on failed save", async () => {
    mocks.finalize.mockRejectedValueOnce(new Error("Connection failed. Please retry."));
    await render(); await click(container.querySelector('[aria-label="Choose Pikachu"]')); await click(button("Save and next"));
    expect(container.querySelector('[role="alert"]').textContent).toContain("Connection failed");
    expect(container.querySelector('[aria-label="Choose Pikachu"]').getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[aria-label="Choose payment to review"]').value).toBe("p");
  });
  it("can classify a non-card payment with a single save and no sale changes", async () => {
    await render(); await select("Movement type", "transfer"); await click(button("Save and next"));
    expect(mocks.finalize.mock.calls[0][2]).toMatchObject({ classification: "transfer", transactions: [] });
  });
  it("saves progress without clearing the payment and restores an existing draft", async () => {
    loaded.draft = { sourceIds: ["p"], transactionIds: ["sale"], amounts: { sale: "110" }, note: "Confirmed with buyer", evidence: "Deal message" };
    await render(); expect(container.querySelector('[aria-label="Explanation / recommendation"]').value).toBe("Confirmed with buyer");
    await click(button("Save progress")); expect(mocks.save).toHaveBeenCalledOnce(); expect(mocks.finalize).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Progress saved");
  });
  it("keeps newly saved progress when switching away and back", async () => {
    await render(); await click(container.querySelector('[aria-label="Choose Pikachu"]')); await click(button("Save progress"));
    await select("Choose payment to review", "q"); await select("Choose payment to review", "p");
    expect(container.querySelector('[aria-label="Choose Pikachu"]').getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[aria-label="Final amount for Pikachu"]').value).toBe("110");
  });
  it("retains the successful save when refreshing fails", async () => {
    await render(); mocks.load.mockRejectedValueOnce(new Error("Offline"));
    await click(container.querySelector('[aria-label="Choose Pikachu"]')); await click(button("Save and next"));
    expect(container.textContent).toContain("Payment saved. The latest list could not be refreshed");
    expect(container.querySelector('[aria-label="Choose payment to review"]').value).toBe("q");
  });
  it("review later advances without saving and allows returning", async () => {
    await render(); await click(button("Review later"));
    expect(container.querySelector('[aria-label="Choose payment to review"]').value).toBe("q");
    await select("Choose payment to review", "p"); expect(container.textContent).toContain("110.00 EUR");
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});

describe("statement import and automatic matching", () => {
  const csv = "TransferWise ID,Date,Amount,Currency\nTEST-1,15/06/2026,90,EUR";
  it("shows progress and automatically matches after importing all selected files", async () => {
    let finishRead;
    const reading = new Promise((resolve) => { finishRead = resolve; });
    await render(); await upload([{ name: "wise.csv", text: () => reading }, { name: "wise2.csv", text: async () => csv.replace("TEST-1", "TEST-2") }]);
    expect(container.textContent).toContain("Reading wise.csv");
    await act(async () => { finishRead(csv); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(mocks.importSources).toHaveBeenCalledTimes(2); expect(mocks.automatic).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("2 new rows imported");
  });
  it("rejects a malformed file before storing other files in the same upload", async () => {
    await render(); await upload([{ name: "good.csv", text: async () => csv }, { name: "wrong.csv", text: async () => "wrong,header\n1,2" }]);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(container.querySelector('[role="alert"]').textContent).toContain("wrong.csv");
    expect(mocks.importSources).not.toHaveBeenCalled(); expect(mocks.automatic).not.toHaveBeenCalled();
  });
  it("does not write merely by opening the page; existing imports can be matched explicitly", async () => {
    await render(); expect(mocks.automatic).not.toHaveBeenCalled(); await click(button("Match imported statements")); expect(mocks.automatic).toHaveBeenCalledOnce();
  });
  it("counts imported rows in disjoint automatic, manual, and pending buckets", async () => {
    const s = loaded.sources[0];
    loaded.sources.push({ ...s, id: "a" }, { ...s, id: "t" }, { ...s, id: "x", kind: "excluded" });
    loaded.reviews = [{ id: "a-review", sourceIds: ["a"], sources: [{ ...s, id: "a" }], resolutionMode: "automatic", classification: "cards", currency: "EUR", total: 110, changes: [] }, { id: "t-review", sourceIds: ["t"], sources: [{ ...s, id: "t" }], resolutionMode: "automatic", classification: "transfer", currency: "EUR", total: 110, changes: [] }];
    await render();
    expect(container.querySelector('[aria-label="Reconciliation progress"]').textContent).toBe("5Imported rows3Automatically classified0Manually cleared2Need your review");
  });
});
