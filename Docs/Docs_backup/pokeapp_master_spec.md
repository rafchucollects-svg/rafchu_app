# PokéValue (Working Title) Master Specification & Roadmap

## Vision
This app — soon to be renamed — is an all-in-one platform for Pokémon TCG enthusiasts. It empowers **vendors** and **collectors**, and eventually connects them through a seamless, community-driven **marketplace**.  

The initial focus is a **Vendor Toolkit**, evolving into a **Collector Companion**, and finally merging into a **Marketplace Ecosystem** that connects players, collectors, and vendors. The app’s mission: make Pokémon card collecting, trading, and selling simple, profitable, and enjoyable.

---

## Core Objectives
1. **Vendor Empowerment:** Streamline pricing, inventory, and trade evaluation for vendors at shows and online.
2. **Collector Engagement:** Provide a beautiful, data-rich collection tracker with real-time pricing and sharing tools.
3. **Marketplace Connection:** Connect collectors and vendors through listings, wishlists, and direct messaging — no in-app transactions, but strong facilitation.
4. **Monetization:** Dual model — ad-supported/free for collectors, subscription-based for vendors, all powered by **Stripe** (and localized payment gateways like **Paytrail** or **Klarna** for Finland/EU compliance).
5. **Cross-Platform:** Mobile-first (iOS/Android via React Native) with responsive web app support.

---

## Architecture Overview
- **Frontend:** React Native + Expo (mobile), React/Next.js (web)
- **Backend:** Firebase (Firestore, Auth, Storage, Cloud Functions)
- **External APIs:**
  - Pokémon TCG API (English cards)
  - CardMarket API (pricing for EU collectors)
  - TCGPlayer (pricing for US)
  - Future: PSA API or web-scraping integration (graded card data)
  - Future: Japanese card data source (to be confirmed)
- **Payments:** Stripe (subscription + ad-free upgrades), Paytrail/Klarna for EU compliance
- **Hosting:** Firebase Hosting

---

## Feature Phases

### **Phase 1: Vendor Toolkit (MVP)**
**Goal:** Empower vendors to price, track, and trade efficiently at shows.

**Features:**
- Pokémon TCG API integration (English, ungraded cards)
- Real-time pricing aggregation (CardMarket / TCGPlayer)
- Trade calculator (vendor-favorable multiplier %)
- Buy offer calculator (below-market cash offers)
- Inventory management (add/edit/tag/sort cards)
- Share function (generate listings with custom sales price)
- Offline mode (for show usage)
- Firebase Auth (Google/email login)
- Firestore data storage

**Stretch:**
- QR/Barcode scanning for quick entry
- CSV import/export
- Basic sales analytics

---

### **Phase 2: Collector Companion**
**Goal:** Give collectors tools to track and show off their collections.

**Features:**
- Add cards via search or scan
- Real-time CardMarket value tracking
- Manage wishlists
- View collection insights (value, rarity, edition)
- Share collection or individual cards
- Cloud sync (Firestore)

**Monetization:**
- Free with ads
- Ad-free version via **Stripe** (local currency via EU-compliant processor)

**Stretch:**
- Portfolio visuals (charts/graphs)
- Card condition tracking (graded cards in future phases)
- PSA database integration (Phase 4)

---

### **Phase 3: Marketplace Foundation**
**Goal:** Connect collectors and vendors in-app.

**Features:**
- Vendor profiles with verification
- Collector–Vendor messaging
- Wishlist-match system (match collectors to vendors with most overlap)
- Vendor visibility controls
- Listing system for vendors (no checkout)

**New Addition:**
- **Ratings & Reviews System** — After confirmed communication suggesting a successful transaction, users can leave ratings and feedback on vendors/buyers. Ratings improve vendor visibility and trust.

**Stretch:**
- Smart vendor recommendations
- Message templates for inquiries
- Search filters and verified-badge program

**Note:**
PokéValue (final name TBD) **does not process payments or shipments** — it only facilitates connection and discovery.

---

### **Phase 4: Vendor Pro & Market Insights**
**Goal:** Give vendors advanced analytics and visibility.

**Features:**
- Market trends dashboard (most wishlisted, most sold, average trade margins)
- Price optimization insights
- Demand heatmaps (by region or event)
- Featured vendor slots (paid promotion)

**Monetization:**
- Monthly/annual subscription via Stripe
- Optional ad/feature packages for visibility

---

### **Phase 5: Expansion & Community Layer**
**Goal:** Build social and global reach.

**Features:**
- In-app chat and groups
- Verified collector/vendor badges
- Event calendar (shows, tournaments)
- Collection challenges and badges

**Stretch:**
- Japanese card support
- PSA/graded card integration (track population and price)
- Gamified rewards and leaderboards

---

## Design & UX Guidelines
- **Aesthetic:** Pokédex-inspired interface with modern design cues.
- **Feedback:** Haptic vibration and shine animations when completing actions.
- **Accessibility:** High-contrast and font-size options.
- **Speed:** Instant responses, optimized offline caching.

---

## Tech Stack Summary
| Layer | Technology |
|-------|-------------|
| Frontend | React Native, Expo, React/Next.js |
| Backend | Firebase (Auth, Firestore, Cloud Functions, Storage) |
| APIs | Pokémon TCG API, CardMarket, TCGPlayer, PSA (future) |
| Payments | Stripe, Paytrail, Klarna |
| Hosting | Firebase Hosting |
| Analytics | Firebase Analytics, Amplitude |

---

## Monetization Model
| User Type | Tier | Description |
|------------|------|--------------|
| Collector | Free | Ad-supported |
| Collector | Premium | Ad-free via Stripe (EU local processor) |
| Vendor | Basic | Toolkit with limited inventory |
| Vendor | Pro | Insights, trends, featured listings |

---

## Future Considerations
- **Regional Expansion:** Add Japanese/US pricing and language support.
- **Web Dashboard:** Vendor inventory management via browser.
- **AI Enhancements:** Smart pricing recommendations and image-based card recognition.
- **Community Partnerships:** Official show listings and sponsorship opportunities.

---

## Roadmap Summary
| Phase | Focus | Core Deliverables |
|--------|--------|-------------------|
| 1 | Vendor Toolkit | MVP app, trade calculator, Firebase sync |
| 2 | Collector Companion | Collection tracking, wishlists, ad-free via Stripe |
| 3 | Marketplace | Messaging, ratings, wishlist match |
| 4 | Vendor Pro | Market insights, paid visibility |
| 5 | Expansion | Graded/Japanese cards, events, community layer |

---

## Name & Branding Ideas
We want a name that conveys **trust**, **passion**, and **value** within the Pokémon TCG world — but also stands apart from generic names. Here are a few ideas:

| Theme | Name Idea | Concept |
|--------|------------|----------|
| Marketplace/Community | **Cardlink** | Linking collectors and vendors |
| Data & Insights | **DexValue** | Combines Pokédex + Value (feels analytical yet friendly) |
| Vendor-Centric | **TradeDex** | Trade-oriented, Pokémon-inspired |
| Collector-Focused | **Vaultmon** | Your personal Pokémon vault |
| Global Appeal | **MonDeck** | Short, sleek, implies Pokémon and decks |
| Premium | **CardSummit** | Positioning as the pinnacle of the hobby |

**Logo Concepts:**
- Minimalist Poké Ball with a bar graph rising from it (symbolizing data + collecting)
- Stylized handshake inside a Poké Ball (symbolizing trust + trade)
- A circular logo with a half Poké Ball, half coin — bridging passion and value
- A vault or safe door shape with card silhouettes inside (for Vaultmon/TradeDex)

---

## The Promise
To create the **most trusted, efficient, and enjoyable Pokémon TCG app** for collectors and vendors alike — a bridge between passion and profit, built with integrity, beauty, and community at its heart.

