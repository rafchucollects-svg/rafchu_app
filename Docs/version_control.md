# Version Control Log

## 2025-10-11 (Latest) – v1.3.1 Marketplace Visual & Pricing Polish

### Enhancement: Visual Appeal & Pricing Accuracy

#### **Card Images Throughout Marketplace**
- **Recommendations Section** - 120x160px card images with shadow effects
- **Search Results** - 80x112px card images for quick browsing
- **Card Detail Modal** - 128x176px prominent card image display
- **Vendor Inventory** - 64x88px thumbnails for easy scanning
- **Professional Layout** - Images with rounded corners, borders, and shadows
- **Graceful Fallbacks** - Images hide automatically if unavailable

#### **Fixed Pricing Logic**
- **Market Prices** (Recommendations & Search):
  - Uses collector's preferred market source (TCGplayer or CardMarket)
  - Shows 30-day average pricing
  - Respects collector's currency preference
- **Vendor Asking Prices** (Detail View & Inventory):
  - Displays vendor's actual prices (`customPrice` or `suggestedPrice`)
  - Distinguished with purple color (vs green for market prices)
  - Clearly labeled as "Asking Price" vs "Market Price"

#### **Enhanced User Experience**
- **Visual Hierarchy** - Clear distinction between market and vendor prices
- **Color Coding** - Green for market prices, Purple for vendor asking prices
- **Better Layout** - Card images make browsing more engaging and professional
- **Improved Scanning** - Easier to compare cards visually in vendor inventories

---

## 2025-10-11 – v1.3 Enhanced Marketplace with Smart Discovery

### Major Feature: Comprehensive Marketplace System

#### **Smart Card Discovery**
- **Personalized Recommendations** - 10 card suggestions based on collector's collection sets and types
- **Intelligent Scoring** - Recommends cards from sets collector already owns
- **Wishlist Highlighting** - Visual indicators for cards on collector's wishlist
- **Vendor Context** - Shows which recommended cards come from vendors with multiple wishlist matches

#### **Unified Search System**
- **Search Modes:**
  - **All** - Search both cards and vendors simultaneously
  - **Cards Only** - Find specific cards across all vendor inventories
  - **Vendors Only** - Search by vendor username
- **Real-time Results** - Instant search as you type
- **Aggregated Card Listings** - See all vendors selling the same card in one view

#### **Card Detail View**
When clicking on any card in search results or recommendations:
- **Market Price Display** - Shows current market price at top (TCGplayer or CardMarket based on user preference)
- **Vendor Comparison Table** - Lists all vendors selling that card with:
  - Vendor name and location
  - Card condition (NM, LP, MP, etc.)
  - Asking price
  - Number of collector's wishlist items that vendor has
  - Contact button for each vendor
- **Price Transparency** - Easy comparison shopping across vendors

#### **Vendor Inventory Browser**
When clicking on a vendor name:
- **Full Inventory View** - Browse all cards available from that vendor
- **Multi-Select Functionality** - Check boxes to select multiple cards
- **Wishlist Indicators** - Cards on collector's wishlist highlighted with green border
- **Bulk Inquiry** - Send one message about multiple selected cards
- **Smart Filtering** - Wishlist items shown prominently

#### **Messaging Integration (UI Ready)**
- **Context-Aware Messages** - Pre-filled with selected cards
- **Card Details Included** - Automatically lists card names, sets, and conditions
- **Message Templates** - Suggested opening message for inquiries
- **Vendor Contact Info** - Easy access to reach vendors
- **Coming Soon Banner** - Full messaging system with real-time notifications prepared

#### **User Experience Enhancements**
- **Responsive Modals** - Beautiful card detail and vendor inventory modals
- **Visual Feedback** - Selected cards highlighted in purple
- **Empty States** - Helpful messages when no results found
- **Loading States** - Clear feedback during data fetching
- **Mobile Optimized** - Works seamlessly on all screen sizes

#### **Technical Implementation**
- Updated `src/pages/Marketplace.jsx`:
  - Added recommendation algorithm based on collection matching
  - Implemented unified search with mode switching
  - Created card detail modal with vendor comparison
  - Built vendor inventory modal with multi-select
  - Added message modal with card context
  - Integrated market pricing from user preferences
- **Performance Optimized** - Uses `useMemo` for expensive calculations
- **Real-time Data** - Syncs with Firestore for vendor inventories

#### **Benefits**
- ✅ Personalized card discovery based on collecting habits
- ✅ Easy price comparison across vendors
- ✅ Efficient bulk inquiries for multiple cards
- ✅ Transparent vendor information and wishlist matches
- ✅ Foundation for full marketplace transactions
- ✅ Ready for messaging system integration

---

## 2025-10-11 – v1.2 Vendor Mode Toggle & Flexible User Roles

### New Feature: Vendor Mode Toggle

#### **User Experience Enhancement**
- **Added vendor mode toggle** in Profile & Settings page
- **Users can now switch** between Collector-only and Vendor modes without creating new accounts
- **Dynamic navigation** - Vendor Toolkit appears/disappears based on vendor mode status
- **Persistent setting** - Vendor status stored in Firestore `users` collection
- **Future-ready** - Prepared for subscription-based vendor access in future releases

#### **Implementation Details**
- Updated `src/pages/UserProfile.jsx`:
  - Added `Store` icon import
  - Added `userProfile` and `setUserProfile` to context
  - Implemented `handleVendorToggle` function with Firestore updates
  - Added toggle UI with visual feedback (✓ Vendor Active / Collector Only)
- Updated `src/components/Layout.jsx`:
  - Wrapped Vendor Toolkit section in `{userProfile?.isVendor && (...)}`
  - Navigation dynamically shows/hides based on vendor status
- **Real-time updates** - Context immediately reflects vendor status changes

#### **Benefits**
- ✅ Easy testing between collector and vendor modes
- ✅ No need for multiple test accounts
- ✅ Smooth user experience with instant navigation updates
- ✅ Foundation for future subscription-based vendor features
- ✅ Maintains backward compatibility with onboarding flow

---

## 2025-10-11 – v1.1 Navigation Overhaul & Routing Architecture

### Major Refactoring: Complete Navigation & Routing System

#### **Architecture Changes**
- **Installed react-router-dom v6** for proper client-side routing
- **Created modular page-based architecture** replacing single-file monolithic App.jsx
- **Implemented React Context** (`AppContext`) for shared state management across all pages
- **Extracted utility functions** into `src/utils/cardHelpers.js` for reusability

#### **Navigation Structure**
- **Hamburger drawer navigation** with animated slide-in menu (Framer Motion)
- **Three main sections** with dedicated sub-routes:
  - **My User** → Profile & Settings
  - **Collector Toolkit** → Card Search, My Collection, Wishlist, Collection Insights, Trade Binder
  - **Vendor Toolkit** → Card Search, My Inventory, Inventory Insights, Trade Calculator, Buy Calculator, Transaction Log, Transaction Summary

#### **New Page Components**
Created individual page components for clean separation of concerns:
- `src/pages/Home.jsx` - Landing page with quick access to all toolkits
- `src/pages/UserProfile.jsx` - User settings, sharing controls, CSV export
- `src/pages/CardSearch.jsx` - Unified card search for both toolkits
- `src/pages/MyCollection.jsx` - Collector's personal collection management
- `src/pages/Wishlist.jsx` - Cards the collector wants to acquire
- `src/pages/CollectionInsights.jsx` - Analytics for collector's collection
- `src/pages/TradeBinder.jsx` - Cards available for trade
- `src/pages/MyInventory.jsx` - Vendor's inventory management
- `src/pages/InventoryInsights.jsx` - Analytics for vendor inventory
- `src/pages/TradeCalculator.jsx` - New trade calculation with transaction logging
- `src/pages/BuyCalculator.jsx` - New purchase calculation with transaction logging
- `src/pages/TransactionLog.jsx` - Chronological transaction history
- `src/pages/TransactionSummary.jsx` - Aggregated transaction analytics

#### **New Infrastructure**
- `src/contexts/AppContext.jsx` - Global state provider for auth, collections, transactions, UI state
- `src/components/Layout.jsx` - Main layout wrapper with navigation drawer and header
- `src/Router.jsx` - Centralized routing configuration
- `src/AppWrapper.jsx` - Firebase initialization and context provider wrapper
- `src/utils/cardHelpers.js` - Shared utilities for pricing, conditions, CSV export, Firestore operations

#### **Transaction System**
- **Firestore schema** for transaction logging: `transactions/{uid}/entries`
- **Transaction types**: `trade` (inbound + outbound items) and `buy` (inbound only)
- **Transaction fields**: timestamp, type, itemsIn, itemsOut, totalValue, notes
- **Transaction Log page**: Chronological view of all trades and purchases
- **Transaction Summary page**: Aggregated analytics with total values, counts, and breakdowns

#### **User Profile Enhancements**
- Dedicated profile page with display name, email, user ID
- Sharing settings management (enable/disable, custom display name)
- One-click share link copying
- CSV export functionality for collection backup
- Tips and information for new users

#### **State Management**
Centralized state in AppContext includes:
- Authentication (user, auth, db)
- Navigation (workspace)
- Card search (query, suggestions, loading, error, active card, selected cards)
- Collection/Inventory (items, search, sorting, selected IDs)
- Wishlist (items)
- Trade & Buy lists (items for calculators)
- Transactions (history)
- UI state (feedback toasts, conditions, rounding)
- Sharing (enabled, username, target UID, share view mode)
- History & insights (data, metrics, ranges)

#### **Helper Functions Extracted**
- Currency formatting and symbols
- Card pricing calculations (TCGPlayer, CardMarket)
- Condition multipliers and label conversions
- Inventory totals computation
- Firestore data cloning
- Collection saving and transaction recording
- CSV export generation
- Search tokenization and ranking

#### **Build & Deployment**
- ✅ Successfully builds with Vite
- ✅ All linting checks pass
- Bundle size: ~880 KB (gzipped ~241 KB)
- Ready for Firebase Hosting deployment

### Previous v1.1 Changes (Earlier Session)

- Secured Data Connect mutation `UpdateCollectionCard` by switching to `collectionCard_updateMany` filtered on `auth.uid`, so only the owner can update a card.
- Required authentication for the `SearchCards` query and recorded an explicit `insecureReason` to document why it stays broadly accessible.
- Regenerated the generated SDK after GraphQL changes and cleaned the schema (renamed the `Card.HP` field to `hp`) to satisfy the Data Connect linter.
- Overhauled search throttling with 12h local caching, 5-result previews (toggleable "show more"), memoized card detail fetches, and CSV import reuse to avoid redundant API calls.
- Noted outstanding database cleanup (`card.h_p` legacy column) that needs manual inspection before running `firebase dataconnect:sql:migrate --force`.

### Files Changed/Created

#### New Files
- `src/contexts/AppContext.jsx`
- `src/components/Layout.jsx`
- `src/Router.jsx`
- `src/AppWrapper.jsx`
- `src/utils/cardHelpers.js`
- `src/pages/Home.jsx`
- `src/pages/UserProfile.jsx`
- `src/pages/CardSearch.jsx`
- `src/pages/MyCollection.jsx`
- `src/pages/Wishlist.jsx`
- `src/pages/CollectionInsights.jsx`
- `src/pages/TradeBinder.jsx`
- `src/pages/MyInventory.jsx`
- `src/pages/InventoryInsights.jsx`
- `src/pages/TradeCalculator.jsx`
- `src/pages/BuyCalculator.jsx`
- `src/pages/TransactionLog.jsx`
- `src/pages/TransactionSummary.jsx`

#### Modified Files
- `package.json` - Added react-router-dom dependency
- `src/main.jsx` - Updated to use AppWrapper
- `Docs/version_control.md` - This file

#### Preserved Files
- `src/App.jsx` - Original monolithic app preserved for reference/migration
- All existing Firebase configurations
- All existing dataconnect schemas and queries
