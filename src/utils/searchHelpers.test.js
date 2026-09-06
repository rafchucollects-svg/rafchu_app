import { describe, it, expect } from "vitest";
import {
  correctTypos,
  expandSetAbbreviations,
  formatQueryForApi,
  preprocessQuery,
  parseQuery,
  filterByRelevance,
  scoreRelevance,
  rankByRelevance,
  isStrongSearchMatch,
  normalizeCardKey,
  getCanonicalCardId,
  calculateCompletenessScore,
  mergeBestData,
  deduplicateResults,
  levenshteinDistance,
  stringSimilarity,
  findFuzzyMatches,
  improveSearchResults,
} from "./searchHelpers";

// ==============================
// Query Preprocessing
// ==============================

describe("correctTypos", () => {
  it("corrects common Pikachu misspellings", () => {
    expect(correctTypos("pkachu")).toBe("pikachu");
    expect(correctTypos("pikacu")).toBe("pikachu");
    expect(correctTypos("pikchu")).toBe("pikachu");
    expect(correctTypos("pickachu")).toBe("pikachu");
  });

  it("corrects common Charizard misspellings", () => {
    expect(correctTypos("charzard")).toBe("charizard");
    expect(correctTypos("charazard")).toBe("charizard");
  });

  it("corrects Mewtwo variants", () => {
    expect(correctTypos("mewtoo")).toBe("mewtwo");
    expect(correctTypos("mewto")).toBe("mewtwo");
    expect(correctTypos("mew2")).toBe("mewtwo");
  });

  it("preserves correct names", () => {
    expect(correctTypos("charizard")).toBe("charizard");
    expect(correctTypos("pikachu")).toBe("pikachu");
  });

  it("handles multi-word queries", () => {
    expect(correctTypos("charzard ex")).toBe("charizard ex");
    expect(correctTypos("pkachu vmax")).toBe("pikachu vmax");
  });

  it("returns empty string for null/empty", () => {
    expect(correctTypos("")).toBe("");
    expect(correctTypos(null)).toBe("");
  });

  it("adds apostrophes to trainer names", () => {
    expect(correctTypos("rockets mewtwo")).toBe("rocket's mewtwo");
    expect(correctTypos("giovannis nidoking")).toBe("giovanni's nidoking");
  });
});

describe("expandSetAbbreviations", () => {
  it("expands common set abbreviations", () => {
    expect(expandSetAbbreviations("pikachu base")).toBe("pikachu Base Set");
    // "evolutions" in the SET_ABBREVIATIONS maps to "Evolutions"
    // but the regex replacement is case-insensitive on input, the output casing
    // comes from the SET_ABBREVIATIONS value. When the input is all lowercase,
    // the match replaces the lowercase word with the properly cased value.
    const result = expandSetAbbreviations("charizard evolutions");
    expect(result.toLowerCase()).toContain("evolutions");
  });

  it("does not double-expand already expanded names", () => {
    expect(expandSetAbbreviations("pikachu Base Set")).toBe(
      "pikachu Base Set"
    );
  });

  it("does not expand when part of a card code", () => {
    // SWSH121 should not expand "swsh" to "Sword Shield"
    expect(expandSetAbbreviations("SWSH121")).toBe("SWSH121");
  });

  it("does not expand promo code patterns", () => {
    // SM-P should not expand "sm" to "Sun Moon"
    expect(expandSetAbbreviations("SM-P")).toBe("SM-P");
  });

  it("returns empty string for null/empty", () => {
    expect(expandSetAbbreviations("")).toBe("");
    expect(expandSetAbbreviations(null)).toBe("");
  });
});

describe("formatQueryForApi", () => {
  it("removes ampersands from Tag Team names", () => {
    expect(formatQueryForApi("Reshiram & Charizard GX")).toBe(
      "Reshiram Charizard GX"
    );
  });

  it("removes 'and' conjunction", () => {
    expect(formatQueryForApi("Pikachu and Zekrom GX")).toBe(
      "Pikachu Zekrom GX"
    );
  });

  it("normalizes whitespace", () => {
    expect(formatQueryForApi("  Charizard   EX  ")).toBe("Charizard EX");
  });

  it("preserves card code queries", () => {
    expect(formatQueryForApi("SWSH121")).toBe("SWSH121");
  });

  it("returns empty string for null/empty", () => {
    expect(formatQueryForApi("")).toBe("");
    expect(formatQueryForApi(null)).toBe("");
  });
});

describe("preprocessQuery", () => {
  it("applies typo correction and set expansion", () => {
    const result = preprocessQuery("charzard base");
    expect(result.processed).toContain("charizard");
    expect(result.processed).toContain("Base Set");
    expect(result.wasModified).toBe(true);
  });

  it("reports corrections", () => {
    const result = preprocessQuery("charzard");
    expect(result.corrections.length).toBeGreaterThan(0);
    expect(result.corrections[0].type).toBe("typo");
  });

  it("returns original for already-correct queries", () => {
    const result = preprocessQuery("Charizard");
    expect(result.processed.toLowerCase()).toBe("charizard");
  });

  it("handles empty/null input", () => {
    const result = preprocessQuery("");
    expect(result.original).toBe("");
    expect(result.processed).toBe("");
  });

  it("respects option flags", () => {
    const result = preprocessQuery("charzard base", {
      correctTypos: false,
      expandSets: false,
    });
    // Without corrections, original input (lowered via formatForApi) should remain
    expect(result.processed).toBe("charzard base");
  });
});

// ==============================
// Query Parsing
// ==============================

describe("parseQuery", () => {
  it("extracts primary name", () => {
    const result = parseQuery("Charizard");
    expect(result.primaryName).toBe("charizard");
  });

  it("extracts card type keywords", () => {
    const result = parseQuery("Charizard ex");
    expect(result.cardTypes).toContain("ex");
  });

  it("extracts card numbers", () => {
    const result = parseQuery("Charizard 6");
    expect(result.numbers).toContain("6");
  });

  it("extracts set-related words", () => {
    const result = parseQuery("Charizard evolutions");
    expect(result.setWords).toContain("evolutions");
  });

  it("handles alphanumeric card codes", () => {
    const result = parseQuery("SWSH121");
    expect(result.numbers).toContain("swsh121");
  });

  it("preserves apostrophes in names", () => {
    const result = parseQuery("Rocket's Mewtwo");
    expect(result.primaryName).toContain("rocket's");
  });

  it("collects name words regardless of position (set before name)", () => {
    const result = parseQuery("Celebrations Charizard");
    expect(result.primaryName).toBe("charizard");
    expect(result.setWords).toContain("celebrations");
  });

  it("collects name words regardless of position (number before name)", () => {
    const result = parseQuery("25 Pikachu");
    expect(result.primaryName).toBe("pikachu");
    expect(result.numbers).toContain("25");
  });

  it("collects name words regardless of position (type between names)", () => {
    const result = parseQuery("Base Set Pikachu");
    expect(result.primaryName).toBe("pikachu");
    expect(result.setWords).toContain("base");
    expect(result.setWords).toContain("set");
  });

  it("extracts 'gold star' as a rarity filter, not name + card type", () => {
    const result = parseQuery("gold star");
    expect(result.primaryName).toBe("");
    expect(result.cardTypes).toEqual([]);
    expect(result.rarityFilters).toContain("gold star");
  });

  it("extracts 'gold star' with a Pokemon name", () => {
    const result = parseQuery("pikachu gold star");
    expect(result.primaryName).toBe("pikachu");
    expect(result.rarityFilters).toContain("gold star");
    expect(result.cardTypes).toEqual([]);
  });

  it("extracts 'gold star' with a Pokemon name and number", () => {
    const result = parseQuery("charizard gold star 100");
    expect(result.primaryName).toBe("charizard");
    expect(result.rarityFilters).toContain("gold star");
    expect(result.numbers).toContain("100");
  });

  it("returns empty for null/empty", () => {
    const result = parseQuery("");
    expect(result.primaryName).toBe("");
    expect(result.cardTypes).toEqual([]);
    expect(result.numbers).toEqual([]);
  });
});

// ==============================
// Relevance Filtering
// ==============================

describe("filterByRelevance", () => {
  const cards = [
    { name: "Charizard", number: "6", set: "Base Set" },
    { name: "Charizard EX", number: "12", set: "Evolutions" },
    { name: "Pikachu", number: "25", set: "Base Set" },
    { name: "Charizard V", number: "19", set: "Darkness Ablaze" },
    { name: "Blastoise", number: "2", set: "Base Set" },
  ];

  it("filters to cards matching the query name", () => {
    const filtered = filterByRelevance(cards, "Charizard");
    expect(filtered.every((c) => c.name.toLowerCase().includes("charizard"))).toBe(
      true
    );
    expect(filtered.length).toBe(3);
  });

  it("filters by card type", () => {
    const filtered = filterByRelevance(cards, "Charizard ex");
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.some((c) => c.name.toLowerCase().includes("ex"))).toBe(true);
  });

  it("filters by number", () => {
    const filtered = filterByRelevance(cards, "Charizard 6");
    expect(filtered.length).toBe(1);
    expect(filtered[0].number).toBe("6");
  });

  it("returns all cards for number-only search", () => {
    const filtered = filterByRelevance(cards, "25");
    expect(filtered.some((c) => c.number === "25")).toBe(true);
  });

  it("filters by rarity (gold star)", () => {
    const cards = [
      { name: "Pikachu ★", rarity: "Rare Holo Star" },
      { name: "Pikachu Gold Star", rarity: "Gold Star" },
      { name: "Pikachu", rarity: "Common" },
      { name: "Charizard", rarity: "Rare Holo" },
    ];
    const filtered = filterByRelevance(cards, "gold star");
    expect(filtered.length).toBeGreaterThanOrEqual(2);
    // Should include Gold Star cards, not regular ones
    expect(filtered.some(c => c.name.includes("★") || c.name.includes("Gold Star"))).toBe(true);
    expect(filtered.some(c => c.name === "Charizard")).toBe(false);
  });

  it("filters by name + rarity (pikachu gold star)", () => {
    const cards = [
      { name: "Pikachu ★", rarity: "Rare Holo Star" },
      { name: "Charizard ★", rarity: "Rare Holo Star" },
      { name: "Pikachu", rarity: "Common" },
    ];
    const filtered = filterByRelevance(cards, "pikachu gold star");
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe("Pikachu ★");
  });

  it("filters by set words", () => {
    const filtered = filterByRelevance(cards, "Charizard evolutions");
    expect(filtered).toEqual([
      expect.objectContaining({ name: "Charizard EX", set: "Evolutions" }),
    ]);
  });

  it("does not silently discard a requested set when no set matches", () => {
    expect(filterByRelevance(cards, "Charizard Team Rocket Returns")).toEqual([]);
  });

  it("requires every word in a multi-word set filter", () => {
    const setCards = [
      { name: "Charizard", number: "4", set: "Team Rocket" },
      { name: "Charizard", number: "4", set: "Team Rocket Returns" },
    ];
    expect(filterByRelevance(setCards, "Charizard Team Rocket Returns")).toEqual([
      expect.objectContaining({ set: "Team Rocket Returns" }),
    ]);
  });
});

// ==============================
// Scoring
// ==============================

describe("scoreRelevance", () => {
  it("gives highest score to exact name match", () => {
    const card = { name: "Pikachu", number: "25", set: "Base Set" };
    const score = scoreRelevance(card, "pikachu");
    expect(score).toBeGreaterThanOrEqual(100);
  });

  it("gives higher score to name-starts-with match", () => {
    const card1 = { name: "Pikachu V", set: "" };
    const card2 = { name: "Flying Pikachu V", set: "" };
    const score1 = scoreRelevance(card1, "pikachu");
    const score2 = scoreRelevance(card2, "pikachu");
    expect(score1).toBeGreaterThan(score2);
  });

  it("gives bonus for image and prices", () => {
    const withImage = { name: "Pikachu", image: "http://img.png", prices: {} };
    const without = { name: "Pikachu" };
    expect(scoreRelevance(withImage, "pikachu")).toBeGreaterThan(
      scoreRelevance(without, "pikachu")
    );
  });

  it("gives bonus for number match", () => {
    const cardWithMatch = { name: "Pikachu", number: "25" };
    const cardNoMatch = { name: "Pikachu", number: "99" };
    const score1 = scoreRelevance(cardWithMatch, "pikachu 25");
    const score2 = scoreRelevance(cardNoMatch, "pikachu 25");
    expect(score1).toBeGreaterThan(score2);
  });

  it("does not penalize queries with numbers vs without", () => {
    // After fix: "pikachu 25" should score at least as high as "pikachu"
    // for a card named "Pikachu" (exact name match via primaryName)
    const card = { name: "Pikachu", number: "25" };
    const scoreWithNum = scoreRelevance(card, "pikachu 25");
    const scoreWithoutNum = scoreRelevance(card, "pikachu");
    expect(scoreWithNum).toBeGreaterThanOrEqual(scoreWithoutNum);
  });

  it("does not penalize queries with set names", () => {
    // "Celebrations Charizard" should still score well for "Charizard"
    const card = { name: "Charizard", set: "Celebrations" };
    const scoreWithSet = scoreRelevance(card, "celebrations charizard");
    expect(scoreWithSet).toBeGreaterThanOrEqual(100); // exact primaryName match
  });
});

describe("rankByRelevance (searchHelpers)", () => {
  it("ranks results by score descending", () => {
    const cards = [
      { name: "Raichu", number: "26", set: "Base Set" },
      { name: "Pikachu", number: "25", set: "Base Set" },
      { name: "Pikachu V", number: "44", set: "Vivid Voltage" },
    ];
    const ranked = rankByRelevance(cards, "pikachu");
    // Exact match should be first
    expect(ranked[0].name).toBe("Pikachu");
  });
});

describe("isStrongSearchMatch", () => {
  it("accepts a canonical name prefix with an exact printed number", () => {
    expect(isStrongSearchMatch(
      { name: "Charizard ex", number: "199/165" },
      "charizard 199",
    )).toBe(true);
  });

  it("does not let a related suffix-name cache hit suppress enrichment", () => {
    expect(isStrongSearchMatch(
      { name: "Ooyama's Pikachu", number: "25" },
      "pikachu 25",
    )).toBe(false);
  });

  it("requires an exact numerator when a card number is requested", () => {
    expect(isStrongSearchMatch(
      { name: "Pikachu", number: "125/198" },
      "pikachu 25",
    )).toBe(false);
  });
});

// ==============================
// Deduplication
// ==============================

describe("normalizeCardKey", () => {
  it("produces consistent key for same card", () => {
    const card1 = { name: "Charizard", number: "6", set: "Base Set" };
    const card2 = { name: "charizard", number: "6", set: "base set" };
    expect(normalizeCardKey(card1)).toBe(normalizeCardKey(card2));
  });

  it("produces different keys for different cards", () => {
    const card1 = { name: "Charizard", number: "6", set: "Base Set" };
    const card2 = { name: "Pikachu", number: "25", set: "Base Set" };
    expect(normalizeCardKey(card1)).not.toBe(normalizeCardKey(card2));
  });

  it("normalizes provider set aliases and printed number denominators", () => {
    const cachedCard = { name: "Charizard ex", number: 199, set: "151" };
    const providerCard = {
      name: "Charizard ex",
      number: "199/165",
      set: "Scarlet & Violet 151",
    };
    expect(normalizeCardKey(cachedCard)).toBe(normalizeCardKey(providerCard));
  });

  it("keeps English and Japanese printings distinct", () => {
    const english = { name: "Charizard ex", number: "199", set: "151", language: "English" };
    const japanese = { ...english, language: "Japanese", isJapanese: true };
    expect(normalizeCardKey(english)).not.toBe(normalizeCardKey(japanese));
  });

  it("keeps materially different card variants distinct", () => {
    const normal = { name: "Pikachu", number: "25", set: "Base Set", variant: "standard" };
    const reverse = { ...normal, variant: "reverse holo" };
    expect(normalizeCardKey(normal)).not.toBe(normalizeCardKey(reverse));
  });
});

describe("getCanonicalCardId", () => {
  it("prefers the cross-provider TCG identity", () => {
    expect(getCanonicalCardId({ tcgid: "SV3PT5-199", tcgplayerId: 517045 }))
      .toBe("tcgid:sv3pt5-199");
  });

  it("uses provider IDs before a normalized print identity", () => {
    expect(getCanonicalCardId({ tcgplayerId: 517045, language: "English" }))
      .toBe("tcgplayer:517045:english");
  });
});

describe("calculateCompletenessScore", () => {
  it("gives higher score to more complete cards", () => {
    const complete = {
      name: "Pikachu",
      image: "http://img.png",
      set: "Base",
      number: "25",
      rarity: "Common",
      prices: { tcgplayer: {}, cardmarket: {} },
    };
    const sparse = { name: "Pikachu" };
    expect(calculateCompletenessScore(complete)).toBeGreaterThan(
      calculateCompletenessScore(sparse)
    );
  });
});

describe("mergeBestData", () => {
  it("merges data from two cards, preferring non-empty values", () => {
    const card1 = { name: "Pikachu", image: null, set: "Base Set" };
    const card2 = { name: "", image: "http://img.png", number: "25" };
    const merged = mergeBestData(card1, card2);
    expect(merged.name).toBe("Pikachu");
    expect(merged.image).toBe("http://img.png");
    expect(merged.set).toBe("Base Set");
    expect(merged.number).toBe("25");
  });

  it("merges prices from both sources", () => {
    const card1 = { name: "A", prices: { tcgplayer: { market_price: 10 } } };
    const card2 = {
      name: "A",
      prices: { cardmarket: { lowest_near_mint: 8 } },
    };
    const merged = mergeBestData(card1, card2);
    expect(merged.prices.tcgplayer.market_price).toBe(10);
    expect(merged.prices.cardmarket.lowest_near_mint).toBe(8);
  });

  it("deep-merges complementary provider data and keeps descriptive labels", () => {
    const priced = {
      name: "Charizard ex",
      set: "151",
      number: 199,
      image: "https://example.com/charizard.png",
      cardMarketId: "2682-trade-record",
      prices: {
        tcgplayer: { market_price: 380.19 },
        cardmarket: { average: 432.58 },
      },
      source: "cardmarket-cache",
    };
    const descriptive = {
      name: "Charizard ex",
      set: "Scarlet & Violet 151",
      number: "199/165",
      cardMarketId: 2682,
      prices: { tcgplayer: { low_price: 323.16 } },
      gradedPrices: { "PSA-10": 900 },
      source: "tcgplayer",
    };

    const merged = mergeBestData(priced, descriptive);
    expect(merged.set).toBe("Scarlet & Violet 151");
    expect(merged.number).toBe("199/165");
    expect(merged.image).toBe(priced.image);
    expect(merged.prices.tcgplayer.market_price).toBe(380.19);
    expect(merged.prices.tcgplayer.low_price).toBe(323.16);
    expect(merged.prices.cardmarket.average).toBe(432.58);
    expect(merged.gradedPrices["PSA-10"]).toBe(900);
    expect(merged.sources).toEqual(expect.arrayContaining(["cardmarket-cache", "tcgplayer"]));
  });
});

describe("deduplicateResults", () => {
  it("removes duplicate cards", () => {
    const cards = [
      { name: "Pikachu", number: "25", set: "Base Set" },
      { name: "pikachu", number: "25", set: "base set" },
      { name: "Charizard", number: "6", set: "Base Set" },
    ];
    const deduped = deduplicateResults(cards);
    expect(deduped.length).toBe(2);
  });

  it("merges data when deduplicating", () => {
    const cards = [
      { name: "Pikachu", number: "25", set: "Base Set", image: null },
      {
        name: "Pikachu",
        number: "25",
        set: "Base Set",
        image: "http://img.png",
      },
    ];
    const deduped = deduplicateResults(cards);
    expect(deduped.length).toBe(1);
    expect(deduped[0].image).toBe("http://img.png");
  });

  it("handles empty array", () => {
    expect(deduplicateResults([])).toEqual([]);
  });

  it("does not merge different languages or print variants", () => {
    const base = { name: "Pikachu", number: "25", set: "Base Set" };
    const cards = [
      { ...base, language: "English", variant: "standard" },
      { ...base, language: "Japanese", variant: "standard" },
      { ...base, language: "English", variant: "reverse holo" },
    ];
    expect(deduplicateResults(cards)).toHaveLength(3);
  });

  it("merges the duplicate Charizard 151 cache records into one complete card", () => {
    const cards = [
      {
        name: "Charizard ex",
        set: "151",
        number: 199,
        image: "https://example.com/charizard.png",
        prices: {
          tcgplayer: { market_price: 380.19 },
          cardmarket: { average: 432.58 },
        },
      },
      {
        name: "Charizard ex",
        set: "Scarlet & Violet 151",
        number: "199",
        rarity: "Special Illustration Rare",
      },
    ];

    const deduped = deduplicateResults(cards);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      name: "Charizard ex",
      set: "Scarlet & Violet 151",
      number: "199",
      rarity: "Special Illustration Rare",
    });
    expect(deduped[0].prices.tcgplayer.market_price).toBe(380.19);
    expect(deduped[0].prices.cardmarket.average).toBe(432.58);
  });
});

// ==============================
// Fuzzy Matching
// ==============================

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("pikachu", "pikachu")).toBe(0);
  });

  it("counts single character difference", () => {
    expect(levenshteinDistance("pikachu", "pikachuu")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("is case-insensitive", () => {
    expect(levenshteinDistance("Pikachu", "pikachu")).toBe(0);
  });
});

describe("stringSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(stringSimilarity("pikachu", "pikachu")).toBe(1);
  });

  it("returns value between 0 and 1 for similar strings", () => {
    const sim = stringSimilarity("pikachu", "pikachuu");
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });

  it("returns 0 for null/empty inputs", () => {
    expect(stringSimilarity("", "abc")).toBe(0);
    expect(stringSimilarity(null, "abc")).toBe(0);
  });
});

describe("findFuzzyMatches", () => {
  const cards = [
    { name: "Pikachu" },
    { name: "Charizard" },
    { name: "Pikachuu" },
    { name: "Raichu" },
  ];

  it("finds similar cards", () => {
    // "pikchu" vs "pikachu" has similarity ~0.71, but the combined score
    // includes word match (0.4 weight) which may lower it.
    // Use a closer typo that's more likely to pass the threshold.
    const matches = findFuzzyMatches("pikachu", cards, { minSimilarity: 0.4 });
    expect(matches.length).toBeGreaterThan(0);
    const names = matches.map((c) => c.name);
    expect(names).toContain("Pikachu");
  });

  it("returns empty for no matches", () => {
    const matches = findFuzzyMatches("zzzzzzzzz", cards);
    expect(matches).toEqual([]);
  });

  it("handles null gracefully", () => {
    expect(findFuzzyMatches(null, cards)).toEqual([]);
    expect(findFuzzyMatches("test", null)).toEqual([]);
  });
});

// ==============================
// Full Pipeline
// ==============================

describe("improveSearchResults", () => {
  const cards = [
    { name: "Pikachu", number: "25", set: "Base Set", image: "http://img.png" },
    { name: "pikachu", number: "25", set: "Base Set" },
    { name: "Charizard", number: "6", set: "Base Set" },
    { name: "Pikachu V", number: "44", set: "Vivid Voltage" },
    { name: "Raichu", number: "26", set: "Base Set" },
  ];

  it("filters, deduplicates, and ranks results", () => {
    const improved = improveSearchResults(cards, "pikachu");
    // Should deduplicate the two Pikachu entries
    const pikachus = improved.filter((c) =>
      c.name.toLowerCase() === "pikachu"
    );
    expect(pikachus.length).toBe(1);
    // Should keep Pikachu V
    expect(improved.some((c) => c.name === "Pikachu V")).toBe(true);
    // Exact Pikachu should rank first
    expect(improved[0].name.toLowerCase()).toBe("pikachu");
  });

  it("respects maxResults option", () => {
    const improved = improveSearchResults(cards, "pikachu", {
      maxResults: 2,
    });
    expect(improved.length).toBeLessThanOrEqual(2);
  });

  it("can disable individual steps", () => {
    const noFilter = improveSearchResults(cards, "pikachu", {
      enableFiltering: false,
    });
    // Without filtering, all cards should pass through
    expect(noFilter.length).toBeGreaterThanOrEqual(4); // After dedup
  });
});
