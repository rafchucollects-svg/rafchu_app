# Card Variant Support - API Investigation

**Question:** Do the APIs differentiate between card variants (regular holo vs reverse holo)?  
**Date:** October 13, 2025  
**Status:** Investigation in Progress

---

## 🎯 WHY VARIANTS MATTER

Card variants are **separate collectibles** with **different values**:

### Common Variant Types:

1. **Regular Holo vs Reverse Holo**
   - Most modern sets (2004+) have both versions
   - Regular holo: Holofoil on Pokemon artwork
   - Reverse holo: Holofoil on card background
   - Often have different values

2. **1st Edition vs Unlimited**
   - Vintage sets (Base Set, Jungle, Fossil, etc.)
   - 1st Edition usually 2-10x more valuable
   - Different stamp on card

3. **Shadowless vs Unlimited** (Base Set only)
   - Base Set has shadowless variant
   - Can be 2-5x more valuable

4. **Holofoil vs Non-Holo**
   - Rare cards often come in both
   - Holo version usually more valuable

5. **Promo vs Regular**
   - Same card, different set
   - Different card number
   - Different artwork sometimes

6. **Regional Variants**
   - English vs Japanese
   - Different language versions

7. **Special Editions**
   - Full Art vs Regular
   - Secret Rare vs Regular
   - Textured vs Smooth
   - Cosmos vs Regular (modern)

---

## 🔍 POKEMON PRICE TRACKER API - FINDINGS

### ✅ **CONFIRMED: Variants ARE Tracked**

From initial testing, I found these examples:

```json
{
  "name": "Lotad - 055/100 (EX Crystal Guardians Reverse Holofoil)",
  "setName": "Crystal Guardians",
  "cardNumber": "55"
}

{
  "name": "Meowth - 80/99 (Mirror Reverse Holo)",
  "setName": "Miscellaneous Cards & Products",
  "cardNumber": "080"
}

{
  "name": "Basic Metal Energy (Reverse Holofoil)",
  "setName": "Shrouded Fable",
  "cardNumber": ""
}
```

**Key Finding:** Variant information is included in the `name` field!

### 🔍 **WHAT WE NEED TO VERIFY:**

1. **Are variants separate entries in the database?**
   - Does Gengar #11 Legendary Collection have TWO entries (regular + reverse)?
   - Or just one entry?

2. **Do variants have different TCGPlayer IDs?**
   - If yes, they're fully separate cards ✅
   - If no, they might share pricing ❌

3. **Do variants have separate pricing?**
   - Regular vs Reverse can have different values
   - Need to verify pricing is variant-specific

4. **How are modern set commons handled?**
   - Most modern commons have regular + reverse
   - Are both tracked?

5. **What about 1st Edition/Shadowless?**
   - These are vintage and very valuable
   - Need to confirm these are separate entries

---

## 📊 TESTING CHECKLIST

### Test Cases to Run (After Rate Limit Resets):

#### Test 1: Modern Set with Reverse Holos
```bash
# Vivid Voltage - Every common has regular + reverse
GET /api/v2/cards?setId=68af47c7190c4823de2527ca&fetchAllInSet=true

# Look for duplicate card numbers with different variants
# Example: Should see TWO Pikachu #043 entries
```

**Expected Result:**
- Card #043 - Pikachu (Regular)
- Card #043 - Pikachu (Reverse Holo)
- Different TCGPlayer IDs
- Different prices

---

#### Test 2: Legendary Collection (Has Reverse Holos)
```bash
GET /api/v2/cards?search=Gengar+11+Legendary&limit=10

# Should return multiple results for card #11
```

**Expected Result:**
- Gengar #11/110 (Regular Holo)
- Gengar #11/110 (Reverse Holo)
- Different prices ($X vs $Y)

---

#### Test 3: Base Set (1st Edition vs Unlimited vs Shadowless)
```bash
GET /api/v2/cards?search=Charizard+base+set&limit=20

# Should return multiple versions
```

**Expected Result:**
- Charizard 4/102 (1st Edition) - $$$$$
- Charizard 4/102 (Shadowless) - $$$
- Charizard 4/102 (Unlimited) - $$
- All with different TCGPlayer IDs

---

#### Test 4: Full Art vs Regular
```bash
GET /api/v2/cards?search=Professor+Research+celebrations&limit=10
```

**Expected Result:**
- Professor's Research (Regular)
- Professor's Research (Full Art)
- Different card numbers or variant tag

---

#### Test 5: Check TCGPlayer IDs
```bash
GET /api/v2/cards?tcgPlayerId=197651
GET /api/v2/cards?tcgPlayerId=197652

# Consecutive IDs might be variants of same card
```

---

## 🔗 CARDMARKET API - TO INVESTIGATE

### Questions for CardMarket:

1. **Does CardMarket track variants separately?**
   - Need to check API documentation
   - Or test with known variant cards

2. **How does CardMarket name variants?**
   - "Reverse Holo"?
   - "1st Edition"?
   - Different product IDs?

3. **Are prices variant-specific?**
   - Critical for accurate valuations

### CardMarket Variant Examples:

**Known facts about CardMarket:**
- European market
- Tracks card condition (NM, LP, MP, etc.)
- Has detailed product database
- Likely tracks variants (they're separate products)

**Need to test:**
```bash
# Check if your existing CardMarket API integration
# returns variant information in card names or metadata
```

---

## 💡 IMPLICATIONS FOR YOUR APP

### If Variants ARE Separate Entries (Expected): ✅

**Good News:**
- Users can track each variant separately
- Accurate pricing per variant
- Can show "You have 5 variants of this card"
- Set completion can include variant tracking

**Implementation:**
```javascript
{
  cardId: "charizard-base-set-4-102",
  variants: [
    {
      type: "1st-edition",
      tcgPlayerId: "12345",
      price: 50000,
      owned: false
    },
    {
      type: "shadowless",
      tcgPlayerId: "12346",
      price: 10000,
      owned: true
    },
    {
      type: "unlimited",
      tcgPlayerId: "12347",
      price: 500,
      owned: true
    }
  ]
}
```

---

### If Variants Share Entries (Unlikely): ❌

**Bad News:**
- Can't accurately track different variants
- Pricing might be averaged or inaccurate
- Users can't differentiate their collection

**Workaround:**
- Add manual "variant" field to your collection items
- Let users specify variant type
- Use base pricing but allow manual override

---

## 🎨 UI IMPLICATIONS

### Variant Display Options:

#### Option 1: Show Variants as Separate Cards
```
┌─────────────────────────────────────┐
│ Charizard - Base Set #4             │
│ Type: 1st Edition                   │
│ Price: $50,000                      │
│ [Add to Collection]                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Charizard - Base Set #4             │
│ Type: Shadowless                    │
│ Price: $10,000                      │
│ [Add to Collection]                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Charizard - Base Set #4             │
│ Type: Unlimited                     │
│ Price: $500                         │
│ [Add to Collection]                 │
└─────────────────────────────────────┘
```

#### Option 2: Show Variants as Options
```
┌─────────────────────────────────────┐
│ Charizard - Base Set #4             │
│                                     │
│ Select Variant:                     │
│ ○ 1st Edition - $50,000             │
│ ○ Shadowless - $10,000              │
│ ● Unlimited - $500                  │
│                                     │
│ [Add to Collection]                 │
└─────────────────────────────────────┘
```

#### Option 3: Grouped Card View
```
┌─────────────────────────────────────┐
│ Charizard - Base Set #4             │
│                                     │
│ You own: 2/3 variants               │
│ ☑ Shadowless                        │
│ ☑ Unlimited                         │
│ ☐ 1st Edition (Most Valuable!)      │
│                                     │
│ [View Variants]                     │
└─────────────────────────────────────┘
```

---

## 🔧 TECHNICAL CONSIDERATIONS

### Database Schema:

```javascript
// Collection Item Structure
{
  id: "collection_item_123",
  userId: "user_abc",
  
  // Card identification
  cardName: "Charizard",
  setName: "Base Set",
  cardNumber: "4",
  tcgPlayerId: "12345",
  
  // Variant specifics
  variant: "1st Edition", // or "Reverse Holo", "Regular", etc.
  variantType: "edition", // "edition", "holo", "promo", "language"
  
  // Quantity & condition
  quantity: 1,
  condition: "NM",
  
  // Pricing (variant-specific)
  purchasePrice: 45000,
  currentPrice: 50000,
  priceSource: "pokemon_price_tracker",
  
  // Metadata
  addedAt: "2025-10-13T00:00:00Z",
  notes: "Purchased at local show"
}
```

### Search & Filter:

```javascript
// Filter by variant
collectionItems.filter(item => item.variant === "Reverse Holo");

// Group by base card
const grouped = groupBy(collectionItems, item => 
  `${item.cardName}-${item.setName}-${item.cardNumber}`
);

// Show variant completion
const charizardVariants = grouped["Charizard-Base Set-4"];
console.log(`You own ${charizardVariants.length}/3 variants`);
```

---

## ✅ ACTION ITEMS

### Immediate (After Rate Limit Resets):
- [ ] Test Pokemon Price Tracker with modern set (Vivid Voltage)
- [ ] Test with Legendary Collection Gengar
- [ ] Test with Base Set Charizard
- [ ] Verify TCGPlayer IDs are different for variants
- [ ] Document variant naming conventions

### CardMarket Investigation:
- [ ] Check CardMarket API docs for variant support
- [ ] Test CardMarket API with known variant cards
- [ ] Compare CardMarket vs Pokemon Price Tracker variant data
- [ ] Document CardMarket variant naming conventions

### App Implementation:
- [ ] Decide on variant display strategy (separate vs grouped)
- [ ] Update collection schema to include variant field
- [ ] Add variant filter to collection views
- [ ] Add variant selector when adding cards
- [ ] Update pricing logic to be variant-aware

---

## 📝 PRELIMINARY CONCLUSIONS

Based on initial findings:

### ✅ **Pokemon Price Tracker API:**
- **DOES track variants** (confirmed from card names)
- Variants appear to be in the card name: "(Reverse Holofoil)"
- Need to verify they have separate entries & pricing

### ❓ **CardMarket API:**
- **Unknown** - needs testing
- Likely tracks variants (they're separate SKUs in stores)
- Need to verify data structure

### 🎯 **Recommendation:**
Once rate limit resets, run all test cases to confirm:
1. Variants are separate database entries
2. Variants have unique TCGPlayer IDs
3. Variants have separate pricing
4. Variant information is consistent in card names

**Then we can design the UI and database schema accordingly.**

---

## 🚨 IMPORTANT NOTE

**This is critical for collectors!**

Imagine telling a user their "Charizard Base Set" is worth $500 when they actually have a 1st Edition worth $50,000. Getting variants right is **essential** for:

1. Accurate collection valuation
2. User trust
3. Marketplace transactions
4. Set completion tracking
5. Investment decisions

**We MUST support variants properly!** ⭐

---

**Status:** Awaiting API rate limit reset to complete testing.  
**Next Step:** Run full test suite and document findings.










