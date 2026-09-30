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
  isStoryGraded,
  matchPhotoCard,
  parseStoryPrice,
  roundStoryPrice,
} from "./storyPhotoMatching";

const card = (changes = {}) => ({
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
const scan = (changes = {}) => ({
  name: "Pikachu",
  collectorNumber: "58/102",
  setName: "Base Set",
  isGraded: false,
  language: "English",
  ...changes,
});
const slab = (changes = {}) =>
  card({ isGraded: true, grade: "10", gradingCompany: "PSA", ...changes });
const slabScan = (changes = {}) =>
  scan({ isGraded: true, grade: "10", gradingCompany: "PSA", ...changes });
beforeEach(() => vi.clearAllMocks());

describe("whole story prices", () => {
  it("parses decimal prices from manual input and legacy drafts", () => {
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
      expect(roundStoryPrice(value), String(value)).toBeNull();
    }
  });
  it("rounds to the nearest whole price or up when requested, never showing zero", () => {
    expect(roundStoryPrice(12.49)).toBe(12);
    expect(roundStoryPrice("12,50")).toBe(13);
    expect(roundStoryPrice(12.01, true)).toBe(13);
    expect(roundStoryPrice(12, true)).toBe(12);
    expect(roundStoryPrice(0.01)).toBe(1);
    expect(roundStoryPrice(1e9)).toBe(1e9);
  });
  it("formats whole amounts without decimals, including the fallback", () => {
    for (const currency of ["EUR", "USD", "ISK"])
      expect(formatStoryPrice(12.75, currency)).toBe(
        new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(13),
      );
    expect(formatStoryPrice(0.01, "EUR")).toContain("1");
    expect(formatStoryPrice(12.75, "invalid-currency")).toBe(
      "invalid-currency 13",
    );
    expect(formatStoryPrice(null, "EUR")).toBe("—");
  });
  it("converts overrides before rounding and before slab or market prices", () => {
    const item = slab({
      gradedPrice: 900,
      overridePrice: "12,75",
      overridePriceCurrency: "USD",
    });
    expect(getStoryPrice(item, "EUR")).toBe(10);
    expect(getStoryPrice(item, "EUR", true)).toBe(11);
    expect(convertCurrency).toHaveBeenCalledWith(12.75, "EUR", "USD");
    expect(computeItemMetrics).not.toHaveBeenCalled();
  });
  it("uses inventory graded-price precedence and USD defaults for inferred slabs too", () => {
    expect(
      getStoryPrice(
        slab({ overridePrice: null, gradedPrice: 100, manualPrice: 20 }),
        "EUR",
      ),
    ).toBe(80);
    expect(
      getStoryPrice(
        slab({
          overridePrice: null,
          gradedPrice: 100,
          gradedPriceCurrency: "GBP",
        }),
        "EUR",
      ),
    ).toBe(160);
    expect(
      getStoryPrice(
        slab({ isGraded: false, overridePrice: null, gradedPrice: 100 }),
        "EUR",
      ),
    ).toBe(80);
  });
  it("converts manual prices and respects implicitly stored user currencies", () => {
    expect(
      getStoryPrice(
        card({
          overridePrice: null,
          manualPrice: "20.50",
          manualPriceCurrency: "USD",
        }),
        "EUR",
      ),
    ).toBe(16);
    expect(getStoryPrice(card({ overridePriceCurrency: null }), "EUR")).toBe(
      13,
    );
    expect(
      getStoryPrice(card({ overridePrice: null, customPrice: 22.5 }), "EUR"),
    ).toBe(23);
  });
  it("rounds the inventory seller ask and uses market fallback only if unavailable", () => {
    const item = card({
      overridePrice: null,
      testMetrics: { suggested: 15.25, tcg: 10, cmAvg: 12 },
    });
    expect(getStoryPrice(item, "EUR")).toBe(15);
    expect(getStoryPrice(item, "EUR", true)).toBe(16);
    expect(computeItemMetrics).toHaveBeenCalledWith(item, "EUR");
    const fallback = {
      ...item,
      testMetrics: { suggested: 0, tcg: 10, cmAvg: 12.5 },
    };
    expect(getStoryPrice(fallback, "EUR", false, "cardmarket")).toBe(13);
    expect(getStoryPrice(fallback, "EUR", false, "tcgplayer")).toBe(10);
  });
  it("leaves unknown prices empty and never substitutes a raw price for a slab", () => {
    for (const overridePrice of [0, "bad", Infinity, -20])
      expect(
        getStoryPrice(
          card({ overridePrice, testMetrics: { suggested: 50 } }),
          "EUR",
        ),
      ).toBeNull();
    expect(getStoryPrice(card({ overridePrice: null }), "EUR")).toBeNull();
    expect(getStoryPrice(null, "EUR")).toBeNull();
    expect(
      getStoryPrice(
        slab({
          isGraded: false,
          overridePrice: null,
          gradedPrice: null,
          testMetrics: { suggested: 25 },
        }),
        "EUR",
      ),
    ).toBeNull();
  });
});

describe("inventory identity and slab detection", () => {
  it("prefers entry IDs and keeps copies sharing catalog IDs distinct", () => {
    expect(getInventoryKey(card())).toBe("pikachu-nm");
    const item = card({ entryId: null });
    expect(getInventoryKey(item, 0)).not.toBe(getInventoryKey(item, 1));
    expect(getInventoryKey(item, 0)).not.toBe(
      getInventoryKey({ ...item, condition: "LP" }, 0),
    );
  });
  it("identifies slab metadata even without a correct boolean flag", () => {
    for (const item of [
      slab(),
      { grade: "9" },
      { isGraded: false, gradingCompany: "PSA" },
      { isGraded: true },
    ])
      expect(isStoryGraded(item)).toBe(true);
    for (const item of [
      null,
      {},
      { condition: "NM" },
      { grade: null, gradingCompany: "" },
      { grade: "N/A", gradingCompany: "Unknown" },
      { grade: "Raw", gradingCompany: "Ungraded" },
    ])
      expect(isStoryGraded(item)).toBe(false);
  });
});

describe("automatic inventory pricing", () => {
  it("applies a whole inventory price to a unique exact match", () => {
    const item = card();
    const result = matchPhotoCard(
      scan({
        name: " PIKACHU ",
        collectorNumber: "#058 / 102",
        language: "en",
      }),
      [item],
    );
    expect(result).toMatchObject({ item, confident: true, price: 13 });
    expect(result.candidates[0]).toMatchObject({ item, price: 13 });
    expect(result.reason).toContain("Applied");
  });
  it("automatically prices clear slabs without requiring a readable set or language", () => {
    const item = slab({
      name: "Mew",
      number: "151",
      set: "CoroCoro Comics",
      language: "Japanese",
      overridePrice: 280.49,
    });
    const detected = slabScan({
      name: "Mew",
      collectorNumber: "#151",
      setName: null,
      language: null,
      grade: "10.0",
      confidence: 0.97,
    });
    expect(matchPhotoCard(detected, [item])).toMatchObject({
      item,
      price: 280,
      confident: true,
    });
  });
  it("uses slab metadata when old inventory or scan flags are false", () => {
    const item = slab({ isGraded: false, overridePrice: 85.5 });
    expect(matchPhotoCard(slabScan({ isGraded: false }), [item])).toMatchObject(
      { item, price: 86 },
    );
    expect(
      matchPhotoCard(
        slabScan({ gradingCompany: "Professional Sports Authenticator" }),
        [item],
      ).item,
    ).toBe(item);
  });
  it.each([
    0.4,
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
  ])(
    "applies a useful price even with low or malformed scan confidence %j",
    (confidence) => {
      const item = card();
      expect(matchPhotoCard(scan({ confidence }), [item])).toMatchObject({
        item,
        price: 13,
        confident: false,
      });
    },
  );
  it("applies prices despite missing set, language, company or raw/slab scanner flags", () => {
    const item = card();
    for (const changes of [
      { setName: null },
      { language: null },
      { isGraded: undefined },
    ])
      expect(matchPhotoCard(scan(changes), [item])).toMatchObject({
        item,
        price: 13,
      });
    const graded = slab();
    expect(
      matchPhotoCard(slabScan({ gradingCompany: null }), [graded]),
    ).toMatchObject({ item: graded, price: 13, confident: false });
  });
  it("uses exact name plus set when the collector number could not be read", () => {
    const item = card();
    expect(
      matchPhotoCard(scan({ collectorNumber: null }), [item]),
    ).toMatchObject({ item, price: 13, confident: false });
    expect(
      matchPhotoCard(scan({ collectorNumber: null, setName: null }), [item]),
    ).toMatchObject({ item: null, price: null });
  });
  it("uses partial and OCR names with a matching collector number", () => {
    const item = card({ name: "Charizard ex", number: "006/165" });
    for (const name of ["Charizard", "Charzard ex", "Charizardex"])
      expect(
        matchPhotoCard(scan({ name, collectorNumber: "6/165" }), [item]),
      ).toMatchObject({ item, price: 13 });
    expect(
      matchPhotoCard(scan({ name: "Charzard ex", collectorNumber: null }), [
        item,
      ]).item,
    ).toBeNull();
  });
  it("does not use unrelated cards just because their number matches", () => {
    for (const name of [null, "Charizard", "Mewtwo", "Unknown Card", "Pokemon"])
      expect(matchPhotoCard(scan({ name }), [card()])).toMatchObject({
        item: null,
        price: null,
      });
    expect(
      matchPhotoCard(scan({ name: "Mew" }), [card({ name: "Mewtwo" })]).item,
    ).toBeNull();
  });
  it("ranks a plausible OCR match above unrelated names sharing a number", () => {
    const likely = card({
      name: "Pikachu ex",
      set: "Different set",
      language: "Japanese",
    });
    const unrelated = card({ entryId: "unrelated", name: "Charizard" });
    const result = matchPhotoCard(scan(), [unrelated, likely]);
    expect(result.item).toBe(likely);
    expect(result.candidates[0].item).toBe(likely);
  });
  it("preserves number prefixes and refuses different or malformed denominators", () => {
    expect(
      matchPhotoCard(scan({ collectorNumber: "58" }), [card()]).price,
    ).toBe(13);
    for (const collectorNumber of ["TG58", "58/120", "58/102/100", "59"])
      expect(matchPhotoCard(scan({ collectorNumber }), [card()])).toMatchObject(
        { item: null, price: null },
      );
  });
  it.each([
    [{ isGraded: true, grade: "10", gradingCompany: "PSA" }, {}],
    [
      { isGraded: false },
      { isGraded: true, grade: "10", gradingCompany: "PSA" },
    ],
    [
      { isGraded: true, grade: "9", gradingCompany: "PSA" },
      { isGraded: true, grade: "10", gradingCompany: "PSA" },
    ],
    [
      { isGraded: true, grade: "10", gradingCompany: "CGC" },
      { isGraded: true, grade: "10", gradingCompany: "PSA" },
    ],
  ])(
    "rejects explicit grade, grader or raw/slab incompatibility (%j)",
    (scanChanges, itemChanges) => {
      expect(
        matchPhotoCard(scan(scanChanges), [card(itemChanges)]),
      ).toMatchObject({ item: null, price: null, confident: false });
    },
  );
  it("selects the right slab among raw cards, other grades and other graders", () => {
    const target = slab({ entryId: "psa10", overridePrice: 99.75 });
    const alternatives = [
      card(),
      slab({ grade: "9", entryId: "psa9" }),
      slab({ gradingCompany: "BGS", entryId: "bgs10" }),
    ];
    expect(
      matchPhotoCard(slabScan({ setName: null }), [...alternatives, target]),
    ).toMatchObject({ item: target, price: 100, confident: true });
  });
  it("applies a stable best suggestion among duplicate conditions and variants", () => {
    const nm = card();
    const lp = card({ entryId: "lp", condition: "LP", overridePrice: 9 });
    const result = matchPhotoCard(scan(), [nm, lp]);
    expect(result).toMatchObject({ item: nm, price: 13, confident: false });
    expect(result.reason).toContain("Several entries");
    expect(
      matchPhotoCard(scan({ condition: "Lightly Played" }), [nm, lp]).item,
    ).toBe(lp);
    const holo = card({ entryId: "holo", variant: "Holo" });
    const reverse = card({ entryId: "reverse", variant: "Reverse Holo" });
    expect(matchPhotoCard(scan(), [holo, reverse]).item).toBe(holo);
    expect(
      matchPhotoCard(scan({ variant: "Reverse Holo" }), [holo, reverse]).item,
    ).toBe(reverse);
  });
  it("prefers priced entries on equal identity scores and preserves ordering otherwise", () => {
    const unavailable = card({ entryId: "unknown-price", overridePrice: null });
    const priced = card({ entryId: "priced" });
    const other = card({ entryId: "other", overridePrice: 30 });
    const result = matchPhotoCard(scan(), [unavailable, priced, other]);
    expect(result).toMatchObject({ item: priced, price: 13, confident: false });
    expect(
      result.candidates.map((candidate) => candidate.item.entryId),
    ).toEqual(["priced", "other", "unknown-price"]);
  });
  it("ranks exact optional details higher but still fills a price when they disagree", () => {
    const english = card();
    const japanese = card({
      entryId: "jp",
      language: "Japanese",
      overridePrice: 40,
    });
    expect(
      matchPhotoCard(scan({ language: "JP" }), [english, japanese]).item,
    ).toBe(japanese);
    for (const change of [
      { language: "JP" },
      { setName: "Different set" },
      { variant: "Reverse Holo" },
      { condition: "LP" },
    ])
      expect(matchPhotoCard(scan(change), [english])).toMatchObject({
        item: english,
        price: 13,
        confident: false,
      });
  });
  it.each(["KR", "CN"])(
    "recognizes the scanner language code %s",
    (language) => {
      const correct = card({
        entryId: language,
        language: language === "KR" ? "Korean" : "Chinese",
      });
      expect(matchPhotoCard(scan({ language }), [card(), correct]).item).toBe(
        correct,
      );
    },
  );
  it("excludes hidden and sold inventory from suggestions and selection", () => {
    const available = card();
    const others = [
      card({ excludeFromSale: true }),
      card({ quantity: 0 }),
      card({ quantity: "0" }),
      card({ quantity: -1 }),
    ];
    const result = matchPhotoCard(scan(), [...others, available]);
    expect(result.item).toBe(available);
    expect(result.candidates).toHaveLength(1);
    expect(matchPhotoCard(scan(), others).candidates).toHaveLength(0);
  });
  it("never invents a price when compatible inventory lacks one", () => {
    const item = card({ overridePrice: null });
    expect(matchPhotoCard(scan(), [item])).toMatchObject({ item, price: null });
    expect(matchPhotoCard(null, null)).toMatchObject({
      item: null,
      price: null,
      candidates: [],
      confident: false,
    });
  });
});
