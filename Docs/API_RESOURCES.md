# API Resources & Sign-Up Guide
**For Graded Cards, Japanese Cards & Sealed Products**

**Last Updated:** October 13, 2025

---

## 🎯 RECOMMENDED APIS (Priority Order)

### 1. **Pokemon Price Tracker - Graded Pokemon Card API** ⭐ TOP PICK
**Best for: Graded card pricing & population data**

- **What it provides:**
  - PSA, BGS, CGC graded card prices
  - Population reports
  - Grade comparisons
  - Historical pricing data
  - Real-time market data

- **Sign up:** https://www.pokemonpricetracker.com/graded-pokemon-card-api
- **Pricing:** Contact for pricing (likely paid tiers)
- **Documentation:** Available on sign-up
- **Ease:** HIGH - Specifically built for Pokemon

**Why this one:** Purpose-built for Pokemon graded cards, exactly what we need!

---

### 2. **Pokemon Price Tracker - Pokemon Trading Card API**
**Best for: General Pokemon card data + prices**

- **What it provides:**
  - 23,000+ Pokemon cards
  - Real-time pricing
  - PSA grading data
  - Bulk operations
  - Japanese card support (likely)

- **Sign up:** https://www.pokemonpricetracker.com/pokemon-trading-card-api
- **Pricing:** Contact for pricing
- **Documentation:** Available on sign-up
- **Ease:** HIGH - Pokemon-focused

**Why this one:** Comprehensive Pokemon coverage, includes Japanese support

---

### 3. **TCGAPIs** ⭐ EASIEST
**Best for: No API key required! Multiple marketplaces**

- **What it provides:**
  - 40+ trading card games
  - TCGPlayer, Cardmarket, Cardtrader data
  - Pricing & sales history
  - **NO API KEYS REQUIRED**

- **Sign up:** https://tcgapis.com
- **Pricing:** FREE tier available!
- **Documentation:** https://tcgapis.com/docs
- **Ease:** VERY HIGH - No authentication needed

**Why this one:** Easiest to start with, no approval process, free tier!

---

### 4. **JustTCG**
**Best for: Condition-based pricing**

- **What it provides:**
  - Magic, Pokemon, Yu-Gi-Oh!
  - Condition-based pricing (NM, LP, etc.)
  - Bulk operations
  - Real-time pricing

- **Sign up:** https://justtcg.com
- **Pricing:** Starts at ~$29/mo (estimate)
- **Documentation:** Available on sign-up
- **Ease:** MEDIUM - Developer-friendly

**Why this one:** Great for condition-specific pricing we already use

---

### 5. **Card Market API** (Different from our current CardMarket)
**Best for: Global pricing, graded insights**

- **What it provides:**
  - Real-time global pricing
  - Graded card insights
  - Historical trends
  - Pokemon, Lorcana, Star Wars

- **Sign up:** https://cardmarket-api.com
- **Pricing:** Contact for pricing
- **Documentation:** Available on sign-up
- **Ease:** MEDIUM

**Why this one:** Global data, historical trends useful for analytics

---

## 🤖 AI-POWERED APIS

### 6. **Ximilar - Card Grading API** ⭐ FOR AI GRADING
**Best for: AI-powered card grading**

- **What it provides:**
  - AI card grading (centering, corners, edges, surface)
  - Card recognition from photos
  - Slab label reading (for graded cards)
  - Condition assessment
  - Automated grading

- **Sign up:** https://www.ximilar.com
- **Documentation:** https://docs.ximilar.com/collectibles/card-grading
- **Pricing:** ~$0.10-0.50 per image analysis
- **Ease:** MEDIUM - Requires image upload flow

**Why this one:** Only true AI grading solution, helps users decide if worth grading

---

### 7. **Ximilar - Collectibles Recognition API**
**Best for: Card identification from photos**

- **What it provides:**
  - Card identification by photo
  - Extracts: name, year, set, rarity
  - Works with Japanese cards
  - Slab label extraction

- **Sign up:** https://www.ximilar.com
- **Documentation:** https://docs.ximilar.com/collectibles/recognition
- **Pricing:** ~$0.10-0.50 per image
- **Ease:** MEDIUM

**Why this one:** Could replace manual card entry - users just take photos!

---

## 🌐 GENERAL MARKETPLACE APIS

### 8. **eBay Developers Program**
**Best for: Real sold prices (graded & sealed)**

- **What it provides:**
  - Real sold listing prices
  - Historical auction data
  - Completed listings
  - Great for graded & sealed products

- **Sign up:** https://developer.ebay.com
- **Get Started:** https://developer.ebay.com/api-docs/static/gs_landing.html
- **Pricing:** FREE tier → $50-200/mo at scale
- **Ease:** MEDIUM - OAuth required

**Steps to get eBay API:**
1. Go to https://developer.ebay.com
2. Click "Register"
3. Create eBay Developer Account
4. Create an Application
5. Get Production API Keys
6. Request higher rate limits (if needed)

**Why this one:** Best for real market prices, essential for graded/sealed

---

### 9. **TCGPlayer Partner Program**
**Best for: Official TCGPlayer pricing**

- **What it provides:**
  - Official TCGPlayer prices
  - Market prices
  - Sealed product pricing
  - Buylist prices

- **Sign up:** https://partner.tcgplayer.com
- **Documentation:** https://docs.tcgplayer.com
- **Pricing:** Requires approval, revenue share model
- **Ease:** HARD - Requires partnership approval

**Steps to get TCGPlayer API:**
1. Apply at https://partner.tcgplayer.com
2. Wait for approval (can take weeks)
3. Requires business information
4. Must demonstrate use case

**Why this one:** Official TCGPlayer data, but hardest to get approved

---

### 10. **Trading Card API** (Beta)
**Best for: Comprehensive TCG data**

- **What it provides:**
  - Multiple TCG games
  - Graded cards
  - Sealed products
  - Market prices

- **Sign up:** https://tradingcardapi.com
- **Status:** BETA - Early access
- **Pricing:** TBD (beta pricing)
- **Ease:** HIGH - Early access available

**Why this one:** Comprehensive but in beta, data may change

---

## 📱 BONUS: POKEMONTCG.IO

### Pokemon TCG API (Free!)
**Best for: Free Pokemon card data**

- **What it provides:**
  - Free Pokemon card database
  - Some Japanese sets
  - Card images
  - Set information
  - **100% FREE**

- **Sign up:** https://pokemontcg.io
- **Documentation:** https://docs.pokemontcg.io
- **API Key:** Get free key at https://dev.pokemontcg.io
- **Pricing:** FREE (rate limited)
- **Ease:** VERY HIGH

**Why this one:** Free baseline Pokemon data, good for Japanese card database

---

## 🎯 MY RECOMMENDATIONS BY USE CASE

### For GRADED CARDS:
1. **Pokemon Price Tracker Graded API** (best Pokemon-specific)
2. **eBay API** (best for market prices)
3. **Ximilar AI Grading** (optional: AI pre-grading)

### For JAPANESE CARDS:
1. **PokemonTCG.io** (free baseline data)
2. **Pokemon Price Tracker Trading Card API** (comprehensive)
3. **TCGAPIs** (no API key required)

### For SEALED PRODUCTS:
1. **eBay API** (real market prices)
2. **Card Market API** (global data)
3. **Manual Database** (most reliable for MSRP)

### For EASIEST START:
1. **TCGAPIs** (no API key, free tier)
2. **PokemonTCG.io** (free, easy)
3. **Pokemon Price Tracker APIs** (Pokemon-focused)

---

## 💰 COST BREAKDOWN

| API | Free Tier | Paid Tier | Est. Monthly Cost |
|-----|-----------|-----------|-------------------|
| TCGAPIs | ✅ Yes | ✅ Yes | $0-50 |
| PokemonTCG.io | ✅ Yes | ❌ No | $0 |
| eBay | ✅ Limited | ✅ Yes | $0-200 |
| Pokemon Price Tracker | ❌ No | ✅ Yes | TBD (Contact) |
| JustTCG | ❌ No | ✅ Yes | ~$29+ |
| Ximilar | ❌ No | ✅ Pay-per-use | $0.10-0.50/image |
| TCGPlayer | ❌ No | ✅ Yes | Partnership req'd |

---

## 🚀 RECOMMENDED IMPLEMENTATION PATH

### Phase 1: Start with Free APIs
1. **TCGAPIs** - No barrier to entry
2. **PokemonTCG.io** - Free Pokemon data
3. Build basic features with manual pricing

### Phase 2: Add Pricing APIs
1. **eBay API** - Register and get keys
2. **Pokemon Price Tracker** - Contact for graded data
3. Integrate real pricing data

### Phase 3: Advanced Features
1. **Ximilar** - Add AI grading (optional)
2. **TCGPlayer** - Apply for partnership (if approved)
3. Expand to more data sources

---

## 📞 CONTACT INFORMATION

### For Business Inquiries:
- **Pokemon Price Tracker:** Contact form on website
- **TCGAPIs:** info@tcgapis.com
- **JustTCG:** support@justtcg.com
- **Ximilar:** hello@ximilar.com

### For Developer Support:
- **eBay:** https://developer.ebay.com/support
- **PokemonTCG.io:** https://github.com/PokemonTCG/pokemon-tcg-api-docs
- **TCGPlayer:** developer@tcgplayer.com

---

## 📝 NEXT STEPS

1. **Immediate (This Week):**
   - Sign up for TCGAPIs (free, no approval)
   - Get PokemonTCG.io API key (free, instant)
   - Test both APIs with your current data

2. **Short-term (This Month):**
   - Register for eBay Developer account
   - Request access from Pokemon Price Tracker
   - Evaluate pricing tiers

3. **Long-term (Next Quarter):**
   - Integrate eBay API for pricing
   - Add Ximilar if AI features wanted
   - Apply for TCGPlayer partnership

---

## 🔗 QUICK LINKS

**Sign Up Today (No Approval):**
- TCGAPIs: https://tcgapis.com
- PokemonTCG.io: https://dev.pokemontcg.io
- Ximilar Trial: https://www.ximilar.com

**Apply & Wait (Approval Required):**
- eBay Developer: https://developer.ebay.com
- TCGPlayer Partner: https://partner.tcgplayer.com

**Contact for Access:**
- Pokemon Price Tracker: https://www.pokemonpricetracker.com/graded-pokemon-card-api
- JustTCG: https://justtcg.com
- Card Market API: https://cardmarket-api.com

---

**Pro Tip:** Start with the free APIs (TCGAPIs + PokemonTCG.io) to build your features, then add paid APIs once you validate user demand and can justify the cost!

**Questions?** Contact the API providers directly - most have responsive support teams for developer inquiries.










