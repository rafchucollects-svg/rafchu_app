# Performance Optimization Plan

## Summary
This document outlines a multi-phase approach to improving the performance of the Pokémon TCG marketplace app.

---

## Phase 1: Quick Wins ✅ COMPLETE
**Status**: Deployed and tested successfully

### Completed Optimizations:
1. ✅ **Community Images Cache** - Centralized image fetching, eliminated 100+ redundant Firestore reads
2. ✅ **Memoized Currency Conversion** - Cached FX rates, reduced repeated calculations
3. ✅ **Fixed Object Mutations** - Eliminated React render bugs by creating new objects instead of mutating

**Result**: App feels much faster, no functionality broken

---

## Phase 2: Should Fix (CURRENT)
**Impact**: Medium-High | **Effort**: Medium

### Targets:
1. **Split AppContext** - Separate concerns to reduce unnecessary re-renders
   - **Problem**: AppContext holds 30+ values; every change causes all consumers to re-render
   - **Solution**: Split into 3 contexts:
     - `AuthContext` (user, db, auth state)
     - `CollectionContext` (collection, inventory, CRUD operations)
     - `UIContext` (modals, feedback, currency, notifications)
   
2. **Reduce Re-renders in CardSearch**
   - **Problem**: Large component with many state variables causes expensive re-renders
   - **Solution**: 
     - Memoize expensive calculations (filteredItems, sortedItems)
     - Move search result rendering to separate component
     - Use `React.memo` for `SuggestionItem` components
   
3. **Bundle Size / Code Splitting**
   - **Problem**: 1.27 MB bundle size
   - **Solution**:
     - Lazy load calculator pages (TradeCalculator, BuyCalculator)
     - Lazy load admin pages (Admin, AdminImageReview)
     - Split vendor vs collector routes
   
4. **Large Collection Filtering**
   - **Problem**: Re-filtering entire collection on every input change
   - **Solution**:
     - Debounce filter inputs (search, sort, graded filter)
     - Use pagination or virtualization for 1000+ item collections

---

## Phase 3: Nice to Have
**Impact**: Low-Medium | **Effort**: Variable

### Potential Targets:
1. **Firebase Query Optimization** - Use Firestore indexes for complex queries
2. **Image Lazy Loading** - Only load images in viewport
3. **Debounce Search Input** - Already done, but could be optimized further
4. **Marketplace Pagination** - Don't load all vendor inventories at once
5. **Transaction Log Pagination** - Limit initial load to recent 50 transactions

---

## Phase 4: Future Scaling
**Impact**: High (at scale) | **Effort**: High

### For Later:
1. **Server-Side Rendering (SSR)** - For SEO and initial load time
2. **Progressive Web App (PWA)** - Offline support, app-like experience
3. **CDN for Static Assets** - Faster global delivery
4. **Backend Caching** - Cache API responses in Cloud Functions
5. **Database Denormalization** - Pre-compute expensive aggregations

---

## Monitoring & Metrics

### Key Performance Indicators:
- **First Contentful Paint (FCP)**: < 1.5s
- **Time to Interactive (TTI)**: < 3.5s
- **Bundle Size**: < 500 KB (gzipped)
- **Re-render Count**: Monitor with React DevTools Profiler

### Tools:
- Chrome Lighthouse
- React DevTools Profiler
- Firebase Performance Monitoring
- Bundle analyzer (`npm run build -- --analyze`)

---

## Implementation Notes

### Phase 2 Changes Will Require:
1. Update all components using `useApp()` to use specific contexts
2. Test all CRUD operations (add, edit, delete cards)
3. Test all calculators (Trade, Buy)
4. Test admin functions
5. Test currency switching
6. Verify no broken imports after code splitting

### Rollback Plan:
- Backup created: `v3.1-phase1-complete-[timestamp].zip`
- Can quickly revert if issues arise

---

## Timeline
- **Phase 1**: ✅ Complete
- **Phase 2**: In Progress (Current)
- **Phase 3**: TBD
- **Phase 4**: Future (post-launch)

