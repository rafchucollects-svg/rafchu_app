/**
 * Search Helper Utilities
 * Provides relevance filtering, scoring, and ranking for card search
 */

// Card type keywords that might appear in queries
const CARD_TYPE_KEYWORDS = ['ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'prism', 'star', 'lv.x', 'lvx'];

/**
 * Parse query to extract primary Pokemon name, card types, and numbers
 */
export function parseQuery(query) {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);
  
  let primaryName = '';
  const cardTypes = [];
  const numbers = [];
  
  for (let i = 0; i < queryWords.length; i++) {
    const word = queryWords[i];
    
    // Check if it's a card type keyword
    if (CARD_TYPE_KEYWORDS.includes(word)) {
      cardTypes.push(word);
      break; // Stop collecting primary name after card type
    }
    
    // Check if it's a number (card number or set number)
    if (!isNaN(word) && word.length <= 4) {
      numbers.push(word);
      break; // Stop collecting primary name after number
    }
    
    // Otherwise, add to primary name
    primaryName += (primaryName ? ' ' : '') + word;
  }
  
  return {
    primaryName: primaryName.trim(),
    cardTypes,
    numbers,
    originalQuery: query,
    queryLower
  };
}

/**
 * Filter results to only include truly relevant cards
 * CRITICAL: Requires primary Pokemon name to be in card name
 */
export function filterByRelevance(results, query) {
  const parsed = parseQuery(query);
  const { primaryName, cardTypes, numbers } = parsed;
  
  return results.filter(card => {
    const nameLower = (card.name || '').toLowerCase();
    const numberLower = String(card.number || '').toLowerCase();
    
    // RULE 1: If query has a primary Pokemon name (>2 chars), REQUIRE it in card name
    if (primaryName && primaryName.length > 2) {
      if (!nameLower.includes(primaryName)) {
        return false; // Skip this card - wrong Pokemon
      }
    }
    
    // RULE 2: If query has a card type (ex, gx, v), require it in name
    if (cardTypes.length > 0) {
      const hasAnyType = cardTypes.some(type => nameLower.includes(type));
      if (!hasAnyType) {
        return false; // Skip this card - wrong type
      }
    }
    
    // RULE 3: If query has a number, require exact match or partial match
    if (numbers.length > 0) {
      const queryNumber = numbers[0];
      // Exact match or card number contains the query number
      if (!numberLower.includes(queryNumber)) {
        return false; // Skip this card - wrong number
      }
    }
    
    return true; // Card passed all relevance checks
  });
}

/**
 * Calculate relevance score for a card based on query
 * Higher score = more relevant
 */
export function scoreRelevance(card, query) {
  const nameLower = (card.name || '').toLowerCase();
  const setLower = (card.set || '').toLowerCase();
  const numberLower = String(card.number || '').toLowerCase();
  const parsed = parseQuery(query);
  const { queryLower, primaryName, cardTypes, numbers } = parsed;
  const queryWords = queryLower.split(/\s+/);
  
  let score = 0;
  
  // 1. EXACT NAME MATCH (100 points) - highest priority
  if (nameLower === queryLower) {
    score += 100;
  }
  
  // 2. NAME STARTS WITH FULL QUERY (50 points)
  else if (nameLower.startsWith(queryLower)) {
    score += 50;
  }
  
  // 3. NAME CONTAINS FULL QUERY (30 points)
  else if (nameLower.includes(queryLower)) {
    score += 30;
  }
  
  // 4. ALL QUERY WORDS PRESENT IN NAME (20 points)
  else if (queryWords.every(w => nameLower.includes(w))) {
    score += 20;
  }
  
  // 5. PRIMARY NAME MATCH (15 points)
  if (primaryName && nameLower.includes(primaryName)) {
    // Bonus if primary name is at start
    if (nameLower.startsWith(primaryName)) {
      score += 15;
    } else {
      score += 10;
    }
  }
  
  // 6. EXACT NUMBER MATCH (15 points)
  if (numbers.length > 0) {
    const queryNumber = numbers[0];
    if (numberLower === queryNumber) {
      score += 15;
    } else if (numberLower.includes(queryNumber)) {
      score += 5; // Partial number match
    }
  }
  
  // 7. CARD TYPE MATCH (10 points)
  if (cardTypes.length > 0) {
    const hasType = cardTypes.some(type => nameLower.includes(type));
    if (hasType) {
      score += 10;
    }
  }
  
  // 8. SET NAME MATCH (8 points)
  if (queryWords.some(w => setLower.includes(w))) {
    score += 8;
  }
  
  // 9. DATA COMPLETENESS BONUS (up to 7 points)
  if (card.image) score += 5;
  if (card.prices) score += 2;
  
  return score;
}

/**
 * Rank search results by relevance score
 */
export function rankByRelevance(results, query) {
  // Score each result
  const scored = results.map(card => ({
    card,
    score: scoreRelevance(card, query)
  }));
  
  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);
  
  // Return cards only (without scores)
  return scored.map(item => item.card);
}

/**
 * Normalize set name to extract core identifier
 * Examples: "Pokemon Scarlet & Violet 151" → "151"
 *           "Base Set" → "base set"
 */
function normalizeSetName(setName) {
  if (!setName) return '';
  
  let normalized = setName.toLowerCase().trim();
  
  // Remove common prefixes
  normalized = normalized
    .replace(/^pokemon\s+/gi, '')
    .replace(/^tcg\s+/gi, '')
    .replace(/^pok[eé]mon\s+/gi, '');
  
  // Remove common series names to extract set code
  normalized = normalized
    .replace(/scarlet\s*&?\s*violet\s*/gi, '')
    .replace(/sword\s*&?\s*shield\s*/gi, '')
    .replace(/sun\s*&?\s*moon\s*/gi, '')
    .replace(/black\s*&?\s*white\s*/gi, '')
    .replace(/xy\s+/gi, '')
    .replace(/\s+series\s*/gi, '')
    .trim();
  
  // Remove special characters and normalize spaces
  normalized = normalized
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

/**
 * Normalize card key for deduplication
 * Cards with same name + number are considered duplicates
 * Set is normalized aggressively to handle variations
 */
export function normalizeCardKey(card) {
  const name = (card.name || '').toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const number = String(card.number || '').toLowerCase().trim();
  const set = normalizeSetName(card.set);
  
  // Primary key: name + number (most reliable)
  // Set is secondary to catch variations
  return `${name}::${number}::${set}`;
}

/**
 * Calculate data completeness score
 */
export function calculateCompletenessScore(card) {
  let score = 0;
  
  if (card.image) score += 10;
  if (card.name) score += 5;
  if (card.set) score += 5;
  if (card.number) score += 5;
  if (card.rarity) score += 3;
  if (card.prices?.tcgplayer) score += 3;
  if (card.prices?.cardmarket) score += 3;
  if (card.prices?.pricecharting) score += 3;
  if (card.releaseDate) score += 2;
  if (card.artist) score += 1;
  
  return score;
}

/**
 * Merge two cards, keeping the best data from each
 */
export function mergeBestData(card1, card2) {
  // Helper to get the best price object
  const mergePrices = (prices1, prices2) => {
    if (!prices1 && !prices2) return undefined;
    if (!prices1) return prices2;
    if (!prices2) return prices1;
    
    return {
      tcgplayer: prices1.tcgplayer || prices2.tcgplayer,
      cardmarket: prices1.cardmarket || prices2.cardmarket,
      pricecharting: prices1.pricecharting || prices2.pricecharting,
    };
  };
  
  return {
    // Prefer card with image
    image: card1.image || card2.image,
    
    // Basic info (prefer non-empty values)
    name: card1.name || card2.name,
    set: card1.set || card2.set,
    number: card1.number || card2.number,
    rarity: card1.rarity || card2.rarity,
    
    // Merge prices
    prices: mergePrices(card1.prices, card2.prices),
    
    // Keep links from both (prefer array)
    links: card1.links || card2.links,
    
    // Keep both sources for reference
    sources: [
      ...(card1.sources || [card1.source]).filter(Boolean),
      ...(card2.sources || [card2.source]).filter(Boolean),
    ],
    
    // Additional metadata
    releaseDate: card1.releaseDate || card2.releaseDate,
    artist: card1.artist || card2.artist,
    
    // Preserve IDs from both
    id: card1.id || card2.id,
    slug: card1.slug || card2.slug,
    entryId: card1.entryId || card2.entryId,
  };
}

/**
 * Deduplicate results, merging duplicate cards
 */
export function deduplicateResults(results) {
  const cardMap = new Map();
  
  for (const card of results) {
    const key = normalizeCardKey(card);
    
    if (!cardMap.has(key)) {
      cardMap.set(key, card);
    } else {
      // Merge with existing card, keeping best data
      const existing = cardMap.get(key);
      const merged = mergeBestData(existing, card);
      cardMap.set(key, merged);
    }
  }
  
  return Array.from(cardMap.values());
}

/**
 * Apply all search improvements: filter, deduplicate, and rank
 */
export function improveSearchResults(results, query, options = {}) {
  const {
    maxResults = 25,
    enableDeduplication = true,
    enableFiltering = true,
    enableRanking = true,
  } = options;
  
  let improved = results;
  
  // Step 1: Filter by relevance (remove irrelevant cards)
  if (enableFiltering) {
    improved = filterByRelevance(improved, query);
    console.log(`🔍 Filtered to ${improved.length} relevant results`);
  }
  
  // Step 2: Deduplicate (merge duplicate cards)
  if (enableDeduplication) {
    const beforeCount = improved.length;
    improved = deduplicateResults(improved);
    const removedCount = beforeCount - improved.length;
    if (removedCount > 0) {
      console.log(`🔄 Removed ${removedCount} duplicate(s)`);
    }
  }
  
  // Step 3: Rank by relevance score
  if (enableRanking) {
    improved = rankByRelevance(improved, query);
    console.log(`📊 Ranked ${improved.length} results by relevance`);
  }
  
  // Step 4: Limit results
  if (maxResults && improved.length > maxResults) {
    improved = improved.slice(0, maxResults);
    console.log(`✂️ Limited to top ${maxResults} results`);
  }
  
  return improved;
}

