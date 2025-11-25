/**
 * API helpers for CardMarket API via Cloud Functions
 * Card search, caching, and detail fetching
 * 
 * SECURITY: All external API calls are routed through Cloud Functions
 * to keep API keys secure on the server side.
 */

import { normalizeApiCard, splitQuery, tokenize, extractNumberPieces } from './cardHelpers';

// Import improved search helpers
import {
  improveSearchResults,
  filterByRelevance,
  rankByRelevance,
  deduplicateResults,
} from './searchHelpers';

// Cloud Functions base URL (secure - no API keys exposed)
const CLOUD_FUNCTIONS_BASE = 'https://us-central1-rafchu-tcg-app.cloudfunctions.net';

// Legacy exports for backwards compatibility (no longer contain sensitive data)
export const RAPIDAPI_KEY = null; // REMOVED - now handled server-side
export const RAPIDAPI_HOST = "cardmarket-api-tcg.p.rapidapi.com";
export const API_BASE = CLOUD_FUNCTIONS_BASE;

// Cache configuration
export const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
export const SEARCH_CACHE_RESULT_LIMIT = 200;
export const MAX_SUGGESTION_LIMIT = 50;
export const DEFAULT_SUGGESTION_LIMIT = 5;

// Cache version - increment when search logic changes to invalidate old cache
const CACHE_VERSION = 'v2.1-merged-apis';

// In-memory cache
const searchCache = new Map();
const cardDetailCache = new Map();

/**
 * Normalize search query for caching (includes version for cache invalidation)
 */
export function canonicalizeQuery(query) {
  if (!query || typeof query !== "string") return "";
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  return `${CACHE_VERSION}:${normalized}`;
}

/**
 * Get cached search results
 */
export function getSearchCacheEntry(canonical) {
  if (!canonical) return null;
  const entry = searchCache.get(canonical);
  if (!entry) return null;
  const age = Date.now() - entry.ts;
  return {
    ...entry,
    expired: age > CACHE_DURATION_MS,
  };
}

/**
 * Save search results to cache
 */
export function setSearchCacheEntry(canonical, results) {
  if (!canonical) return;
  searchCache.set(canonical, {
    ts: Date.now(),
    results: results || [],
  });
}

/**
 * Search cards via Cloud Function proxy (secure - no API keys exposed)
 * Routes CardMarket API calls through server-side Cloud Functions
 */
export async function apiSearchCards(
  query,
  {
    useCache = true,
    allowExpired = false,
    maxResults = SEARCH_CACHE_RESULT_LIMIT,
  } = {},
) {
  if (!query?.trim()) return [];

  const canonical = canonicalizeQuery(query);
  if (useCache) {
    const cached = getSearchCacheEntry(canonical);
    if (cached && cached.results.length) {
      if (!cached.expired || allowExpired) {
        return cached.results.slice(0, maxResults);
      }
    }
  }

  try {
    // Use the searchCardMarket Cloud Function (secure proxy)
    const url = `${CLOUD_FUNCTIONS_BASE}/searchCardMarket?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('CardMarket search via Cloud Function failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.success || !data.results) {
      return [];
    }
    
    // Normalize and process results
    let items = data.results.map(raw => normalizeApiCard(raw)).filter(c => c?.name);
    
    // Apply local ranking for better relevance
    const { numberPieces } = splitQuery(query);
    
    if (numberPieces.length) {
      const hits = items.filter((it) => {
        const n = ((it.number || "") + "").toLowerCase();
        const nm = (it.name || "").toLowerCase();
        const nn = (it.nameNumbered || "").toLowerCase();
        const tcgid = ((it.tcgid || "") + "").toLowerCase();
        return numberPieces.some(
          (p) => n.includes(p) || nm.includes(p) || nn.includes(p) || tcgid.includes(p),
        );
      });
      if (hits.length) items = hits;
    }

    items = rankByRelevance(items, query);
    items.sort((a, b) => {
      const ak = !!a.number;
      const bk = !!b.number;
      return ak === bk ? 0 : ak ? -1 : 1;
    });
    
    const limited = items.slice(0, maxResults);
    if (limited.length) {
      setSearchCacheEntry(canonical, limited);
    }
    return limited;
  } catch (error) {
    console.error('CardMarket search error:', error);
    return [];
  }
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
 * Format search results for display
 */
export function formatSearchResults(results, query, limit) {
  if (!Array.isArray(results)) return [];
  return results.slice(0, limit).map((card) => ({
    ...card,
    searchQuery: query,
  }));
}

/**
 * Generate unique ID
 */
export function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * =============================================================================
 * TRIPLE API INTEGRATION (v2.1)
 * All external API calls routed through Cloud Functions for security
 * =============================================================================
 */

/**
 * Search PriceCharting API directly (PRIMARY SEARCH SOURCE)
 * This provides comprehensive card data including all graded prices
 */
export async function apiSearchPriceCharting(query, { limit = 50 } = {}) {
  if (!query?.trim()) return [];
  
  try {
    const url = `${CLOUD_FUNCTIONS_BASE}/searchPriceChartingCards?query=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('PriceCharting search failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.success || !data.results) {
      return [];
    }
    
    // Transform PriceCharting results to our normalized format
    // Cloud Function already parses and returns: name, set, number, fullName, priceChartingId
    return data.results.map(card => {
      return {
        id: card.id || uniqueId(),
        name: card.name,
        set: card.set || '',
        number: card.number || '',
        rarity: card.rarity || '',
        image: null, // Will be enriched from CardMarket
        priceChartingId: card.priceChartingId,
        fullName: card.fullName,
        // Store raw PriceCharting data for reference
        priceChartingData: card,
      };
    });
  } catch (error) {
    console.error('Error searching PriceCharting:', error);
    return [];
  }
}

/**
 * Fetch comprehensive prices for a specific card from all three APIs
 * Returns pricing data from PriceCharting, Pokemon Price Tracker, and CardMarket
 */
export async function apiFetchComprehensivePrices(card, { isGraded = false, grade = null } = {}) {
  if (!card?.name) return null;
  
  try {
    const params = new URLSearchParams({
      name: card.name,
      ...(card.set && { set: card.set }),
      ...(card.number && { number: card.number }),
      ...(isGraded && { isGraded: 'true' }),
      ...(grade && { grade: grade }),
    });
    
    const url = `${CLOUD_FUNCTIONS_BASE}/fetchComprehensivePrices?${params}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('Comprehensive prices fetch failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      return null;
    }
    
    return data.prices;
  } catch (error) {
    console.error('Error fetching comprehensive prices:', error);
    return null;
  }
}

/**
 * Fetch on-demand market prices for a specific card
 * Called when user clicks a card or adds to collection/inventory
 * Returns both US (TCGPlayer) and EU (CardMarket) prices
 */
/**
 * Fetch graded card prices from PriceCharting via Cloud Function
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
  
  try {
    const params = new URLSearchParams({
      name: cardName,
      set: card.set || card.episode?.name || '',
      number: card.number || card.card_number || '',
      company: gradingCompany || 'PSA',
      grade: grade || '10'
    });
    
    const url = `${CLOUD_FUNCTIONS_BASE}/fetchGradedPrices?${params.toString()}`;
    console.log('🏆 Fetching graded price:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Failed to fetch graded prices:', response.status, response.statusText);
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    const data = await response.json();
    console.log('✅ Graded price response:', data);
    return data;
  } catch (error) {
    console.error('Error fetching graded prices:', error);
    return { success: false, error: error.message };
  }
}

export async function apiFetchMarketPrices(card) {
  try {
    console.log('💰 Fetching on-demand prices for:', card.name, card.set, card.number);
    
    const params = new URLSearchParams({
      name: card.name,
      ...(card.set && { set: card.set }),
      ...(card.number && { number: card.number }),
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
    
    console.log('✅ Market prices fetched:', data.prices);
    return data.prices; // { us: {...}, eu: {...} }
    
  } catch (error) {
    console.error('❌ Error fetching market prices:', error);
    return null;
  }
}

/**
 * Hybrid search using PriceCharting (primary) enriched with CardMarket (images)
 * CORRECTED FLOW:
 * - PriceCharting: PRIMARY search for card data (NO PRICES in search results)
 * - CardMarket: Image enrichment during search
 * - Prices: Fetched ON-DEMAND via apiFetchMarketPrices when user interacts with card
 */
export async function apiSearchCardsHybrid(query, options = {}) {
  const { 
    useCache = true, 
    allowExpired = false, 
    maxResults = SEARCH_CACHE_RESULT_LIMIT 
  } = options;
  
  if (!query?.trim()) return [];
  
  // Check cache first
  const canonical = canonicalizeQuery(query);
  if (useCache) {
    const cached = getSearchCacheEntry(canonical);
    if (cached && cached.results.length) {
      if (!cached.expired || allowExpired) {
        return cached.results.slice(0, maxResults);
      }
    }
  }
  
  // Search BOTH APIs in parallel for comprehensive results
  console.log('🔍 Searching both PriceCharting and CardMarket...');
  
  // Add timeout to prevent hanging (8s for CardMarket, 10s for PriceCharting)
  const timeout = (ms) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Search timeout')), ms)
  );
  
  const [priceChartingResults, cardMarketResults] = await Promise.all([
    Promise.race([
      apiSearchPriceCharting(query, { limit: maxResults }),
      timeout(10000) // Reduced from 15s to 10s
    ]).catch(err => {
      console.error('PriceCharting search error:', err.message);
      return [];
    }),
    Promise.race([
      apiSearchCards(query, { useCache: false, maxResults: maxResults }),
      timeout(8000) // Reduced from 30s to 8s - fail faster on slow APIs
    ]).catch(err => {
      console.error('CardMarket search error:', err.message);
      return [];
    })
  ]);
  
  console.log(`📊 PriceCharting: ${priceChartingResults.length} results`);
  console.log(`📊 CardMarket: ${cardMarketResults.length} results`);
  
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
    const normalizedSet = normalizeSetName(card.set);
    const normalizedName = card.name.toLowerCase().replace(/\s+/g, '');
    const number = (card.number || '').toString().toLowerCase();
    return `${normalizedName}-${normalizedSet}-${number}`;
  };
  
  // Create a Map to track unique cards (avoid duplicates)
  const cardMap = new Map();
  
  // Track position scores for better ranking (earlier results from either API = higher priority)
  const positionScores = new Map();
  
  // Add CardMarket results (they have better images and set data)
  cardMarketResults.forEach((cmCard, index) => {
    const key = createCardKey(cmCard);
    cardMap.set(key, {
      ...cmCard,
      source: 'cardmarket',
      // CardMarket cards need priceChartingId for graded lookups
      priceChartingId: null,
    });
    // Lower index = higher score (result #1 gets high score)
    positionScores.set(key, 100 - index);
  });
  
  // Enrich with PriceCharting data (adds priceChartingId for graded support)
  priceChartingResults.forEach((pcCard, index) => {
    const key = createCardKey(pcCard);
    
    if (cardMap.has(key)) {
      // Card exists from CardMarket, just add PriceCharting ID
      const existing = cardMap.get(key);
      cardMap.set(key, {
        ...existing,
        priceChartingId: pcCard.priceChartingId,
        fullName: pcCard.fullName, // Keep full name for reference
      });
      // Boost score if it's also early in PriceCharting results
      const cmScore = positionScores.get(key) || 0;
      const pcScore = 100 - index;
      positionScores.set(key, cmScore + pcScore); // Combined score from both sources
    } else {
      // New card from PriceCharting only
      cardMap.set(key, {
        ...pcCard,
        source: 'pricecharting',
      });
      // PriceCharting-only cards get their position score
      positionScores.set(key, 100 - index);
    }
  });
  
  // Convert Map back to array
  let finalResults = Array.from(cardMap.values());
  
  console.log(`📥 Before improvements: ${finalResults.length} results`);
  
  // Apply comprehensive search improvements (NEW!)
  // - Filters out irrelevant cards (e.g., non-Charizard cards when searching "charizard 199")
  // - Deduplicates and merges duplicate entries
  // - Ranks by relevance score
  // - Limits to top results
  finalResults = improveSearchResults(finalResults, query, {
    maxResults: maxResults,
    enableDeduplication: true,
    enableFiltering: true,
    enableRanking: true,
  });
  
  // Cache the improved results
  if (finalResults.length) {
    setSearchCacheEntry(canonical, finalResults);
  }
  
  console.log(`✅ Returning ${finalResults.length} improved results`);
  console.log(`   📍 ${finalResults.filter(c => c.source === 'cardmarket').length} from CardMarket`);
  console.log(`   📍 ${finalResults.filter(c => c.source === 'pricecharting').length} from PriceCharting only`);
  console.log(`   💰 NO PRICES in results (fetched on-demand)`);
  
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
  } = options;

  console.log(`🔍 Searching with intelligent cache: "${query}"`);
  
  try {
    const searchUrl = `https://us-central1-rafchu-tcg-app.cloudfunctions.net/searchCards?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Search failed');
    }
    
    console.log(`✅ Got ${data.results.length} results from ${data.source} (${data.cached ? 'CACHED' : 'FRESH'})`);
    
    // If cached search returned results, use them
    if (data.results.length > 0) {
      return data.results.slice(0, maxResults);
    }
    
    // No results from cache - fall back to hybrid search (PriceCharting + CardMarket)
    console.log('⚠️ No results from cache, falling back to hybrid search...');
    return apiSearchCardsHybrid(query, options);
    
  } catch (error) {
    console.error('❌ Cached search failed, falling back to hybrid search:', error.message);
    // Fallback to the existing hybrid search if cache search fails
    return apiSearchCardsHybrid(query, options);
  }
}

