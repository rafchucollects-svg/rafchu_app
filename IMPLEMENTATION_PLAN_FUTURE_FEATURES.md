# Implementation Plan: Graded Cards, Japanese Cards & Sealed Products

**Date Created:** October 12, 2025  
**Status:** Planning Phase - To Be Actioned Later

---

## Current API Assessment

### CardMarket API (via RapidAPI) - Current Implementation
**Endpoint:** `https://cardmarket-api-tcg.p.rapidapi.com`

**Current Capabilities:**
- ✅ English Pokémon TCG cards
- ✅ Card pricing (TCGPlayer & CardMarket)
- ✅ Card images, set information, rarity
- ✅ Card numbers and variants
- ❌ **No native graded card data**
- ❌ **No native Japanese card data**
- ❌ **No sealed product data**

### What We Need to Add

---

## 1. GRADED CARDS SUPPORT

### Current Limitations
The CardMarket API does not provide:
- PSA/BGS/CGC graded pricing
- Grade population data
- Certification numbers
- Graded card images

### Implementation Strategy

#### Phase 1: Basic Graded Card Tracking (Immediate - No API Required)
**Can be done TODAY with existing infrastructure**

**Database Schema Addition:**
```javascript
{
  // Existing card fields...
  name: "Charizard",
  set: "Base Set",
  number: "4",
  condition: "NM",
  
  // NEW: Graded card fields
  isGraded: false,
  gradingInfo: {
    company: null, // "PSA", "BGS", "CGC", "ACE"
    grade: null, // "10", "9.5", "9", etc.
    certNumber: null, // Certification number
    subgrades: { // For BGS
      centering: null,
      corners: null, 
      edges: null,
      surface: null
    },
    gradedDate: null,
    gradedValue: null // Manual price override for graded
  }
}
```

**UI Components Needed:**
1. Toggle for "This card is graded"
2. Dropdown for grading company
3. Input for grade (with validation)
4. Input for certification number
5. Display badge showing grade (e.g., "PSA 10", "BGS 9.5")
6. Filter/sort by graded status

**Pricing Strategy:**
- Manual price override for graded cards (required)
- Future: Integrate with eBay API for recent sold graded card data
- Future: Integrate with PSA/CGC APIs for population data

**Effort:** 2-3 days development + testing

---

#### Phase 2: Graded Card Price Data (Requires New API)
**NOT available today - requires external integration**

**Option A: eBay API Integration**
- **Pros:** Real sold prices for graded cards
- **Cons:** Rate limits, complex authentication
- **Cost:** Free tier available, paid tiers for higher volume
- **API:** https://developer.ebay.com/

**Implementation:**
```javascript
// Example search
GET https://api.ebay.com/buy/browse/v1/item_summary/search
Query: "Charizard Base Set PSA 10"
Filter by: Sold listings, last 90 days
```

**Option B: TCGPlayer Pricing API (Graded)**
- **Pros:** Structured pricing data
- **Cons:** Limited graded card coverage
- **Cost:** Requires TCGPlayer partnership
- **API:** https://docs.tcgplayer.com/

**Option C: PriceCharting API**
- **Pros:** Historical graded card pricing
- **Cons:** Primarily focused on video games, limited TCG
- **API:** https://www.pricecharting.com/api-documentation

**Recommended:** eBay API for graded card pricing (Phase 2)

**Effort:** 5-7 days development + testing

---

#### Phase 3: AI-Powered Pre-Grading (Advanced - Optional)
**NOT available today - requires AI service**

**Option: Ximilar Card Grading API**
- Upload card images
- AI analyzes centering, corners, edges, surface
- Provides estimated grade
- **Cost:** ~$0.10-0.50 per image analysis
- **API:** https://www.ximilar.com/

**Use Case:** Help collectors decide if a card is worth professional grading

**Effort:** 3-4 days development + testing

---

## 2. JAPANESE CARDS SUPPORT

### Current Limitations
The CardMarket API focuses on English/European markets and has limited Japanese card data.

### Implementation Strategy

#### Phase 1: Manual Japanese Card Entry (Immediate)
**Can be done TODAY with existing infrastructure**

**Database Schema Addition:**
```javascript
{
  // Existing fields...
  name: "Charizard",
  
  // NEW: Japanese card support
  language: "English", // "English", "Japanese", "German", etc.
  japaneseInfo: {
    japaneseName: "リザードン", // Original Japanese name
    set: "Base Set", // English set name
    japaneseSet: "第1弾拡張パック", // Japanese set name
    releaseDate: "1996-10-20",
    isPromo: false,
    promoNumber: null
  }
}
```

**UI Components Needed:**
1. Language selector dropdown
2. Japanese name input field (with Japanese IME support)
3. Japanese set name input
4. Filter by language
5. Display Japanese characters properly in cards

**Pricing Strategy:**
- Manual price entry initially
- Future: Integrate with Mercari Japan, Yahoo! Auctions Japan

**Effort:** 2-3 days development + testing

---

#### Phase 2: Japanese Card Database Integration (Requires New Data Source)
**NOT fully available today - requires external integration**

**Option A: Pokemon TCG API (pokemontcg.io)**
- **Coverage:** Some Japanese sets available
- **Pros:** Free, well-documented
- **Cons:** Incomplete Japanese coverage
- **API:** https://pokemontcg.io

```javascript
// Check if set is Japanese
GET https://api.pokemontcg.io/v2/sets
Filter: printedTotal, releaseDate, series

// Many Japanese sets ARE available
// E.g., "Japanese Gym Heroes", "Japanese Neo Genesis"
```

**Option B: Pokellector API (Unofficial)**
- Scraping-based solution
- Has extensive Japanese card data
- **Legal concerns** - not officially sanctioned

**Option C: Manual Database Building**
- Create our own Japanese card database
- Source from:
  - Bulbapedia
  - Serebii.net
  - Pokeguardian
- One-time effort, long-term benefit

**Recommended:** Start with Pokemon TCG API, supplement with manual database

**Effort:** 7-10 days for database setup + testing

---

#### Phase 3: Japanese Market Pricing (Advanced)
**NOT available today - requires Japanese marketplace integration**

**Option A: Mercari Japan API**
- Real Japanese market prices
- **Issue:** No official API, requires scraping
- **Legal:** Gray area

**Option B: Yahoo! Auctions Japan**
- Auction prices for Japanese cards
- **Issue:** No official API for card pricing
- **Alternative:** Manual price tracking

**Option C: CardRush / Hareruya (Japanese Stores)**
- Direct Japanese retailer pricing
- **Issue:** No public APIs
- **Solution:** Web scraping or partnerships

**Recommended:** Manual pricing initially, explore partnerships later

**Effort:** 10-15 days for full integration

---

## 3. SEALED PRODUCTS SUPPORT

### Current Limitations
The CardMarket API is card-focused and does NOT include:
- Booster boxes
- Elite Trainer Boxes (ETBs)
- Collection boxes
- Blister packs
- Tins

### Implementation Strategy

#### Phase 1: Manual Sealed Product Entry (Immediate)
**Can be done TODAY with existing infrastructure**

**Database Schema - New Collection Type:**
```javascript
{
  type: "sealed_product", // New type alongside "card"
  productType: "booster_box", // "etb", "collection_box", "blister", "tin"
  
  productInfo: {
    name: "Obsidian Flames Booster Box",
    set: "Obsidian Flames",
    releaseDate: "2023-08-11",
    packCount: 36, // For booster boxes
    cardsPerPack: 10,
    language: "English",
    edition: "Unlimited", // "1st Edition", "Unlimited"
    manufacturer: "The Pokemon Company",
    barcode: "820650809606",
    sku: "POK-SV03-BB"
  },
  
  pricing: {
    msrp: 143.99,
    marketPrice: null,
    buyPrice: null,
    tradeValue: null,
    manualPrice: null
  },
  
  condition: "sealed", // "sealed", "opened", "damaged_seal"
  quantity: 1,
  
  images: {
    box: "url",
    packArt: "url"
  },
  
  notes: "Pre-release box"
}
```

**UI Components Needed:**
1. Toggle to add "Sealed Product" vs "Card"
2. Product type selector
3. Set/release selector
4. Pack count and cards per pack inputs
5. Condition selector (sealed, opened, damaged)
6. Display sealed products separately from cards
7. Filter/sort by product type

**Pricing Strategy:**
- Manual MSRP entry
- Manual market price tracking
- Future: Scrape from TCGPlayer, eBay, Amazon

**Effort:** 4-5 days development + testing

---

#### Phase 2: Sealed Product Database (Requires Data Collection)
**NOT available today - no public API**

**Data Sources to Build From:**
1. **TCGPlayer** - Has sealed product listings
   - Manual data collection
   - Or scraping (terms of service check required)

2. **PokemonCenter.com** - Official MSRP
   - Manual tracking of releases

3. **Cardboard Connection** - Historical release data
   - https://www.cardboardconnection.com/

4. **Serebii.net** - Release dates and product info
   - https://www.serebii.net/

**Database Structure:**
```json
{
  "products": [
    {
      "id": "sv03-bb-en",
      "name": "Obsidian Flames Booster Box",
      "type": "booster_box",
      "set": "Obsidian Flames",
      "setCode": "SV03",
      "releaseDate": "2023-08-11",
      "msrp": 143.99,
      "packCount": 36,
      "cardsPerPack": 10,
      "language": "en",
      "images": {...}
    }
  ]
}
```

**Recommended:** Build internal database manually, update quarterly

**Effort:** 10-12 days for initial database + ongoing maintenance

---

#### Phase 3: Sealed Product Pricing Integration (Advanced)
**NOT available today - requires external integration**

**Option A: TCGPlayer Marketplace API**
- Sealed product pricing available
- Requires partnership/approval
- **API:** https://docs.tcgplayer.com/

**Option B: eBay API**
- Real sold prices for sealed products
- Good for vintage/hard-to-find items
- **API:** https://developer.ebay.com/

**Option C: Amazon Product Advertising API**
- Current retail prices
- Limited to in-stock items
- **API:** https://webservices.amazon.com/paapi5/documentation/

**Recommended:** eBay API for market prices, Amazon API for MSRP/retail

**Effort:** 7-10 days for integration + testing

---

## SUMMARY & RECOMMENDATIONS

### What Can Be Done TODAY (No New APIs)
1. ✅ **Graded Cards - Basic Tracking**
   - Add grading fields to database
   - Manual grade entry
   - Manual graded pricing
   - **Effort:** 2-3 days
   - **Value:** HIGH - users want this immediately

2. ✅ **Japanese Cards - Manual Entry**
   - Add language field
   - Japanese name input
   - Manual pricing
   - **Effort:** 2-3 days
   - **Value:** MEDIUM - niche but requested

3. ✅ **Sealed Products - Manual Entry**
   - New product type in database
   - Manual product entry
   - Manual pricing
   - **Effort:** 4-5 days
   - **Value:** HIGH - expands app beyond cards

**Total Immediate Effort:** 8-11 days for all three features (basic versions)

---

### What Requires External APIs (Later)
1. **Graded Card Pricing** - eBay API
2. **Japanese Card Database** - Pokemon TCG API + manual curation
3. **Japanese Market Pricing** - Partnerships or scraping
4. **Sealed Product Database** - Manual curation
5. **Sealed Product Pricing** - eBay/Amazon APIs

---

## RECOMMENDED IMPLEMENTATION ORDER

### Sprint 1 (Week 1-2): Graded Cards Basic
- Database schema updates
- UI for grading entry
- Graded card display/filtering
- Manual pricing

### Sprint 2 (Week 3-4): Sealed Products Basic
- New product type structure
- Sealed product entry UI
- Product display/filtering
- Manual pricing

### Sprint 3 (Week 5-6): Japanese Cards Basic
- Language support
- Japanese name fields
- Japanese card display
- Manual pricing

### Sprint 4+ (Future): External API Integration
- eBay API for graded pricing
- Pokemon TCG API for Japanese data
- Sealed product database build
- Advanced pricing integrations

---

## COST ESTIMATE

### Development Time
- **Phase 1 (All Basic Features):** 8-11 days
- **Phase 2 (API Integrations):** 20-30 days
- **Phase 3 (Advanced Features):** 15-20 days

### External Costs
- **eBay API:** Free tier → $50-200/month at scale
- **AI Grading (Ximilar):** $0.10-0.50 per image
- **Hosting/Storage:** +$10-50/month for image storage

### Total Timeline
- **MVP (All Basic Features):** 2-3 weeks
- **Full Implementation:** 2-3 months

---

## NEXT STEPS

1. **User Research:** Survey users on priority (graded vs Japanese vs sealed)
2. **Prototype:** Build graded cards first (highest demand)
3. **Test:** Beta test with power users
4. **Iterate:** Gather feedback, refine
5. **Scale:** Add API integrations based on usage

---

**Questions to Consider:**
- Do we want to focus on one feature first or all three simultaneously?
- What's the user demand for each feature?
- Budget for external APIs?
- Timeline constraints?

**Note:** This plan assumes the current CardMarket API will remain as the primary card data source, with new features built on top of our existing infrastructure.










