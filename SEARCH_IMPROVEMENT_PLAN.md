# Card Search Improvement Plan

## Current Issues (User Feedback)

Based on the screenshot and user feedback, the search for "charizard 199" returns:
1. ✅ Charizard ex (151, #199) - **RELEVANT**
2. ✅ Charizard ex (Pokemon Scarlet & Violet 151, #199) - **RELEVANT** (but duplicate?)
3. ❌ Team Rocket's Weezing (#199) - **NOT RELEVANT** (not Charizard!)
4. ❌ Spheal (#199) - **NOT RELEVANT** (not Charizard!)
5. ❌ Cornerstone Mask Ogerpon ex (#199) - **NOT RELEVANT** (not Charizard!)

### Core Problems

1. **Poor Relevance Filtering**
   - Search matches on card number alone, ignoring Pokemon name
   - No validation that all search terms are present
   - Should only show Charizard cards when "charizard" is in the query

2. **No Ranking by Relevance**
   - Results are not sorted by how well they match the query
   - Cards with exact name matches should appear first
   - Cards with only partial matches should rank lower

3. **No User Behavior Learning**
   - No tracking of which cards users click on
   - No reinforcement learning from user selections
   - Missed opportunity to improve relevance over time

4. **Duplicate Entries**
   - Same card appears twice (with/without image)
   - Different API sources return same card
   - No deduplication logic

5. **No Prioritization of Complete Data**
   - Cards without images shown equally to cards with images
   - Should prioritize cards with complete information
   - Should surface "best" version of each card

---

## Proposed Solutions

### 🎯 Phase 1: Improve Core Relevance (CRITICAL)

**Goal:** Only show cards that are truly relevant to the user's search.

#### 1.1 Strict Term Matching

**Implementation:**
- Extract primary Pokemon name from query (e.g., "charizard" from "charizard 199")
- **Require** primary name to be present in card name
- If user searches "charizard 199":
  - ✅ Show: Charizard cards with #199
  - ❌ Hide: Any non-Charizard cards (even if #199)

**Code Location:**
- Frontend: `src/utils/apiHelpers.js` - `apiSearchCardsHybrid()`
- Add relevance filtering after merging API results

**Algorithm:**
```javascript
function filterByRelevance(results, query) {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);
  
  // Extract primary Pokemon name (words before card type keywords or numbers)
  const cardTypeKeywords = ['ex', 'gx', 'v', 'vmax', 'vstar', 'break', 'prism'];
  let primaryName = '';
  let hasCardType = false;
  let hasNumber = false;
  
  for (let i = 0; i < queryWords.length; i++) {
    const word = queryWords[i];
    if (cardTypeKeywords.includes(word)) {
      hasCardType = true;
      break;
    }
    if (!isNaN(word) && word.length <= 4) {
      hasNumber = true;
      break;
    }
    primaryName += (primaryName ? ' ' : '') + word;
  }
  
  return results.filter(card => {
    const nameLower = (card.name || '').toLowerCase();
    const numberLower = String(card.number || '').toLowerCase();
    
    // If query has a primary Pokemon name, REQUIRE it in card name
    if (primaryName && primaryName.length > 2) {
      if (!nameLower.includes(primaryName)) {
        return false; // Skip this card entirely
      }
    }
    
    // If query has a card type (ex, gx, v), require it in name
    if (hasCardType) {
      const hasType = cardTypeKeywords.some(type => 
        queryWords.includes(type) && nameLower.includes(type)
      );
      if (!hasType) return false;
    }
    
    // If query has a number, require exact match
    if (hasNumber) {
      const queryNumber = queryWords.find(w => !isNaN(w) && w.length <= 4);
      if (queryNumber && numberLower !== queryNumber) {
        return false;
      }
    }
    
    return true;
  });
}
```

#### 1.2 Relevance Scoring & Ranking

**Implementation:**
- Score each result based on how well it matches the query
- Sort by score (highest first)
- Limit results to top 25 most relevant

**Scoring Criteria:**
```javascript
function scoreRelevance(card, query) {
  const nameLower = (card.name || '').toLowerCase();
  const setLower = (card.set || '').toLowerCase();
  const numberLower = String(card.number || '').toLowerCase();
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);
  
  let score = 0;
  
  // 1. Exact name match (100 points) - highest priority
  if (nameLower === queryLower) {
    score += 100;
  }
  
  // 2. Name starts with full query (50 points)
  else if (nameLower.startsWith(queryLower)) {
    score += 50;
  }
  
  // 3. Name contains full query (30 points)
  else if (nameLower.includes(queryLower)) {
    score += 30;
  }
  
  // 4. All query words present in name (20 points)
  else if (queryWords.every(w => nameLower.includes(w))) {
    score += 20;
  }
  
  // 5. Exact number match (15 points)
  const queryNumber = queryWords.find(w => !isNaN(w) && w.length <= 4);
  if (queryNumber && numberLower === queryNumber) {
    score += 15;
  }
  
  // 6. Set name match (10 points)
  if (queryWords.some(w => setLower.includes(w))) {
    score += 10;
  }
  
  // 7. Has complete information bonus (5 points)
  if (card.image) score += 5;
  if (card.prices) score += 3;
  
  // 8. Card rarity/type match (5 points)
  const cardTypeKeywords = ['ex', 'gx', 'v', 'vmax', 'vstar'];
  if (queryWords.some(w => cardTypeKeywords.includes(w)) && 
      cardTypeKeywords.some(t => nameLower.includes(t))) {
    score += 5;
  }
  
  return score;
}
```

---

### 🔄 Phase 2: Deduplication (HIGH PRIORITY)

**Goal:** Show each unique card only once, with the best available data.

#### 2.1 Identify Duplicates

**Matching Criteria:**
- Same name (case-insensitive, normalized)
- Same set (normalized)
- Same number

**Normalization:**
```javascript
function normalizeCardKey(card) {
  const name = (card.name || '').toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const set = (card.set || '').toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const number = String(card.number || '').toLowerCase().trim();
  
  return `${name}::${set}::${number}`;
}
```

#### 2.2 Merge Duplicate Cards

**Priority for selecting "best" version:**
1. Card with image > card without image
2. Card with more complete price data
3. Card from more reliable source (PriceCharting > CardMarket)
4. Card with more metadata (rarity, release date, etc.)

**Implementation:**
```javascript
function deduplicateResults(results) {
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

function mergeBestData(card1, card2) {
  return {
    // Prefer card with image
    image: card1.image || card2.image,
    name: card1.name || card2.name,
    set: card1.set || card2.set,
    number: card1.number || card2.number,
    rarity: card1.rarity || card2.rarity,
    
    // Merge prices (take highest available)
    prices: {
      tcgplayer: Math.max(
        card1.prices?.tcgplayer || 0,
        card2.prices?.tcgplayer || 0
      ) || undefined,
      cardmarket: Math.max(
        card1.prices?.cardmarket || 0,
        card2.prices?.cardmarket || 0
      ) || undefined,
      pricecharting: Math.max(
        card1.prices?.pricecharting || 0,
        card2.prices?.pricecharting || 0
      ) || undefined,
    },
    
    // Keep both sources for reference
    sources: [
      ...(card1.sources || [card1.source]),
      ...(card2.sources || [card2.source])
    ].filter(Boolean),
    
    // Prefer more complete metadata
    releaseDate: card1.releaseDate || card2.releaseDate,
    artist: card1.artist || card2.artist,
  };
}
```

---

### 🧠 Phase 3: User Behavior Learning (MEDIUM PRIORITY)

**Goal:** Learn from user clicks to improve relevance over time.

#### 3.1 Click Tracking

**Implementation:**
- Track when users click on a search result
- Store: query, card selected, timestamp, user context
- Use Firestore collection: `search_analytics/{analyticsId}`

**Data Structure:**
```javascript
{
  query: "charizard 199",
  queryNormalized: "charizard199",
  cardSelected: {
    name: "Charizard ex",
    set: "151",
    number: "199",
    cardKey: "charizardex::151::199"
  },
  timestamp: Firestore.Timestamp,
  userId: "optional-user-id",
  sessionId: "generated-session-id",
  position: 0, // Position in search results
  totalResults: 5
}
```

**Code Location:**
- `src/pages/CardSearch.jsx` - Add tracking to `pickCard()` function

#### 3.2 Popularity Scoring

**Implementation:**
- Query analytics to get click counts per card for each query
- Boost relevance score based on click popularity

**Algorithm:**
```javascript
async function getPopularityBoost(query, card) {
  const queryNormalized = normalizeQuery(query);
  const cardKey = normalizeCardKey(card);
  
  // Query last 90 days of clicks
  const recentClicks = await db.collection('search_analytics')
    .where('queryNormalized', '==', queryNormalized)
    .where('cardSelected.cardKey', '==', cardKey)
    .where('timestamp', '>', ninetyDaysAgo)
    .count()
    .get();
  
  const clickCount = recentClicks.data().count;
  
  // Boost: +1 point per click, max +20 points
  return Math.min(clickCount, 20);
}
```

#### 3.3 Privacy & Compliance

- **No PII stored** (user ID is optional, only for logged-in users)
- **Session-based tracking** for anonymous users
- **90-day data retention** - auto-delete old analytics
- **User opt-out** option in settings

---

### 🏆 Phase 4: Prioritize Complete Data (LOW PRIORITY)

**Goal:** Surface cards with complete information first.

#### 4.1 Data Completeness Score

**Scoring:**
```javascript
function calculateCompletenessScore(card) {
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
```

#### 4.2 Weighted Ranking

Combine all scores:
```javascript
function calculateFinalScore(card, query) {
  const relevanceScore = scoreRelevance(card, query); // 0-100+
  const popularityScore = getPopularityBoost(query, card); // 0-20
  const completenessScore = calculateCompletenessScore(card); // 0-40
  
  // Weighted sum (relevance is most important)
  return (
    relevanceScore * 1.0 +    // 100% weight
    popularityScore * 0.3 +    // 30% weight
    completenessScore * 0.2    // 20% weight
  );
}
```

---

## Implementation Phases

### ✅ Phase 1: Core Relevance (Week 1) - **CRITICAL**
- [ ] 1.1 Implement strict term matching in `apiSearchCardsHybrid()`
- [ ] 1.2 Add relevance scoring algorithm
- [ ] 1.3 Sort results by relevance score
- [ ] 1.4 Limit to top 25 most relevant results
- [ ] 1.5 Test with problematic queries ("charizard 199", "mew ex 232")

### ✅ Phase 2: Deduplication (Week 2) - **HIGH PRIORITY**
- [ ] 2.1 Implement card normalization
- [ ] 2.2 Add deduplication logic
- [ ] 2.3 Implement smart data merging
- [ ] 2.4 Test with queries that return duplicates

### ✅ Phase 3: User Behavior (Week 3) - **MEDIUM PRIORITY**
- [ ] 3.1 Create Firestore `search_analytics` collection
- [ ] 3.2 Add click tracking to CardSearch component
- [ ] 3.3 Create Cloud Function for popularity scoring
- [ ] 3.4 Integrate popularity boost into ranking
- [ ] 3.5 Add data retention policy (90 days)

### ✅ Phase 4: Complete Data Priority (Week 4) - **LOW PRIORITY**
- [ ] 4.1 Implement completeness scoring
- [ ] 4.2 Integrate into final ranking algorithm
- [ ] 4.3 A/B test weighted scores
- [ ] 4.4 Fine-tune weights based on user feedback

---

## Testing Strategy

### Test Cases

1. **"charizard 199"**
   - ✅ ONLY Charizard cards with #199
   - ❌ NO other Pokemon with #199

2. **"mew ex"**
   - ✅ Mew ex cards prioritized
   - ✅ Sorted by relevance (exact matches first)
   - ✅ No duplicates

3. **"pikachu vmax 044"**
   - ✅ Pikachu VMAX #044 cards only
   - ✅ Exact matches ranked highest

4. **"lugia"**
   - ✅ All Lugia cards
   - ✅ Sorted by popularity + relevance
   - ✅ Complete data prioritized

### Success Metrics

- **Relevance**: 95%+ of results are truly relevant
- **Deduplication**: Zero duplicate cards in results
- **Speed**: Search results in < 2 seconds
- **User Satisfaction**: Track click-through rate (CTR) on top results

---

## Additional Improvements (Future)

1. **Fuzzy Matching**: Handle typos (e.g., "charazard" → "charizard")
2. **Autocomplete**: Show suggestions as user types
3. **Search History**: Show recent searches
4. **Filters**: Add filters for set, rarity, price range
5. **Advanced Search**: Support complex queries (e.g., "charizard NOT vmax")
6. **Image Search**: Search by card image (ML-based)

---

## File Changes Required

### Frontend
- [ ] `src/utils/apiHelpers.js` - Add relevance filtering & scoring
- [ ] `src/pages/CardSearch.jsx` - Add click tracking
- [ ] `src/utils/searchHelpers.js` - New file for search utilities

### Backend
- [ ] `firestore.rules` - Add rules for `search_analytics` collection
- [ ] `functions/index.js` - Add popularity scoring function
- [ ] `functions/index.js` - Create analytics cleanup function (scheduled)

### Database
- [ ] Firestore collection: `search_analytics`
- [ ] Firestore index: `queryNormalized`, `timestamp` (for analytics)

---

## Rollout Plan

1. **Phase 1 (Critical)**: Deploy immediately after testing
2. **Phase 2 (High Priority)**: Deploy 1 week after Phase 1
3. **Phase 3 (Medium Priority)**: Deploy with user opt-in, monitor performance
4. **Phase 4 (Low Priority)**: A/B test with 50% of users, gather feedback

---

## Notes

- All changes are **backwards compatible**
- No breaking changes to existing APIs
- Can be rolled back easily if issues arise
- User privacy is maintained (no PII without consent)





