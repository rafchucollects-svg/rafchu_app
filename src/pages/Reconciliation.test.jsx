import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { db: {}, user: { uid: "reviewer" } },
  load: vi.fn(), finalize: vi.fn(), save: vi.fn(), getDocs: vi.fn(),
}));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => mocks.app }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), getDocs: mocks.getDocs }));
vi.mock("@/utils/reconciliationStore", () => ({ loadReconciliation: mocks.load, finalizeReconciliation: mocks.finalize, saveReconciliationDraft: mocks.save, importReconciliationSources: vi.fn() }));
import { Reconciliation } from "./Reconciliation";

let container, root;
const click = async (element) => act(async () => element.click());
const button = (text) => [...container.querySelectorAll("button")].find((element) => element.textContent === text);
const fill = async (element, value) => act(async () => {
  const proto = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
});
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  const ts = Date.parse("2026-06-15");
  mocks.load.mockResolvedValue({ sources: [{ id: "p", kind: "payment", provider: "Wise", reference: "synthetic", amount: 90, currency: "EUR", date: ts, description: "Pikachu" }], reviews: [], draft: null });
  mocks.getDocs.mockResolvedValue({ docs: [{ id: "sale", data: () => ({ type: "sale", ts, totalValue: 100, currency: "EUR", itemsOut: [{ name: "Pikachu", quantity: 1, unitPrice: 100 }] }) }] });
  mocks.finalize.mockResolvedValue("review-1");
  mocks.save.mockResolvedValue();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

describe("reconciliation review screen", () => {
  it("requires review of the proposed discount and evidence before finalization", async () => {
    await act(async () => root.render(<MemoryRouter><Reconciliation /></MemoryRouter>));
    await click(container.querySelector('input[type="checkbox"]'));
    await click(button("Use suggestion"));
    expect(button("Approve and finalize").disabled).toBe(true);
    await fill(container.querySelector('[aria-label="Final amount for Pikachu"]'), "90");
    await fill(container.querySelectorAll("textarea")[0], "Agreed discount at show");
    expect(button("Approve and finalize").disabled).toBe(true);
    await fill(container.querySelectorAll("textarea")[1], "Deal message; no receipt issued");
    expect(button("Approve and finalize").disabled).toBe(false);
    await click(button("Approve and finalize"));
    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(mocks.finalize.mock.calls[0][2]).toMatchObject({ amounts: { sale: "90" }, note: "Agreed discount at show", evidence: "Deal message; no receipt issued" });
    expect(container.textContent).toContain("Finalized and added to the accountant report");
  });
  it("keeps the draft and reports a conflicting review without claiming success", async () => {
    mocks.load.mockResolvedValueOnce({ ...(await mocks.load()), draft: { sourceIds: ["p"], transactionIds: ["sale"], amounts: { sale: "90" }, currency: "EUR", rates: {}, note: "Discount", evidence: "Reference", classification: "cards" } });
    mocks.finalize.mockRejectedValueOnce(new Error("A payment has already been finalized. Refresh before reviewing again."));
    await act(async () => root.render(<MemoryRouter><Reconciliation /></MemoryRouter>));
    await click(button("Approve and finalize"));
    expect(container.querySelector('[role="alert"]').textContent).toContain("already been finalized");
    expect(container.querySelectorAll("textarea")[0].value).toBe("Discount");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
