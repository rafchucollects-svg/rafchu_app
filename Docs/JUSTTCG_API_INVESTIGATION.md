# JustTCG.com API Investigation

**Date:** October 13, 2025  
**API Key Provided:** `REDACTED_JUSTTCG_KEY`  
**Status:** ⚠️ Unable to Connect - Cloudflare Error 1014

---

## 🎯 **WHY THIS API IS PROMISING**

### **Variant Support in Data Structure:**

From their documentation example:
```json
{
  "id": "pokemon-battle-academy-fire-energy-22-charizard-stamped",
  "name": "Fire Energy (#22 Charizard Stamped)",
  "game": "Pokemon",
  "set": "battle-academy-pokemon",
  "set_name": "Battle Academy",
  "number": "N/A",
  "tcgplayerId": "219042",
  "rarity": "Promo",
  "variants": [
    {
      "id": "pokemon-battle-academy-fire-energy-22-charizard-stamped_near-mint",
      "printing": "Normal",  // <-- THIS IS KEY!
      "condition": "Near Mint",
      "price": 4.99,
      "lastUpdated": 1743100261
    },
    {
      "id": "pokemon-battle-academy-fire-energy-22-charizard-stamped_lightly-played",
      "printing": "Normal",
      "condition": "Lightly Played",
      "price": 3.50,
      "lastUpdated": 1743101175
    }
  ]
}
```

### **Key Features:**

✅ **`variants` array** - Built-in variant support!  
✅ **`printing` field** - Could differentiate "Normal", "Reverse Holo", "1st Edition", etc.  
✅ **`tcgplayerId`** - Can cross-reference with our existing data  
✅ **Condition-specific pricing** - NM, LP, MP, etc.  
✅ **`lastUpdated` timestamp** - Know how fresh the data is  
✅ **Pokemon-specific** - Can filter by `game=Pokemon`

### **Rate Limits:**
- 10 requests per minute
- 20 cards per request
- **Very reasonable for our use case!**

---

## ✅ **API IS WORKING! - Testing Complete**

### **Connection Method:**
- ❌ Direct curl requests: Failed (Error 1014 - Cloudflare blocking)
- ✅ **Official SDK (`justtcg-js`)**: SUCCESS! 🎉

### **How to Use:**
```javascript
import { JustTCG } from 'justtcg-js';

const client = new JustTCG({ apiKey: 'REDACTED_JUSTTCG_KEY' });

// Search for cards
const results = await client.v1.cards.search({
  game: 'Pokemon',
  search: 'Charizard',
  limit: 20
});

// Get specific card
const card = await client.v1.cards.get({
  game: 'Pokemon',
  tcgplayerId: '85670'
});
```

---

## 🎯 **KEY FINDINGS:**

### ✅ **1. PRINTING VARIANTS ARE TRACKED!**

**Example: Shining Charizard (Neo Destiny)**
```json
{
  "name": "Shining Charizard",
  "tcgplayerId": "89163",
  "variants": [
    {
      "printing": "Unlimited Holofoil",
      "condition": "Near Mint",
      "price": 6502.49
    },
    {
      "printing": "1st Edition Holofoil",
      "condition": "Near Mint",
      "price": 700.00
    }
  ]
}
```

**THIS IS EXACTLY WHAT WE NEED!** 🎯

### ✅ **2. Rich Price History**
- 7-day, 30-day, 90-day, and 1-year price trends
- Min/max prices
- Price change percentages
- Historical data points
- Volatility metrics

### ✅ **3. Multiple Conditions Per Variant**
Each printing has prices for:
- Near Mint
- Lightly Played
- Moderately Played
- Heavily Played
- Damaged

### ✅ **4. Generous Rate Limits**
```json
{
  "apiRequestLimit": 1000,
  "apiDailyLimit": 100,
  "apiRateLimit": 10,
  "apiRequestsUsed": 1,
  "apiDailyRequestsUsed": 1,
  "apiRequestsRemaining": 999,
  "apiDailyRequestsRemaining": 99,
  "apiPlan": "Free Tier"
}
```

**10 requests/min, 100/day, 1000 total on free tier!**

---

## ⚠️ **LIMITATIONS FOUND:**

### **1. Search Quality**
- Searches prioritize expensive items (booster boxes, cases)
- Individual cards can be hard to find via search
- May need to search by TCGPlayer ID or specific filters

### **2. Documentation Gap**
- SDK has `v1` endpoints, but docs mention `v2`
- Need to explore full API capabilities
- Some methods unclear (get by TCGPlayer ID didn't work as expected)

### **3. Not All Cards May Be Indexed**
- Couldn't find Gengar #11 from Legendary Collection in initial tests
- May need better search strategies
- Or database might be incomplete for older/less popular cards

---

## 🎯 **NEXT STEPS:**

###  **1. Further Testing** (Priority: HIGH)
- [ ] Test with more Pokemon cards to verify coverage
- [ ] Find optimal search strategies for specific cards
- [ ] Test `getByBatch` method for bulk operations
- [ ] Explore filtering options (by set, rarity, etc.)
- [ ] Test if we can search by TCGPlayer ID reliably

### **2. Verify Gengar Legendary Collection Coverage**
- [ ] Try different search terms
- [ ] Check if card exists in their database
- [ ] If missing, evaluate coverage for older sets
- [ ] Compare with Pokemon Price Tracker coverage

### **3. Integration Planning** (if data is good)
- [ ] Decide: Primary or Secondary data source?
- [ ] Design data sync strategy
- [ ] Plan caching approach (100 requests/day limit)
- [ ] Map JustTCG data to our schema
- [ ] Handle API rate limits gracefully

### **4. Prototype Implementation**
- [ ] Create JustTCG API helper module
- [ ] Implement card search with variant support
- [ ] Test in card search UI
- [ ] Compare results with current Pokemon Price Tracker data
- [ ] Measure performance and accuracy

---

## 💡 **WHY THIS API IS WORTH PURSUING**

Even with the current connection issue, **JustTCG API is VERY promising** for variant support:

### **1. Native Variant Support**
The `variants` array with `printing` field is EXACTLY what we need:

```javascript
// Hypothetical response for Gengar #11:
{
  "name": "Gengar",
  "number": "11",
  "set_name": "Legendary Collection",
  "tcgplayerId": "85670",
  "variants": [
    {
      "printing": "Holofoil",      // Regular Holo
      "condition": "Near Mint",
      "price": 169.99
    },
    {
      "printing": "Reverse Holofoil", // REVERSE HOLO!
      "condition": "Near Mint",
      "price": 250.00
    }
  ]
}
```

**This would solve our variant problem COMPLETELY!** 🎉

---

### **2. Better Data Structure Than Current APIs**

| Feature | Pokemon Price Tracker | CardMarket | **JustTCG** |
|---------|----------------------|------------|-------------|
| Variant Support | ❌ Limited | ❌ Unknown | ✅ **Native** |
| Printing Field | ❌ No | ❌ No | ✅ **Yes** |
| Condition Pricing | ✅ Yes | ✅ Yes | ✅ Yes |
| TCGPlayer ID | ✅ Yes | ❌ No | ✅ **Yes** |
| Rate Limits | 60/min | Unknown | 10/min |
| Cards per Request | 1 | Unknown | **20** |

**JustTCG could be our PRIMARY data source!** 🚀

---

### **3. Efficient for Our Use Case**

With 20 cards per request:
- **Single request** = Get 20 cards with ALL variants and pricing
- **10 requests/min** = 200 cards/min = 12,000 cards/hour
- **More than enough** for typical user searches

Compare to Pokemon Price Tracker:
- 1 card per request
- 60 requests/min = 60 cards/min = 3,600 cards/hour
- **JustTCG is 3.3x more efficient!**

---

## 🎨 **HOW WE WOULD USE IT**

### **Search Flow:**

```javascript
// User searches "Gengar Legendary Collection"
const response = await fetch('https://api.justtcg.com/v2/cards', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer REDACTED_JUSTTCG_KEY'
  },
  params: {
    game: 'Pokemon',
    search: 'Gengar Legendary Collection',
    limit: 20
  }
});

const cards = await response.json();

// Display results with variants
cards.forEach(card => {
  console.log(`${card.name} - ${card.set_name} #${card.number}`);
  
  // Group variants by printing
  const printings = groupBy(card.variants, v => v.printing);
  
  Object.entries(printings).forEach(([printing, variants]) => {
    const nmPrice = variants.find(v => v.condition === 'Near Mint')?.price;
    console.log(`  ${printing}: $${nmPrice}`);
  });
});

// Output:
// Gengar - Legendary Collection #11
//   Holofoil: $169.99
//   Reverse Holofoil: $250.00
```

### **Collection Item Structure:**

```javascript
{
  id: "collection_123",
  userId: "user_abc",
  
  // Card identification
  name: "Gengar",
  set: "Legendary Collection",
  number: "11",
  tcgPlayerId: "85670",
  
  // Variant information (from JustTCG)
  printing: "Reverse Holofoil",    // From API!
  variantSource: "justtcg",        // API-confirmed
  
  // User's card details
  condition: "Near Mint",
  quantity: 1,
  
  // Pricing (from JustTCG)
  currentPrice: 250.00,
  priceLastUpdated: 1743100261,
  priceSource: "justtcg"
}
```

---

## ✅ **ACTION PLAN**

### **IMMEDIATE (You need to do this):**

1. **Check your email** from JustTCG
   - Look for activation instructions
   - Look for API documentation link
   - Check spam folder

2. **Visit JustTCG.com**
   - Login to your account (if applicable)
   - Look for "API" or "Developer" section
   - Check if API key needs activation

3. **Find Documentation**
   - Look for API docs at `docs.justtcg.com` or similar
   - Check for example code
   - Verify the correct authentication method

4. **Contact Support**
   - Email: support@justtcg.com (or similar)
   - Explain Error 1014 issue
   - Request working example curl command

### **ONCE API IS ACCESSIBLE:**

1. **Test Variant Data (Priority #1)**
   ```bash
   # Test Gengar - Legendary Collection
   # Should return BOTH Holo and Reverse Holo variants
   ```

2. **Test Modern Set (Priority #2)**
   ```bash
   # Test a modern common (e.g., Pikachu from recent set)
   # Should have regular + reverse holo variants
   ```

3. **Test Edge Cases**
   - 1st Edition cards
   - Shadowless cards
   - Promo cards
   - Secret Rares

4. **Compare Pricing**
   - Cross-check with Pokemon Price Tracker
   - Verify accuracy
   - Check data freshness

5. **Evaluate for Production**
   - Data completeness
   - Update frequency
   - Rate limits sufficient?
   - Pricing accuracy
   - Reliability

---

## 🎯 **IF JUSTTCG API WORKS...**

### **Implementation Priority:**

**HIGH PRIORITY** - Could replace Pokemon Price Tracker as primary source!

**Why:**
- ✅ Native variant support (THE KEY FEATURE WE NEED!)
- ✅ TCGPlayer IDs for cross-reference
- ✅ Condition-specific pricing
- ✅ Efficient (20 cards per request)
- ✅ Reasonable rate limits
- ✅ Pokemon-focused

**Timeline:**
- If data is good: **1 week to integrate**
- If data has gaps: **Use as supplement to Pokemon Price Tracker**

---

## 📊 **COMPARISON: ALL THREE APIS**

| Feature | Pokemon Price Tracker | JustTCG | TCGPlayer Direct |
|---------|----------------------|---------|------------------|
| **Variant Support** | ❌ Limited | 🎯 **Native** | ✅ Complete |
| **Easy Access** | ✅ Active | ⏳ Pending | ❌ Need to Apply |
| **Rate Limits** | 60/min | 10/min | Unknown |
| **Cards/Request** | 1 | **20** | Unknown |
| **Pokemon Focus** | ✅ Yes | ✅ Yes | Multi-game |
| **Cost** | $$ | **FREE** | $$$ |
| **Data Quality** | Good | **Unknown** | Best |

**Recommendation:**
1. **Get JustTCG working** (highest priority!)
2. If JustTCG data is good → **Make it primary source**
3. If JustTCG has gaps → **Use with Pokemon Price Tracker**
4. Consider TCGPlayer direct only if both fail

---

## 🚀 **BOTTOM LINE**

**JustTCG API could be THE SOLUTION to our variant problem!**

The `variants` array with `printing` field is EXACTLY what we need. If this API has good data coverage for Pokemon cards, it could:

- ✅ Solve the variant tracking issue completely
- ✅ Replace Pokemon Price Tracker (simpler architecture)
- ✅ Save API costs (free vs paid)
- ✅ Provide better data structure
- ✅ Enable efficient batch operations

**BUT FIRST:** We need to resolve the Error 1014 and get the API working!

---

**Status:** ✅ **API IS WORKING! Confirmed variant support!**  
**Next Step:** Further testing to verify card coverage, then integration planning  
**Priority:** 🔥 HIGH - This could be THE solution for variant tracking!

---

## 📊 **FINAL ASSESSMENT:**

### **What We Know FOR SURE:**

✅ **API Works** - Successfully connected via SDK  
✅ **Variant Support** - Confirmed with Shining Charizard example  
✅ **Printing Field** - "Unlimited Holofoil" vs "1st Edition Holofoil" tracked separately  
✅ **Condition Pricing** - All 5 conditions per variant  
✅ **Price History** - Extensive historical data  
✅ **Free Tier** - 100 requests/day, 1000 total  
✅ **TCGPlayer IDs** - Can cross-reference with existing data

### **What We DON'T Know Yet:**

❓ Card coverage for older/less popular sets  
❓ Whether Reverse Holo variants are tracked  
❓ Optimal search strategies  
❓ Full API capabilities (SDK may not expose everything)  
❓ Data freshness and update frequency

### **Recommendation:**

**MEDIUM-HIGH PRIORITY** - Very promising, but needs more testing before committing to integration.

**Immediate Actions:**
1. ✅ SDK installed (`justtcg-js`)
2. ⏭️ **Test with 20-30 known cards** (including variants)
3. ⏭️ **Compare with Pokemon Price Tracker** data quality
4. ⏭️ **Decide on integration strategy** based on findings

**If testing goes well:**
- Use as **PRIMARY** source for variant data
- Fall back to Pokemon Price Tracker for gaps
- This would give us the BEST variant coverage!

**If testing reveals gaps:**
- Use as **SECONDARY** source
- Pokemon Price Tracker remains primary
- Use JustTCG for specific high-value variants

---

**Updated:** October 13, 2025  
**Next Review:** After comprehensive card testing

