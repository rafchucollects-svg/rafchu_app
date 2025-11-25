# Multi-API Integration Strategy

**Purpose:** Smart strategy for seamlessly combining multiple pricing APIs  
**APIs Involved:**
1. **CardMarket API** (existing)
2. **TCGPlayer** (via Pokemon Price Tracker API)
3. **Pokemon Price Tracker API** (new)

**Goal:** Provide best pricing data to users while optimizing costs and performance

---

## 🎯 API STRENGTHS & WEAKNESSES

### CardMarket API
**Strengths:**
- ✅ European market pricing
- ✅ International perspective
- ✅ Non-NM condition pricing (reliable)
- ✅ European vendor availability

**Weaknesses:**
- ❌ Limited US market data
- ❌ Slower updates
- ❌ No graded card pricing
- ❌ No sealed products
- ❌ No Japanese cards

**Best For:**
- European collectors
- International price comparison
- Non-NM card pricing (LP/MP/DMG)

---

### TCGPlayer (via Pokemon Price Tracker)
**Strengths:**
- ✅ US market leader
- ✅ Real-time pricing
- ✅ High liquidity (many sellers)
- ✅ NM condition pricing (most reliable)
- ✅ Sealed products
- ✅ Fast updates

**Weaknesses:**
- ❌ US-centric only
- ❌ No graded pricing directly
- ❌ Limited international shipping

**Best For:**
- US collectors
- NM card pricing
- Quick sales/purchases
- Sealed products

---

### Pokemon Price Tracker API (New)
**Strengths:**
- ✅ Aggregates TCGPlayer data
- ✅ **PSA/Graded pricing** (8/9/10) ⭐
- ✅ **Historical data** (90 days) ⭐
- ✅ **Sealed products with history** ⭐
- ✅ Smart title parsing
- ✅ Sales velocity & trends
- ✅ Japanese promo cards (partial)
- ✅ Bulk fetching (efficient)

**Weaknesses:**
- ❌ US market only (via TCGPlayer)
- ❌ No BGS/CGC confirmed
- ❌ No Japan-exclusive cards
- ❌ API costs (credits)

**Best For:**
- Graded card tracking
- Investment analysis
- Historical trends
- Sealed product investments
- Smart imports

---

## 🧠 SMART INTEGRATION STRATEGY

### Decision Tree: Which API to Use?

```
START: User adds/views a card
│
├─ Is it a GRADED card (PSA/BGS/CGC)?
│  └─ YES → Use Pokemon Price Tracker API (includeEbay=true)
│           ✅ PSA 8/9/10 pricing
│           ✅ Sales velocity
│           ✅ Market trends
│
├─ Is it a SEALED product?
│  └─ YES → Use Pokemon Price Tracker API (/sealed-products)
│           ✅ Sealed pricing
│           ✅ Price history
│
├─ Is user in EUROPE or prefers CardMarket?
│  └─ YES → Primary: CardMarket API
│           Fallback: Pokemon Price Tracker (TCGPlayer)
│           Show both prices (€ vs $)
│
├─ Is card condition NON-NM (LP/MP/DMG)?
│  └─ YES → Primary: Pokemon Price Tracker (condition-adjusted TCGPlayer)
│           Secondary: CardMarket (if user preference)
│           Show condition warning if CardMarket + non-NM
│
├─ Is it a JAPANESE card?
│  ├─ Promo (227/S-P, etc.) → Pokemon Price Tracker (may have data)
│  └─ Japan Exclusive → Manual entry only (no API data)
│
└─ DEFAULT (Raw English NM card):
   → Primary: Pokemon Price Tracker (TCGPlayer)
   → Secondary: CardMarket (if user preference)
   → Show both for comparison
```

---

## 💡 USER EXPERIENCE DESIGN

### 1. **User Preference Setting**
**Location:** Settings > Pricing Preferences

```
┌─────────────────────────────────────┐
│ Default Pricing Source              │
├─────────────────────────────────────┤
│ ○ TCGPlayer (US Market)             │
│ ○ CardMarket (EU Market)            │
│ ● Smart (Best Available) ← Default  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Show Additional Pricing Sources     │
├─────────────────────────────────────┤
│ ☑ Show TCGPlayer pricing            │
│ ☑ Show CardMarket pricing           │
│ ☐ Show both side-by-side            │
└─────────────────────────────────────┘
```

**"Smart" Mode Logic:**
- User in US → Default to TCGPlayer
- User in EU → Default to CardMarket
- Graded cards → Always Pokemon Price Tracker
- Sealed products → Always Pokemon Price Tracker
- Historical data requested → Pokemon Price Tracker

---

### 2. **Card Display - Smart Pricing**

**Example: Raw English Card (NM)**
```
┌──────────────────────────────────────────┐
│ Charizard GX - Hidden Fates #9          │
├──────────────────────────────────────────┤
│ Market Price: $5.03                      │
│ Source: TCGPlayer (US)                   │
│                                          │
│ ▼ Compare Prices                         │
│   TCGPlayer:   $5.03 (89 listings)       │
│   CardMarket:  €4.65 (~$5.10)            │
│   Best Deal:   TCGPlayer ✓               │
└──────────────────────────────────────────┘
```

**Example: Graded Card (PSA 10)**
```
┌──────────────────────────────────────────┐
│ Charizard GX - Hidden Fates #9          │
│ Grade: PSA 10                            │
├──────────────────────────────────────────┤
│ Market Price: $73.43                     │
│ Source: eBay Sales (7-day avg)           │
│ Trend: 🔻 Falling (-8.2%)                │
│ Sales: 2.57/day (High demand)            │
│                                          │
│ ▼ Grading Options                        │
│   Raw (NM):   $5.03                      │
│   PSA 8:      $20.33 🔺                  │
│   PSA 9:      $214.00 🔺                 │
│   PSA 10:     $73.43 🔻                  │
└──────────────────────────────────────────┘
```

**Example: Sealed Product**
```
┌──────────────────────────────────────────┐
│ Surging Sparks Booster Box               │
├──────────────────────────────────────────┤
│ Market Price: $125.00                    │
│ Source: TCGPlayer                        │
│ 30-Day Change: +8.7% 🔺                  │
│                                          │
│ [View Price History Chart]               │
└──────────────────────────────────────────┘
```

---

### 3. **Price Confidence Indicators**

Show users how reliable the pricing is:

```
High Confidence ⭐⭐⭐⭐⭐
├─ 50+ listings
├─ Recent update (< 24h)
└─ Multiple sources agree

Medium Confidence ⭐⭐⭐
├─ 10-50 listings
├─ Updated within week
└─ Single reliable source

Low Confidence ⭐⭐
├─ < 10 listings
├─ Last update > 1 week
└─ Limited market data

No Data ⚠️
└─ Manual price entry recommended
```

---

## 🔧 TECHNICAL IMPLEMENTATION

### Data Structure

```javascript
// Unified card pricing object
const cardPricing = {
  // Primary price (shown first)
  primary: {
    price: 5.03,
    currency: "USD",
    source: "tcgplayer",
    condition: "NM",
    confidence: "high",
    lastUpdated: "2025-10-13T08:00:00Z",
    listings: 89
  },
  
  // Alternative pricing sources
  alternatives: [
    {
      price: 4.65,
      currency: "EUR",
      source: "cardmarket",
      condition: "NM",
      confidence: "medium",
      lastUpdated: "2025-10-12T12:00:00Z",
      listings: 23
    }
  ],
  
  // Graded pricing (if available)
  graded: {
    psa8: { price: 20.33, trend: "rising", confidence: "high" },
    psa9: { price: 214.00, trend: "rising", confidence: "high" },
    psa10: { price: 73.43, trend: "falling", confidence: "high" }
  },
  
  // Historical data (if available)
  history: {
    available: true,
    source: "pokemon_price_tracker",
    days: 90,
    trend: "stable"
  }
};
```

---

### API Call Strategy

```javascript
async function getCardPricing(card, userPreferences) {
  const results = {
    primary: null,
    alternatives: [],
    graded: null,
    history: null
  };
  
  // 1. Check if card is graded
  if (card.grade) {
    // ALWAYS use Pokemon Price Tracker for graded
    results.primary = await fetchPokemonPriceTracker(card, {
      includeEbay: true
    });
    results.graded = results.primary.ebay.salesByGrade;
    return results;
  }
  
  // 2. Check if sealed product
  if (card.type === 'sealed') {
    // ALWAYS use Pokemon Price Tracker for sealed
    results.primary = await fetchPokemonPriceTracker(card, {
      endpoint: 'sealed-products',
      includeHistory: true
    });
    results.history = results.primary.priceHistory;
    return results;
  }
  
  // 3. Determine primary source based on preferences
  const primarySource = determinePrimarySource(userPreferences, card);
  
  // 4. Fetch primary pricing
  if (primarySource === 'tcgplayer') {
    results.primary = await fetchPokemonPriceTracker(card);
  } else if (primarySource === 'cardmarket') {
    results.primary = await fetchCardMarket(card);
  }
  
  // 5. Fetch alternative pricing (if user wants comparison)
  if (userPreferences.showAlternatives) {
    if (primarySource === 'tcgplayer') {
      results.alternatives.push(await fetchCardMarket(card));
    } else {
      results.alternatives.push(await fetchPokemonPriceTracker(card));
    }
  }
  
  // 6. Fetch historical data if needed (Pokemon Price Tracker only)
  if (userPreferences.showHistory) {
    const historyData = await fetchPokemonPriceTracker(card, {
      includeHistory: true
    });
    results.history = historyData.priceHistory;
  }
  
  return results;
}

function determinePrimarySource(preferences, card) {
  // User explicitly set preference
  if (preferences.defaultSource !== 'smart') {
    return preferences.defaultSource;
  }
  
  // Smart mode logic
  const userRegion = preferences.region || detectRegion();
  
  if (userRegion === 'EU') {
    // Europe: prefer CardMarket for NM, TCGPlayer for non-NM
    return card.condition === 'NM' ? 'cardmarket' : 'tcgplayer';
  } else {
    // US/Other: prefer TCGPlayer
    return 'tcgplayer';
  }
}
```

---

### Caching Strategy

```javascript
const CACHE_DURATION = {
  cardmarket: 60 * 60 * 1000,        // 1 hour
  tcgplayer: 30 * 60 * 1000,         // 30 minutes
  graded: 24 * 60 * 60 * 1000,       // 24 hours (less volatile)
  sealed: 60 * 60 * 1000,            // 1 hour
  history: 24 * 60 * 60 * 1000       // 24 hours (doesn't change much)
};

// Cache structure in Firestore
const priceCache = {
  cardId: "68b2ea70b594c9577ba43e48",
  sources: {
    tcgplayer: {
      price: 5.03,
      cachedAt: "2025-10-13T08:00:00Z",
      expiresAt: "2025-10-13T08:30:00Z"
    },
    cardmarket: {
      price: 4.65,
      cachedAt: "2025-10-13T07:00:00Z",
      expiresAt: "2025-10-13T08:00:00Z"
    }
  }
};

async function fetchWithCache(source, card, options) {
  const cacheKey = `${source}-${card.tcgPlayerId}`;
  const cached = await getFromCache(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  
  // Fetch fresh data
  const freshData = await fetchFromAPI(source, card, options);
  
  // Cache it
  await saveToCache(cacheKey, freshData, CACHE_DURATION[source]);
  
  return freshData;
}
```

---

## 💰 COST OPTIMIZATION

### Pokemon Price Tracker API Credits

**Strategy to minimize costs:**

1. **Batch Operations**
   - Use `fetchAllInSet=true` instead of individual calls
   - Cache aggressively

2. **Selective History**
   - Only fetch history when user explicitly requests it
   - Don't fetch history for entire collection by default

3. **Selective Graded Data**
   - Only fetch eBay data for cards user marks as "graded"
   - Don't fetch for entire collection

4. **Smart Refresh**
   - Only refresh prices when user views a card
   - Background refresh for top 10 most valuable cards only

**Example Cost Calculation:**

```
User views their collection (100 cards):
- Show cached prices (free)
- User clicks 1 card to see details
- Fetch: 1 card + history + graded = 3 credits
- Daily cost for active user: ~10-30 credits

User imports a set (50 cards):
- Fetch: 50 cards with basic pricing = 50 credits
- If they want history: +50 credits = 100 total

Monthly estimate for 100 active users:
- 100 users × 30 credits/day = 3,000 credits/day
- 3,000 × 30 days = 90,000 credits/month
- Well within 10,000/day Pro limit per account
```

---

## 🚀 ROLLOUT STRATEGY

### Phase 1: Background Integration (Week 1)
- ✅ Set up Pokemon Price Tracker API
- ✅ Build API adapter functions
- ✅ Implement caching layer
- ✅ Test with sample data
- ❌ DON'T show to users yet

### Phase 2: Graded Cards Beta (Week 2)
- ✅ Add graded card tracking for admins only
- ✅ Test PSA pricing accuracy
- ✅ Validate caching strategy
- ✅ Monitor API usage/costs
- ❌ DON'T open to all users yet

### Phase 3: Soft Launch (Week 3)
- ✅ Add "Smart Pricing" toggle in settings
- ✅ Default OFF, users opt-in
- ✅ Show both TCGPlayer and CardMarket
- ✅ Add price confidence indicators
- ✅ Monitor user feedback

### Phase 4: Full Launch (Week 4)
- ✅ Default "Smart Pricing" to ON
- ✅ Add graded card features for all users
- ✅ Add sealed product tracking
- ✅ Add historical price charts
- ✅ Full feature set live

### Phase 5: Optimization (Ongoing)
- ✅ Refine caching strategy based on usage
- ✅ Add more pricing sources if needed
- ✅ A/B test different UI presentations
- ✅ Optimize API costs

---

## 📊 SUCCESS METRICS

**Track these to measure success:**

1. **Data Quality**
   - % of cards with pricing data
   - Average confidence score
   - User-reported price accuracy

2. **User Engagement**
   - % of users using price comparison
   - % of users viewing historical data
   - % of users tracking graded cards

3. **API Costs**
   - Average credits per user per day
   - Total monthly API costs
   - Cost per active user

4. **User Satisfaction**
   - NPS score for pricing features
   - Support tickets about pricing
   - Feature usage rates

---

## ✅ IMPLEMENTATION CHECKLIST

**Before Going Live:**

- [ ] API keys securely stored (environment variables)
- [ ] Rate limiting implemented (respect API limits)
- [ ] Error handling (graceful fallbacks)
- [ ] Caching layer built
- [ ] User preferences saved
- [ ] Price confidence indicators
- [ ] Currency conversion ($ ↔ €)
- [ ] Mobile-responsive pricing UI
- [ ] Loading states for slow API calls
- [ ] Offline mode (show cached prices)
- [ ] Admin dashboard for API monitoring
- [ ] Cost alerts (if approaching limits)

**Nice to Have:**

- [ ] A/B test different pricing displays
- [ ] User feedback on pricing accuracy
- [ ] Automatic fallback if API down
- [ ] Price history charts
- [ ] Export pricing data

---

## 🎯 RECOMMENDATION

**Start with this approach:**

1. **Keep CardMarket as default for EU users** (it's working well)
2. **Add Pokemon Price Tracker for:**
   - Graded cards (PSA) - NEW FEATURE ⭐
   - Sealed products - NEW FEATURE ⭐
   - US users who prefer TCGPlayer
   - Historical data when requested
3. **Show both prices side-by-side** for transparency
4. **Let users choose** their preferred source
5. **Use caching aggressively** to minimize costs

**This gives you:**
- ✅ Best of both worlds (EU + US markets)
- ✅ New features (graded, sealed, history)
- ✅ User choice and transparency
- ✅ Cost-effective implementation
- ✅ Seamless user experience

**Ready to implement when you are!** 🚀










