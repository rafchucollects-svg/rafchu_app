import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiFetchGradedPrices,
  apiSearchCardsCached,
  canonicalizeQuery,
  getEmbeddedGradedPrices,
  getEmbeddedMarketPrices,
  hasFreshEmbeddedMarketPrices,
  matchesLanguageScope,
} from "./apiHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("language-scoped search caching", () => {
  it("uses separate cache identities for each language scope", () => {
    expect(canonicalizeQuery(" Charizard 199 ", "english"))
      .not.toBe(canonicalizeQuery("charizard 199", "japanese"));
  });

  it("does not leak Japanese printings into the English scope", () => {
    const japanese = { language: "Japanese", isJapanese: true };
    expect(matchesLanguageScope(japanese, "english")).toBe(false);
    expect(matchesLanguageScope(japanese, "japanese")).toBe(true);
    expect(matchesLanguageScope(japanese, "all")).toBe(true);
  });
});

describe("embedded market data", () => {
  const card = {
    tcgplayerId: 517045,
    pricesLastUpdated: new Date().toISOString(),
    prices: {
      tcgplayer: {
        market_price: 380.19,
        low_price: 350,
        currency: "USD",
      },
      cardmarket: {
        avg30: 432.58,
        lowest_near_mint: 410,
        availableItems: 27,
        currency: "EUR",
      },
    },
  };

  it("reuses complete provider data without inventing low or high values", () => {
    expect(getEmbeddedMarketPrices(card)).toMatchObject({
      us: { found: true, market: 380.19, low: 350, high: null, currency: "USD" },
      eu: { found: true, avg: 432.58, low: 410, availableItems: 27, currency: "EUR" },
    });
  });

  it("recognizes a freshly enriched price record", () => {
    expect(hasFreshEmbeddedMarketPrices(card)).toBe(true);
  });
});

describe("embedded graded data", () => {
  const card = {
    name: "Charizard ex",
    tcgplayerId: 517045,
    prices: {
      cardmarket: {
        currency: "EUR",
        graded: { psa: { "10": { price: 900 } } },
      },
      ebay: {
        currency: "USD",
        graded: {
          psa: { "10": { median_price: 925, sample_size: 12 } },
        },
      },
    },
  };

  it("prefers the eBay sold median and retains its sample size", () => {
    expect(getEmbeddedGradedPrices(card, "PSA")["10"])
      .toEqual({ price: 925, sampleSize: 12 });
  });

  it("returns embedded graded data without a network request", async () => {
    await expect(apiFetchGradedPrices(card, "PSA", "10")).resolves.toMatchObject({
      success: true,
      graded: {
        price: 925,
        currency: "USD",
        sampleSize: 12,
        source: "eBay sold listings",
      },
    });
  });
});

describe("database cache enrichment", () => {
  it("continues to providers when the database only returns a weak rich match", async () => {
    const fetchMock = vi.fn(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/searchCards?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            results: [{
              id: "weak-25",
              name: "Ooyama's Pikachu",
              number: "25",
              set: "Vending",
              image: "https://example.com/weak.png",
              tcgplayerId: 1,
              prices: { tcgplayer: { market_price: 10, currency: "USD" } },
            }],
          }),
        };
      }

      if (requestUrl.includes("/searchCardMarket?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            results: [{
              data: {
                id: "base-25",
                name: "Pikachu",
                card_number: "25/102",
                rarity: "Common",
                image: "https://example.com/pikachu.png",
                tcgplayer_id: 42351,
                episode: { name: "Base Set" },
                prices: { tcg_player: { market_price: 14, currency: "USD" } },
              },
            }],
          }),
        };
      }

      return { ok: true, json: async () => ({ success: false }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await apiSearchCardsCached("pikachu 25", {
      useCache: false,
      maxResults: 20,
      languageScope: "english",
    });

    expect(results[0]).toMatchObject({ name: "Pikachu", number: "25/102" });
    expect(results.some(card => card.name === "Ooyama's Pikachu")).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/searchCardMarket?")))
      .toBe(true);
  });
});
