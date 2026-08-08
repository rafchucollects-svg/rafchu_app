import { describe, it, expect } from "vitest";
import {
  getConditionMultiplier,
  conditionLabelToCode,
  conditionCodeToLabel,
  getConditionColorClass,
  getCurrencySymbol,
  formatCurrency,
  convertCurrency,
  computeTcgPrice,
  getCardmarketLowest,
  getCardmarketAvg,
  computeSuggestedPrice,
  computeMarketValues,
  computeItemMetrics,
  computeInventoryTotals,
  normalizeApiCard,
  normalizeApostrophes,
  tokenize,
  normalizeCardNumber,
  extractNumberPieces,
  splitQuery,
  cloneForFirestore,
  buildHistoryEntry,
  CONDITION_MULTIPLIER,
} from "./cardHelpers";
import { rankByRelevance } from "./searchHelpers";

// ==============================
// Condition Helpers
// ==============================

describe("getConditionMultiplier", () => {
  it("returns 1 for NM (Near Mint)", () => {
    expect(getConditionMultiplier("NM")).toBe(1);
  });

  it("returns correct multipliers for each condition", () => {
    expect(getConditionMultiplier("LP")).toBe(0.9);
    expect(getConditionMultiplier("MP")).toBe(0.8);
    expect(getConditionMultiplier("HP")).toBe(0.6);
    expect(getConditionMultiplier("DMG")).toBe(0.4);
  });

  it("defaults to 1 for unknown or missing conditions", () => {
    expect(getConditionMultiplier()).toBe(1);
    expect(getConditionMultiplier("UNKNOWN")).toBe(1);
    expect(getConditionMultiplier("")).toBe(1);
  });
});

describe("conditionLabelToCode", () => {
  it("converts full labels to short codes", () => {
    expect(conditionLabelToCode("NEAR MINT")).toBe("NM");
    expect(conditionLabelToCode("LIGHTLY PLAYED")).toBe("LP");
    expect(conditionLabelToCode("MODERATELY PLAYED")).toBe("MP");
    expect(conditionLabelToCode("HEAVILY PLAYED")).toBe("HP");
    expect(conditionLabelToCode("DAMAGED")).toBe("DMG");
  });

  it("is case-insensitive", () => {
    expect(conditionLabelToCode("near mint")).toBe("NM");
    expect(conditionLabelToCode("Near Mint")).toBe("NM");
  });

  it("passes through short codes", () => {
    expect(conditionLabelToCode("NM")).toBe("NM");
    expect(conditionLabelToCode("LP")).toBe("LP");
  });

  it("returns null for unknown or empty input", () => {
    expect(conditionLabelToCode(null)).toBeNull();
    expect(conditionLabelToCode("")).toBeNull();
    expect(conditionLabelToCode("GARBAGE")).toBeNull();
  });
});

describe("conditionCodeToLabel", () => {
  it("converts codes to readable labels", () => {
    expect(conditionCodeToLabel("NM")).toBe("Near Mint");
    expect(conditionCodeToLabel("LP")).toBe("Lightly Played");
    expect(conditionCodeToLabel("MP")).toBe("Moderately Played");
    expect(conditionCodeToLabel("HP")).toBe("Heavily Played");
    expect(conditionCodeToLabel("DMG")).toBe("Damaged");
  });

  it("is case-insensitive", () => {
    expect(conditionCodeToLabel("nm")).toBe("Near Mint");
    expect(conditionCodeToLabel("lp")).toBe("Lightly Played");
  });

  it("returns Unknown for unrecognized codes", () => {
    expect(conditionCodeToLabel("")).toBe("Unknown");
    expect(conditionCodeToLabel(null)).toBe("Unknown");
  });
});

describe("getConditionColorClass", () => {
  it("returns green classes for NM", () => {
    expect(getConditionColorClass("NM")).toContain("green");
  });

  it("returns red classes for DMG", () => {
    expect(getConditionColorClass("DMG")).toContain("red");
  });

  it("defaults to NM styling for missing conditions", () => {
    expect(getConditionColorClass()).toContain("green");
    expect(getConditionColorClass(null)).toContain("green");
  });
});

// ==============================
// Currency Helpers
// ==============================

describe("getCurrencySymbol", () => {
  it("returns correct symbols for known currencies", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("GBP")).toBe("£");
    expect(getCurrencySymbol("JPY")).toBe("¥");
  });

  it("is case-insensitive", () => {
    expect(getCurrencySymbol("usd")).toBe("$");
    expect(getCurrencySymbol("eur")).toBe("€");
  });

  it("returns currency code + space for unknown currencies", () => {
    expect(getCurrencySymbol("SEK")).toBe("SEK ");
  });

  it("returns empty string for null/empty", () => {
    expect(getCurrencySymbol("")).toBe("");
    expect(getCurrencySymbol(null)).toBe("");
  });
});

describe("formatCurrency", () => {
  it("formats number as currency", () => {
    const result = formatCurrency(12.5, "USD");
    // Intl formatting varies by locale, just check it contains the number
    expect(result).toContain("12");
  });

  it("returns dash for null/NaN", () => {
    expect(formatCurrency(null)).toBe("–");
    expect(formatCurrency(undefined)).toBe("–");
    expect(formatCurrency("not a number")).toBe("–");
  });
});

describe("convertCurrency", () => {
  it("returns same amount when source = target", () => {
    expect(convertCurrency(100, "USD", "USD")).toBe(100);
    expect(convertCurrency(50.5, "EUR", "EUR")).toBe(50.5);
  });

  it("returns 0 for null or NaN amount", () => {
    expect(convertCurrency(null, "USD", "EUR")).toBe(0);
    expect(convertCurrency(NaN, "USD", "EUR")).toBe(0);
    expect(convertCurrency(0, "USD", "EUR")).toBe(0);
  });

  it("converts between currencies", () => {
    // Just verify it returns a number, since rates are dynamic
    const result = convertCurrency(100, "EUR", "USD");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });
});

// ==============================
// Card Pricing Helpers
// ==============================

describe("computeTcgPrice", () => {
  it("returns market price * condition multiplier", () => {
    const card = {
      prices: { tcgplayer: { market_price: 10 } },
    };
    expect(computeTcgPrice(card, "NM")).toBe(10);
    expect(computeTcgPrice(card, "LP")).toBe(9); // 10 * 0.9
    expect(computeTcgPrice(card, "HP")).toBe(6); // 10 * 0.6
  });

  it("falls back to mid_price if no market_price", () => {
    const card = {
      prices: { tcgplayer: { mid_price: 8 } },
    };
    expect(computeTcgPrice(card, "NM")).toBe(8);
  });

  it("returns 0 for missing prices", () => {
    expect(computeTcgPrice({}, "NM")).toBe(0);
    expect(computeTcgPrice(null, "NM")).toBe(0);
    expect(computeTcgPrice({ prices: {} }, "NM")).toBe(0);
  });
});

describe("getCardmarketLowest", () => {
  it("picks lowest7 as first priority", () => {
    const card = {
      prices: {
        cardmarket: { lowest7: 5, lowest_near_mint: 6, lowest_listing: 7 },
      },
    };
    expect(getCardmarketLowest(card, "NM")).toBe(5);
  });

  it("applies condition multiplier", () => {
    const card = {
      prices: { cardmarket: { lowest7: 10 } },
    };
    expect(getCardmarketLowest(card, "LP")).toBe(9); // 10 * 0.9
  });

  it("returns 0 for missing data", () => {
    expect(getCardmarketLowest({}, "NM")).toBe(0);
    expect(getCardmarketLowest({ prices: {} }, "NM")).toBe(0);
  });
});

describe("getCardmarketAvg", () => {
  it("prefers 30d average over 7d", () => {
    const card = {
      prices: {
        cardmarket: { "30d_average": 12, "7d_average": 10 },
      },
    };
    expect(getCardmarketAvg(card, "NM")).toBe(12);
  });

  it("falls back to 7d average", () => {
    const card = {
      prices: {
        cardmarket: { "7d_average": 10 },
      },
    };
    expect(getCardmarketAvg(card, "NM")).toBe(10);
  });

  it("returns 0 for missing data", () => {
    expect(getCardmarketAvg({}, "NM")).toBe(0);
  });
});

describe("computeSuggestedPrice", () => {
  it("uses override price when provided", () => {
    expect(
      computeSuggestedPrice({
        tcg: 10,
        cmAvg: 12,
        cmLowest: 8,
        condition: "NM",
        overridePrice: 25,
      })
    ).toBe(25);
  });

  it("uses TCG price for non-NM conditions", () => {
    expect(
      computeSuggestedPrice({
        tcg: 9,
        cmAvg: 12,
        cmLowest: 8,
        condition: "LP",
      })
    ).toBe(9);
  });

  it("picks max of cardmarket and TCG for NM", () => {
    expect(
      computeSuggestedPrice({
        tcg: 10,
        cmAvg: 12,
        cmLowest: 8,
        condition: "NM",
      })
    ).toBe(12); // max(max(12,8), 10)
  });

  it("falls back gracefully when some prices missing", () => {
    expect(
      computeSuggestedPrice({ tcg: 10, cmAvg: 0, cmLowest: 0, condition: "NM" })
    ).toBe(10);

    expect(
      computeSuggestedPrice({ tcg: 0, cmAvg: 8, cmLowest: 0, condition: "NM" })
    ).toBe(8);
  });

  it("returns 0 when all prices are 0", () => {
    expect(
      computeSuggestedPrice({ tcg: 0, cmAvg: 0, cmLowest: 0, condition: "NM" })
    ).toBe(0);
  });
});

describe("computeMarketValues", () => {
  const card = {
    prices: {
      tcgplayer: { market_price: 10, currency: "EUR" },
      cardmarket: { lowest7: 8, "30d_average": 12, currency: "EUR" },
    },
  };

  it("keeps the current ask while deriving distinct market views", () => {
    const values = computeMarketValues(card, {
      condition: "NM",
      targetCurrency: "EUR",
      marketSource: "cardmarket",
    });
    expect(values.sellerAsk).toBe(12);
    expect(values.preferredMarket).toBe(12);
    expect(values.preferredSource).toBe("CardMarket");
    expect(values.quickSale).toBe(8);
    expect(values.availableBenchmarkCount).toBe(3);
  });

  it("uses TCGplayer for the selected market", () => {
    const values = computeMarketValues(card, {
      condition: "NM",
      targetCurrency: "EUR",
      marketSource: "tcg",
    });
    expect(values.preferredMarket).toBe(10);
    expect(values.preferredSource).toBe("TCGplayer");
  });

  it("falls back cleanly when only one feed is available", () => {
    const values = computeMarketValues(
      { prices: { tcgplayer: { market_price: 9, currency: "EUR" } } },
      { targetCurrency: "EUR", marketSource: "cardmarket" },
    );
    expect(values.preferredMarket).toBe(9);
    expect(values.quickSale).toBe(9);
    expect(values.availableBenchmarkCount).toBe(1);
  });

  it("uses the current manual inventory price only for Seller Ask", () => {
    const values = computeMarketValues(
      { overridePrice: 600, overridePriceCurrency: "EUR", prices: {} },
      { targetCurrency: "EUR", marketSource: "tcg" },
    );
    expect(values.sellerAsk).toBe(600);
    expect(values.preferredMarket).toBe(0);
    expect(values.quickSale).toBe(0);
  });
});

describe("computeItemMetrics", () => {
  it("computes metrics for a standard card", () => {
    const item = {
      condition: "NM",
      prices: {
        tcgplayer: { market_price: 10 },
        cardmarket: { lowest7: 8, "30d_average": 12 },
      },
    };
    const metrics = computeItemMetrics(item);
    expect(metrics.tcg).toBe(10);
    expect(metrics.cmAvg).toBe(12);
    expect(metrics.cmLowest).toBe(8);
    expect(metrics.suggested).toBe(12); // max of all
  });

  it("uses graded price directly for graded cards", () => {
    const item = {
      isGraded: true,
      gradedPrice: 500,
    };
    const metrics = computeItemMetrics(item);
    expect(metrics.suggested).toBe(500);
    expect(metrics.tcg).toBe(500);
    expect(metrics.cmAvg).toBe(500);
  });

  it("uses manual price when set", () => {
    const item = {
      manualPrice: 25,
    };
    const metrics = computeItemMetrics(item);
    expect(metrics.suggested).toBe(25);
  });

  it("override price wins over graded price", () => {
    const item = {
      isGraded: true,
      gradedPrice: 500,
      overridePrice: 750,
      overridePriceCurrency: "USD",
    };
    const metrics = computeItemMetrics(item, "USD");
    expect(metrics.suggested).toBe(750);
    expect(metrics.tcg).toBe(750);
    expect(metrics.cmAvg).toBe(750);
    expect(metrics.cmLowest).toBe(750);
  });

  it("override price wins over standard pricing", () => {
    const item = {
      condition: "NM",
      overridePrice: 99,
      overridePriceCurrency: "USD",
      prices: {
        tcgplayer: { market_price: 10 },
        cardmarket: { lowest7: 8, "30d_average": 12 },
      },
    };
    const metrics = computeItemMetrics(item, "USD");
    expect(metrics.suggested).toBe(99);
  });

  it("converts override price from stored currency to user currency", () => {
    const item = {
      overridePrice: 100,
      overridePriceCurrency: "USD",
    };
    const usd = computeItemMetrics(item, "USD");
    expect(usd.suggested).toBe(100);

    const eur = computeItemMetrics(item, "EUR");
    // Should not pass through 100 USD as 100 EUR
    expect(eur.suggested).not.toBe(100);
    expect(eur.suggested).toBeGreaterThan(0);
  });

  it("normalizes provider currencies before choosing a suggested price", () => {
    const item = {
      condition: "NM",
      prices: {
        tcgplayer: { market_price: 100, currency: "USD" },
        cardmarket: { "30d_average": 100, currency: "EUR" },
      },
    };
    const metrics = computeItemMetrics(item, "USD");
    expect(metrics.tcg).toBe(100);
    expect(metrics.cmAvg).toBeGreaterThan(100);
    expect(metrics.suggested).toBe(metrics.cmAvg);
  });
});

describe("computeInventoryTotals", () => {
  it("sums up totals across items with quantities", () => {
    const items = [
      {
        quantity: 2,
        condition: "NM",
        prices: {
          tcgplayer: { market_price: 10 },
          cardmarket: { lowest7: 10, "30d_average": 10 },
        },
      },
      {
        quantity: 1,
        condition: "NM",
        prices: {
          tcgplayer: { market_price: 5 },
          cardmarket: { lowest7: 5, "30d_average": 5 },
        },
      },
    ];
    const totals = computeInventoryTotals(items);
    expect(totals.count).toBe(3); // 2 + 1
    expect(totals.tcg).toBe(25); // (10*2) + (5*1)
  });

  it("returns zeros for empty array", () => {
    const totals = computeInventoryTotals([]);
    expect(totals.count).toBe(0);
    expect(totals.suggested).toBe(0);
    expect(totals.tcg).toBe(0);
  });

  it("handles non-array input gracefully", () => {
    const totals = computeInventoryTotals(null);
    expect(totals.count).toBe(0);
  });
});

// ==============================
// Normalization & Tokenization
// ==============================

describe("normalizeApostrophes", () => {
  it("converts curly quotes to straight", () => {
    expect(normalizeApostrophes("Rocket\u2019s")).toBe("Rocket's");
    expect(normalizeApostrophes("Rocket\u2018s")).toBe("Rocket's");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeApostrophes(null)).toBe("");
    expect(normalizeApostrophes(undefined)).toBe("");
  });
});

describe("tokenize", () => {
  it("splits query into lowercase tokens", () => {
    expect(tokenize("Charizard EX")).toEqual(["charizard", "ex"]);
  });

  it("preserves apostrophes within words", () => {
    const tokens = tokenize("Rocket's Mewtwo");
    expect(tokens).toContain("rocket's");
    expect(tokens).toContain("mewtwo");
  });

  it("returns empty array for null", () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("normalizeCardNumber", () => {
  it("strips leading zeros", () => {
    expect(normalizeCardNumber("001")).toBe("1");
    expect(normalizeCardNumber("025")).toBe("25");
  });

  it("normalizes slash notation", () => {
    expect(normalizeCardNumber("001/203")).toBe("1/203");
  });

  it("normalizes promo codes", () => {
    expect(normalizeCardNumber("SWSH001")).toBe("swsh1");
    expect(normalizeCardNumber("SM123")).toBe("sm123");
  });

  it("returns empty string for null", () => {
    expect(normalizeCardNumber(null)).toBe("");
    expect(normalizeCardNumber("")).toBe("");
  });
});

describe("extractNumberPieces", () => {
  it("extracts pure numbers", () => {
    const pieces = extractNumberPieces("charizard 25");
    expect(pieces).toContain("25");
  });

  it("extracts slash notation", () => {
    const pieces = extractNumberPieces("25/203");
    expect(pieces).toContain("25/203");
  });

  it("extracts alphanumeric codes", () => {
    const pieces = extractNumberPieces("SWSH001");
    expect(pieces).toContain("swsh001");
    expect(pieces).toContain("swsh1"); // normalized version
  });

  it("returns empty array for null", () => {
    expect(extractNumberPieces(null)).toEqual([]);
  });
});

describe("splitQuery", () => {
  it("separates name query from number pieces", () => {
    const result = splitQuery("Charizard 25");
    expect(result.nameQuery).toBe("charizard");
    expect(result.numberPieces).toContain("25");
  });

  it("handles query with only name", () => {
    const result = splitQuery("Pikachu");
    expect(result.nameQuery).toBe("pikachu");
    expect(result.numberPieces).toEqual([]);
  });
});

// ==============================
// Ranking
// ==============================

describe("rankByRelevance", () => {
  const cards = [
    { name: "Pikachu", number: "25" },
    { name: "Charizard EX", number: "6" },
    { name: "Pikachu V", number: "44" },
    { name: "Raichu", number: "26" },
  ];

  it("ranks exact name matches highest", () => {
    const ranked = rankByRelevance(cards, "Pikachu");
    expect(ranked[0].name).toBe("Pikachu");
  });

  it("includes cards that partially match", () => {
    const ranked = rankByRelevance(cards, "Pikachu");
    const names = ranked.map((c) => c.name);
    expect(names).toContain("Pikachu V");
  });

  it("returns all cards sorted (filtering is done separately by filterByRelevance)", () => {
    const ranked = rankByRelevance(cards, "Mewtwo");
    // rankByRelevance sorts by score but doesn't filter out zero-score cards
    // filterByRelevance handles removal of irrelevant cards
    expect(ranked.length).toBe(cards.length);
  });

  it("handles null/empty gracefully", () => {
    expect(rankByRelevance(null, "test")).toEqual([]);
    expect(rankByRelevance([], "test")).toEqual([]);
    expect(rankByRelevance(cards, "")).toEqual(cards);
  });
});

// ==============================
// Utility Helpers
// ==============================

describe("cloneForFirestore", () => {
  it("deep clones objects", () => {
    const original = { a: 1, b: { c: 2 } };
    const cloned = cloneForFirestore(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
  });

  it("clones arrays", () => {
    const original = [1, 2, { a: 3 }];
    const cloned = cloneForFirestore(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });
});

describe("normalizeApiCard", () => {
  it("normalizes a raw API response", () => {
    const raw = {
      data: {
        id: "123",
        name: "Charizard",
        card_number: "6",
        rarity: "Rare",
        episode: { name: "Base Set", slug: "base-set" },
        image: "https://example.com/charizard.jpg",
        prices: {
          cardmarket: { lowest_near_mint: 50, currency: "EUR" },
          tcg_player: { market_price: 45, currency: "EUR" },
        },
      },
    };

    const card = normalizeApiCard(raw);
    expect(card.id).toBe("123");
    expect(card.name).toBe("Charizard");
    expect(card.number).toBe("6");
    expect(card.set).toBe("Base Set");
    expect(card.image).toBe("https://example.com/charizard.jpg");
    expect(card.prices.cardmarket.lowest_near_mint).toBe(50);
    expect(card.prices.tcgplayer.market_price).toBe(45);
  });

  it("handles missing data gracefully", () => {
    const card = normalizeApiCard({});
    expect(card.id).toBeUndefined();
    expect(card.name).toBeUndefined();
    expect(card.prices.cardmarket.currency).toBe("EUR");
  });

  it("preserves canonical IDs, provider metadata, availability, and graded sales", () => {
    const card = normalizeApiCard({
      id: "sv3pt5-199",
      name: "Charizard ex",
      card_number: "199/165",
      tcgid: "sv3pt5-199",
      cardmarket_id: 2682,
      tcgplayer_id: 517045,
      episode: {
        name: "151",
        code: "MEW",
        series: { name: "Scarlet & Violet" },
      },
      prices: {
        cardmarket: {
          currency: "EUR",
          available_items: 42,
          graded: { psa: { "10": { price: 900 } } },
        },
        tcg_player: { currency: "USD", market_price: 380.19 },
        ebay: {
          currency: "USD",
          graded: { psa: { "10": { median_price: 925, sample_size: 12 } } },
        },
      },
    });

    expect(card).toMatchObject({
      set: "Scarlet & Violet 151",
      setName: "151",
      setSeries: "Scarlet & Violet",
      setCode: "MEW",
      tcgid: "sv3pt5-199",
      cardMarketId: 2682,
      tcgplayerId: 517045,
    });
    expect(card.prices.cardmarket.availableItems).toBe(42);
    expect(card.prices.ebay.graded.psa["10"].sample_size).toBe(12);
  });
});

describe("buildHistoryEntry", () => {
  it("builds a history entry from items", () => {
    const items = [
      {
        quantity: 1,
        condition: "NM",
        prices: {
          tcgplayer: { market_price: 10 },
          cardmarket: { lowest7: 10, "30d_average": 10 },
        },
      },
    ];
    const entry = buildHistoryEntry(items);
    expect(entry.count).toBe(1);
    expect(entry.date).toBeGreaterThan(0);
    expect(entry.suggested).toBe(10);
  });
});
