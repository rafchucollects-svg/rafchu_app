import { describe, expect, it } from "vitest";
import {
  buildCardDatabaseSearchTerms,
  selectCardDatabaseQueryTerms,
} from "./cardSearchCache";

describe("buildCardDatabaseSearchTerms", () => {
  it("normalizes and deduplicates card search terms", () => {
    expect(buildCardDatabaseSearchTerms("  Pokémon EX — 151 Pokémon ")).toEqual([
      "pokemon",
      "ex",
      "151",
    ]);
  });

  it("keeps at most ten Firestore array-contains-any terms", () => {
    const terms = buildCardDatabaseSearchTerms("one two three four five six seven eight nine ten eleven");
    expect(terms).toHaveLength(10);
    expect(terms.at(-1)).toBe("ten");
  });

  it("handles empty input", () => {
    expect(buildCardDatabaseSearchTerms("  ")).toEqual([]);
  });
});

describe("selectCardDatabaseQueryTerms", () => {
  it("queries Firestore with the most descriptive name term", () => {
    expect(selectCardDatabaseQueryTerms("charizard ex 199")).toEqual(["charizard"]);
  });

  it("skips generic card words before falling back to a number", () => {
    expect(selectCardDatabaseQueryTerms("pokemon ex 151")).toEqual(["151"]);
  });
});
