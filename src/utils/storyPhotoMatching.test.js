import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./cardHelpers", () => ({
  convertCurrency: vi.fn((amount, target, source) => {
    const rates = { USD: 1, EUR: 0.8, GBP: 0.5 };
    return (amount / rates[source]) * rates[target];
  }),
  computeItemMetrics: vi.fn(
    (item) =>
      item.testMetrics || { suggested: 0, tcg: 0, cmAvg: 0, cmLowest: 0 },
  ),
}));

import { computeItemMetrics, convertCurrency } from "./cardHelpers";
import {
  formatStoryPrice,
  getInventoryKey,
  getStoryPrice,
  matchPhotoCard,
  parseStoryPrice,
} from "./storyPhotoMatching";

const inventoryCard = (changes = {}) => ({
  entryId: "pikachu-nm",
  cardId: "base-58",
  name: "Pikachu",
  number: "58/102",
  set: "Base Set",
  condition: "NM",
  isGraded: false,
  language: "English",
  quantity: 1,
  overridePrice: 12.75,
  overridePriceCurrency: "EUR",
  ...changes,
});
const scannedCard = (changes = {}) => ({
  name: "Pikachu",
  collectorNumber: "58/102",
  setName: "Base Set",
  isGraded: false,
  language: "English",
  ...changes,
});

beforeEach(() => vi.clearAllMocks());

describe("story prices", () => {
  it("accepts decimal comma and point without interpreting thousands separators", () => {
    expect(parseStoryPrice(" 12,75 ")).toBe(12.75);
    expect(parseStoryPrice("12.75")).toBe(12.75);
    expect(parseStoryPrice(12.75)).toBe(12.75);
    for (const value of [
      "1,234",
      "1,234.56",
      "1.234,56",
      "12 EUR",
      "1e3",
      "12.345",
      "",
      " ",
      "-2",
      "0",
      null,
      undefined,
      true,
      [],
      {},
      NaN,
      Infinity,
      -1,
      0,
      1e12,
    ]) {
      expect(parseStoryPrice(value), String(value)).toBeNull();
    }
  });

  it("preserves cents in the displayed price instead of rounding to whole currency", () => {
    expect(formatStoryPrice(12.75, "EUR")).toContain("12.75");
    expect(formatStoryPrice(12.5, "USD")).toContain("12.50");
    expect(formatStoryPrice(12.75, "ISK")).toContain("12.75");
    expect(formatStoryPrice(null, "EUR")).toBe("—");
  });

  it("uses the inventory override over a graded or market price and converts its currency", () => {
    expect(
      getStoryPrice(
        inventoryCard({
          isGraded: true,
          gradedPrice: 900,
          overridePrice: "12,75",
          overridePriceCurrency: "USD",
        }),
        "EUR",
      ),
    ).toBeCloseTo(10.2);
    expect(convertCurrency).toHaveBeenCalledWith(12.75, "EUR", "USD");
    expect(computeItemMetrics).not.toHaveBeenCalled();
  });

  it("follows the inventory graded-price precedence and USD default", () => {
    expect(
      getStoryPrice(
        inventoryCard({
          overridePrice: null,
          isGraded: true,
          gradedPrice: 100,
          manualPrice: 20,
        }),
        "EUR",
      ),
    ).toBe(80);
    expect(
      getStoryPrice(
        inventoryCard({
          overridePrice: null,
          isGraded: true,
          gradedPrice: 100,
          gradedPriceCurrency: "GBP",
        }),
        "EUR",
      ),
    ).toBe(160);
  });

  it("converts manual prices and preserves implicit user-currency overrides", () => {
    expect(
      getStoryPrice(
        inventoryCard({
          overridePrice: null,
          manualPrice: "20.50",
          manualPriceCurrency: "USD",
        }),
        "EUR",
      ),
    ).toBeCloseTo(16.4);
    expect(
      getStoryPrice(inventoryCard({ overridePriceCurrency: null }), "EUR"),
    ).toBe(12.75);
    expect(
      getStoryPrice(
        inventoryCard({ overridePrice: null, customPrice: 22.5 }),
        "EUR",
      ),
    ).toBe(22.5);
  });

  it("uses the same seller ask as the inventory and only rounds when requested", () => {
    const item = inventoryCard({
      overridePrice: null,
      testMetrics: { suggested: 15.25, tcg: 10, cmAvg: 12 },
    });
    expect(getStoryPrice(item, "EUR")).toBe(15.25);
    expect(getStoryPrice(item, "EUR", true)).toBe(16);
    expect(computeItemMetrics).toHaveBeenCalledWith(item, "EUR");
  });

  it("uses the preferred source only when no inventory seller ask is available", () => {
    const item = inventoryCard({
      overridePrice: null,
      testMetrics: { suggested: 0, tcg: 10, cmAvg: 12.5 },
    });
    expect(getStoryPrice(item, "EUR", false, "cardmarket")).toBe(12.5);
    expect(getStoryPrice(item, "EUR", false, "tcgplayer")).toBe(10);
  });

  it("does not turn unavailable prices or invalid explicit overrides into zero or another price", () => {
    for (const overridePrice of [0, "bad", Infinity, -20]) {
      expect(
        getStoryPrice(
          inventoryCard({
            overridePrice,
            gradedPrice: 300,
            testMetrics: { suggested: 50 },
          }),
          "EUR",
        ),
      ).toBeNull();
    }
    expect(
      getStoryPrice(inventoryCard({ overridePrice: null }), "EUR"),
    ).toBeNull();
    expect(getStoryPrice(null, "EUR")).toBeNull();
    expect(
      getStoryPrice(
        inventoryCard({
          overridePrice: null,
          isGraded: true,
          gradedPrice: null,
          testMetrics: { suggested: 25 },
        }),
        "EUR",
      ),
    ).toBeNull();
  });
});

describe("inventory entry identity", () => {
  it("prefers the inventory entry ID and keeps copies sharing a catalog ID distinct", () => {
    expect(getInventoryKey(inventoryCard())).toBe("pikachu-nm");
    const item = inventoryCard({ entryId: null });
    expect(getInventoryKey(item, 0)).not.toBe(getInventoryKey(item, 1));
    expect(getInventoryKey(item, 0)).not.toBe(
      getInventoryKey({ ...item, condition: "LP" }, 0),
    );
  });
});

describe("photo card matching", () => {
  it("matches a unique card using name, number, set and compatible details", () => {
    const item = inventoryCard();
    const result = matchPhotoCard(
      scannedCard({
        name: " PIKACHU ",
        collectorNumber: "#058 / 102",
        language: "en",
      }),
      [item],
      { currency: "EUR" },
    );
    expect(result).toMatchObject({ item, confident: true, price: 12.75 });
    expect(result.candidates[0]).toMatchObject({ item, price: 12.75 });
  });

  it("permits a missing printed denominator when the set identifies the printing", () => {
    expect(
      matchPhotoCard(scannedCard({ collectorNumber: "58" }), [inventoryCard()])
        .confident,
    ).toBe(true);
  });

  it("keeps low-confidence scans for review even when the suggested identity exists", () => {
    const result = matchPhotoCard(scannedCard({ confidence: 0.4 }), [
      inventoryCard(),
    ]);
    expect(result).toMatchObject({ item: null, price: null, confident: false });
    expect(result.candidates).toHaveLength(1);
  });

  it.each(["KR", "CN"])(
    "recognizes the scanner language code %s",
    (language) => {
      const item = inventoryCard({
        language: language === "KR" ? "Korean" : "Chinese",
      });
      expect(matchPhotoCard(scannedCard({ language }), [item]).item).toBe(item);
      expect(
        matchPhotoCard(scannedCard({ language }), [inventoryCard()]).item,
      ).toBeNull();
    },
  );

  it.each([
    null,
    undefined,
    true,
    false,
    "0.99",
    "",
    [],
    {},
    NaN,
    Infinity,
    -1,
    1.1,
  ])("requires review for malformed supplied confidence %j", (confidence) => {
    expect(
      matchPhotoCard(scannedCard({ confidence }), [inventoryCard()]),
    ).toMatchObject({ item: null, price: null, confident: false });
  });

  it("requires review when a supposedly raw card also has a grade or grading company", () => {
    expect(
      matchPhotoCard(scannedCard({ grade: "9", gradingCompany: "PSA" }), [
        inventoryCard({ grade: "9", gradingCompany: "PSA" }),
      ]),
    ).toMatchObject({ item: null, price: null, confident: false });
  });

  it("preserves numbered subset prefixes and refuses a contradictory denominator", () => {
    expect(
      matchPhotoCard(scannedCard({ collectorNumber: "TG58" }), [
        inventoryCard(),
      ]).item,
    ).toBeNull();
    expect(
      matchPhotoCard(scannedCard({ collectorNumber: "58/120" }), [
        inventoryCard(),
      ]).item,
    ).toBeNull();
  });

  it.each([
    [{ name: "Pikachu V" }, {}],
    [{ setName: "Jungle" }, {}],
    [{ language: "Japanese" }, {}],
    [{ isGraded: true, grade: "10", gradingCompany: "PSA" }, {}],
    [
      { isGraded: false },
      { isGraded: true, grade: "10", gradingCompany: "PSA" },
    ],
    [{ condition: "LP" }, {}],
    [{ variant: "Reverse Holo" }, { variant: "Holo" }],
  ])(
    "does not auto-price a contradictory identity (%j)",
    (scanChanges, itemChanges) => {
      expect(
        matchPhotoCard(scannedCard(scanChanges), [inventoryCard(itemChanges)]),
      ).toMatchObject({ item: null, price: null, confident: false });
    },
  );

  it("never chooses arbitrarily between different conditions or variants", () => {
    const nm = inventoryCard();
    const lp = inventoryCard({
      entryId: "lp",
      condition: "LP",
      overridePrice: 9,
    });
    expect(matchPhotoCard(scannedCard(), [nm, lp])).toMatchObject({
      item: null,
      price: null,
      confident: false,
    });
    expect(
      matchPhotoCard(scannedCard({ condition: "Near Mint" }), [nm, lp]).item,
    ).toBe(nm);
    const holo = inventoryCard({ entryId: "holo", variant: "Holo" });
    const reverse = inventoryCard({
      entryId: "reverse",
      variant: "Reverse Holo",
    });
    expect(matchPhotoCard(scannedCard(), [holo, reverse]).item).toBeNull();
    expect(
      matchPhotoCard(scannedCard({ variant: "Holo" }), [holo, reverse]).item,
    ).toBe(holo);
  });

  it("still requires review for separate identical entries", () => {
    expect(
      matchPhotoCard(scannedCard(), [
        inventoryCard(),
        inventoryCard({ entryId: "copy" }),
      ]).item,
    ).toBeNull();
  });

  it("uses grade and grading company to distinguish slabs", () => {
    const psa9 = inventoryCard({
      entryId: "psa9",
      isGraded: true,
      grade: "9",
      gradingCompany: "PSA",
    });
    const psa10 = inventoryCard({
      entryId: "psa10",
      isGraded: true,
      grade: "10",
      gradingCompany: "PSA",
    });
    const bgs10 = inventoryCard({
      entryId: "bgs10",
      isGraded: true,
      grade: "10",
      gradingCompany: "BGS",
    });
    const scan = scannedCard({
      isGraded: true,
      grade: "10.0",
      gradingCompany: "PSA",
    });
    expect(matchPhotoCard(scan, [psa9, psa10, bgs10]).item).toBe(psa10);
    expect(
      matchPhotoCard({ ...scan, grade: "8" }, [psa9, psa10]).item,
    ).toBeNull();
    expect(
      matchPhotoCard({ ...scan, gradingCompany: "CGC" }, [psa10]).item,
    ).toBeNull();
    expect(
      matchPhotoCard({ ...scan, gradingCompany: "" }, [psa10]).item,
    ).toBeNull();
  });

  it("retains useful candidates without auto-matching when the scan lacks key details", () => {
    for (const changes of [
      { collectorNumber: "" },
      { name: "" },
      { setName: "" },
      { isGraded: undefined },
    ]) {
      const result = matchPhotoCard(scannedCard(changes), [inventoryCard()]);
      expect(result).toMatchObject({
        item: null,
        price: null,
        confident: false,
      });
      expect(result.candidates).toHaveLength(1);
    }
  });

  it("requires review when detected details cannot be verified from the inventory", () => {
    expect(
      matchPhotoCard(scannedCard({ language: "Japanese" }), [
        inventoryCard({ language: null }),
      ]).item,
    ).toBeNull();
    expect(
      matchPhotoCard(scannedCard({ variant: "Reverse Holo" }), [
        inventoryCard(),
      ]).item,
    ).toBeNull();
  });

  it("filters hidden and out-of-stock entries before deciding whether a match is unique", () => {
    const available = inventoryCard();
    const others = [
      inventoryCard({ entryId: "hidden", excludeFromSale: true }),
      inventoryCard({ entryId: "sold", quantity: 0 }),
      inventoryCard({ entryId: "sold-string", quantity: "0" }),
      inventoryCard({ entryId: "invalid-qty", quantity: -1 }),
    ];
    const result = matchPhotoCard(scannedCard(), [available, ...others]);
    expect(result.item).toBe(available);
    expect(result.candidates).toHaveLength(1);
    expect(matchPhotoCard(scannedCard(), others).candidates).toHaveLength(0);
  });

  it("matches identity without inventing a price when market data is unavailable", () => {
    const item = inventoryCard({ overridePrice: null });
    expect(matchPhotoCard(scannedCard(), [item])).toMatchObject({
      item,
      confident: true,
      price: null,
    });
  });

  it("returns an empty safe result for malformed or unrelated input", () => {
    expect(matchPhotoCard(null, null)).toMatchObject({
      item: null,
      price: null,
      candidates: [],
      confident: false,
    });
    expect(
      matchPhotoCard(scannedCard(), [
        inventoryCard({ name: "Charizard", number: "4" }),
      ]).candidates,
    ).toHaveLength(0);
  });
});
