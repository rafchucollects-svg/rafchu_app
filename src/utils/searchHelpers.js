/**
 * Search Helper Utilities
 * Provides relevance filtering, scoring, and ranking for card search
 * Includes query preprocessing for typo correction and set expansion
 */

import { normalizeApostrophes, normalizeCardNumber } from './cardHelpers';

// Card type keywords that might appear in queries
const CARD_TYPE_KEYWORDS = ['ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'prism', 'star', 'lv.x', 'lvx'];

// =============================================================================
// QUERY PREPROCESSING - Typo Correction & Set Expansion
// =============================================================================

/**
 * Common Pokemon name misspellings and their corrections
 * Only includes frequently misspelled names to avoid false positives
 */
const POKEMON_TYPO_CORRECTIONS = {
  // Common typos
  'pkachu': 'pikachu',
  'pikacu': 'pikachu',
  'pikchu': 'pikachu',
  'pickachu': 'pikachu',
  'pikachuu': 'pikachu',
  'charzard': 'charizard',
  'charzird': 'charizard',
  'charazard': 'charizard',
  'charziard': 'charizard',
  'charizrd': 'charizard',
  'charizar': 'charizard',
  'mewtoo': 'mewtwo',
  'mewto': 'mewtwo',
  'mewtew': 'mewtwo',
  'mew2': 'mewtwo',
  'gyrados': 'gyarados',
  'gyradose': 'gyarados',
  'gyardos': 'gyarados',
  'blastois': 'blastoise',
  'blastose': 'blastoise',
  'blastiose': 'blastoise',
  'venasaur': 'venusaur',
  'venosaur': 'venusaur',
  'venusuar': 'venusaur',
  'dragonite': 'dragonite',
  'dragonit': 'dragonite',
  'alakazm': 'alakazam',
  'alakzam': 'alakazam',
  'gengar': 'gengar',
  'genger': 'gengar',
  'machamp': 'machamp',
  'machomp': 'machamp',
  'snorlx': 'snorlax',
  'snolax': 'snorlax',
  'luiga': 'lugia',
  'lugai': 'lugia',
  'rayquza': 'rayquaza',
  'rayquasa': 'rayquaza',
  'rayqaza': 'rayquaza',
  'groudn': 'groudon',
  'groundon': 'groudon',
  'kyogr': 'kyogre',
  'kyorge': 'kyogre',
  'arceaus': 'arceus',
  'arcues': 'arceus',
  'giratna': 'giratina',
  'giritina': 'giratina',
  'dialga': 'dialga',
  'diagla': 'dialga',
  'palkia': 'palkia',
  'palika': 'palkia',
  'umbreon': 'umbreon',
  'umbrean': 'umbreon',
  'espeon': 'espeon',
  'espean': 'espeon',
  'sylveon': 'sylveon',
  'sylvean': 'sylveon',
  'eeve': 'eevee',
  'evee': 'eevee',
  'eevie': 'eevee',
  'lucario': 'lucario',
  'lucairo': 'lucario',
  'gardevoir': 'gardevoir',
  'gardavoir': 'gardevoir',
  'gardevior': 'gardevoir',
  'greninja': 'greninja',
  'grenjina': 'greninja',
  'zoroark': 'zoroark',
  'zoroak': 'zoroark',
  'darkrai': 'darkrai',
  'darkri': 'darkrai',
  // Team Rocket's Pokemon - common with apostrophe issues
  "rocket's": "rocket's",
  'rockets': "rocket's",
  "giovanni's": "giovanni's",
  'giovannis': "giovanni's",
  "surge's": "surge's",
  'surges': "surge's",
  "sabrina's": "sabrina's",
  'sabrinas': "sabrina's",
  "blaine's": "blaine's",
  'blaines': "blaine's",
  "koga's": "koga's",
  'kogas': "koga's",
  "erika's": "erika's",
  'erikas': "erika's",
  "misty's": "misty's",
  'mistys': "misty's",
  "brock's": "brock's",
  'brocks': "brock's",
};

/**
 * Set abbreviation expansions
 * Maps common abbreviations to full set names for better API matching
 */
const SET_ABBREVIATIONS = {
  // Scarlet & Violet era
  'sv': 'Scarlet Violet',
  's&v': 'Scarlet Violet',
  'scarlet violet': 'Scarlet Violet',
  'paldea': 'Paldea Evolved',
  'obsidian': 'Obsidian Flames',
  'paradox': 'Paradox Rift',
  'paldean': 'Paldean Fates',
  'temporal': 'Temporal Forces',
  'twilight': 'Twilight Masquerade',
  'shrouded': 'Shrouded Fable',
  'stellar': 'Stellar Crown',
  'surging': 'Surging Sparks',
  'prismatic': 'Prismatic Evolutions',
  
  // Sword & Shield era
  'swsh': 'Sword Shield',
  'sw&sh': 'Sword Shield',
  'sword shield': 'Sword Shield',
  'vivid': 'Vivid Voltage',
  'vivid voltage': 'Vivid Voltage',
  'darkness': 'Darkness Ablaze',
  'darkness ablaze': 'Darkness Ablaze',
  'rebel': 'Rebel Clash',
  'rebel clash': 'Rebel Clash',
  'champions': 'Champion\'s Path',
  'champion\'s path': 'Champion\'s Path',
  'shining': 'Shining Fates',
  'shining fates': 'Shining Fates',
  'battle': 'Battle Styles',
  'battle styles': 'Battle Styles',
  'chilling': 'Chilling Reign',
  'chilling reign': 'Chilling Reign',
  'evolving': 'Evolving Skies',
  'evolving skies': 'Evolving Skies',
  'fusion': 'Fusion Strike',
  'fusion strike': 'Fusion Strike',
  'brilliant': 'Brilliant Stars',
  'brilliant stars': 'Brilliant Stars',
  'astral': 'Astral Radiance',
  'astral radiance': 'Astral Radiance',
  'pokemon go': 'Pokemon GO',
  'lost': 'Lost Origin',
  'lost origin': 'Lost Origin',
  'silver': 'Silver Tempest',
  'silver tempest': 'Silver Tempest',
  'crown': 'Crown Zenith',
  'crown zenith': 'Crown Zenith',
  
  // Sun & Moon era
  'sm': 'Sun Moon',
  's&m': 'Sun Moon',
  'sun moon': 'Sun Moon',
  'guardians': 'Guardians Rising',
  'burning': 'Burning Shadows',
  'crimson': 'Crimson Invasion',
  'ultra': 'Ultra Prism',
  'forbidden': 'Forbidden Light',
  'celestial': 'Celestial Storm',
  'dragon': 'Dragon Majesty',
  'team up': 'Team Up',
  'unbroken': 'Unbroken Bonds',
  'unified': 'Unified Minds',
  'hidden': 'Hidden Fates',
  'cosmic': 'Cosmic Eclipse',
  
  // XY era
  'xy': 'XY',
  'flashfire': 'Flashfire',
  'furious': 'Furious Fists',
  'phantom': 'Phantom Forces',
  'primal': 'Primal Clash',
  'roaring': 'Roaring Skies',
  'ancient': 'Ancient Origins',
  'breakthrough': 'BREAKthrough',
  'breakpoint': 'BREAKpoint',
  'generations': 'Generations',
  'fates': 'Fates Collide',
  'steam': 'Steam Siege',
  'evolutions': 'Evolutions',
  
  // Classic sets
  'base': 'Base Set',
  'base set': 'Base Set',
  'jungle': 'Jungle',
  'fossil': 'Fossil',
  'rocket': 'Team Rocket',
  'team rocket': 'Team Rocket',
  'gym heroes': 'Gym Heroes',
  'gym challenge': 'Gym Challenge',
  'neo genesis': 'Neo Genesis',
  'neo discovery': 'Neo Discovery',
  'neo revelation': 'Neo Revelation',
  'neo destiny': 'Neo Destiny',
  
  // Special sets
  '151': 'Pokemon 151',
  'pokemon 151': 'Pokemon 151',
  'celebrations': 'Celebrations',
  'special delivery': 'Special Delivery',
};

/**
 * Correct common typos in a search query
 * @param {string} query - Original query
 * @returns {string} - Query with typos corrected
 */
export function correctTypos(query) {
  if (!query) return '';
  
  const words = query.toLowerCase().split(/\s+/);
  const corrected = words.map(word => {
    // Check if this word has a known correction
    const correction = POKEMON_TYPO_CORRECTIONS[word];
    if (correction) {
      console.log(`📝 Typo corrected: "${word}" → "${correction}"`);
      return correction;
    }
    return word;
  });
  
  return corrected.join(' ');
}

/**
 * Expand set abbreviations in a search query
 * Prioritizes longer matches first to avoid partial replacements
 * @param {string} query - Original query  
 * @returns {string} - Query with set names expanded
 */
export function expandSetAbbreviations(query) {
  if (!query) return '';
  
  const queryLower = query.toLowerCase();
  
  // Sort abbreviations by length (longest first) to match "crown zenith" before "crown"
  const sortedAbbrevs = Object.entries(SET_ABBREVIATIONS)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [abbrev, fullName] of sortedAbbrevs) {
    // Skip if the full name is already in the query (avoid double expansion)
    if (queryLower.includes(fullName.toLowerCase())) {
      continue;
    }
    
    // Match abbreviation as a word boundary (not part of another word)
    const regex = new RegExp(`\\b${escapeRegex(abbrev)}\\b`, 'gi');
    if (regex.test(queryLower)) {
      // Don't expand if it's part of a card code like SWSH121
      const codePattern = new RegExp(`${escapeRegex(abbrev)}\\d+`, 'gi');
      if (!codePattern.test(queryLower)) {
        const expanded = query.replace(regex, fullName);
        console.log(`📦 Set expanded: "${query}" → "${expanded}"`);
        return expanded;
      }
    }
  }
  
  return query;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format query for better API matching
 * - Adds # before standalone numbers for card number searches
 * - Normalizes spacing
 * @param {string} query - Original query
 * @returns {string} - Formatted query
 */
export function formatQueryForApi(query) {
  if (!query) return '';
  
  // Normalize multiple spaces
  let formatted = query.replace(/\s+/g, ' ').trim();
  
  // Don't modify queries that are just card codes (SWSH121, etc.)
  if (/^[a-z]{1,6}\d+$/i.test(formatted)) {
    return formatted;
  }
  
  return formatted;
}

/**
 * Main query preprocessor - applies all transformations
 * @param {string} query - Original search query
 * @param {object} options - Preprocessing options
 * @returns {object} - { original, processed, corrections }
 */
export function preprocessQuery(query, options = {}) {
  const {
    correctTypos: shouldCorrectTypos = true,
    expandSets: shouldExpandSets = true,
    formatForApi: shouldFormat = true,
  } = options;
  
  if (!query?.trim()) {
    return { original: '', processed: '', corrections: [] };
  }
  
  const corrections = [];
  let processed = normalizeApostrophes(query.trim());
  const original = processed;
  
  // Step 1: Correct typos
  if (shouldCorrectTypos) {
    const beforeTypo = processed;
    processed = correctTypos(processed);
    if (processed !== beforeTypo.toLowerCase()) {
      corrections.push({ type: 'typo', before: beforeTypo, after: processed });
    }
  }
  
  // Step 2: Expand set abbreviations
  if (shouldExpandSets) {
    const beforeExpand = processed;
    processed = expandSetAbbreviations(processed);
    if (processed.toLowerCase() !== beforeExpand.toLowerCase()) {
      corrections.push({ type: 'set', before: beforeExpand, after: processed });
    }
  }
  
  // Step 3: Format for API
  if (shouldFormat) {
    processed = formatQueryForApi(processed);
  }
  
  return {
    original,
    processed,
    corrections,
    wasModified: corrections.length > 0,
  };
}

// Regex to detect card number patterns (pure numbers or alphanumeric codes)
const CARD_NUMBER_PATTERN = /^([a-z]{1,6}\d{1,4}|\d{1,4}(\/\d{1,4})?)$/i;

/**
 * Check if a word looks like a card number/code
 * Matches: 123, SWSH121, SM123, GG69, SV231, 123/456
 */
function isCardNumberLike(word) {
  if (!word) return false;
  return CARD_NUMBER_PATTERN.test(word);
}

/**
 * Parse query to extract primary Pokemon name, card types, and numbers
 * Normalizes apostrophes for consistent matching
 * Enhanced to detect alphanumeric card codes (SWSH121, SM123, etc.)
 */
export function parseQuery(query) {
  if (!query) return { primaryName: '', cardTypes: [], numbers: [], originalQuery: '', queryLower: '' };
  
  // Normalize apostrophes first (convert curly to straight, etc.)
  const normalized = normalizeApostrophes(query);
  const queryLower = normalized.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);
  
  let primaryName = '';
  const cardTypes = [];
  const numbers = [];
  
  for (let i = 0; i < queryWords.length; i++) {
    const word = queryWords[i];
    
    // Check if it's a card type keyword
    if (CARD_TYPE_KEYWORDS.includes(word)) {
      cardTypes.push(word);
      // Continue processing to capture any trailing numbers (e.g., "Mewtwo ex 231")
      continue;
    }
    
    // Check if it's a number or alphanumeric code (SWSH121, SM123, GG69, etc.)
    if (isCardNumberLike(word)) {
      numbers.push(word);
      // Continue processing - don't add numbers to name
      continue;
    }
    
    // Otherwise, add to primary name (only if we haven't hit a card type yet)
    // This prevents "231" from being added to name after "ex"
    if (cardTypes.length === 0 && numbers.length === 0) {
      primaryName += (primaryName ? ' ' : '') + word;
    }
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
 * Normalizes apostrophes for consistent matching
 * Enhanced to handle number-only searches (like SWSH121)
 */
export function filterByRelevance(results, query) {
  const parsed = parseQuery(query);
  const { primaryName, cardTypes, numbers } = parsed;
  
  // If query is ONLY a number/code (no name), don't filter by name at all
  const isNumberOnlySearch = numbers.length > 0 && !primaryName;
  
  return results.filter(card => {
    // Normalize card name for comparison (handles apostrophe variations)
    const nameLower = normalizeApostrophes((card.name || '').toLowerCase());
    const numberLower = String(card.number || '').toLowerCase();
    
    // RULE 1: If query has a primary Pokemon name (>2 chars), REQUIRE it in card name
    // Skip this rule for number-only searches
    if (!isNumberOnlySearch && primaryName && primaryName.length > 2) {
      // primaryName is already normalized via parseQuery
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
    
    // RULE 3: If query has a number, require match (with normalization)
    if (numbers.length > 0) {
      const queryNumber = numbers[0];
      const normalizedQueryNumber = normalizeCardNumber(queryNumber);
      const normalizedCardNumber = normalizeCardNumber(numberLower);
      
      // For number-only searches, be more flexible with matching
      // Check card number field AND card name/id for the number
      const hasNumberMatch = 
        numberLower.includes(queryNumber) || 
        normalizedCardNumber === normalizedQueryNumber ||
        normalizedCardNumber.includes(normalizedQueryNumber) ||
        numberLower === queryNumber;
      
      // Also check if the number appears in the card's ID or name (for promo cards)
      const cardId = String(card.id || '').toLowerCase();
      const hasIdMatch = cardId.includes(queryNumber) || cardId.includes(normalizedQueryNumber);
      
      if (!hasNumberMatch && !hasIdMatch) {
        return false; // Skip this card - wrong number
      }
    }
    
    return true; // Card passed all relevance checks
  });
}

/**
 * Calculate relevance score for a card based on query
 * Higher score = more relevant
 * Normalizes apostrophes for consistent matching
 */
export function scoreRelevance(card, query) {
  // Normalize all strings for comparison
  const nameLower = normalizeApostrophes((card.name || '').toLowerCase());
  const setLower = normalizeApostrophes((card.set || '').toLowerCase());
  const numberLower = String(card.number || '').toLowerCase();
  const parsed = parseQuery(query); // parseQuery already normalizes
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
  
  // 6. EXACT NUMBER MATCH (15 points) - with normalization
  if (numbers.length > 0) {
    const queryNumber = numbers[0];
    const normalizedQueryNumber = normalizeCardNumber(queryNumber);
    const normalizedCardNumber = normalizeCardNumber(numberLower);
    
    // Exact normalized match (handles 001 vs 1)
    if (normalizedCardNumber === normalizedQueryNumber) {
      score += 15;
    }
    // Exact raw match
    else if (numberLower === queryNumber) {
      score += 12;
    }
    // Partial match
    else if (numberLower.includes(queryNumber) || normalizedCardNumber.includes(normalizedQueryNumber)) {
      score += 5;
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
 * Apostrophes are preserved to maintain card identity
 */
export function normalizeCardKey(card) {
  // Normalize apostrophes first, then clean up
  const name = normalizeApostrophes((card.name || '').toLowerCase())
    .replace(/[^\w\s']/g, '') // Keep apostrophes in names like "Rocket's"
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
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching in "Did you mean?" suggestions
 */
export function levenshteinDistance(str1, str2) {
  const s1 = normalizeApostrophes(str1.toLowerCase());
  const s2 = normalizeApostrophes(str2.toLowerCase());
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;
  
  const matrix = [];
  
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[s2.length][s1.length];
}

/**
 * Calculate similarity score between two strings (0-1, higher is more similar)
 */
export function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

/**
 * Find fuzzy matches for a card query
 * Returns cards that are similar but not exact matches
 * Used for "Did you mean?" suggestions
 */
export function findFuzzyMatches(query, cards, options = {}) {
  const { 
    maxResults = 5, 
    minSimilarity = 0.5,
    includeNumber = true 
  } = options;
  
  if (!query || !cards?.length) return [];
  
  const normalizedQuery = normalizeApostrophes(query.toLowerCase().trim());
  const queryParts = normalizedQuery.split(/\s+/);
  
  // Score each card
  const scored = cards.map(card => {
    const cardName = normalizeApostrophes((card.name || '').toLowerCase());
    
    // Calculate name similarity
    const nameSimilarity = stringSimilarity(normalizedQuery, cardName);
    
    // Check if all query words appear in card name
    const wordMatchScore = queryParts.reduce((score, word) => {
      if (cardName.includes(word)) return score + (1 / queryParts.length);
      // Check partial word match
      if (cardName.split(/\s+/).some(w => w.startsWith(word) || word.startsWith(w))) {
        return score + (0.5 / queryParts.length);
      }
      return score;
    }, 0);
    
    // Bonus for number match
    let numberBonus = 0;
    if (includeNumber && card.number) {
      const queryNumbers = normalizedQuery.match(/\d+/g) || [];
      const cardNumber = String(card.number).toLowerCase();
      if (queryNumbers.some(n => cardNumber === n || cardNumber.includes(n))) {
        numberBonus = 0.2;
      }
    }
    
    // Combined score
    const totalScore = (nameSimilarity * 0.4) + (wordMatchScore * 0.4) + numberBonus;
    
    return {
      card,
      similarity: totalScore,
      nameSimilarity,
      wordMatchScore
    };
  });
  
  // Filter and sort by similarity
  return scored
    .filter(s => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults)
    .map(s => ({
      ...s.card,
      _matchScore: s.similarity
    }));
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

