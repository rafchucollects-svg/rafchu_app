/**
 * API helpers for CardMarket API via Cloud Functions
 * Card search, caching, and detail fetching
 * 
 * SECURITY: All external API calls are routed through Cloud Functions
 * to keep API keys secure on the server side.
 */

import { normalizeApiCard } from './cardHelpers';
import { getAuth } from 'firebase/auth';

// Import improved search helpers (ranking is done ONCE via improveSearchResults)
import {
  improveSearchResults,
  isStrongSearchMatch,
  mergeBestData,
  preprocessQuery,
  parseQuery,
} from './searchHelpers';

// Cloud Functions base URL (secure - no API keys exposed)
const CLOUD_FUNCTIONS_BASE = (
  import.meta.env.VITE_CLOUD_FUNCTIONS_BASE ||
  'https://us-central1-rafchu-tcg-app.cloudfunctions.net'
).replace(/\/$/, '');
const CONDITION_PRICING_BETA_BASE = (
  import.meta.env.VITE_CONDITION_PRICING_BETA_BASE || CLOUD_FUNCTIONS_BASE
).replace(/\/$/, '');

// Legacy exports for backwards compatibility (no longer contain sensitive data)
export const RAPIDAPI_KEY = null; // REMOVED - now handled server-side
export const RAPIDAPI_HOST = "cardmarket-api-tcg.p.rapidapi.com";
export const API_BASE = CLOUD_FUNCTIONS_BASE;

// Cache configuration
export const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours for good results
export const CACHE_DURATION_LOW_RESULTS_MS = 2 * 60 * 60 * 1000; // 2 hours for low result count (might improve)
export const CACHE_LOW_RESULTS_THRESHOLD = 3; // Results below this count get shorter cache
export const SEARCH_CACHE_RESULT_LIMIT = 200;
export const MAX_SUGGESTION_LIMIT = 50;
export const DEFAULT_SUGGESTION_LIMIT = 5;

// CardMarket's broad search can bury older Gold Star printings behind newer
// cards with the same Pokemon name or collector number. These verified,
// narrowly targeted queries keep those printings discoverable without making
// every numbered-card search depend on a large provider response.
const GOLD_STAR_BY_POKEMON = {
  'pikachu':   '104 holon',
  'mewtwo':    '103 holon',
  'gyarados':  '102 holon',
  'charizard': '100 frontiers',
  'mew':       '101 frontiers',
  'rayquaza':  '107 deoxys',
  'latias':    '105 latias deoxys',
  'latios':    '106 latios deoxys',
  'entei':     '113 unseen',
  'raikou':    '114 unseen',
  'suicune':   '115 unseen',
  'groudon':   '111 groudon legend',
  'kyogre':    '112 kyogre legend',
  'alakazam':  '99 alakazam crystal',
  'celebi':    '100 celebi crystal',
  'mudkip':    '107 mudkip rocket',
  'torchic':   '108 torchic rocket',
  'treecko':   '109 treecko rocket',
  'flareon':   '100 keepers',
  'jolteon':   '101 keepers',
  'vaporeon':  '102 keepers',
};

// Cache version - increment when search logic changes to invalidate old cache
const CACHE_VERSION = 'v4.10-power-keepers-gold-stars';

// Simple search analytics (in-memory for now, could be sent to analytics service)
const searchAnalytics = {
  searches: [],
  maxEntries: 100,
  
  log(query, resultCount, source) {
    this.searches.push({
      query: query.toLowerCase().trim(),
      resultCount,
      source,
      timestamp: Date.now(),
    });
    // Keep only last N entries
    if (this.searches.length > this.maxEntries) {
      this.searches.shift();
    }
  },
  
  getRecentSearches() {
    return this.searches.slice(-20);
  },
  
  getZeroResultSearches() {
    return this.searches.filter(s => s.resultCount === 0);
  },
};

// In-memory cache
const searchCache = new Map();
const cardDetailCache = new Map();

/**
 * Normalize search query for caching (includes version for cache invalidation)
 */
export function canonicalizeQuery(query, languageScope = 'english') {
  if (!query || typeof query !== "string") return "";
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  return `${CACHE_VERSION}:${languageScope}:${normalized}`;
}

export function matchesLanguageScope(card, languageScope = 'english') {
  const isJapanese = Boolean(
    card?.isJapanese ||
    card?._isJapaneseCard ||
    String(card?.language || '').toLowerCase().startsWith('jap'),
  );
  if (languageScope === 'all') return true;
  if (languageScope === 'japanese') return isJapanese;
  return !isJapanese;
}

/**
 * Get cached search results
 * Uses adaptive cache duration - shorter for low result counts
 */
export function getSearchCacheEntry(canonical) {
  if (!canonical) return null;
  const entry = searchCache.get(canonical);
  if (!entry) return null;
  
  const age = Date.now() - entry.ts;
  const resultCount = entry.results?.length || 0;
  
  // Use shorter cache duration for low result counts (might improve with retry)
  const cacheDuration = resultCount < CACHE_LOW_RESULTS_THRESHOLD 
    ? CACHE_DURATION_LOW_RESULTS_MS 
    : CACHE_DURATION_MS;
  
  return {
    ...entry,
    expired: age > cacheDuration,
    resultCount,
    cacheDuration,
  };
}

/**
 * Save search results to cache
 * Stores result count for adaptive cache expiration
 */
export function setSearchCacheEntry(canonical, results) {
  if (!canonical) return;
  const resultArray = results || [];
  searchCache.set(canonical, {
    ts: Date.now(),
    results: resultArray,
    resultCount: resultArray.length,
  });
}

/**
 * INTERNAL: Fetch raw card results without ranking
 * Used by hybrid search to avoid duplicate ranking operations
 */
async function apiSearchCardsRaw(
  query,
  {
    maxResults = SEARCH_CACHE_RESULT_LIMIT,
    includeJapanese = false,
    signal = null,
  } = {},
) {
  if (!query?.trim()) return [];

  try {
    // Search both CardMarket (English) and JustTCG (Japanese) in parallel
    const searchPromises = [
      // CardMarket search (English cards)
      fetch(`${CLOUD_FUNCTIONS_BASE}/searchCardMarket?q=${encodeURIComponent(query)}&maxResults=${maxResults}`, { signal })
        .then(r => r.ok ? r.json() : { success: false })
        .catch(() => ({ success: false })),
    ];
    
    // Add Japanese card search if enabled
    if (includeJapanese) {
      searchPromises.push(
        fetch(`${CLOUD_FUNCTIONS_BASE}/searchJapaneseCards?q=${encodeURIComponent(query)}&limit=20`, { signal })
          .then(r => r.ok ? r.json() : { success: false })
          .catch(() => ({ success: false }))
      );
    }
    
    const [cardMarketData, japaneseData] = await Promise.all(searchPromises);
    
    // Process CardMarket results
    let items = [];
    if (cardMarketData?.success && cardMarketData?.results) {
      items = cardMarketData.results.map(raw => normalizeApiCard(raw)).filter(c => c?.name);
    }
    
    // Process Japanese card results and merge
    if (japaneseData?.success && japaneseData?.cards) {
      const japaneseItems = japaneseData.cards.map(card => ({
        // Map JustTCG format to our internal format
        id: card.justTcgId || card.id,
        name: card.name,
        set: card.set,
        number: card.number,
        rarity: card.rarity,
        nameNumbered: `${card.name} #${card.number}`,
        isJapanese: true,
        language: 'Japanese',
        // Images from TCGPlayer CDN
        image: card.image || card.imageUrl || '',
        imageUrl: card.imageUrl || card.image || '',
        imageSmall: card.imageSmall || card.image || '',
        imageLarge: card.imageLarge || card.image || '',
        // TCGPlayer ID for reference
        tcgplayerId: card.tcgplayerId,
        // Price info
        prices: card.prices,
        // Variants
        variants: card.variants,
        // Source tracking
        dataSource: 'justtcg',
        // Flag for UI
        _isJapaneseCard: true,
      })).filter(c => c?.name);
      
      // Merge Japanese cards with English cards
      items = [...items, ...japaneseItems];
      // Japanese cards added to results
    }
    
    return items; // Return RAW results - no ranking here!
  } catch (error) {
    console.error('CardMarket raw search error:', error);
    return [];
  }
}

/**
 * Search cards via Cloud Function proxy (secure - no API keys exposed)
 * Routes CardMarket API calls through server-side Cloud Functions
 * Also searches Japanese cards via JustTCG API
 * 
 * NOTE: This function applies ranking. For raw results, use apiSearchCardsRaw internally.
 */
export async function apiSearchCards(
  query,
  {
    useCache = true,
    allowExpired = false,
    maxResults = SEARCH_CACHE_RESULT_LIMIT,
    includeJapanese = false,
    skipRanking = false, // Allow skipping ranking for hybrid search
    signal = null,
  } = {},
) {
  if (!query?.trim()) return [];

  const canonical = canonicalizeQuery(query, includeJapanese ? 'all' : 'english');
  if (useCache) {
    const cached = getSearchCacheEntry(canonical);
    if (cached && cached.results.length) {
      if (!cached.expired || allowExpired) {
        return cached.results.slice(0, maxResults);
      }
    }
  }

  // Fetch raw results
  let items = await apiSearchCardsRaw(query, { maxResults, includeJapanese, signal });
  
  // If skipRanking is true, return raw results (used by hybrid search)
  if (skipRanking) {
    return items.slice(0, maxResults);
  }
  
  // Apply ranking for standalone use
  items = improveSearchResults(items, query, {
    maxResults,
    enableDeduplication: true,
    enableFiltering: true,
    enableRanking: true,
  });
    
  if (items.length) {
    setSearchCacheEntry(canonical, items);
  }
  
  return items;
}

/**
 * Fetch detailed card information via Cloud Function (secure)
 */
export async function apiFetchCardDetails(card) {
  if (!card) return null;
  const cacheKey =
    card?.id ||
    card?.slug ||
    card?.nameNumbered ||
    `${card?.name || ""}#${card?.number || ""}`;

  if (cacheKey && cardDetailCache.has(cacheKey)) {
    return cardDetailCache.get(cacheKey);
  }

  const hasCanonicalIdentity = Boolean(
    card.tcgid || card.tcgplayerId || card.tcgPlayerId || card.cardmarketId || card.cardMarketId,
  );
  const hasCoreDetails = Boolean(card.name && card.set && card.number && card.image && card.rarity);
  if (hasCanonicalIdentity && hasCoreDetails) {
    if (cacheKey) cardDetailCache.set(cacheKey, card);
    return card;
  }

  // Try to fetch card details via Cloud Function if we have an ID
  if (card.id) {
    try {
      const url = `${CLOUD_FUNCTIONS_BASE}/getCardDetails?id=${encodeURIComponent(card.id)}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.card) {
          const normalized = normalizeApiCard(data.card);
          if (cacheKey) cardDetailCache.set(cacheKey, normalized);
          return normalized;
        }
      }
    } catch {
      // ignore and fallback to search
    }
  }

  // Fallback: search for the card (uses secure Cloud Function)
  const query =
    card.nameNumbered ||
    `${card.name || ""} ${card.number || ""}`.trim() ||
    card.name;
  if (query) {
    try {
      const results = await apiSearchCards(query, {
        allowExpired: true,
        maxResults: 20,
      });
      const match =
        results.find((c) => c.id && card.id && c.id === card.id) ||
        results.find(
          (c) =>
            c.slug && card.slug && c.slug === card.slug &&
            c.number === card.number,
        ) ||
        results.find(
          (c) =>
            c.name === card.name &&
            c.number === card.number &&
            c.set === card.set,
        ) ||
        results[0];
      if (match && cacheKey) {
        cardDetailCache.set(cacheKey, match);
      }
      return match || card;
    } catch {
      // ignore
    }
  }

  return card;
}

/**
 * Enrich a card object with market prices from the apiFetchMarketPrices response.
 * Mutates and returns the card. Handles US (TCGPlayer) and EU (CardMarket) prices.
 * 
 * @param {object} card - The card object to enrich (will be mutated)
 * @param {object} marketPrices - Response from apiFetchMarketPrices()
 * @returns {object} The enriched card
 */
export function enrichCardWithMarketPrices(card, marketPrices) {
  if (!card || !marketPrices) return card;

  card.prices = card.prices || {};

  // US / TCGPlayer prices
  if (marketPrices.us?.found) {
    card.prices.tcgplayer = {
      ...(card.prices.tcgplayer || {}),
      market_price: marketPrices.us.market,
      low_price: marketPrices.us.low,
      mid_price: marketPrices.us.mid,
      high_price: marketPrices.us.high,
      currency: marketPrices.us.currency || card.prices.tcgplayer?.currency || 'USD',
      source: marketPrices.us.source || 'TCGPlayer',
      lastUpdated: marketPrices.us.lastUpdated || new Date().toISOString(),
      tcgPlayerId: marketPrices.us.tcgPlayerId || null,
    };
    if (marketPrices.us.tcgPlayerId) {
      card.tcgPlayerId = marketPrices.us.tcgPlayerId;
      card.tcgplayerId = marketPrices.us.tcgPlayerId;
    }
    card.priceSource = marketPrices.us.source || 'TCGPlayer';
  }

  // EU / CardMarket prices
  if (marketPrices.eu?.found) {
    card.prices.cardmarket = {
      ...(card.prices.cardmarket || {}),
      avg30: marketPrices.eu.avg,
      avg7: marketPrices.eu.trend,
      lowest_near_mint: marketPrices.eu.low,
      averageSellPrice: marketPrices.eu.avg,
      lowPrice: marketPrices.eu.low,
      trendPrice: marketPrices.eu.trend,
      currency: marketPrices.eu.currency || card.prices.cardmarket?.currency || 'EUR',
      availableItems: marketPrices.eu.availableItems ?? card.prices.cardmarket?.availableItems ?? null,
      countryLows: marketPrices.eu.countryLows || card.prices.cardmarket?.countryLows || {},
      graded: marketPrices.eu.graded || card.prices.cardmarket?.graded || {},
      lastUpdated: marketPrices.eu.lastUpdated || new Date().toISOString(),
    };
    if (marketPrices.eu.ebayGraded && Object.keys(marketPrices.eu.ebayGraded).length > 0) {
      card.prices.ebay = {
        ...(card.prices.ebay || {}),
        currency: marketPrices.eu.ebayCurrency || card.prices.ebay?.currency || 'USD',
        graded: marketPrices.eu.ebayGraded,
      };
    }
    if (marketPrices.eu.cardmarketId) {
      card.cardMarketId = marketPrices.eu.cardmarketId;
      card.cardmarketId = marketPrices.eu.cardmarketId;
    }
    if (marketPrices.eu.tcgplayerId && !card.tcgplayerId && !card.tcgPlayerId) {
      card.tcgplayerId = marketPrices.eu.tcgplayerId;
      card.tcgPlayerId = marketPrices.eu.tcgplayerId;
    }
    if (marketPrices.eu.tcgid) card.tcgid = marketPrices.eu.tcgid;
  }

  card.pricesLastUpdated = marketPrices.timestamp || new Date().toISOString();

  return card;
}

/**
 * Format search results for display
 */
export function formatSearchResults(results, query, limit) {
  if (!Array.isArray(results)) return [];
  return improveSearchResults(results, query, {
    maxResults: limit,
    enableDeduplication: true,
    enableFiltering: true,
    enableRanking: true,
  }).map((card) => ({
    ...card,
    searchQuery: query,
  }));
}

function numericPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getEmbeddedMarketPrices(card) {
  const tcg = card?.prices?.tcgplayer || {};
  const cm = card?.prices?.cardmarket || {};
  const market = numericPrice(tcg.market_price ?? tcg.mid_price);
  const cmAverage = numericPrice(cm.avg30 ?? cm['30d_average'] ?? cm.avg7 ?? cm['7d_average']);
  const cmLow = numericPrice(cm.lowest_near_mint ?? cm.lowest ?? cm.lowest_price);
  const timestamp = card?.pricesLastUpdated || tcg.lastUpdated || cm.lastUpdated || null;

  return {
    us: market > 0 ? {
      found: true,
      source: tcg.source || 'TCGPlayer',
      market,
      low: numericPrice(tcg.low_price) || null,
      mid: numericPrice(tcg.mid_price) || market,
      high: numericPrice(tcg.high_price) || null,
      currency: tcg.currency || 'USD',
      tcgPlayerId: card?.tcgplayerId || card?.tcgPlayerId || tcg.tcgPlayerId || null,
      lastUpdated: tcg.lastUpdated || timestamp,
    } : { found: false, source: 'TCGPlayer' },
    eu: cmAverage > 0 || cmLow > 0 ? {
      found: true,
      source: 'CardMarket',
      avg: cmAverage || cmLow,
      low: cmLow || cmAverage,
      trend: numericPrice(cm.avg7 ?? cm['7d_average'] ?? cm.trend) || cmAverage || cmLow,
      currency: cm.currency || 'EUR',
      availableItems: cm.availableItems ?? cm.available_items ?? null,
      countryLows: cm.countryLows || {},
      lastUpdated: cm.lastUpdated || timestamp,
    } : { found: false, source: 'CardMarket' },
    timestamp,
  };
}

export function hasFreshEmbeddedMarketPrices(card, maxAgeMs = CACHE_DURATION_MS) {
  const embedded = getEmbeddedMarketPrices(card);
  if (!embedded.us?.found && !embedded.eu?.found) return false;
  const updatedAt = timestampToMillis(embedded.timestamp);
  return updatedAt > 0 && Date.now() - updatedAt <= maxAgeMs;
}

function normalizeGradedEntry(entry) {
  if (typeof entry === 'number') return { price: numericPrice(entry), sampleSize: null };
  return {
    price: numericPrice(entry?.median_price ?? entry?.medianPrice ?? entry?.price),
    sampleSize: Number(entry?.sample_size ?? entry?.sampleSize) || null,
  };
}

export function getEmbeddedGradedPrices(card, gradingCompany) {
  const companyKey = String(gradingCompany || 'PSA').toLowerCase();
  const ebayCompany = card?.prices?.ebay?.graded?.[companyKey] || {};
  const cardmarketCompany = card?.prices?.cardmarket?.graded?.[companyKey] || {};
  const allGrades = {};

  Object.entries(cardmarketCompany).forEach(([key, value]) => {
    const grade = String(key).toLowerCase().replace(companyKey, '').replace(/_/g, '.');
    const normalized = normalizeGradedEntry(value);
    if (grade && normalized.price > 0) allGrades[grade] = normalized;
  });
  Object.entries(ebayCompany).forEach(([grade, value]) => {
    const normalized = normalizeGradedEntry(value);
    if (normalized.price > 0) allGrades[String(grade)] = normalized;
  });

  return allGrades;
}

/**
 * Resolve graded prices from data already supplied by CardMarket/eBay. PSA can
 * additionally fall back to Pokemon Price Tracker, the supported live source.
 */
export async function apiFetchGradedPrices(card, gradingCompany, grade) {
  if (!card) {
    console.error('apiFetchGradedPrices: No card provided');
    return null;
  }
  
  // Validate that we have at least a card name
  const cardName = card.name || card.fullName || '';
  if (!cardName) {
    console.error('apiFetchGradedPrices: Card has no name', card);
    return { success: false, error: 'Card name is required' };
  }
  
  const company = gradingCompany || 'PSA';
  const gradeKey = String(grade || '10');
  const embeddedGrades = getEmbeddedGradedPrices(card, company);
  const embedded = embeddedGrades[gradeKey];
  if (embedded?.price > 0) {
    const hasEbayGrade = Boolean(card?.prices?.ebay?.graded?.[company.toLowerCase()]?.[gradeKey]);
    return {
      success: true,
      card: { name: cardName, tcgplayerId: card.tcgplayerId || card.tcgPlayerId || null },
      graded: {
        company,
        grade: gradeKey,
        price: embedded.price,
        currency: hasEbayGrade
          ? (card?.prices?.ebay?.currency || 'USD')
          : (card?.prices?.cardmarket?.currency || 'EUR'),
        sampleSize: embedded.sampleSize,
        source: hasEbayGrade ? 'eBay sold listings' : 'CardMarket graded data',
        allGrades: { [company.toLowerCase()]: Object.fromEntries(
          Object.entries(embeddedGrades).map(([itemGrade, value]) => [itemGrade, value.price]),
        ) },
      },
    };
  }

  if (String(company).toUpperCase() !== 'PSA') {
    return { success: false, error: `No verified ${company} ${gradeKey} market data is available` };
  }

  try {
    const params = new URLSearchParams({
      name: cardName,
      set: card.set || card.episode?.name || '',
      cardNumber: card.number || card.card_number || '',
      grade: gradeKey,
    });
    
    const url = `${CLOUD_FUNCTIONS_BASE}/getPsaGradedPrice?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    const data = await response.json();
    if (!data.success || !numericPrice(data.price)) return data;
    return {
      success: true,
      card: {
        name: data.cardName || cardName,
        set: data.setName || card.set,
        number: data.cardNumber || card.number,
        tcgplayerId: data.tcgPlayerId || card.tcgplayerId || card.tcgPlayerId || null,
      },
      graded: {
        company: 'PSA',
        grade: gradeKey,
        price: numericPrice(data.price),
        currency: 'USD',
        confidence: data.confidence || null,
        source: 'Pokemon Price Tracker / eBay',
        allGrades: { psa: { [gradeKey]: numericPrice(data.price) } },
      },
    };
  } catch (error) {
    console.error('Error fetching graded prices:', error);
    return { success: false, error: error.message };
  }
}

export async function apiFetchMarketPrices(card, { force = false } = {}) {
  try {
    if (!force && hasFreshEmbeddedMarketPrices(card)) {
      return getEmbeddedMarketPrices(card);
    }
    
    const params = new URLSearchParams({
      name: card.name,
      ...(card.set && { set: card.set }),
      ...(card.number && { number: card.number }),
      ...(card.setCode && { setCode: card.setCode }),
      ...(card.setSeries && { series: card.setSeries }),
      ...((card.tcgplayerId || card.tcgPlayerId) && { tcgplayerId: card.tcgplayerId || card.tcgPlayerId }),
      ...((card.cardmarketId || card.cardMarketId) && { cardmarketId: card.cardmarketId || card.cardMarketId }),
      ...(card.tcgid && { tcgid: card.tcgid }),
    });
    
    const url = `${CLOUD_FUNCTIONS_BASE}/fetchMarketPrices?${params}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch market prices:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.warn('⚠️ Market prices API returned unsuccessful response');
      return null;
    }
    
    // Market prices fetched
    return data.prices; // { us: {...}, eu: {...} }
    
  } catch (error) {
    console.error('❌ Error fetching market prices:', error);
    return null;
  }
}

/**
 * Testing-only exact condition/printing lookup.
 * This endpoint is user-triggered and never changes the saved seller price.
 */
export async function apiFetchConditionAwarePriceBeta(card, { printing = '' } = {}) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in to test condition-aware pricing.');

  const token = await user.getIdToken();
  const params = new URLSearchParams({
    name: card?.name || '',
    condition: card?.condition || 'NM',
    language: card?.language || (card?.isJapanese ? 'Japanese' : 'English'),
    ...(card?.set && { set: card.set }),
    ...(card?.number && { number: card.number }),
    ...(card?.rarity && { rarity: card.rarity }),
    ...((card?.tcgplayerId || card?.tcgPlayerId) && {
      tcgplayerId: card.tcgplayerId || card.tcgPlayerId,
    }),
    ...((printing || card?.variant) && { printing: printing || card.variant }),
  });

  const response = await fetch(`${CONDITION_PRICING_BETA_BASE}/getConditionAwarePriceBeta?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Condition-aware pricing returned HTTP ${response.status}.`);
  }
  return payload.result;
}

/**
 * Provider fallback search used when the shared card database has no match.
 * CardMarket and Japanese results are normalized here; prices are fetched
 * on-demand via apiFetchMarketPrices when the user selects a card.
 * 
 * Now includes query preprocessing for typo correction and set expansion!
 */
export async function apiSearchCardsHybrid(query, options = {}) {
  const { 
    useCache = true, 
    allowExpired = false, 
    maxResults = SEARCH_CACHE_RESULT_LIMIT,
    signal = null,
    languageScope = 'english',
  } = options;
  
  if (!query?.trim()) return [];
  
  // STEP 0: Preprocess query (typo correction, set expansion)
  const { processed: processedQuery, wasModified } = preprocessQuery(query);
  
  if (wasModified) {
    // Query preprocessed (typos/sets corrected)
  }
  
  // STEP 0.5: Smart query for API - handle set names specially
  // APIs search card NAMES, not set names. So "pikachu celebrations" won't find Pikachu FROM Celebrations.
  // Solution: When set is specified, search BOTH the Pokemon name AND just the set name, then merge.
  const parsed = parseQuery(processedQuery || query);
  let searchQuery = processedQuery || query;
  let setOnlyQueries = []; // Secondary queries for set-specific search
  
  // Set aliases: some sets are subsets and need parent set search to find cards
  // e.g., "Classic Collection" is within "Celebrations" - API only finds it via "celebrations"
  const SET_PARENT_ALIASES = {
    'classic': 'celebrations',
    'classic collection': 'celebrations',
    'collection': null, // Don't expand "collection" alone - too generic
    'promo': null, // "promo" is a filter, not a search term
    'promos': null,
  };
  
  // If we have a Pokemon name AND any specific filters
  const hasFilters = parsed.numbers.length > 0 || parsed.setWords.length > 0 || parsed.cardTypes.length > 0 || (parsed.rarityFilters || []).length > 0;
  
  // Handle rarity-only searches (e.g., "gold star" with no Pokemon name)
  // The API should search for the rarity phrase directly to find matching cards
  if (!parsed.primaryName && (parsed.rarityFilters || []).length > 0) {
    searchQuery = parsed.rarityFilters.join(' ');
    if (parsed.cardTypes.length > 0) {
      searchQuery = `${searchQuery} ${parsed.cardTypes.join(' ')}`;
    }
    
    // GOLD STAR SPECIAL HANDLING:
    // The CardMarket API searches by card name, but Gold Star cards are named
    // "Pikachu ★", "Charizard ★ δ" etc. The API strips the ★ symbol from queries,
    // so "gold star" returns irrelevant results like "Gold Potion".
    // Solution: fire targeted secondary queries using "cardNumber setKeyword"
    // patterns that we've verified return actual Gold Star cards.
    // Limited to ~8 iconic cards to avoid hitting RapidAPI rate limits.
    if (parsed.rarityFilters.includes('gold star')) {
      const GOLD_STAR_QUERIES = [
        '104 holon',         // Pikachu ★ — Holon Phantoms
        '103 holon',         // Mewtwo ★ — Holon Phantoms
        '100 frontiers',     // Charizard ★ δ — Dragon Frontiers
        '101 frontiers',     // Mew ★ δ — Dragon Frontiers
        '107 deoxys',        // Rayquaza ★ — Deoxys
        '113 unseen',        // Entei ★ — Unseen Forces
        '114 unseen',        // Raikou ★ — Unseen Forces
        '115 unseen',        // Suicune ★ — Unseen Forces
      ];
      setOnlyQueries.push(...GOLD_STAR_QUERIES);
    }
  }
  
  if (parsed.primaryName && parsed.primaryName.length >= 2 && hasFilters) {
    // Start with the Pokemon name
    searchQuery = parsed.primaryName;
    
    // IMPORTANT: Include card type AND number in search query
    // The API returns MUCH better results with the full query:
    // - "charizard v" → returns "Charizard", "Charizard VSTAR" (wrong!)
    // - "charizard v 154" → returns "Charizard V #154" (correct!)
    if (parsed.cardTypes.length > 0) {
      searchQuery = `${parsed.primaryName} ${parsed.cardTypes.join(' ')}`;
    }
    // Include rarity phrases in the search query (e.g., "pikachu gold star")
    if ((parsed.rarityFilters || []).length > 0) {
      searchQuery = `${searchQuery} ${parsed.rarityFilters.join(' ')}`;
      
      // GOLD STAR + POKEMON NAME: Add targeted secondary search
      // e.g., "pikachu gold star" → also search "104 holon" to find Pikachu ★
      if (parsed.rarityFilters.includes('gold star')) {
        const targetedQuery = GOLD_STAR_BY_POKEMON[parsed.primaryName.toLowerCase()];
        if (targetedQuery) {
          setOnlyQueries.push(targetedQuery);
        }
      }
    }
    // Also include numbers in the search query - API uses them for better matching
    if (parsed.numbers.length > 0) {
      searchQuery = `${searchQuery} ${parsed.numbers.join(' ')}`;
    }
    
    // TAG TEAM DETECTION: If we have multiple words in primaryName AND card type is GX,
    // this could be a Tag Team card (e.g., "Reshiram Charizard GX" → "Reshiram & Charizard-GX")
    // The API doesn't find Tag Team cards when searching both names together,
    // but DOES find them when searching just the first Pokemon name.
    const primaryNameWords = parsed.primaryName.split(/\s+/);
    const isLikelyTagTeam = primaryNameWords.length >= 2 && 
                           parsed.cardTypes.includes('gx') &&
                           !parsed.setWords.length; // No set specified
    
    if (isLikelyTagTeam) {
      // Search by just the first Pokemon name (API will return Tag Team cards)
      // e.g., "Reshiram Charizard GX" → search "Reshiram" to find "Reshiram & Charizard-GX"
      searchQuery = primaryNameWords[0];
      // Also search for the second Pokemon name to ensure we cover both directions
      // e.g., "Pikachu Zekrom GX" - searching "Pikachu" AND "Zekrom" separately
      if (primaryNameWords.length >= 2) {
        setOnlyQueries.push(primaryNameWords[1]);
      }
    }
    
    // If set words are present, also do separate searches for set names
    if (parsed.setWords.length > 0) {
      const setQuery = parsed.setWords.join(' ').toLowerCase();
      // Only add if it's not a generic term like "promo"
      if (!['promo', 'promos', 'promotional'].includes(setQuery)) {
        setOnlyQueries.push(setQuery);
      }
      
      // IMPORTANT: Also search the COMBINED "name + set" query.
      // The API often returns much better results for combined queries:
      // "celebrations charizard" → Charizard from Celebrations (correct!)
      // vs. separate "charizard" + "celebrations" → miss the right card.
      setOnlyQueries.push(`${setQuery} ${parsed.primaryName}`);
      
      // Check if this set has a parent alias we should also search
      // e.g., "classic" → also search "celebrations"
      for (const [alias, parent] of Object.entries(SET_PARENT_ALIASES)) {
        if (setQuery.includes(alias) && parent && !setOnlyQueries.includes(parent)) {
          setOnlyQueries.push(parent);
        }
      }
    }
    
    // If searching with a number, also search for just the number
    // This catches cards that might be ranked low in name searches but high in number searches
    // e.g., "Reshiram Charizard GX 217" - searching "Reshiram" might not return #217, but searching "217" will
    if (parsed.numbers.length > 0) {
      // Add direct number search
      for (const num of parsed.numbers) {
        // Only add if it's a reasonable card number (not too short to be meaningful)
        if (num.length >= 2 || parseInt(num) >= 10) {
          setOnlyQueries.push(num);
        }
      }

      // A name + collector number is enough to identify the known Gold Star
      // printing. Users should not also have to type the rarity or set name.
      // Example: "mew 101" needs "101 frontiers" because the provider's
      // generic 101 results are dominated by newer cards.
      const targetedGoldStarQuery = GOLD_STAR_BY_POKEMON[parsed.primaryName.toLowerCase()];
      if (targetedGoldStarQuery) {
        const targetedNumber = targetedGoldStarQuery.split(/\s+/)[0].replace(/^0+/, '') || '0';
        const hasTargetedNumber = parsed.numbers.some(number => {
          const queryNumber = String(number).split('/')[0].replace(/^0+/, '') || '0';
          return queryNumber === targetedNumber;
        });
        if (hasTargetedNumber && !setOnlyQueries.includes(targetedGoldStarQuery)) {
          setOnlyQueries.push(targetedGoldStarQuery);
        }
      }
      
      // If no explicit set, also try "[name] promo" search for promo variants
      if (parsed.setWords.length === 0) {
        setOnlyQueries.push(`${parsed.primaryName} promo`);
      }
    }
    
  }
  
  // Check cache first (using original query for cache key)
  const canonical = canonicalizeQuery(query, languageScope);
  if (useCache) {
    const cached = getSearchCacheEntry(canonical);
    if (cached && cached.results.length) {
      if (!cached.expired || allowExpired) {
        return cached.results.slice(0, maxResults);
      }
    }
  }
  
  // Bail early if already aborted
  if (signal?.aborted) return [];
  
  // Keep a timeout guard around provider calls so a slow upstream cannot hold
  // the UI indefinitely.
  const timeout = (ms) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Search timeout')), ms)
  );
  
  const cardMarketResults = await Promise.race([
    apiSearchCards(searchQuery, {
      useCache: false,
      maxResults,
      includeJapanese: languageScope !== 'english',
      skipRanking: true,
      signal,
    }),
    timeout(8000),
  ]).catch(err => {
    if (err?.name !== 'AbortError') console.error('Card search error:', err.message);
    return [];
  });

  // Judge the primary response by relevant matches, not its raw size. A query
  // such as "moltres 229" can return 20 Moltres cards without returning #229;
  // that must still trigger the targeted number fallback.
  const primaryRelevantResults = improveSearchResults(
    cardMarketResults,
    processedQuery || query,
    {
      maxResults: DEFAULT_SUGGESTION_LIMIT,
      enableDeduplication: true,
      enableFiltering: true,
      enableRanking: true,
    },
  );
  const primaryNeedsFallback =
    cardMarketResults.length < DEFAULT_SUGGESTION_LIMIT ||
    primaryRelevantResults.length === 0;

  let setSearchResults = [];
  if (primaryNeedsFallback && setOnlyQueries.length > 0 && !signal?.aborted) {
    const isRaritySearch = (parsed.rarityFilters || []).length > 0;
    const secondaryMaxResults = isRaritySearch ? 5 : 50;
    setSearchResults = await Promise.all(setOnlyQueries.map(setQuery =>
      Promise.race([
        apiSearchCards(setQuery, {
          useCache: false,
          maxResults: secondaryMaxResults,
          includeJapanese: languageScope !== 'english',
          skipRanking: true,
          signal,
        }),
        timeout(8000),
      ]).catch(err => {
        if (err?.name !== 'AbortError') console.error(`Set search "${setQuery}" error:`, err.message);
        return [];
      })
    ));
  }
  
  // Bail if aborted while waiting for API responses
  if (signal?.aborted) return [];
  
  // Merge all set search results into cardMarket results
  const combinedCardMarketResults = [...cardMarketResults, ...setSearchResults.flat()];
  
  // Helper to normalize set names for better deduplication
  const normalizeSetName = (setName) => {
    if (!setName) return '';
    return setName
      .toLowerCase()
      .replace(/pokemon\s+/gi, '') // Remove "Pokemon" prefix
      .replace(/\s+/g, '') // Remove all spaces
      .replace(/[^a-z0-9]/g, ''); // Remove special characters
  };
  
  // Helper to create deduplication key
  const createCardKey = (card) => {
    const normalizedSet = normalizeSetName(card.set || card.episode?.name || '');
    const normalizedName = (card.name || '').toLowerCase().replace(/\s+/g, '');
    // Handle both card.number and card.card_number (API inconsistency)
    const number = (card.number || card.card_number || '').toString().toLowerCase();
    return `${normalizedName}-${normalizedSet}-${number}`;
  };
  
  // Create a Map to track unique cards (avoid duplicates)
  const cardMap = new Map();
  
  // Add CardMarket results (they have better images and set data)
  // Use combined results which includes set-only search results
  combinedCardMarketResults.forEach((cmCard) => {
    const key = createCardKey(cmCard);
    // Normalize field names (API returns card_number, we use number)
    const normalizedCard = {
      ...cmCard,
      number: cmCard.number || cmCard.card_number, // Normalize card number field
      set: cmCard.set || cmCard.episode?.name, // Normalize set field
      source: cmCard.dataSource === 'justtcg' || cmCard._isJapaneseCard ? 'justtcg' : 'cardmarket',
    };
    cardMap.set(
      key,
      cardMap.has(key) ? mergeBestData(cardMap.get(key), normalizedCard) : normalizedCard,
    );
  });
  
  // Convert Map back to array
  let finalResults = Array.from(cardMap.values())
    .filter(card => matchesLanguageScope(card, languageScope));
  
  // Applying search improvements (filter, dedupe, rank)
  
  // Apply comprehensive search improvements
  // - Filters out irrelevant cards (e.g., non-Charizard cards when searching "charizard 199")
  // - Deduplicates and merges duplicate entries
  // - Ranks by relevance score
  // - Limits to top results
  // Use ORIGINAL PROCESSED query for filtering (includes number for proper filtering)
  // NOT the searchQuery which might have number stripped for better API results
  const filterQuery = processedQuery || query;
  finalResults = improveSearchResults(finalResults, filterQuery, {
    maxResults: maxResults,
    enableDeduplication: true,
    enableFiltering: true,
    enableRanking: true,
  });
  
  // Cache the improved results
  if (finalResults.length) {
    setSearchCacheEntry(canonical, finalResults);
  }
  
  // Log search analytics
  searchAnalytics.log(query, finalResults.length, 'hybrid');
  
  // Clean summary log (not verbose debug)
  const cmCount = finalResults.filter(c => c.source === 'cardmarket').length;
  const jpCount = finalResults.filter(c => c.source === 'justtcg').length;
  if (import.meta.env.DEV) console.log(`✅ Search "${query}" → ${finalResults.length} results (${cmCount} CM, ${jpCount} JP)`);
  
  return finalResults;
}

/**
 * Search Cards with Intelligent Caching (Expand-on-Search)
 * Uses the new searchCards Cloud Function that:
 * 1. Queries card_database cache first (FAST)
 * 2. Falls back to API if not cached
 * 3. Automatically caches new cards
 * 4. Returns results with prices included
 * 
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @returns {Promise<Array>} - Array of card results
 */
export async function apiSearchCardsCached(query, options = {}) {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const {
    useCache = true,
    maxResults = MAX_SUGGESTION_LIMIT,
    signal = null,
    languageScope = 'english',
    skipDatabaseCache = false,
  } = options;

  // Searching with intelligent cache
  if (skipDatabaseCache || languageScope !== 'english') {
    return apiSearchCardsHybrid(query, { ...options, signal, languageScope });
  }
  
  try {
    const searchUrl = `https://us-central1-rafchu-tcg-app.cloudfunctions.net/searchCards?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, { signal });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Search failed');
    }
    
    // Results from intelligent cache
    
    // If cached search returned results, use them
    if (data.results.length > 0) {
      const cachedResults = improveSearchResults(data.results, query, {
        maxResults,
        enableDeduplication: true,
        enableFiltering: true,
        enableRanking: true,
      });
      const hasRichStrongMatch = cachedResults.some(card => {
        const hasIdentity = Boolean(
          card.tcgid || card.tcgplayerId || card.tcgPlayerId || card.cardmarketId || card.cardMarketId,
        );
        const hasPrice = Number(
          card.prices?.tcgplayer?.market_price ||
          card.prices?.cardmarket?.lowest_near_mint ||
          card.prices?.cardmarket?.avg30,
        ) > 0;
        return hasIdentity && hasPrice && Boolean(card.image) && isStrongSearchMatch(card, query);
      });

      if (hasRichStrongMatch) {
        if (useCache) setSearchCacheEntry(canonicalizeQuery(query, languageScope), cachedResults);
        return cachedResults;
      }

      // Keep the fast cache candidates visible in the final merge, but do not
      // let weak or sparse matches prevent a real provider lookup.
      const providerResults = await apiSearchCardsHybrid(query, {
        ...options,
        useCache: false,
        signal,
        languageScope,
      });
      const mergedResults = improveSearchResults(
        [...cachedResults, ...providerResults],
        query,
        {
          maxResults,
          enableDeduplication: true,
          enableFiltering: true,
          enableRanking: true,
        },
      );
      if (useCache && mergedResults.length > 0) {
        setSearchCacheEntry(canonicalizeQuery(query, languageScope), mergedResults);
      }
      return mergedResults;
    }
    
    // No results from the database-backed endpoint: use the provider fallback.
    return apiSearchCardsHybrid(query, { ...options, signal });
    
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) return [];
    console.error('❌ Cached search failed, falling back to hybrid search:', error.message);
    // Fallback to the existing hybrid search if cache search fails
    return apiSearchCardsHybrid(query, { ...options, signal });
  }
}
