import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: {},
  getDoc: vi.fn(),
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  convertCurrency: vi.fn((amount, target, source) => {
    if (source === "USD" && target === "EUR") return Number(amount) * 0.9;
    return Number(amount);
  }),
}));

vi.mock("@/contexts/AppContext", () => ({ useApp: () => mocks.context }));
vi.mock("firebase/firestore", () => ({ getDoc: mocks.getDoc, doc: mocks.doc }));
vi.mock("@/components/LoginModal", () => ({ LoginModal: () => null }));
vi.mock("@/utils/cardHelpers", () => ({
  computeItemMetrics: (item) => ({ suggested: item.suggestedPrice || 0 }),
  convertCurrency: mocks.convertCurrency,
  formatCurrency: (amount, currency) => `${currency} ${Number(amount).toFixed(2)}`,
  getConditionColorClass: () => "",
  getConditionDisplayLabel: (condition) => condition,
}));

import { SharedInventory } from "./SharedInventory";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const snapshot = (data) => ({ exists: () => data !== null, data: () => data });
const inventory = () => [
  { entryId: "pikachu", name: "Alpha Pikachu", set: "Base Set", number: "25", quantity: 2, overridePrice: 9, overridePriceCurrency: "USD", addedAt: NOW - DAY, image: "/pikachu.png", condition: "NM" },
  { entryId: "charizard", name: "Beta Charizard", set: "Base Set", number: "4", quantity: 1, isGraded: true, gradingCompany: "PSA", grade: "10", gradedPrice: 15, gradedPriceCurrency: "USD", addedAt: NOW - 30 * DAY, image: "/charizard.png" },
  { entryId: "eevee", name: "Gamma Eevee", set: "Jungle", number: "51", quantity: 3, suggestedPrice: 6.2, addedAt: NOW - 5 * DAY, image: "/eevee.png", condition: "NM" },
  { entryId: "mewtwo", name: "Delta Mewtwo", set: "Base Set", number: "10", quantity: 1, suggestedPrice: 10.2, addedAt: NOW - 20 * DAY, image: "/mewtwo.png", condition: "NM" },
  { entryId: "excluded", name: "Private Lugia", set: "Neo Genesis", quantity: 4, excludeFromSale: true, suggestedPrice: 100, image: "/lugia.png" },
];

let host;
let root;
let publicInventory;
let navigate;

function RouterHarness() {
  navigate = useNavigate();
  return <SharedInventory />;
}

const render = (entry = "/?inventory=seller-123") => act(async () => {
  root.render(<MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RouterHarness /></MemoryRouter>);
});

const normalize = (text) => text.replace(/\s+/g, " ").trim();
const namedControl = (name) => {
  const direct = host.querySelector(`[aria-label="${name}"]`);
  if (direct) return direct;
  const label = [...host.querySelectorAll("label")].find((element) => normalize(element.textContent) === name);
  const control = label?.control || label?.querySelector("input,select");
  expect(control, `Expected an accessible control named ${name}`).toBeTruthy();
  return control;
};
const select = (name, value) => act(async () => {
  const control = namedControl(name);
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
});
const search = (value) => act(async () => {
  const control = namedControl("Search cards");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
});
const click = (name) => act(async () => {
  const button = [...host.querySelectorAll("button")].find((element) => normalize(element.textContent) === name);
  expect(button, `Expected a button named ${name}`).toBeTruthy();
  button.click();
});
const cardNames = () => [...host.querySelectorAll("article h3")].map((element) => normalize(element.textContent));
const statistic = (name) => {
  const label = [...host.querySelectorAll("dt,span,p")].find((element) => normalize(element.textContent) === name);
  expect(label, `Expected statistic ${name}`).toBeTruthy();
  const value = label.tagName === "DT" ? label.parentElement.querySelector("dd") : label.nextElementSibling;
  expect(value, `Expected a value for statistic ${name}`).toBeTruthy();
  return normalize(value.textContent);
};
const expectInventoryStats = () => {
  expect(statistic("Cards available")).toBe("7");
  expect(statistic("Graded")).toBe("1");
  expect(statistic("Added in 14 days")).toBe("5");
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  publicInventory = { shareEnabled: true, shareUsername: "North Star Cards", roundUp: true, items: inventory() };
  mocks.context = {
    db: {},
    user: null,
    currency: "EUR",
    loginModalOpen: false,
    setLoginModalOpen: vi.fn(),
    communityImages: {},
    getImageForCard: vi.fn(() => null),
    refreshCommunityImages: vi.fn().mockResolvedValue(),
  };
  mocks.getDoc.mockImplementation(async (reference) => {
    if (reference.collection === "public_profiles") return snapshot({ username: "Profile Name", country: "Finland" });
    if (reference.collection === "public_inventories") return snapshot(publicInventory);
    throw new Error(`Unexpected private data read: ${reference.collection}`);
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

describe("shared inventory browsing", () => {
  it("loads the public projection, respects sale exclusions, and removes the total value", async () => {
    await render();

    expect(mocks.getDoc.mock.calls.map(([reference]) => reference)).toEqual([
      { collection: "public_profiles", id: "seller-123" },
      { collection: "public_inventories", id: "seller-123" },
    ]);
    expect(host.textContent).toContain("North Star Cards");
    expect(host.textContent).toContain("Cards for sale");
    expect(host.querySelector("h2")?.textContent).toContain("Browse cards");
    expect(cardNames()).toEqual(["Alpha Pikachu", "Beta Charizard", "Delta Mewtwo", "Gamma Eevee"]);
    expect(host.textContent).not.toContain("Private Lugia");
    expect(host.textContent).not.toMatch(/total (?:inventory )?value/i);
    expectInventoryStats();
  });

  it("keeps full-inventory stats stable while searching and filtering", async () => {
    await render();
    await search("Pikachu");
    expect(cardNames()).toEqual(["Alpha Pikachu"]);
    expectInventoryStats();

    await search("");
    await select("Card type", "graded");
    expect(cardNames()).toEqual(["Beta Charizard"]);
    expectInventoryStats();
    await select("Card type", "ungraded");
    expect(cardNames()).toEqual(["Alpha Pikachu", "Delta Mewtwo", "Gamma Eevee"]);
    expectInventoryStats();
  });

  it("trims search text and clears both search and card-type filters", async () => {
    await render();
    await search("  pIKachu  ");
    expect(cardNames()).toEqual(["Alpha Pikachu"]);
    await select("Card type", "graded");
    expect(cardNames()).toEqual([]);
    expect(host.textContent).toContain("No matching cards");

    await click("Clear filters");
    expect(namedControl("Search cards").value).toBe("");
    expect(namedControl("Card type").value).toBe("all");
    expect(cardNames()).toHaveLength(4);
    expectInventoryStats();
  });

  it("lets visitors browse seller-priced cards", async () => {
    await render();
    expect([...namedControl("Card type").options].find((option) => option.value === "manualPrice")?.textContent).toBe("Seller-priced");
    await select("Card type", "manualPrice");
    expect(cardNames()).toEqual(["Alpha Pikachu"]);
    expectInventoryStats();
  });

  it("sorts both price directions using the same converted and rounded selling prices", async () => {
    await render();
    await select("Sort by", "priceAsc");
    expect(cardNames()).toEqual(["Gamma Eevee", "Alpha Pikachu", "Delta Mewtwo", "Beta Charizard"]);
    const prices = [...host.querySelectorAll("article h3")].map((heading) => {
      const card = heading.closest("article");
      return card.textContent.match(/EUR \d+\.\d{2}/)?.[0];
    });
    expect(prices).toEqual(["EUR 7.00", "EUR 9.00", "EUR 11.00", "EUR 14.00"]);
    expect(mocks.convertCurrency).toHaveBeenCalledWith(9, "EUR", "USD");
    expect(mocks.convertCurrency).toHaveBeenCalledWith(15, "EUR", "USD");

    await select("Sort by", "price");
    expect(cardNames()).toEqual(["Beta Charizard", "Delta Mewtwo", "Alpha Pikachu", "Gamma Eevee"]);
  });

  it.each([
    ["missing", null],
    ["disabled", { shareEnabled: false, items: inventory() }],
  ])("shows an unavailable state for a %s inventory", async (_reason, data) => {
    publicInventory = data;
    await render();
    expect(host.textContent).toMatch(/inventory (?:is )?(?:not available|unavailable)/i);
    expect(cardNames()).toEqual([]);
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).not.toContain("Private Lugia");
  });

  it("distinguishes an empty shared inventory from unavailable sharing", async () => {
    publicInventory.items = [];
    await render();
    expect(host.textContent).toContain("North Star Cards");
    expect(host.textContent).toMatch(/no cards|empty/i);
    expect(host.textContent).not.toMatch(/inventory (?:is )?(?:not available|unavailable)/i);
    expect(cardNames()).toEqual([]);
  });

  it("retries a transient public data failure and shows the inventory after recovery", async () => {
    const error = new Error("Connection unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getDoc.mockRejectedValueOnce(error);
    await render();
    expect(host.textContent).toContain("Inventory could not be loaded");
    expect(cardNames()).toEqual([]);
    expect(log).toHaveBeenCalledWith("Failed to load shared inventory:", error);

    await click("Try again");
    expect(cardNames()).toHaveLength(4);
    expect(host.textContent).toContain("North Star Cards");
    expect(host.textContent).not.toContain("Inventory could not be loaded");
    expect(mocks.getDoc).toHaveBeenCalledTimes(4);
  });

  it("opens the login modal from the seller's Sign in action", async () => {
    await render();
    await click("Sign in");
    expect(mocks.context.setLoginModalOpen).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("keeps a card readable when its image is absent or fails to load", async () => {
    publicInventory.items[0].image = "";
    await render();
    const pikachu = [...host.querySelectorAll("article")].find((card) => card.textContent.includes("Alpha Pikachu"));
    expect(pikachu.textContent).toContain("Image unavailable");
    expect(pikachu.textContent).toContain("EUR 9.00");

    const charizard = [...host.querySelectorAll("article")].find((card) => card.textContent.includes("Beta Charizard"));
    await act(async () => charizard.querySelector("img").dispatchEvent(new Event("error")));
    expect(charizard.querySelector("img")).toBeNull();
    expect(charizard.textContent).toContain("Image unavailable");
    expect(charizard.textContent).toContain("PSA 10");
    expect(charizard.textContent).toContain("EUR 14.00");
  });

  it("ignores an older inventory response after navigating to another seller", async () => {
    let finishOldInventory;
    const oldInventory = publicInventory;
    const newInventory = { shareEnabled: true, shareUsername: "Second Seller", items: [{ ...inventory()[2], name: "Second seller Eevee", quantity: 1 }] };
    mocks.getDoc.mockImplementation(async (reference) => {
      if (reference.collection === "public_profiles") return snapshot({ username: "Profile Name" });
      if (reference.id === "seller-123") return new Promise((resolve) => { finishOldInventory = resolve; });
      return snapshot(newInventory);
    });
    await render();
    expect(host.textContent).toContain("Loading inventory");

    await act(async () => navigate("/?inventory=second-seller"));
    expect(host.textContent).toContain("Second Seller");
    expect(cardNames()).toEqual(["Second seller Eevee"]);

    await act(async () => finishOldInventory(snapshot(oldInventory)));
    expect(host.textContent).toContain("Second Seller");
    expect(host.textContent).not.toContain("North Star Cards");
    expect(cardNames()).toEqual(["Second seller Eevee"]);
    expect(statistic("Cards available")).toBe("1");
  });
});
