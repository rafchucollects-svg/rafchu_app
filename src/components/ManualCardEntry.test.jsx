import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ rates: {} }) })));
  return { search: vi.fn() };
});
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ user: { uid: "test" }, currency: "EUR" }) }));
vi.mock("@/utils/apiHelpers", () => ({ apiSearchCardsHybrid: mocks.search }));
vi.mock("./ConsignmentFields", () => ({ ConsignmentFields: () => null }));
import { ManualCardEntry } from "./ManualCardEntry";

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.search.mockReset().mockResolvedValue([]);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
afterAll(() => vi.unstubAllGlobals());
async function changeLanguage(value) {
  await act(async () => {
    const select = host.querySelector("#manual-card-language");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function button(text) {
  return [...host.querySelectorAll("button")].find(element => element.textContent.trim() === text);
}

it.each(["collector", "vendor"])("adds a manually selected Japanese card in %s mode", async mode => {
  const add = vi.fn();
  await act(async () => root.render(<ManualCardEntry initialQuery="Hungry Snorlax" mode={mode} onAddCard={add} />));
  expect(host.querySelector("#manual-card-language").value).toBe("English");
  await changeLanguage("Japanese");
  await act(async () => button(`Add to ${mode === "vendor" ? "Inventory" : "Collection"}`).click());
  expect(add).toHaveBeenCalledWith(expect.objectContaining({
    name: "Hungry Snorlax", language: "Japanese", isJapanese: true, isManualEntry: true,
  }), { fromSuggestion: false, isManual: true });
  expect(mocks.search).toHaveBeenLastCalledWith("Hungry Snorlax", expect.objectContaining({ languageScope: "japanese" }));
});

it("clears the Japanese flag when the user chooses English again", async () => {
  const add = vi.fn();
  await act(async () => root.render(<ManualCardEntry initialQuery="Snorlax" onAddCard={add} />));
  await changeLanguage("Japanese");
  await changeLanguage("English");
  await act(async () => button("Add to Collection").click());
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ language: "English", isJapanese: false }), expect.anything());
  expect(mocks.search).toHaveBeenLastCalledWith("Snorlax", expect.objectContaining({ languageScope: "english" }));
});

it("clears previous-language suggestions while the selected-language lookup is pending", async () => {
  const english = { id: "en", name: "Snorlax English", set: "English set", number: "1", language: "English", isJapanese: false };
  const japanese = { id: "jp", name: "Snorlax Japanese", set: "Japanese set", number: "2", language: "Japanese", isJapanese: true };
  let resolveJapanese;
  mocks.search.mockImplementation((_query, options) => options.languageScope === "english"
    ? Promise.resolve([english])
    : new Promise(resolve => { resolveJapanese = resolve; }));
  const add = vi.fn();
  await act(async () => root.render(<ManualCardEntry initialQuery="Snorlax" onAddCard={add} />));
  expect(host.textContent).toContain("Snorlax English");
  await changeLanguage("Japanese");
  expect(host.textContent).not.toContain("Snorlax English");
  expect(host.textContent).toContain("Checking for similar cards");
  await act(async () => resolveJapanese([japanese]));
  expect(host.textContent).toContain("Snorlax Japanese");
  await act(async () => button("Add").click());
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "jp", language: "Japanese", isJapanese: true }), { fromSuggestion: true });
});

it("ignores a previous-language response that finishes after the new lookup", async () => {
  let resolveEnglish;
  const japanese = { id: "jp", name: "Snorlax Japanese", language: "Japanese", isJapanese: true };
  mocks.search.mockImplementation((_query, options) => options.languageScope === "english"
    ? new Promise(resolve => { resolveEnglish = resolve; })
    : Promise.resolve([japanese]));
  await act(async () => root.render(<ManualCardEntry initialQuery="Snorlax" />));
  await changeLanguage("Japanese");
  await act(async () => resolveEnglish([{ id: "en", name: "Snorlax English", language: "English" }]));
  expect(host.textContent).toContain("Snorlax Japanese");
  expect(host.textContent).not.toContain("Snorlax English");
});
