# Pending Features - Post v2.0 Deployment

**Date:** October 13, 2025  
**Status:** Planning & Prioritization  
**Last Deployment:** v2.0 (with Safari/Chrome optimizations, Coming Soon banner, email/password auth)

---

## 🎯 **CURRENTLY IN PROGRESS / IMMEDIATE:**

### **1. Card Variant Support** (HIGH PRIORITY) 🔥
**Status:** API investigation complete, ready to implement  
**Decision:** Hybrid approach (API + manual entry)

**What it includes:**
- [ ] Extract variant info from card names (e.g., "(Full Art)", "(Secret)")
- [ ] Display variant badges in search results
- [ ] Add "Variant" dropdown when adding cards to collection/inventory
  - Regular Holo
  - Reverse Holo
  - 1st Edition
  - Shadowless
  - Unlimited
  - Other (user specify)
- [ ] Manual price override for non-API variants
- [ ] TCGPlayer verification links
- [ ] Variant filter in collection/inventory views
- [ ] "API Supported" vs "User Specified" indicators

**Effort:** 2-3 days  
**Value:** HIGH - Critical for accurate valuations  
**Docs:** 
- `VARIANT_INVESTIGATION_RESULTS.md`
- `JUSTTCG_API_FINAL_VERDICT.md`

**Why it matters:** Variants can have 100x price differences (1st Edition vs Unlimited)

---

## 💬 **FEATURED IN "COMING SOON" BANNER:**

These features are visible to users in the app banner:

### **2. Japanese Card Support** (MEDIUM-HIGH PRIORITY)
**Status:** API research done, needs implementation

**What it includes:**
- [ ] Language field in collection items
- [ ] Japanese card search (Pokemon Price Tracker API supports some)
- [ ] Japanese card pricing (manual for Japan-exclusives)
- [ ] Language filter in collections
- [ ] Flag indicators (🇺🇸 vs 🇯🇵)

**Limitations:**
- API only has Japanese cards that sell on eBay.com
- Japan-exclusive cards need manual pricing

**Effort:** 3-4 days  
**Value:** MEDIUM - Expands collector base  
**Docs:** `POKEMON_PRICE_TRACKER_COMPLETE_API_GUIDE.md`

---

### **3. Graded Card Support** (MEDIUM-HIGH PRIORITY) 🏆
**Status:** API confirmed PSA graded data available

**What it includes:**
- [ ] Grading company field (PSA, BGS, CGC)
- [ ] Grade field (1-10)
- [ ] Graded card search/filtering
- [ ] Raw vs graded value comparison
- [ ] Graded card pricing (PSA via Pokemon Price Tracker API)
- [ ] Population report data (if available)
- [ ] "Should I grade this?" ROI calculator

**API Coverage:**
- ✅ PSA graded pricing (Pokemon Price Tracker with `includeEbay=true`)
- ❓ BGS/CGC graded pricing (unknown)

**Effort:** 4-5 days  
**Value:** HIGH - High-value collector segment  
**Docs:** `POKEMON_PRICE_TRACKER_COMPLETE_API_GUIDE.md`

---

### **4. Sealed Product Support** (MEDIUM PRIORITY) 📦
**Status:** API confirmed full support

**What it includes:**
- [ ] Sealed product type field (Booster Box, ETB, Bundle, etc.)
- [ ] Sealed product search
- [ ] Price history and trends
- [ ] Product type filtering
- [ ] Set-specific sealed products
- [ ] Investment tracking for sealed products

**API Coverage:**
- ✅ Full sealed product support (Pokemon Price Tracker API)
- ✅ Price history
- ✅ Product type filtering

**Effort:** 3-4 days  
**Value:** MEDIUM - Different user segment (investors)  
**Docs:** `POKEMON_PRICE_TRACKER_COMPLETE_API_GUIDE.md`

---

## 🛒 **MARKETPLACE ENHANCEMENTS:**

### **5. Shopping Cart System** (HIGH PRIORITY) 🛒
**Status:** Spec documented, not yet implemented

**What it includes:**
- [ ] Add cards from marketplace to cart
- [ ] Multi-vendor cart support
- [ ] Cart persistence across sessions
- [ ] Quantity adjustments in cart
- [ ] Shipping estimation (future)
- [ ] Checkout flow (contact vendor)
- [ ] Cart notifications
- [ ] "Save for later" functionality

**User Flow:**
1. Browse marketplace
2. Click "Add to Cart" on cards
3. View cart with items grouped by vendor
4. "Contact Vendor" to finalize deal
5. Track pending deals

**Effort:** 1 week  
**Value:** HIGH - Core marketplace functionality  
**Docs:** `FEATURE_SPEC_SHOPPING_CART_PENDING_DEALS.md`

---

### **6. Pending Deals System** (HIGH PRIORITY) 💼
**Status:** Spec documented, not yet implemented

**What it includes:**
- [ ] Deal creation from cart or direct contact
- [ ] Deal status tracking (pending, accepted, declined, completed)
- [ ] Negotiation messaging within deal
- [ ] Deal history for buyers and sellers
- [ ] Deal notifications (new offer, status change)
- [ ] Deal expiration
- [ ] Payment status tracking (external)
- [ ] Shipping tracking (external)

**Firestore Structure:**
```javascript
{
  dealId: "deal_123",
  buyerId: "user_abc",
  sellerId: "vendor_xyz",
  items: [...],
  totalAmount: 150.00,
  status: "pending",
  messages: [...],
  createdAt, updatedAt
}
```

**Effort:** 1 week  
**Value:** HIGH - Enables transactions  
**Docs:** `FEATURE_SPEC_SHOPPING_CART_PENDING_DEALS.md`

---

## 📧 **COMMUNICATION FEATURES:**

### **7. Email Notifications for Messages** (READY, NOT DEPLOYED)
**Status:** Cloud Function built, not deployed

**What it includes:**
- [ ] Email when user receives message from vendor/buyer
- [ ] Email includes message preview and link to conversation
- [ ] Smart throttling (don't email if user is active)
- [ ] User preferences for email notifications

**Implementation:**
- ✅ Cloud Function written
- ✅ Nodemailer setup documented
- ⏳ Gmail app password setup needed
- ⏳ Firebase environment variables needed
- ⏳ Deployment

**Effort:** 1 hour (just deployment + config)  
**Value:** MEDIUM - Improves response time  
**Docs:** `EMAIL_SETUP_GUIDE.md`

---

## 🎨 **UI/UX IMPROVEMENTS:**

### **8. Dismissible Banners** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Coming Soon banner dismissible
- [x] Vendor CTA dismissible
- [x] State persisted in localStorage

---

### **9. Browser Optimizations** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Safari-specific CSS fixes
- [x] Chrome optimizations
- [x] Input zoom prevention
- [x] Backdrop filter fixes

---

## 🔒 **VENDOR FEATURES:**

### **10. Vendor Tier Differentiation** (BACKLOG) ⚠️
**Status:** Note created, not yet implemented

**Current State:**
- All approved vendors get "PRO" tier
- Basic and Pro have same features

**What needs to be done:**
- [ ] Define Basic tier features (limited inventory, basic analytics)
- [ ] Define Pro tier features (unlimited, advanced analytics, priority support)
- [ ] Define Lifetime tier features (all Pro features permanently)
- [ ] Implement feature gates based on tier
- [ ] Update pricing page
- [ ] Build tier comparison UI

**Effort:** 1 week  
**Value:** HIGH (monetization)  
**Note:** Should be done before launching public vendor subscriptions

---

## 🐛 **BUG FIXES & IMPROVEMENTS:**

### **11. Search Error Fixes** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Fixed `.toLowerCase()` errors on non-string values
- [x] Added String() casting in search filters

---

### **12. Disabled Vendor Hiding** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Disabled vendors hidden from marketplace
- [x] Vendors with no inventory hidden from marketplace

---

### **13. Vendor Sorting Improvements** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] "Top Vendors for you" based on location, wishlist, popularity, rating

---

### **14. Insights Pages Rebuilt** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Collection Insights rebuilt from scratch
- [x] Inventory Insights rebuilt from scratch

---

### **15. Trade Binder** (HIDDEN UNTIL BUILT)
**Status:** Commented out in UI

- [ ] Design Trade Binder feature
- [ ] Build trade offer system
- [ ] Implement trade matching
- [ ] Add trade history

**Effort:** 2 weeks  
**Value:** MEDIUM - Nice-to-have

---

## 📊 **ANALYTICS & INSIGHTS:**

### **16. Firebase Analytics** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Analytics initialized
- [x] Tracking user activity

---

## 🔐 **AUTHENTICATION:**

### **17. Email/Password Authentication** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Sign up with email
- [x] Sign in with email
- [x] Password reset
- [x] Profile display name on signup

---

## 📝 **FEEDBACK & ADMIN:**

### **18. Feedback System** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] Feedback button in hamburger menu
- [x] Feedback button at bottom of card search
- [x] Feedback modal with category selection
- [x] Admin panel "Feedback" tab
- [x] Mark as reviewed / delete feedback

---

### **19. Vendor Access Requests** (✅ COMPLETE)
**Status:** Deployed in v2.0

- [x] In-app vendor access request form
- [x] Business name, type, social links (Instagram, YouTube)
- [x] Admin panel "Vendor Requests" tab
- [x] Approve/deny requests
- [x] Auto-assign "PRO" tier on approval

---

## 🗺️ **FEATURES FROM ROADMAP (Not Yet Discussed):**

These are in `FEATURE_ROADMAP.md` but haven't been prioritized yet:

### **Collection Management:**
- [ ] Collection export (CSV, PDF)
- [ ] Collection import from CSV
- [ ] Photo upload for cards
- [ ] Custom tags/labels
- [ ] Multiple collections per user
- [ ] Insurance valuation report

### **Pricing & Valuation:**
- [ ] Price history charts
- [ ] Price alerts
- [ ] Profit/loss calculation
- [ ] Weekly/monthly price digest emails

### **Set Completion:**
- [ ] Set completion tracking
- [ ] "Complete this set" cost calculator
- [ ] Set priority ranking
- [ ] Master set tracking (including variants)

### **Smart Import Tools:**
- [ ] OCR for card photos
- [ ] Bulk import from spreadsheet
- [ ] Import from TCGPlayer collection
- [ ] Barcode scanning

### **Investment Tools:**
- [ ] Portfolio performance dashboard
- [ ] Buy/sell/hold recommendations
- [ ] Market trend analysis
- [ ] Price prediction models

---

## 📋 **SUMMARY BY PRIORITY:**

### **🔥 HIGH PRIORITY (Do Next):**

1. **Card Variant Support** (2-3 days) - Critical for accuracy
2. **Shopping Cart System** (1 week) - Core marketplace functionality
3. **Pending Deals System** (1 week) - Enables transactions
4. **Graded Card Support** (4-5 days) - High-value users
5. **Vendor Tier Differentiation** (1 week) - Monetization prep

**Total Effort:** ~4 weeks

---

### **⚡ MEDIUM-HIGH PRIORITY (Soon After):**

6. **Japanese Card Support** (3-4 days)
7. **Sealed Product Support** (3-4 days)

**Total Effort:** ~1 week

---

### **📧 QUICK WINS (Deploy Anytime):**

8. **Email Notifications** (1 hour) - Just needs config + deploy

---

### **📦 BACKLOG (Future):**

9. All other roadmap features (collection management, set completion, etc.)

---

## 🤔 **RECOMMENDED IMPLEMENTATION ORDER:**

### **Sprint 1 (Week 1):**
1. **Card Variant Support** (2-3 days) - Start here!
2. **Email Notifications** (1 hour) - Quick deploy
3. **Shopping Cart System** (3-4 days) - Begin implementation

### **Sprint 2 (Week 2):**
4. **Shopping Cart System** (finish, 1-2 days)
5. **Pending Deals System** (3-4 days)

### **Sprint 3 (Week 3):**
6. **Pending Deals System** (finish, 1-2 days)
7. **Graded Card Support** (3-4 days)

### **Sprint 4 (Week 4):**
8. **Vendor Tier Differentiation** (1 week)

### **Sprint 5 (Week 5):**
9. **Japanese Card Support** (3-4 days)
10. **Sealed Product Support** (3-4 days)

---

## ❓ **QUESTIONS FOR PRIORITIZATION:**

1. **Most important to users right now?**
   - Variant tracking accuracy?
   - Being able to buy/sell cards?
   - More card types (graded, Japanese, sealed)?

2. **Most important for business?**
   - Marketplace transactions (shopping cart/deals)?
   - Vendor monetization (tier features)?
   - User growth (more card types)?

3. **Quick wins worth doing first?**
   - Email notifications (1 hour)?
   - Variant support (2-3 days)?

4. **What can wait?**
   - Set completion tracking?
   - Import tools?
   - Investment analytics?

---

## 💭 **MY RECOMMENDATION:**

**Start with:**
1. ✅ **Card Variant Support** (2-3 days) - Foundational, affects everything
2. ✅ **Email Notifications** (1 hour) - Quick user experience win
3. ✅ **Shopping Cart + Pending Deals** (2 weeks) - Core marketplace feature

**Why this order:**
- Variants affect how users add cards → do it before shopping cart
- Email notifications are trivial to deploy → quick win
- Shopping cart is the #1 missing marketplace feature → high impact

**Then assess:**
- User feedback on these features
- What users are asking for most
- Business priorities (monetization vs growth)

---

**Status:** 📋 Ready for prioritization discussion  
**Date:** October 13, 2025  
**Next:** User decides priority order










