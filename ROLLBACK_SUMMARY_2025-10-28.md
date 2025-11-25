# Rollback Summary - October 28, 2025

## What Happened

All changes made on October 28, 2025 have been **completely reverted** due to critical issues causing:
- Cards displaying $0 values
- Vendor inventory being overwritten by collector data
- General instability

## Changes Reverted

### 1. Automatic Price Refresh (REMOVED)
**Location**: `src/contexts/AppContext.jsx`

**What was attempted**:
- Daily automatic price refresh for vendor and collector inventories
- Background market price updates
- Recalculation of suggested prices for non-overridden cards

**Why it failed**:
- Race conditions during navigation between pages
- Data corruption: collector data overwriting vendor inventory
- Cards showing incorrect ($0) values
- Incomplete/stuck refreshes

**Current state**: 
- Automatic price refresh is **completely disabled**
- Left a comment: "Automatic price refresh DISABLED - This feature was causing data corruption and has been disabled until it can be properly fixed"

### 2. Snapshot Restore Feature (REMOVED)
**Location**: `src/pages/MyInventory.jsx`

**What was attempted**:
- One-click restore button for inventory snapshots
- Automatic tracking of which cards had manual overrides
- Ability to restore historical inventory states

**Why it failed**:
- Restored all cards with manual price overrides (incorrect behavior)
- Attempted fix caused cards to show $0 values
- Did not properly distinguish between manually overridden vs market-priced cards

**Current state**:
- Restore button removed from UI
- `restoreInventoryFromSnapshot()` function removed
- Snapshot creation reverted to original state (no `hasManualOverride` tracking)
- Snapshots can still be:
  - Created (Save Snapshot button still works)
  - Viewed (can see historical data)
  - Deleted
  - But NOT restored via UI

## Files Modified in Rollback

1. **`src/contexts/AppContext.jsx`**
   - Removed entire price refresh `useEffect`
   - Removed imports: `apiFetchCardDetails`, `computeItemMetrics`
   - Removed `priceRefreshRef`
   
2. **`src/pages/MyInventory.jsx`**
   - Removed `restoreInventoryFromSnapshot()` function
   - Removed "Restore" button from snapshot UI
   - Reverted snapshot creation (removed `hasManualOverride` tracking)
   - Removed `RotateCcw` icon import

## Documentation Deleted

- `CRITICAL_BUG_FIX_DATA_CORRUPTION.md`
- `SNAPSHOT_RESTORE_FEATURE.md`
- `AUTOMATIC_PRICE_REFRESH_FINAL.md`

## Current App State

### ✅ Working Features
- Vendor inventory management
- Collector collection management
- Manual price overrides
- Snapshot creation and viewing
- All existing marketplace functionality
- Transaction logging
- Sharing inventories

### ❌ Not Working / Disabled
- Automatic price refresh (disabled)
- Snapshot restore via UI (removed)

### ⚠️ Manual Data Recovery
Users experiencing data loss can still recover via Firebase Console:
1. Go to Firestore Database
2. Navigate to `inventory_snapshots/{userId}/snapshots`
3. Find the correct snapshot
4. Manually copy the `items` array
5. Navigate to `collections/{userId}`
6. Replace the `items` field
7. Click Update

## Lessons Learned

1. **Don't use `collectionItems` as a useEffect dependency** when it changes frequently during navigation
2. **Separate data stores (collector vs vendor) must NEVER cross-pollinate**
3. **Test navigation scenarios thoroughly** before deploying state-dependent features
4. **Snapshot restore needs more planning** - should track override status from the start, not retrofit it
5. **Have a rollback plan** for critical data integrity features

## Next Steps

### Before Re-implementing Automatic Price Refresh:
1. Design a proper queue-based system (not useEffect-based)
2. Use Firebase Functions or a scheduled job (not client-side)
3. Implement proper locking mechanisms
4. Add comprehensive logging
5. Test extensively in staging with rapid navigation
6. Have automatic rollback on error

### Before Re-implementing Snapshot Restore:
1. Redesign snapshot schema to include all necessary metadata from the start:
   - `hasManualOverride` flag per item
   - `originalOverridePrice` if applicable
   - `gradedPrice` for graded cards
   - Full card metadata (not just display fields)
2. Implement non-destructive restore option (merge vs replace)
3. Add "preview" mode before confirming restore
4. Test with various edge cases (graded cards, variants, manual overrides)

## Deployment

- **Deployed**: October 28, 2025
- **Status**: Reverted to stable state
- **URL**: https://rafchu-tcg-app.web.app
- **Version**: Pre-October 28, 2025 changes

