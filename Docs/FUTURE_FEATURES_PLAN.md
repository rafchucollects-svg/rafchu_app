# Future Features Implementation Plan
**Graded Cards • Japanese Cards • Sealed Products**

**Date:** October 12, 2025  
**Status:** Planning Phase

---

## 🔍 CURRENT API ASSESSMENT

### CardMarket API (Current)
**What we have TODAY:**
- ✅ English Pokémon cards
- ✅ Pricing (TCGPlayer & CardMarket)
- ✅ Card images & metadata
- ❌ NO graded card data
- ❌ NO Japanese card database
- ❌ NO sealed product data

**Verdict:** We'll need to build these features manually with optional API integrations later.

---

## 1️⃣ GRADED CARDS SUPPORT

### ✅ PHASE 1: Basic Tracking (Can Do TODAY)
**No external APIs needed - 2-3 days development**

**What to Add:**
```javascript
{
  isGraded: false,
  gradingInfo: {
    company: "PSA|BGS|CGC|ACE",
    grade: "10|9.5|9...",
    certNumber: "12345678",
    subgrades: { // BGS only
      centering: 9.5,
      corners: 10,
      edges: 9.5,
      surface: 10
    },
    gradedValue: 5000 // manual override
  }
}
```

**Features:**
- Toggle "This card is graded"
- Select grading company
- Enter grade & cert number
- Manual price override for graded
- Filter/sort by graded status
- Display PSA/BGS badge on cards

**Pricing:** Manual entry (required for now)

---

### 🔄 PHASE 2: Price Data (Needs External API)
**Options for graded pricing:**

1. **eBay API** (Recommended)
   - Real sold prices
   - Historical data
   - Cost: Free tier → $50-200/mo at scale
   - API: https://developer.ebay.com/

2. **130point.com API**
   - PSA card valuations
   - Population data
   - Cost: TBD

3. **Manual Tracking**
   - Spreadsheet of recent sales
   - Update weekly/monthly

**Effort:** 5-7 days

---

### 🤖 PHASE 3: AI Pre-Grading (Optional)
**Ximilar Card Grading API:**
- Upload card image
- AI predicts grade
- Cost: $0.10-0.50 per image
- API: https://www.ximilar.com/

**Use Case:** Help decide if worth professional grading

**Effort:** 3-4 days

---

## 2️⃣ JAPANESE CARDS SUPPORT

### ✅ PHASE 1: Manual Entry (Can Do TODAY)
**No external APIs needed - 2-3 days development**

**What to Add:**
```javascript
{
  language: "Japanese|English|German...",
  japaneseInfo: {
    japaneseName: "リザードン",
    japaneseSet: "第1弾拡張パック",
    releaseDate: "1996-10-20",
    isPromo: false
  }
}
```

**Features:**
- Language selector
- Japanese name input (with IME)
- Japanese set names
- Filter by language
- Proper Japanese character display

**Pricing:** Manual entry initially

---

### 🔄 PHASE 2: Database Integration
**Options for Japanese card data:**

1. **Pokemon TCG API** (pokemontcg.io)
   - Some Japanese sets available
   - Free, well-documented
   - Incomplete coverage
   - API: https://pokemontcg.io

2. **Manual Database**
   - Scrape from Bulbapedia, Serebii, Pokeguardian
   - One-time effort
   - Full control

3. **Community Contributions**
   - Let users add Japanese cards
   - Moderation required

**Effort:** 7-10 days

---

### 🌏 PHASE 3: Japanese Market Pricing
**Challenges:**
- Mercari Japan: No official API
- Yahoo! Auctions: No API
- CardRush/Hareruya: No public APIs

**Solutions:**
- Manual price tracking
- Partner with Japanese stores
- Web scraping (legal concerns)

**Effort:** 10-15 days

---

## 3️⃣ SEALED PRODUCTS SUPPORT

### ✅ PHASE 1: Manual Entry (Can Do TODAY)
**No external APIs needed - 4-5 days development**

**New Product Type:**
```javascript
{
  type: "sealed_product",
  productType: "booster_box|etb|collection_box|blister|tin",
  
  productInfo: {
    name: "Obsidian Flames Booster Box",
    set: "Obsidian Flames",
    packCount: 36,
    cardsPerPack: 10,
    msrp: 143.99,
    barcode: "820650809606"
  },
  
  condition: "sealed|opened|damaged",
  marketPrice: null, // manual
  quantity: 1
}
```

**Features:**
- Toggle "Sealed Product" vs "Card"
- Product type selector
- Pack count inputs
- Sealed condition tracking
- Separate inventory section
- Filter/sort by product type

**Pricing:** Manual MSRP & market price

---

### 🔄 PHASE 2: Product Database
**Build from:**
- TCGPlayer (manual data collection)
- PokemonCenter.com (official MSRP)
- Cardboard Connection (history)
- Serebii.net (release dates)

**Effort:** 10-12 days + quarterly updates

---

### 💰 PHASE 3: Pricing Integration
**Options:**

1. **TCGPlayer API**
   - Sealed product pricing
   - Requires partnership

2. **eBay API**
   - Real sold prices
   - Great for vintage

3. **Amazon Product API**
   - Current retail prices

**Effort:** 7-10 days

---

## 📊 SUMMARY

### What We Can Build TODAY
| Feature | Effort | Value | Priority |
|---------|--------|-------|----------|
| Graded Cards (Basic) | 2-3 days | HIGH | 1 |
| Sealed Products (Basic) | 4-5 days | HIGH | 2 |
| Japanese Cards (Basic) | 2-3 days | MEDIUM | 3 |

**Total:** 8-11 days for ALL THREE basic versions

### What Needs External APIs
- Graded pricing: eBay API
- Japanese database: Pokemon TCG API + manual
- Japanese pricing: Partnerships
- Sealed database: Manual curation
- Sealed pricing: eBay/Amazon APIs

---

## 🎯 RECOMMENDED TIMELINE

### Sprint 1 (Week 1-2): Graded Cards
- Database schema
- UI for grade entry
- Display badges
- Manual pricing
- **Deploy & Test**

### Sprint 2 (Week 3-4): Sealed Products  
- New product type
- Entry UI
- Product filtering
- Manual pricing
- **Deploy & Test**

### Sprint 3 (Week 5-6): Japanese Cards
- Language support
- Japanese inputs
- Display updates
- Manual pricing
- **Deploy & Test**

### Future Sprints: API Integrations
- eBay API (graded pricing)
- Pokemon TCG API (Japanese data)
- Database expansions
- Advanced features

---

## 💰 COST ESTIMATE

### Development
- Phase 1 (All Basic): 8-11 days
- Phase 2 (APIs): 20-30 days  
- Phase 3 (Advanced): 15-20 days

### External Services
- eBay API: Free → $50-200/mo
- AI Grading: $0.10-0.50 per image
- Extra Storage: +$10-50/mo

### Timeline
- **MVP (Basic All):** 2-3 weeks
- **Full Features:** 2-3 months

---

## ✅ DECISION POINTS

**Before Starting:**
1. Survey users - which feature first?
2. Set budget for external APIs
3. Decide: all three or focus one?
4. Beta test group ready?

**Success Metrics:**
- Adoption rate of new features
- User feedback scores
- Data entry quality
- Time to add items

---

## 📝 NOTES

- All basic versions require NO external APIs
- Can start immediately with existing infrastructure
- External APIs = nice-to-have, not required
- Focus on user value first, automation later
- Manual entry is perfectly viable short-term

**Bottom Line:** These features are 100% doable TODAY with manual data entry. API integrations can come later based on user demand and budget.

---

**Next Steps:**
1. Review this plan
2. Prioritize features
3. Allocate development time
4. Create user stories
5. Start with Sprint 1 (Graded Cards)










