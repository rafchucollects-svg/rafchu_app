import { describe, expect, it } from "vitest";
import {
  buildMarketplaceSearchIndex,
  getMarketplaceCardKey,
  normalizeMarketplaceText,
  searchMarketplace,
} from "./marketplaceSearch";

const vendors = [
  {
    userId: "vendor-fi",
    profile: { username: "Rafchu Cards", country: "Finland" },
    totalCards: 2,
    inventory: [
      { cardId: "pika-25", name: "Pikachu", set: "Base Set", number: "25" },
      { cardId: "mew-151", name: "Mew ex", set: "151", number: "205" },
    ],
  },
  {
    userId: "vendor-se",
    profile: { username: "Nordic Collectibles", country: "Sweden" },
    totalCards: 1,
    inventory: [
      { cardId: "pika-25", name: "Pikachu", set: "Base Set", number: "25" },
    ],
  },
];

describe("marketplace search", () => {
  it("normalizes accents, casing, and punctuation", () => {
    expect(normalizeMarketplaceText("  Pokémon—EX  ")).toBe("pokemon ex");
  });

  it("uses stable card identities and merges vendors", () => {
    expect(getMarketplaceCardKey(vendors[0].inventory[0])).toBe("pika-25");
    const index = buildMarketplaceSearchIndex(vendors);
    expect(index.cards).toHaveLength(2);
    expect(index.cards.find((entry) => entry.key === "pika-25").vendors).toHaveLength(2);
  });

  it("ranks exact card matches and searches across card fields", () => {
    const results = searchMarketplace(buildMarketplaceSearchIndex(vendors), { query: "pikachu" });
    expect(results.totalCards).toBe(1);
    expect(results.cards[0].card.name).toBe("Pikachu");

    const setResults = searchMarketplace(buildMarketplaceSearchIndex(vendors), { query: "151 205" });
    expect(setResults.cards[0].card.name).toBe("Mew ex");
  });

  it("applies country and mode filters before returning results", () => {
    const index = buildMarketplaceSearchIndex(vendors);
    const cardResults = searchMarketplace(index, {
      query: "pikachu",
      mode: "cards",
      country: "Sweden",
    });
    expect(cardResults.vendors).toEqual([]);
    expect(cardResults.cards[0].vendors.map((vendor) => vendor.userId)).toEqual(["vendor-se"]);

    const vendorResults = searchMarketplace(index, {
      query: "rafchu",
      mode: "vendors",
      country: "Finland",
    });
    expect(vendorResults.cards).toEqual([]);
    expect(vendorResults.vendors.map((vendor) => vendor.userId)).toEqual(["vendor-fi"]);
  });

  it("limits rendered results while retaining total counts", () => {
    const manyVendors = [{
      ...vendors[0],
      inventory: Array.from({ length: 40 }, (_, index) => ({
        cardId: `pikachu-${index}`,
        name: `Pikachu ${index}`,
        set: "Test Set",
        number: String(index),
      })),
    }];
    const results = searchMarketplace(buildMarketplaceSearchIndex(manyVendors), {
      query: "pikachu",
      limit: 10,
    });
    expect(results.cards).toHaveLength(10);
    expect(results.totalCards).toBe(40);
  });
});
