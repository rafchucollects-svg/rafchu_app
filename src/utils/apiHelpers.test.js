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

  it("keeps a Japanese exact match when searching all languages", async () => {
    const fetchMock = vi.fn(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/searchCardMarket?")) {
        return {
          ok: true,
          json: async () => ({ success: true, results: [] }),
        };
      }
      if (requestUrl.includes("/searchJapaneseCards?")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            cards: [{
              name: "Mega Tokyo's Pikachu - 098/XY-P",
              set: "XY-P: XY Promos",
              number: "098/XY-P",
              language: "Japanese",
              isJapanese: true,
              image: "https://example.com/mega-tokyo-pikachu.png",
              tcgplayerId: "602003",
              prices: { tcgplayer: { market_price: 699, currency: "USD" } },
            }],
          }),
        };
      }
      return { ok: true, json: async () => ({ success: false }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await apiSearchCardsCached("mega tokyo pikachu", {
      useCache: false,
      maxResults: 20,
      languageScope: "all",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: "Mega Tokyo's Pikachu - 098/XY-P",
      language: "Japanese",
      isJapanese: true,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/searchCardMarket?")))
      .toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/searchJapaneseCards?")))
      .toBe(true);
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

describe("numbered-card provider fallbacks", () => {
  const cardMarketResponse = (cards) => ({
    ok: true,
    json: async () => ({
      success: true,
      results: cards.map(card => ({
        data: {
          id: card.id || `${card.name}-${card.number}`,
          name: card.name,
          card_number: card.number,
          rarity: card.rarity || "Rare Holo",
          image: card.image || "https://example.com/card.png",
          tcgid: card.tcgid,
          episode: { name: card.set },
          prices: { tcg_player: { market_price: card.price || 10, currency: "USD" } },
        },
      })),
    }),
  });

  const emptyJapaneseResponse = {
    ok: true,
    json: async () => ({ success: true, cards: [] }),
  };

  it("runs the number fallback when a large primary response has no relevant match", async () => {
    const irrelevantMoltres = Array.from({ length: 20 }, (_, index) => ({
      name: "Moltres",
      number: String(index + 1),
      set: `Set ${index + 1}`,
    }));
    const expected = {
      name: "Team Rocket's Moltres ex",
      number: "229",
      set: "Destined Rivals",
      rarity: "Special Illustration Rare",
      tcgid: "sv10-229",
    };

    const fetchMock = vi.fn(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/searchJapaneseCards?")) return emptyJapaneseResponse;
      if (requestUrl.includes("q=moltres%20229")) return cardMarketResponse(irrelevantMoltres);
      if (requestUrl.includes("q=229")) return cardMarketResponse([expected]);
      return cardMarketResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await apiSearchCardsCached("moltres 229", {
      useCache: false,
      maxResults: 50,
      languageScope: "all",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject(expected);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=229")))
      .toBe(true);
  });

  it("uses the curated Gold Star query for a matching name and number", async () => {
    const irrelevantMew = Array.from({ length: 20 }, (_, index) => ({
      name: "Mew",
      number: String(index + 1),
      set: `Mew Set ${index + 1}`,
    }));
    const expected = {
      name: "Mew ★ δ",
      number: "101",
      set: "EX Dragon Frontiers",
      rarity: "Rare Holo Star",
      tcgid: "ex15-101",
    };

    const fetchMock = vi.fn(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/searchJapaneseCards?")) return emptyJapaneseResponse;
      if (requestUrl.includes("q=mew%20101")) return cardMarketResponse(irrelevantMew);
      if (requestUrl.includes("q=101%20frontiers")) return cardMarketResponse([expected]);
      return cardMarketResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await apiSearchCardsCached("mew 101", {
      useCache: false,
      maxResults: 50,
      languageScope: "all",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject(expected);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=101%20frontiers")))
      .toBe(true);
  });

  it.each(["flareon gold star", "flareon 100"])(
    "uses the provider-specific Flareon Gold Star fallback for %s",
    async (query) => {
      const irrelevantFlareon = Array.from({ length: 20 }, (_, index) => ({
        name: "Flareon",
        number: String(index + 1),
        set: `Flareon Set ${index + 1}`,
      }));
      const expected = {
        name: "Flareon ★",
        number: "100",
        set: "EX Power Keepers",
        rarity: "Rare Holo Star",
        tcgid: "ex16-100",
      };

      const fetchMock = vi.fn(async (url) => {
        const requestUrl = String(url);
        if (requestUrl.includes("/searchJapaneseCards?")) return emptyJapaneseResponse;
        if (requestUrl.includes(`q=${encodeURIComponent(query)}`)) {
          return cardMarketResponse(irrelevantFlareon);
        }
        if (requestUrl.includes("q=100%20keepers")) return cardMarketResponse([expected]);
        return cardMarketResponse([]);
      });
      vi.stubGlobal("fetch", fetchMock);

      const results = await apiSearchCardsCached(query, {
        useCache: false,
        maxResults: 50,
        languageScope: "all",
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject(expected);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=100%20keepers")))
        .toBe(true);
    },
  );
});
