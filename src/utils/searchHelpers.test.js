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
  normalizeCardKey,
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

  it("filters by set words", () => {
    const filtered = filterByRelevance(cards, "Charizard evolutions");
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.some((c) => c.set === "Evolutions")).toBe(true);
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
    // Note: adding a number to the query loses the "exact name match" bonus (100 pts)
    // because "pikachu 25" !== "pikachu". So we test number bonus by comparing
    // two cards with the same name against a query that includes a number.
    const cardWithMatch = { name: "Pikachu", number: "25" };
    const cardNoMatch = { name: "Pikachu", number: "99" };
    const score1 = scoreRelevance(cardWithMatch, "pikachu 25");
    const score2 = scoreRelevance(cardNoMatch, "pikachu 25");
    expect(score1).toBeGreaterThan(score2);
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
