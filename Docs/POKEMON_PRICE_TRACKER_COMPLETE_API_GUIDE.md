# Pokemon Price Tracker API - COMPLETE GUIDE

**Your API Key:** `pokeprice_pro_53bd47a27e9398b64d62eb62228447390605bed10a7c7894`  
**Plan:** Pro  
**Base URL:** `https://www.pokemonpricetracker.com/api/v2`

---

## 🎯 COMPLETE FEATURE MATRIX

| Feature | Available | Quality | Notes |
|---------|-----------|---------|-------|
| **English Cards** | ✅ YES | ⭐⭐⭐⭐⭐ | 23,000+ cards, full pricing |
| **PSA Graded Pricing** | ✅ YES | ⭐⭐⭐⭐ | PSA 8/9/10 with `?includeEbay=true` |
| **Historical Data (Cards)** | ✅ YES | ⭐⭐⭐⭐⭐ | 90 days with `?includeHistory=true` |
| **Sealed Products** | ✅ YES | ⭐⭐⭐⭐ | Booster boxes, ETBs, blisters |
| **Sealed Historical Data** | ✅ YES | ⭐⭐⭐⭐ | `?includeHistory=true` |
| **Bulk Fetching** | ✅ YES | ⭐⭐⭐⭐⭐ | `fetchAllInSet=true` (efficient) |
| **Title Parsing** | ✅ YES | ⭐⭐⭐⭐ | Extract card info from any text |
| **Set Search** | ✅ YES | ⭐⭐⭐⭐⭐ | Fast, accurate filtering |
| **JP Cards (International)** | ✅ YES | ⭐⭐⭐ | Cards that sell on eBay.com |
| **JP Cards (Japan-Only)** | ❌ NO | - | Not tracked |
| **BGS/CGC Grading** | ❓ UNKNOWN | - | Only PSA confirmed |

---

## 📚 ALL AVAILABLE ENDPOINTS

### 1. **GET /api/v2/cards** - Search & Fetch Cards

#### Basic Search
```bash
GET /api/v2/cards?search=charizard&limit=10
```

#### Filter by Set Name
```bash
GET /api/v2/cards?set=celebrations&limit=10
```

#### Filter by Set ID
```bash
GET /api/v2/cards?setId=68af37165bce97006df9f23c&limit=10
```

#### Get Specific Card by TCGPlayer ID
```bash
GET /api/v2/cards?tcgPlayerId=197651
```

#### Bulk Fetch Entire Set ⭐ **EFFICIENT!**
```bash
GET /api/v2/cards?set=celebrations&fetchAllInSet=true
```
**Benefits:**
- Returns ALL cards in set (26 cards in example)
- Uses only 1 API call per card (not per request)
- More efficient than pagination
- Shows `fetchedAllCards: true` in metadata

**Metadata:**
```json
{
  "fetchAllInSet": true,
  "fetchedAllCards": true,
  "apiCallsConsumed": {
    "total": 26,
    "breakdown": {
      "cards": 26,
      "history": 0,
      "ebay": 0
    },
    "costPerCard": 1
  }
}
```

#### Include Historical Data
```bash
GET /api/v2/cards?search=charizard&includeHistory=true
```

#### Include Graded/PSA Data ⭐ **IMPORTANT!**
```bash
GET /api/v2/cards?search=charizard&includeEbay=true
```
**Returns:**
- PSA 8/9/10 pricing
- Sales velocity
- Market trends
- 7-day rolling averages
- Confidence levels

---

### 2. **GET /api/v2/sets** - List & Search Sets

#### List All Sets
```bash
GET /api/v2/sets
```

#### Search Sets
```bash
GET /api/v2/sets?search=scarlet
```
**Returns:** 4 sets (Scarlet & Violet 151, Base Set, Promo Cards, Energies)

**Response:**
```json
{
  "data": [
    {
      "id": "68af47c7...",
      "name": "Scarlet & Violet Base Set",
      "series": "Scarlet & Violet",
      "cardCount": 258,
      "releaseDate": "2025-03-31",
      "tcgPlayerId": "sv-base-set"
    }
  ]
}
```

---

### 3. **GET /api/v2/sealed-products** - Sealed Product Pricing

#### Search Sealed Products
```bash
GET /api/v2/sealed-products?search=Surging+Sparks&limit=5
```

**Returns:**
- Booster box cases ($1,186.91)
- Booster pack bundles ($31.06)
- Single booster packs ($7.79)
- Single pack blisters ($12.47-$14.53)
- Elite Trainer Boxes
- Collection boxes

#### Filter by Product Type
```bash
GET /api/v2/sealed-products?search=Elite+Trainer+Box&limit=10
```

#### Include Price History ⭐ **NEW!**
```bash
GET /api/v2/sealed-products?search=Elite+Trainer+Box&includeHistory=true
```

**Response with History:**
```json
{
  "name": "XY Roaring Skies Elite Trainer Box",
  "unopenedPrice": 1790.13,
  "priceHistory": [
    {
      "date": "2025-09-15",
      "unopenedPrice": 1973.74
    },
    {
      "date": "2025-09-22",
      "unopenedPrice": 1973.74
    },
    {
      "date": "2025-09-29",
      "unopenedPrice": 1973.74
    },
    {
      "date": "2025-10-06",
      "unopenedPrice": 1973.74
    }
  ]
}
```

---

### 4. **POST /api/v2/parse-title** - Smart Title Parser

Parse messy card titles from eBay, spreadsheets, or user input.

```bash
POST /api/v2/parse-title
Content-Type: application/json

{
  "title": "2022 POKEMON JPN SWORD & SHIELD DARK PHANTASMA #073 FULL ART/PIKACHU PSA 10"
}
```

**Response:**
```json
{
  "parsed": {
    "confidence": 0.89,
    "year": 2022,
    "cardNumber": "073",
    "psaGrade": 10,
    "language": "JPN",
    "setName": "Sword & Shield",
    "variant": "Full Art",
    "cardName": "Pikachu",
    "fieldConfidence": {
      "year": 1.0,
      "cardNumber": 0.9,
      "grade": 1.0,
      "language": 0.95,
      "setName": 0.8,
      "variant": 0.85,
      "cardName": 0.75
    }
  },
  "matches": [
    {
      "name": "Pikachu - 227/S-P",
      "setName": "Sword & Shield Promo Cards",
      "matchScore": 0.7,
      "prices": {
        "market": 1125.39
      }
    }
  ]
}
```

**Use Cases:**
- Import collections from eBay listings
- Parse CSV/Excel files
- Auto-complete user input
- Detect language (EN vs JP)
- Extract PSA grades
- Find closest database matches

---

## 🎨 QUERY PARAMETERS REFERENCE

### Common Parameters (All Endpoints)

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `limit` | number | Max results (default: 10) | `limit=50` |
| `offset` | number | Pagination offset | `offset=20` |
| `search` | string | Text search | `search=charizard` |

### Card-Specific Parameters

| Parameter | Type | Description | Cost |
|-----------|------|-------------|------|
| `set` | string | Filter by set name | Free |
| `setId` | string | Filter by set ID | Free |
| `tcgPlayerId` | string | Get specific card | Free |
| `includeHistory` | boolean | Add price history (90 days) | +1 per card |
| `includeEbay` | boolean | Add PSA/graded data | +1 per card |
| `fetchAllInSet` | boolean | Get entire set efficiently | 1 per card |

### Sealed Product Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Product name search |
| `set` | string | Filter by set |
| `productType` | string | e.g., "Elite Trainer Box" |
| `includeHistory` | boolean | Add price history |
| `minPrice` | number | Min price filter |
| `maxPrice` | number | Max price filter |

### Set Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Set name search |

---

## 💰 API CREDIT COSTS

| Operation | Credits |
|-----------|---------|
| **Basic card fetch** | 1 per card |
| **+ includeHistory** | +1 per card (total: 2) |
| **+ includeEbay** | +1 per card (total: 2 or 3) |
| **Sealed product** | 1 per product |
| **+ includeHistory** | +1 per product |
| **Title parsing** | 3 per parse |
| **fetchAllInSet** | 1 per card in set |

**Example: Fetch 10 cards with history + graded data**
- 10 cards × 3 credits = 30 credits

**Your Daily Limit:** ~10,000 calls/day (Pro tier)

---

## 🚀 POWERFUL FEATURES & INSPIRATIONS

### 1. **Bulk Set Importer** 💡
Use `fetchAllInSet=true` to import entire sets efficiently:
```javascript
// Import entire Celebrations set (26 cards)
const response = await fetch(
  'https://www.pokemonpricetracker.com/api/v2/cards?set=celebrations&fetchAllInSet=true&includeHistory=true',
  { headers: { 'Authorization': 'Bearer YOUR_KEY' } }
);
// Cost: 26 cards × 2 credits = 52 credits
// Returns: All cards with full pricing + 90 days history
```

**UI Inspiration:**
- "Import Entire Set" button in your app
- Shows progress bar as cards load
- Displays total cost before import

---

### 2. **Smart eBay Import** 💡
Use `/parse-title` to import from eBay or spreadsheets:
```javascript
// User pastes eBay listing
const title = "2022 POKEMON JPN S&S #073 PIKACHU PSA 10";

// Your app parses it
const parsed = await parseTitle(title);

// Show confidence to user
console.log(`${parsed.confidence * 100}% match`);
console.log(`Found: ${parsed.cardName} from ${parsed.setName}`);
console.log(`Grade: PSA ${parsed.psaGrade}`);
console.log(`Closest match: $${parsed.matches[0].prices.market}`);
```

**UI Inspiration:**
- "Import from eBay" feature
- Paste any card title, app auto-detects
- Shows confidence score
- Suggests closest matches

---

### 3. **Sealed Product Investment Tracker** 💡
Track sealed product prices over time:
```javascript
// Get ETB with history
const etb = await fetch(
  'https://www.pokemonpricetracker.com/api/v2/sealed-products?search=Elite+Trainer+Box&includeHistory=true'
);

// Show price chart
// XY Roaring Skies ETB: $1,790 (down from $1,974)
// Trend: -9.3% over 30 days
```

**UI Inspiration:**
- "Sealed Products" investment dashboard
- Price charts for booster boxes
- ROI calculator (buy price vs current)
- Alerts when prices drop/rise

---

### 4. **Graded Card Portfolio** 💡
Track PSA/graded cards separately:
```javascript
// Get card with graded pricing
const card = await fetchCard({
  search: 'charizard gx',
  includeEbay: true
});

// Display graded options
console.log('Raw: $5.03');
console.log('PSA 8: $20.33 (rising)');
console.log('PSA 9: $214 (rising)');
console.log('PSA 10: $73.43 (falling)');
console.log('Sales velocity: 2.57/day');
```

**UI Inspiration:**
- Separate "Graded Cards" section
- Show raw vs graded value comparison
- Market trend indicators (🔺 rising, 🔻 falling)
- Sales velocity heatmap
- "Should I grade this?" calculator

---

### 5. **International Card Support** 💡
Support JP promo cards that trade internationally:
```javascript
// Search Japanese promo
const jpCard = await fetchCard({
  search: '227/S-P',
  includeEbay: true
});

// Returns: Pikachu 227/S-P
// Market: $1,125.39
// PSA 10: $1,615 (low confidence)
```

**UI Inspiration:**
- Mark JP cards with 🇯🇵 flag
- Show confidence level for pricing
- "Low confidence" warning for JP exclusives
- Allow manual price override

---

### 6. **Set Completion Tracker** 💡
Use `fetchAllInSet` to show completion progress:
```javascript
// Get all cards in set
const set = await fetchAllInSet('celebrations');
// 26 cards total

// Compare with user's collection
const userCards = getUserCollection('celebrations');
// User has 18 cards

// Show progress: 18/26 (69% complete)
// Show missing cards with prices
```

**UI Inspiration:**
- Set completion checklist
- Visual progress bar
- "Complete this set" button
- Show total cost to complete
- Sort missing cards by price

---

### 7. **Price Alert System** 💡
Use historical data to trigger alerts:
```javascript
// Track card price history
const history = card.priceHistory.conditions["Near Mint"].history;

// Detect 10% drop
if (currentPrice < (avgPrice * 0.9)) {
  sendAlert('Charizard GX dropped 10%! Now $5.03');
}
```

**UI Inspiration:**
- "Set Price Alert" button on cards
- Alert when card reaches target price
- Alert on X% price change
- Daily/weekly price digest email

---

## 📊 EXAMPLE WORKFLOWS

### Workflow 1: Add Card to Collection
```bash
# 1. User types "charizard hidden"
GET /api/v2/cards?search=charizard+hidden&limit=5

# 2. User selects "Charizard GX"
GET /api/v2/cards?tcgPlayerId=197651&includeHistory=true&includeEbay=true

# 3. Show full details:
# - Current price: $5.03
# - 30-day history chart
# - PSA 10: $73.43
# - Sales trend: falling
```

### Workflow 2: Import eBay Purchase
```bash
# 1. User pastes eBay title
POST /api/v2/parse-title
{
  "title": "Pokemon Charizard GX Hidden Fates #9 PSA 10"
}

# 2. Get parsed data:
# - Card: Charizard GX
# - Set: Hidden Fates
# - Grade: PSA 10
# - Confidence: 95%

# 3. Fetch full card
GET /api/v2/cards?tcgPlayerId=197651&includeEbay=true

# 4. Auto-populate:
# - Grade: PSA 10
# - Purchase price: User enters
# - Current value: $73.43
# - ROI: Calculate
```

### Workflow 3: Complete a Set
```bash
# 1. User clicks "Complete Celebrations Set"
GET /api/v2/cards?set=celebrations&fetchAllInSet=true

# 2. Get user's collection
# Compare with full set (26 cards)

# 3. Show missing cards:
# - Mew (Secret): $45.20
# - Professor's Research (FA): $8.50
# - Total to complete: $53.70
```

### Workflow 4: Track Sealed Investment
```bash
# 1. User adds "Surging Sparks Booster Box"
GET /api/v2/sealed-products?search=Surging+Sparks+Booster

# 2. User logs purchase: $120 (10/01/2025)

# 3. Track value over time
GET /api/v2/sealed-products?search=Surging+Sparks+Booster&includeHistory=true

# 4. Show ROI:
# - Bought: $120
# - Current: $125
# - ROI: +$5 (+4.2%)
# - Days held: 12
```

---

## 🎯 RECOMMENDED IMPLEMENTATION PRIORITY

### Phase 1: Core Features (Week 1)
1. ✅ Card search & add to collection
2. ✅ Current pricing display
3. ✅ Basic collection management
4. ✅ Set filtering

### Phase 2: Advanced Pricing (Week 2)
1. ✅ Historical price charts (`includeHistory=true`)
2. ✅ Graded card tracking (`includeEbay=true`)
3. ✅ PSA 8/9/10 pricing display
4. ✅ Market trend indicators

### Phase 3: Bulk Operations (Week 3)
1. ✅ Set completion tracker (`fetchAllInSet=true`)
2. ✅ Bulk import from CSV
3. ✅ eBay title parser (`/parse-title`)
4. ✅ Collection export

### Phase 4: Sealed Products (Week 4)
1. ✅ Sealed product tracking
2. ✅ Sealed price history
3. ✅ Investment ROI calculator
4. ✅ Booster box alerts

### Phase 5: Advanced Features (Later)
1. ⏭️ Price alerts & notifications
2. ⏭️ Portfolio analytics
3. ⏭️ Grading ROI calculator
4. ⏭️ Trade value comparisons

---

## 🎉 BOTTOM LINE

**You have access to an EXTREMELY powerful API!**

**What you can build RIGHT NOW:**
- ✅ Complete collection manager
- ✅ Graded card portfolio tracker (PSA 8/9/10)
- ✅ Sealed product investment tracker
- ✅ Price history & trend analysis
- ✅ Smart import from eBay/spreadsheets
- ✅ Set completion tracking
- ✅ Japanese promo card support (partial)

**What you need additional APIs for:**
- ❌ Japan-exclusive cards (need Yahoo Japan or Mercari)
- ❓ BGS/CGC grading (might be there, need to test more)

**Estimated coverage of your feature goals:**
- English cards: 100% ✅
- Graded cards: 95% ✅ (PSA confirmed, BGS/CGC unknown)
- Sealed products: 100% ✅
- Japanese cards: 60% ⚠️ (international promos yes, JP exclusives no)

---

**Ready to start building?** 🚀

You have everything you need for a world-class Pokemon card tracking app!










