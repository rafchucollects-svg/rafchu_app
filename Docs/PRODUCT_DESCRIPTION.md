# Rafchu – Pokémon TCG Marketplace & Collection Platform

## Product Description (for AI-assisted rebuild)

---

## 1. What Is Rafchu?

Rafchu is a web application for the Pokémon Trading Card Game (TCG) community. It serves two user personas — **Collectors** and **Vendors** — with a shared **Marketplace** that connects them. The app helps collectors track and value their card collections while giving vendors tools to manage inventory, calculate trade/buy offers, and run a storefront. A real-time messaging system and transaction flow bring buyers and sellers together.

The name of the project in Firebase is `rafchu-tcg-app`. The production URL is `https://rafchu-tcg-app.web.app`.

---

## 2. User Personas & Access Model

### 2.1 All Users (Authenticated)
- Sign up / sign in via **Google** or **email/password** (with password reset)
- First-time users complete an **onboarding modal**: choose a username, country, and whether they're a vendor
- Based on country, defaults are set: EU users get CardMarket as market source and EUR as currency; everyone else gets TCGPlayer and USD
- Every user gets a profile at `/user/profile` where they can change market source, currency, secondary currency, default trade/buy percentages, and social links (Instagram, YouTube)

### 2.2 Collectors
Every authenticated user is a collector by default. Collectors have access to:
- **Card Search** — search the Pokémon TCG card database
- **My Collection** — add, edit, remove, share, and export cards
- **Wishlist** — track cards they want, with 30-day price trends
- **Trade Binder** — (placeholder for future feature)
- **Marketplace** — browse vendor inventories, contact vendors, add cards to wishlist
- **Collection Insights** — (placeholder for future analytics)

### 2.3 Vendors
Vendor access is gated. Users must request access (business name, type, social links), and an admin approves or denies. Once approved, vendors get everything a collector has plus:
- **Vendor Inventory** — full inventory management with pricing, conditions, grading, snapshots, cash management
- **Trade Calculator** — build trade offers with custom percentages, thresholds, pending deals
- **Buy Calculator** — plan purchases with buy percentages, confirm and add to inventory
- **Transaction Log** — view/edit all trades, buys, and sales
- **Transaction Summary** — aggregate stats (cash sales, trade value, purchases)
- **Inventory Insights** — analytics dashboard (value breakdowns, rarity/condition/set distributions, top cards, graded overview)
- **Wishlist Insights** — see most-wishlisted cards across all collectors (demand intelligence)
- **Vendor Profile** — public storefront with inventory, ratings, social links

### 2.4 Admin
A hardcoded admin email (`rafchucollects@gmail.com`) has access to:
- User management (search users, grant/revoke vendor access)
- Vendor access request queue (approve/deny)
- Feedback review
- Community image moderation (approve/reject submissions)

---

## 3. Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| React Router | 6 (createBrowserRouter) | Client-side routing |
| Vite | 7 | Build tool and dev server |
| Tailwind CSS | 3.4 | Utility-first styling |
| Framer Motion | 12 | Animations |
| Lucide React | 0.545 | Icon library |
| shadcn/ui pattern | — | Custom UI primitives (Button, Input, Card, Select, Tabs) using CSS variables and `cn()` utility |

### Backend (Firebase)
| Service | Purpose |
|---------|---------|
| Firebase Auth | Google + email/password authentication |
| Cloud Firestore | Primary database (all collections listed in Section 7) |
| Firebase Storage | Profile pictures, message images, community card images, manual card images |
| Cloud Functions (Node 20) | API proxies, search, pricing, scheduled jobs, email notifications |
| Firebase Hosting | Static hosting with SPA rewrites |
| Firebase Data Connect | PostgreSQL-backed GraphQL (schema defined but not actively used in the frontend) |

### External APIs (called from Cloud Functions)
| API | Purpose | Auth |
|-----|---------|------|
| PriceCharting | Card pricing (raw + graded: PSA, BGS, CGC, SGC), CSV bulk data | API key |
| Pokémon Price Tracker | TCGPlayer market prices, PSA graded prices via eBay data | API key |
| CardMarket (via RapidAPI) | EU prices, card images, card search | RapidAPI key |
| JustTCG | Japanese card search (18,000+ cards) | API key |
| TCGdex | Free fallback card search (no key required) | None |
| exchangerate-api.com | Currency conversion rates | Free tier |
| Gmail (Nodemailer) | Email notifications for new messages | Gmail credentials |

### Dev Tools
- ESLint 9 with React Hooks + React Refresh plugins
- Vitest for unit testing
- Firebase Emulators for local development
- PostCSS + Autoprefixer

---

## 4. Application Architecture

### 4.1 Entry Flow
```
index.html → src/main.jsx → <AppWrapper /> → <ErrorBoundary> → <AppProvider> → <AppRouter>
```

- **AppWrapper** initializes Firebase (Auth, Firestore, Analytics), connects to emulators in dev mode, handles all auth operations (Google sign-in, email sign-up/in, password reset, logout), and passes auth handlers down
- **AppProvider** (via `AppContext`) is the global state manager — it holds user state, collection/inventory data, wishlist, trade/buy items, transactions, cash data, sharing state, market preferences, and exposes all CRUD functions
- **AppRouter** defines all routes using React Router v6's `createBrowserRouter`

### 4.2 Route Structure
```
/ (Layout — header, drawer, modals)
├── /                       → HomeWrapper (redirect logic)
├── /home                   → HomeWrapper
├── /trade-offer            → SharedTradeOffer (public)
├── /user/profile           → UserProfile
├── /admin                  → Admin
├── /admin/image-reviews    → AdminImageReview
├── /search                 → UnifiedCardSearch
├── /collector
│   ├── /search             → CardSearch (collector mode)
│   ├── /collection         → MyCollection
│   ├── /wishlist           → Wishlist
│   ├── /insights           → CollectionInsights
│   ├── /trade-binder       → TradeBinder
│   ├── /marketplace        → Marketplace
│   ├── /vendor/:vendorId   → VendorProfile
│   └── /messages           → Messages
├── /vendor (wrapped in VendorAccessGuard)
│   ├── /search             → CardSearch (vendor mode)
│   ├── /inventory          → MyInventory
│   ├── /insights           → InventoryInsights
│   ├── /trade-calculator   → TradeCalculator
│   ├── /buy-calculator     → BuyCalculator
│   ├── /transaction-log    → TransactionLog
│   ├── /transaction-summary → TransactionSummary
│   └── /wishlist-insights  → WishlistInsights
└── *                       → Redirect to /
```

HomeWrapper checks URL params: `?inventory={userId}` → SharedInventory, `?collection={userId}` → SharedCollection, otherwise redirects to `/collector/marketplace`.

### 4.3 State Management
The app uses a single React Context (`AppContext`) for global state. No external state library (Redux, Zustand, etc.) is used. Key state categories:

- **Auth**: `user` (Firebase Auth user), `userProfile` (Firestore user doc), `needsOnboarding`
- **Workspace**: `currentPath`, `workspace` ('user' | 'collector' | 'vendor')
- **Search**: `query`, `suggestions`, `loading`, `error`, `activeCard`, `selectedCards`
- **Collection/Inventory**: `collectionItems`, filters, sorts, selections, `viewingUid`
- **Cash**: `cashData` ({ physical: [], digital: [], pending: [] })
- **Wishlist**: `wishlistItems`
- **Trade/Buy**: `tradeItems`, `buyItems`
- **Transactions**: `transactions`
- **Sharing**: `shareEnabled`, `shareUsernameInput`, `shareUsernameStored`, `shareOwnerTitle`, `shareTargetUid`, `isShareView`
- **Market**: `marketSource` ('tcg' | 'cardmarket'), `currency`, `secondaryCurrency`
- **UI**: modal toggles, quick-add feedback, vendor request modal

Collection source depends on the current path: `/collector/` routes use `collector_collections` and `collector_wishlists`; `/vendor/` routes use `collections` and `wishlists`.

### 4.4 Styling
- Tailwind CSS with HSL CSS custom properties (shadcn/ui pattern)
- Light mode by default, dark mode CSS variables defined but not toggled in the app
- Mobile-first responsive design with extensive Safari-specific fixes
- Minimum touch targets of 44px on mobile
- `cn()` utility (clsx + tailwind-merge) for conditional class composition

---

## 5. Feature Details

### 5.1 Card Search System

The search system is the core of the app. It uses a multi-source, cache-first approach:

**Search Pipeline:**
1. User types a query → 500ms debounce
2. Query is preprocessed: typo correction, set abbreviation expansion, query parsing (name, set, number)
3. **Cache check**: search `card_database` (Firestore) first
4. **Hybrid search**: PriceCharting + CardMarket APIs in parallel
5. Results are deduplicated, scored by relevance, and ranked
6. Japanese cards searched via JustTCG as a separate source

**Search Helpers (client-side):**
- `preprocessQuery()` — normalizes input, expands abbreviations (e.g., "sv" → "Scarlet & Violet")
- `correctTypos()` — fuzzy matching against known card names
- `filterByRelevance()` / `scoreRelevance()` / `rankByRelevance()` — scoring based on name match, set match, number match
- `deduplicateResults()` — merge cards from multiple sources using normalized keys
- `findFuzzyMatches()` — Levenshtein distance for "Did you mean?" suggestions
- Dynamic set catalog loaded from Firestore `system/set_catalog`

**Pricing Pipeline:**
- `apiFetchMarketPrices(cardName, setName)` → US (TCGPlayer) and EU (CardMarket) prices
- `apiFetchGradedPrices(cardName, setName)` → PSA, BGS, CGC, SGC prices from PriceCharting
- Prices are formatted per user's market source and currency preferences
- In-memory client-side cache with 12-hour TTL (2-hour for low-result queries)

**Card Data Model (from API):**
```
{
  id, name, set, number, rarity,
  imageUrl, imageUrlHiRes,
  prices: { tcg: { low, mid, high, market }, cardmarket: { low, avg, trend } },
  gradedPrices: { psa10, psa9, bgs10, bgs9_5, cgc10, cgc9_5, sgc10, sgc9_5 },
  source, variant, isJapanese
}
```

### 5.2 Collection Management (Collectors)

**Page:** `MyCollection` at `/collector/collection`

**Core Features:**
- Search and filter cards (rarity, condition, set, graded/ungraded)
- Sort by name, set, price, date added, condition, quantity
- Card grid with images, condition badges, value, quantity
- Inline condition editing (NM, LP, MP, HP, DMG)
- Grading support: PSA, BGS, CGC, SGC, ACE — with grade values (1–10, half-point increments for BGS)
- Manual price override per card
- Graded markup percentages (+5%, +10%, +15%, etc.)
- Quantity management
- Comments/notes per card
- Move selected cards to trade binder
- **Sharing**: toggle sharing on/off, set a share username, copy share link (`?collection={userId}`)
- **Export**: CSV download of entire collection
- **Import**: CardLadder Pro CSV import (parses graded cards, fetches images)
- **Clear**: wipe entire collection
- Community image display for cards without API images
- Image replacement (search CardMarket/JustTCG, paste URL, or upload)

**Firestore:** `collector_collections/{uid}` — contains `items` array, `shareEnabled`, `shareUsername`

### 5.3 Vendor Inventory Management

**Page:** `MyInventory` at `/vendor/inventory`

Everything from Collection Management, plus:
- **Round-up prices** toggle (rounds to nearest dollar)
- **Exclude from sale** per card (hides from public inventory)
- **Bulk operations**: select multiple cards, bulk delete
- **Sales recording**: select cards and record as a sale transaction
- **Inventory Snapshots**: save current inventory state, load previous snapshots, compare value changes, rename snapshots
- **Cash Manager**: track physical cash, digital wallet balances (PayPal, Revolut, Wise, MobilePay, Venmo, Cash App, etc.), and pending payments. Supports 11 currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, DKK, SEK, NOK, MXN). Receive pending → digital flows.
- **Quick Add**: embedded card search for rapid inventory building

**Firestore:** `collections/{uid}` — contains `items` array, `roundUp`, `cashData`, `shareEnabled`, `shareUsername`, plus `inventory_snapshots/{uid}/snapshots` subcollection

### 5.4 Trade Calculator

**Page:** `TradeCalculator` at `/vendor/trade-calculator`

**Purpose:** Build trade offers for in-person or online trades.

**Features:**
- Add cards via search or manual entry
- Set a default trade percentage (40%–120% of market value)
- Per-card overrides: condition, percentage, manual value
- **Threshold bulk action**: "All cards under $X → use Y% trade value"
- **Pending deals**: save up to 5 in-progress trade calculations, load/delete them
- **Confirm trade**: select which inventory cards are being traded out, record the transaction
- **Cash in trade**: track cash exchanged in either direction
- **Share**: copy trade offer as formatted text, or generate a shareable link (stored in `tradeOffers` collection with 7-day expiry)
- **Split offer by tier**: automatically group cards by value tier
- **Dual currency**: show values in both primary and secondary currency

**Firestore:** `pendingDeals/{uid}`, `collections/{uid}`, `transactions`, `tradeOffers`

### 5.5 Buy Calculator

**Page:** `BuyCalculator` at `/vendor/buy-calculator`

Nearly identical to Trade Calculator but for purchases:
- Default buy percentage instead of trade percentage
- Confirm buy → adds cards to inventory and records purchase transaction
- Same sharing, pending deals, threshold, and dual currency features

### 5.6 Wishlist

**Page:** `Wishlist` at `/collector/wishlist`

- List of cards the collector wants to acquire
- Search within wishlist
- Shows price trend vs 30-day average (up/down arrows)
- Total wishlist value
- Remove cards from wishlist

**Firestore:** `collector_wishlists/{uid}`

### 5.7 Marketplace

**Page:** `Marketplace` at `/collector/marketplace`

**Purpose:** Browse and discover vendors and their inventory.

- Loads all vendors with sharing enabled and their inventories
- **Search modes**: All, Cards Only, Vendors Only
- **Country filter** (based on vendor profiles)
- **Recommendations**: suggested cards and vendors
- **Card detail modal**: shows all vendor listings for a specific card
- **Contact vendor**: creates or opens a conversation thread
- **Add to wishlist** from marketplace
- **Wishlist match count**: shows how many of your wishlisted cards a vendor has
- Vendor CTA for non-vendors (encouraging them to become vendors)

**Firestore reads:** `users`, `collections`, `collector_wishlists`, `ratings`, `conversations`

### 5.8 Vendor Profile

**Page:** `VendorProfile` at `/collector/vendor/:vendorId`

- Vendor banner with photo, name, country
- Full inventory grid with search, condition filter, sort
- Card selection for bulk inquiry
- Message vendor / inquire about selected cards
- Social links (Instagram, YouTube)
- Star ratings from past transactions

### 5.9 Messaging System

**Page:** `Messages` at `/collector/messages`

- **Conversation list** with real-time updates
- **Real-time messaging** (Firestore onSnapshot)
- **Send text and images** (images uploaded to Firebase Storage)
- **Transaction flow**: 
  1. Vendor starts a transaction (pending)
  2. Both parties confirm (buyer confirmed, seller confirmed)
  3. Transaction completes
  4. Both parties can rate (thumbs up/down)
  5. Vendor can cancel
- **Delete individual messages**
- **Hide conversations**
- **Email notifications**: when a new message is received, the recipient gets an email via Nodemailer

### 5.10 Transaction Log & Summary

**Transaction Log** (`/vendor/transaction-log`):
- Lists last 100 trades, buys, and sales
- Expandable details per transaction
- Edit prices on acquired cards
- Delete transactions
- Add manual transactions (sale, trade, purchase)

**Transaction Summary** (`/vendor/transaction-summary`):
- Aggregate stats: cash from sales, value gained in trades, total purchases
- Graded vs ungraded breakdown
- Cash from trades

**Firestore:** `transactions/{uid}/entries`

### 5.11 Inventory Insights

**Page:** `InventoryInsights` at `/vendor/insights`

All derived from the in-memory inventory data (no separate Firestore reads):
- Total cards, total market value, total trade value, total buy value, profit potential
- Rarity breakdown (pie/bar chart data)
- Condition breakdown
- Top 5 most valuable cards
- Graded overview: count, value, average grade, company distribution
- Top graded cards
- Set distribution

### 5.12 Wishlist Insights (Vendor)

**Page:** `WishlistInsights` at `/vendor/wishlist-insights`

- Aggregates ALL collector wishlists across the platform
- Shows top 50 most-wishlisted cards
- Total market demand value
- User count per card (how many collectors want it)
- Helps vendors stock what collectors actually want

### 5.13 Shared Views

**SharedInventory** (`?inventory={userId}`):
- Read-only view of a vendor's inventory
- Vendor banner, search, sort, graded filter
- Product-style grid with prices
- Login prompt for guests

**SharedCollection** (`?collection={userId}`):
- Read-only view of a collector's collection
- Search, sort, totals
- Login prompt for guests

**SharedTradeOffer** (`/trade-offer?id={offerId}`):
- Read-only trade or buy offer
- Expiry check (7 days)
- Card list with conditions, grades, and values
- Vendor info

### 5.14 Card Image System

Multiple image sources with fallback chain:
1. **API image** (from CardMarket, PriceCharting, or TCGdex)
2. **Community image** (user-submitted, admin-approved)
3. **Placeholder** (no image)

**Community Image Flow:**
1. User uploads an image for a card without one → stored in `community-images/pending/`
2. Admin reviews in Admin panel → approve (moves to `community-images/approved/`, creates `approvedCommunityImages` doc) or reject (deletes from storage)
3. Approved images are cached client-side (5-minute TTL) via `useCommunityImages` hook

**Image Replacement:**
Users can replace any card image via:
- Search (CardMarket + JustTCG image search)
- Paste URL
- Upload from device

### 5.15 Grading System

Supported grading companies: **PSA, BGS, CGC, SGC, ACE, Other**

- Grade values: 1–10 (half-point increments for BGS: 9.5, 10 Black Label)
- Graded prices fetched from PriceCharting (PSA 10, PSA 9, BGS 10, BGS 9.5, CGC 10, CGC 9.5, SGC 10, SGC 9.5)
- PSA prices also fetched from Pokémon Price Tracker (eBay-based)
- Graded markup percentages available for manual adjustment
- Visual badges show grading company logo and grade
- CardLadder Pro CSV import for bulk graded card entry

### 5.16 Pricing System

**Condition Multipliers:**
| Condition | Code | Multiplier |
|-----------|------|------------|
| Near Mint | NM | 1.0 |
| Lightly Played | LP | 0.8 |
| Moderately Played | MP | 0.6 |
| Heavily Played | HP | 0.4 |
| Damaged | DMG | 0.25 |

**Price Sources:**
- **TCGPlayer**: low, mid, high, market (US source)
- **CardMarket**: low, average, trend (EU source)
- **PriceCharting**: fallback for both, plus graded prices

**Price Display:**
- `computeTcgPrice()` — uses market price, falls back to mid
- `getCardmarketLowest()` / `getCardmarketAvg()` — EU pricing
- `computeSuggestedPrice()` — condition-adjusted price based on user's market source
- `computeItemMetrics()` — full price breakdown per card (trade value, buy value, market value)
- `computeInventoryTotals()` — aggregate inventory stats

**Currency Support:**
11 currencies: USD, EUR, GBP, JPY, CAD, AUD, CHF, DKK, SEK, NOK, MXN. Conversion via exchangerate-api.com. Users can set primary and secondary display currencies.

### 5.17 Admin Panel

**Access:** Hardcoded to `rafchucollects@gmail.com`

**Tabs:**
1. **Users** — search users, view details, toggle vendor access
2. **Vendor Requests** — approve/deny access requests
3. **Feedback** — view user-submitted feedback, mark reviewed, delete
4. **Community Images** — approve/reject image submissions

---

## 6. Cloud Functions Detail

### Search & Data Functions
| Function | Trigger | Description |
|----------|---------|-------------|
| `searchCards` | HTTPS | Cache-first search: checks `card_database`, falls back to CardMarket + TCGdex |
| `searchCardMarket` | HTTPS | Direct CardMarket search proxy |
| `searchPriceChartingCards` | HTTPS | PriceCharting search (card data, no prices) |
| `searchJapaneseCards` | HTTPS | JustTCG Japanese card search |
| `getJapaneseSets` | HTTPS | List all Japanese sets from JustTCG |
| `getCardDetails` | HTTPS | Card details by ID from CardMarket |

### Pricing Functions
| Function | Trigger | Description |
|----------|---------|-------------|
| `fetchMarketPrices` | HTTPS | US (TCGPlayer via Price Tracker) + EU (CardMarket) prices with PriceCharting fallback |
| `fetchGradedPrices` | HTTPS | Graded prices from PriceCharting (PSA, BGS, CGC, SGC grade tiers) |
| `getPsaGradedPrice` | HTTPS | PSA-specific graded prices via Pokémon Price Tracker eBay data |
| `fetchComprehensivePrices` | HTTPS | DEPRECATED — legacy multi-source pricing |

### Scheduled Jobs
| Function | Schedule | Description |
|----------|----------|-------------|
| `cachePriceChartingCSV` | Daily 2 AM UTC | Downloads and caches PriceCharting CSV to `pricecharting_cache` |
| `scheduledCardDatabaseUpdate` | Daily 2 AM UTC | Discovers unique cards → updates `card_database` → refreshes user collection prices |
| `syncJapaneseCards` | Sundays 3 AM UTC | Caches popular Japanese cards to `japanese_cards_cache` |
| `syncSetCatalog` | Sundays 3 AM UTC | Syncs set catalog from CardMarket to `system/set_catalog` |

### Notification Functions
| Function | Trigger | Description |
|----------|---------|-------------|
| `sendMessageNotification` | Firestore (onCreate on `conversations/{id}/messages/{id}`) | Sends email notification to message recipient via Gmail/Nodemailer |

### Admin/Maintenance Functions
| Function | Trigger | Description |
|----------|---------|-------------|
| `initializeCardDatabase` | HTTPS (token) | One-time `card_database` initialization |
| `triggerCsvCache` | HTTPS | Manual PriceCharting CSV cache trigger |
| `triggerUserPriceRefresh` | HTTPS | Manual push of cached prices to user inventories |
| `getCacheStats` | HTTPS | Stats for `card_database` |
| `getUpdateLogs` | HTTPS | Read update logs for monitoring |
| `checkInventoryPriceFreshness` | HTTPS | Analyze how fresh a user's inventory prices are |
| `migrateTcgPocketCards` | HTTPS | Migrate TCG Pocket cards to CardMarket data |
| `forceUpdateAllCards` | HTTPS (token) | Force update all `card_database` entries |
| `triggerJapaneseSync` | HTTPS (token) | Manual Japanese card cache sync |
| `triggerSetCatalogSync` | HTTPS | Manual set catalog sync |

---

## 7. Firestore Data Model

### Core Collections

**`users/{uid}`**
```
{
  displayName, email, photoURL, country,
  onboardingCompleted: boolean,
  vendorAccess: { enabled: boolean, status: 'active'|'pending'|'denied' },
  isVendor: boolean, isAdmin: boolean,
  market: 'tcg' | 'cardmarket',
  currency: string, secondaryCurrency: string,
  defaultTradePercentage: number, defaultBuyPercentage: number,
  instagram: string, youtube: string,
  createdAt: timestamp
}
```

**`collections/{uid}` (Vendor Inventory)**
```
{
  items: [
    {
      id, name, set, number, rarity, imageUrl,
      condition: 'NM'|'LP'|'MP'|'HP'|'DMG',
      quantity: number, manualPrice: number|null,
      isGraded: boolean, gradingCompany: string, grade: number,
      isJapanese: boolean, language: string,
      excludeFromSale: boolean,
      prices: { tcg: {...}, cardmarket: {...} },
      gradedPrices: { psa10, psa9, bgs10, ... },
      addedAt: timestamp, source: string,
      comment: string, fromCardLadder: boolean,
      userUploadedImage: boolean
    }, ...
  ],
  cashData: { physical: [...], digital: [...], pending: [...] },
  roundUp: boolean,
  shareEnabled: boolean, shareUsername: string,
  history: [ { date, totalValue, totalCards, ... } ]
}
```

**`collector_collections/{uid}` (Collector Collection)**
```
{
  items: [ ...same card structure as vendor... ],
  shareEnabled: boolean, shareUsername: string
}
```

**`collector_wishlists/{uid}`**
```
{
  items: [
    { id, name, set, imageUrl, prices, addedAt, ... }
  ]
}
```

**`conversations/{conversationId}`**
```
{
  participants: [uid1, uid2],
  participantNames: { uid1: name1, uid2: name2 },
  lastMessage: string, lastMessageAt: timestamp,
  hidden: { uid: boolean },
  createdAt: timestamp
}
```

**`conversations/{id}/messages/{messageId}`**
```
{
  senderId: uid, text: string,
  imageUrl: string|null,
  createdAt: timestamp, deleted: boolean
}
```

**`transactions/{uid}/entries/{entryId}`**
```
{
  type: 'trade'|'buy'|'sale',
  items: [ { name, set, condition, value, ... } ],
  totalValue: number, cashAmount: number,
  createdAt: timestamp, notes: string
}
```

**`tradeOffers/{offerId}`**
```
{
  vendorId: uid, vendorName: string,
  type: 'trade'|'buy',
  items: [ { name, set, condition, grade, value, ... } ],
  totalValue: number, cashAmount: number,
  createdAt: timestamp, expiresAt: timestamp (7 days)
}
```

**`pendingDeals/{uid}`**
```
{
  deals: [
    { id, name, items: [...], totalValue, createdAt }
  ] // max 5
}
```

**`ratings/{ratingId}`**
```
{
  fromUserId, toUserId, conversationId,
  rating: 'positive'|'negative',
  createdAt: timestamp
}
```

**`inventory_snapshots/{uid}/snapshots/{snapshotId}`**
```
{
  name: string, items: [...],
  totalValue: number, totalCards: number,
  createdAt: timestamp
}
```

### Admin/System Collections

**`vendorAccessRequests/{requestId}`** — businessName, businessType, userId, status, instagram, youtube, createdAt

**`feedback/{feedbackId}`** — userId, category, message, reviewed, createdAt

**`communityImageSubmissions/{submissionId}`** — cardId, cardName, imageUrl, submittedBy, status ('pending'|'approved'|'rejected'), createdAt

**`approvedCommunityImages/{docId}`** — cardId, cardName, imageUrl, approvedAt, approvedBy

**`card_database/{cardId}`** — cached card data from APIs (name, set, prices, imageUrl, lastUpdated)

**`pricecharting_cache/{docId}`** — cached PriceCharting CSV data

**`japanese_cards_cache/{docId}`** — cached Japanese card data from JustTCG

**`system/set_catalog`** — dynamic set catalog synced from CardMarket

**`update_logs/{logId}`** — logs from scheduled card database updates

---

## 8. Firebase Storage Structure

```
/profile-pictures/{userId}/      — User profile photos (public read, owner write)
/message-images/{conversationId}/ — Chat images (auth read/write)
/community-images/
  /pending/                       — User-submitted card images awaiting review
  /approved/                      — Admin-approved community images
/manual-cards/{userId}/           — Images for manually-entered cards
/card-images/{uid}/               — User-replaced card images
```

---

## 9. Security Rules Summary

### Firestore
- **users**: public read, owner or admin write
- **collections** (vendor): read if `shareEnabled` or authenticated; owner write
- **collector_collections**: read if `shareEnabled` or owner; owner write
- **conversations**: participants only (read and write)
- **transactions**: authenticated read/write
- **ratings**: public read, creator write
- **tradeOffers**: public read, vendor create, owner update/delete
- **card_database**: authenticated read, no client write (Cloud Functions only)
- **approvedCommunityImages**: public read, admin write
- Default: deny all

### Storage
- Profile pictures: public read, owner write
- Message images: authenticated
- Community images: pending (public read, auth create <5MB, admin delete), approved (public read, admin write)
- Manual cards: public read, owner create/delete (<5MB)

---

## 10. UI/UX Patterns

### Design System
- HSL CSS custom properties for theming (shadcn/ui pattern)
- Light mode default; dark mode variables defined but not exposed as a toggle
- Custom UI primitives: Button (6 variants, 4 sizes), Input, Card, Select, Tabs
- `cn()` utility for conditional Tailwind classes

### Mobile-First
- Responsive breakpoints via Tailwind
- Safari-specific fixes (flexbox, viewport height, tap highlights, zoom prevention)
- 44px minimum touch targets
- 16px minimum font size on inputs (prevents iOS zoom)
- Drawer navigation pattern for mobile

### Layout
- Fixed header with logo, navigation links, user menu
- Slide-in drawer for mobile navigation
- Sections: Marketplace, Card Search, My User, Collector Toolkit, Vendor Toolkit
- Onboarding modal on first login
- Vendor CTA banner for non-vendors (dismissible)
- "Coming Soon" banner for features in development

### Common Patterns
- Debounced search (500ms)
- Inline editing (click to edit condition, price, grade)
- Quick-add feedback toast
- Modal-heavy interaction (add card, graded card, image upload, manual entry, comments, login, feedback, vendor access request)
- CSV export for all list views
- Share link generation with clipboard copy
- Error boundary with retry

---

## 11. Key Business Logic

### Price Calculation Flow
1. Fetch raw market price from API (TCGPlayer or CardMarket based on user preference)
2. Apply condition multiplier (NM=1.0, LP=0.8, MP=0.6, HP=0.4, DMG=0.25)
3. For vendors: apply trade% or buy% to get offer value
4. If graded: use graded price from PriceCharting instead of raw × condition
5. If manual price override exists: use that instead
6. If round-up enabled: round to nearest whole number
7. Convert to user's preferred currency

### Collection Path Logic
- Routes under `/collector/` → Firestore `collector_collections` and `collector_wishlists`
- Routes under `/vendor/` → Firestore `collections` and `wishlists`
- This separation means vendors and collectors have independent card stores

### Search Ranking Algorithm
Cards are scored based on:
- Exact name match (highest weight)
- Partial name match
- Set name match
- Card number match
- Source priority (PriceCharting > CardMarket > TCGdex)
- Has image (bonus)
- Has prices (bonus)

---

## 12. Environment & Deployment

### Environment Variables (Client)
All prefixed with `VITE_`:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

### Environment Variables (Cloud Functions)
Set via Firebase Functions config:
- `pricecharting.key`
- `pokeprice.key`
- `rapidapi.key`
- `justtcg.key`
- `gmail.email`
- `gmail.password`

### Deployment
- Frontend: Firebase Hosting (static files from `dist/`)
- Backend: Cloud Functions (Node 20)
- CI/CD: GitHub Actions for Firebase Hosting (merge + PR preview)
- SPA rewrite: all routes → `index.html`

### Local Development
- `npm run dev` — Vite dev server
- `npm run emulators` — Firebase Emulator Suite (Auth, Firestore, Functions, Storage, Hosting, Database, etc.)
- Emulators auto-connected in dev mode via `import.meta.env.DEV`

---

## 13. Known Limitations & Technical Debt

1. **No external state library** — AppContext is very large; a rebuild should consider Zustand or similar
2. **Collection items stored as arrays in single documents** — scalability concern for large inventories; a rebuild should use subcollections
3. **Hardcoded admin email** — should use custom claims or a roles collection
4. **TradeBinder and CollectionInsights are placeholders** — not yet implemented
5. **Dark mode CSS defined but no toggle** — should be exposed as a user preference
6. **No pagination** — all items loaded at once; large collections may be slow
7. **No offline support** — despite being mentioned in the spec, no service worker or offline persistence
8. **No TypeScript** — entire codebase is JavaScript with JSX
9. **selectedVendor bug in Marketplace** — `setSelectedVendor` called but `selectedVendor` not defined
10. **Firebase Data Connect schema defined but not integrated** — GraphQL schema exists but frontend uses Firestore directly
11. **No automated tests** — only a couple of unit test files exist for helpers
12. **API keys embedded as fallbacks in Cloud Functions** — should use only Firebase config / Secret Manager
