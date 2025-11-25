# Shopping Cart & Pending Deals Feature Spec

**Feature Type:** Marketplace Enhancement  
**Priority:** High ⭐  
**Status:** Planning / Not Yet Implemented  
**Requested By:** User conversation on October 13, 2025  
**Estimated Complexity:** Medium-High

---

## 🎯 FEATURE OVERVIEW

**Current State:**
- Users can select cards from vendor inventory
- System sends automated message to vendor with card list
- Manual negotiation happens in messages

**Desired State:**
- Users can add cards to a shopping cart
- Submit cart as formal "deal request" to vendor
- Vendor sees "Pending Deals" tab with buyer requests
- Vendor can approve/decline deals
- Upon approval, inventory automatically updates
- Buyer's collection automatically updates
- Transaction is recorded for both parties

---

## 👥 USER FLOWS

### Flow 1: Buyer Creates Deal Request

```
1. Buyer browses vendor inventory
   └─> Clicks "Add to Cart" on cards they want

2. Buyer reviews shopping cart
   ├─> Sees all selected cards
   ├─> Sees individual prices
   ├─> Sees total price
   └─> Can remove/adjust quantities

3. Buyer submits cart
   ├─> Cart converts to "Deal Request"
   ├─> Automated message sent to vendor
   └─> Deal appears in buyer's "Pending Requests"

4. Buyer waits for vendor response
   ├─> Receives notification when vendor responds
   ├─> Can view deal status (pending/approved/declined)
   └─> Can cancel request if needed

5. Deal Approved
   ├─> Buyer receives notification
   ├─> Cards automatically added to buyer's collection
   ├─> Transaction recorded in purchase history
   └─> Buyer can leave rating/review
```

### Flow 2: Vendor Processes Deal Request

```
1. Vendor receives notification
   └─> "New deal request from [Buyer Name]"

2. Vendor opens "Pending Deals" tab
   ├─> Sees list of all pending requests
   ├─> Each request shows:
   │   ├─ Buyer name
   │   ├─ Requested cards with prices
   │   ├─ Total deal value
   │   └─ Request timestamp

3. Vendor reviews specific deal
   ├─> Views buyer's profile/rating
   ├─> Checks inventory availability
   └─> Can message buyer for questions

4. Vendor makes decision
   ├─> Option A: Approve Deal
   │   ├─> Confirms cards available
   │   ├─> System automatically:
   │   │   ├─ Deducts cards from inventory
   │   │   ├─ Updates buyer's collection
   │   │   ├─ Records transaction
   │   │   └─ Sends notifications
   │   └─> Deal moves to "Completed Deals"
   │
   └─> Option B: Decline Deal
       ├─> Optionally adds reason
       ├─> Sends notification to buyer
       └─> Deal moves to "Declined Deals"
```

---

## 🗂️ DATA STRUCTURES

### Deal Request Object (Firestore)

```javascript
{
  // Deal identification
  id: "deal_123456789",
  createdAt: "2025-10-13T14:30:00Z",
  updatedAt: "2025-10-13T14:35:00Z",
  
  // Parties involved
  buyerId: "user_abc123",
  buyerName: "Rafael",
  buyerEmail: "rafchucollects@gmail.com",
  
  vendorId: "user_vendor789",
  vendorName: "Rafchu Collectibles",
  vendorEmail: "vendor@example.com",
  
  // Deal details
  cards: [
    {
      cardId: "68b2ea70b594c9577ba43e48",
      name: "Charizard GX",
      setName: "Hidden Fates",
      cardNumber: "9",
      condition: "NM",
      quantity: 1,
      pricePerCard: 5.03,
      totalPrice: 5.03,
      imageUrl: "https://...",
      // Snapshot of card at time of request
      inventorySnapshot: { /* card data */ }
    },
    {
      cardId: "68af87b6c4f780b5153e99c5",
      name: "Charizard V",
      setName: "Champion's Path",
      condition: "NM",
      quantity: 2,
      pricePerCard: 20.00,
      totalPrice: 40.00
    }
  ],
  
  // Totals
  itemCount: 3,
  totalValue: 45.03,
  currency: "USD",
  
  // Status tracking
  status: "pending", // pending, approved, declined, cancelled
  statusHistory: [
    {
      status: "pending",
      timestamp: "2025-10-13T14:30:00Z",
      note: "Deal request submitted"
    }
  ],
  
  // Vendor response
  vendorResponse: {
    respondedAt: null,
    decision: null, // "approved" or "declined"
    note: null,
    transactionId: null
  },
  
  // Metadata
  conversationId: "conv_abc123", // Link to message thread
  cancelledBy: null,
  cancellationReason: null
}
```

---

## 🎨 UI MOCKUPS

### Buyer: Shopping Cart View

```
┌─────────────────────────────────────────────┐
│ Shopping Cart                          [X]   │
├─────────────────────────────────────────────┤
│                                             │
│ Vendor: Rafchu Collectibles                │
│ Location: Miami, FL                         │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ [IMG] Charizard GX                      │ │
│ │       Hidden Fates #9                   │ │
│ │       Condition: NM                     │ │
│ │       Quantity: 1    $5.03       [🗑️]  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ [IMG] Charizard V                       │ │
│ │       Champion's Path #79               │ │
│ │       Condition: NM                     │ │
│ │       Quantity: 2    $40.00      [🗑️]  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ─────────────────────────────────────────── │
│ Subtotal (3 cards):              $45.03    │
│                                             │
│ [Clear Cart]    [Submit Deal Request] →    │
└─────────────────────────────────────────────┘
```

### Buyer: Pending Requests View

```
┌─────────────────────────────────────────────┐
│ My Pending Deal Requests              🔔 3  │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🟡 PENDING                              │ │
│ │ Vendor: Rafchu Collectibles             │ │
│ │ 3 cards • $45.03                        │ │
│ │ Requested: 10 min ago                   │ │
│ │                                         │ │
│ │ [View Details]         [Cancel Request] │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🟢 APPROVED                             │ │
│ │ Vendor: Card Kingdom                    │ │
│ │ 5 cards • $120.50                       │ │
│ │ Approved: 2 hours ago                   │ │
│ │                                         │ │
│ │ [View Receipt]    [Leave Review] ⭐     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔴 DECLINED                             │ │
│ │ Vendor: Local Shop                      │ │
│ │ 2 cards • $30.00                        │ │
│ │ Declined: Yesterday                     │ │
│ │ Reason: "Cards already sold"            │ │
│ │                                         │ │
│ │ [View Details]                [Archive] │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Vendor: Pending Deals Tab

```
┌─────────────────────────────────────────────┐
│ Pending Deals                         🔔 5  │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ NEW DEAL REQUEST                        │ │
│ │ From: Rafael ⭐⭐⭐⭐⭐ (5.0)          │ │
│ │ 3 cards • $45.03                        │ │
│ │ Requested: 10 min ago                   │ │
│ │                                         │ │
│ │ Cards Requested:                        │ │
│ │ • Charizard GX (NM) x1 - $5.03         │ │
│ │ • Charizard V (NM) x2 - $40.00         │ │
│ │                                         │ │
│ │ ✅ All cards in stock                   │ │
│ │                                         │ │
│ │ [Message Buyer]                         │ │
│ │ [Decline Deal]    [✓ Approve Deal] →   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ DEAL REQUEST                            │ │
│ │ From: CardCollector99 ⭐⭐⭐⭐ (4.5)    │ │
│ │ 8 cards • $250.00                       │ │
│ │ Requested: 1 hour ago                   │ │
│ │                                         │ │
│ │ ⚠️ 2 cards out of stock                 │ │
│ │                                         │ │
│ │ [View Details]                          │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Vendor: Approve Deal Confirmation

```
┌─────────────────────────────────────────────┐
│ Approve Deal Request?                       │
├─────────────────────────────────────────────┤
│                                             │
│ Buyer: Rafael                               │
│ Total: $45.03 (3 cards)                     │
│                                             │
│ This action will:                           │
│ ✓ Remove cards from your inventory          │
│ ✓ Add cards to buyer's collection           │
│ ✓ Record transaction in both histories      │
│ ✓ Notify buyer of approval                  │
│                                             │
│ Optional Note to Buyer:                     │
│ ┌─────────────────────────────────────────┐ │
│ │ Cards are ready for pickup/shipping!    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Payment Method: [In-Person / External]      │
│                                             │
│ [Cancel]                    [Confirm] →     │
└─────────────────────────────────────────────┘
```

---

## 🔔 NOTIFICATIONS

### For Buyers:
1. **Deal Request Submitted**
   - "Your deal request has been sent to [Vendor]"
   
2. **Deal Approved**
   - "Great news! [Vendor] approved your deal request for $45.03"
   - "3 cards have been added to your collection"
   
3. **Deal Declined**
   - "[Vendor] declined your deal request"
   - "[Optional reason from vendor]"
   
4. **Deal Cancelled**
   - "You cancelled your deal request with [Vendor]"

### For Vendors:
1. **New Deal Request**
   - "New deal request from [Buyer] - $45.03 (3 cards)"
   
2. **Deal Cancelled by Buyer**
   - "[Buyer] cancelled their deal request"
   
3. **Reminder**
   - "You have 5 pending deal requests"

---

## 🔧 TECHNICAL IMPLEMENTATION

### Firestore Collections

```
/deals/{dealId}
  - Deal documents (as defined above)

/users/{userId}/pendingDeals/{dealId}
  - References to active deals for quick lookup

/conversations/{conversationId}
  - Link to message thread
  - Auto-generate message when deal is created
```

### Cloud Functions

```javascript
// 1. onCreate Deal - Send notifications
exports.onDealCreated = functions.firestore
  .document('deals/{dealId}')
  .onCreate(async (snap, context) => {
    const deal = snap.data();
    
    // Notify vendor
    await sendNotification(deal.vendorId, {
      title: 'New Deal Request',
      body: `${deal.buyerName} wants to buy ${deal.itemCount} cards for $${deal.totalValue}`,
      data: { dealId: snap.id }
    });
    
    // Create message in conversation
    await createDealMessage(deal);
  });

// 2. onUpdate Deal - Handle approval/decline
exports.onDealUpdated = functions.firestore
  .document('deals/{dealId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // Deal was approved
    if (before.status === 'pending' && after.status === 'approved') {
      await handleDealApproval(change.after);
    }
    
    // Deal was declined
    if (before.status === 'pending' && after.status === 'declined') {
      await handleDealDecline(change.after);
    }
  });

// 3. Handle Deal Approval
async function handleDealApproval(dealSnap) {
  const deal = dealSnap.data();
  
  // 1. Remove cards from vendor inventory
  for (const card of deal.cards) {
    await removeFromInventory(deal.vendorId, card);
  }
  
  // 2. Add cards to buyer collection
  for (const card of deal.cards) {
    await addToCollection(deal.buyerId, card);
  }
  
  // 3. Record transaction
  await recordTransaction({
    type: 'marketplace_purchase',
    buyerId: deal.buyerId,
    vendorId: deal.vendorId,
    dealId: dealSnap.id,
    cards: deal.cards,
    totalValue: deal.totalValue
  });
  
  // 4. Notify buyer
  await sendNotification(deal.buyerId, {
    title: 'Deal Approved!',
    body: `${deal.vendorName} approved your purchase of ${deal.itemCount} cards`
  });
}
```

### Security Rules

```javascript
match /deals/{dealId} {
  // Anyone authenticated can create a deal
  allow create: if request.auth != null
                && request.auth.uid == request.resource.data.buyerId;
  
  // Buyer and vendor can read their deals
  allow read: if request.auth != null
              && (request.auth.uid == resource.data.buyerId
                  || request.auth.uid == resource.data.vendorId);
  
  // Only vendor can approve/decline
  allow update: if request.auth != null
                && request.auth.uid == resource.data.vendorId
                && (request.resource.data.status == 'approved'
                    || request.resource.data.status == 'declined');
  
  // Buyer can cancel pending deals
  allow update: if request.auth != null
                && request.auth.uid == resource.data.buyerId
                && resource.data.status == 'pending'
                && request.resource.data.status == 'cancelled';
}
```

---

## ✅ ACCEPTANCE CRITERIA

### Phase 1: Basic Shopping Cart (Week 1)
- [ ] Buyer can add cards to cart from vendor inventory
- [ ] Buyer can view cart with all selected cards
- [ ] Buyer can remove cards from cart
- [ ] Buyer can see total price
- [ ] Cart persists across sessions

### Phase 2: Deal Requests (Week 2)
- [ ] Buyer can submit cart as deal request
- [ ] Deal request creates Firestore document
- [ ] Automated message sent to vendor
- [ ] Buyer can view pending requests
- [ ] Buyer can cancel pending requests

### Phase 3: Vendor Processing (Week 3)
- [ ] Vendor sees "Pending Deals" tab
- [ ] Vendor can view all pending requests
- [ ] Vendor can view deal details
- [ ] Vendor can approve deals
- [ ] Vendor can decline deals with reason

### Phase 4: Automation (Week 4)
- [ ] Approved deals automatically update inventory
- [ ] Approved deals automatically update buyer collection
- [ ] Transaction recorded in database
- [ ] Both parties receive notifications
- [ ] Purchase history updated

### Phase 5: Polish (Week 5)
- [ ] Deal status history tracking
- [ ] Review/rating system after completed deals
- [ ] Deal analytics for vendors
- [ ] Email notifications (optional)
- [ ] Mobile push notifications

---

## 🎯 SUCCESS METRICS

**Track these to measure feature success:**

1. **Adoption Rate**
   - % of marketplace users who use cart vs direct messages
   - Number of deal requests per week

2. **Conversion Rate**
   - % of deal requests that get approved
   - Average time from request to approval

3. **User Satisfaction**
   - Vendor feedback on deal management
   - Buyer feedback on purchase process
   - Support tickets related to deals

4. **Transaction Volume**
   - Total deals processed per month
   - Average deal value
   - Repeat customers per vendor

---

## 🚧 POTENTIAL CHALLENGES

1. **Inventory Race Conditions**
   - **Problem:** Multiple buyers request same card
   - **Solution:** First-come-first-served; show "reserved" status

2. **Price Changes**
   - **Problem:** Vendor changes price after cart created
   - **Solution:** Lock prices when cart submitted

3. **Partial Inventory**
   - **Problem:** Vendor only has 1 of 2 requested cards
   - **Solution:** Allow partial approval with notification

4. **Abandoned Carts**
   - **Problem:** Users add to cart but never submit
   - **Solution:** Auto-expire carts after 24 hours

5. **Payment Processing**
   - **Problem:** How to handle actual payment?
   - **Solution:** Phase 1 = external payment, Phase 2 = integrate Stripe

---

## 🗓️ DEVELOPMENT TIMELINE

**Estimated: 5 weeks**

- Week 1: Shopping cart UI + functionality
- Week 2: Deal request system + database
- Week 3: Vendor pending deals UI + approval/decline
- Week 4: Automation (inventory updates, notifications)
- Week 5: Testing, polish, deployment

---

## 📝 NOTES

- This feature bridges the gap between "browsing" and "purchasing"
- Makes the marketplace feel more like an actual store
- Reduces back-and-forth messaging for simple transactions
- Vendors can process deals more efficiently
- Creates transaction history for both parties
- Foundation for future payment integration

**This is a HIGH PRIORITY feature that will significantly improve marketplace UX!** 🎉










