import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, Package, Search, LogIn, Award, MapPin, Sparkles, TrendingUp, Filter, ArrowUpDown, Clock } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { LoginModal } from "@/components/LoginModal";
import { computeInventoryTotals, formatCurrency, computeItemMetrics, getConditionColorClass, convertCurrency, getConditionDisplayLabel, isViewerInEurope } from "@/utils/cardHelpers";
import { getDoc, doc } from "firebase/firestore";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const isNewCard = (item) => item.addedAt && (Date.now() - item.addedAt) < TWO_WEEKS_MS;

/**
 * Shared Inventory View (Read-only)
 * Displays a vendor's inventory when accessed via ?inventory={userId}
 */

export function SharedInventory() {
  const { 
    user, 
    db, 
    currency,
    loginModalOpen,
    setLoginModalOpen,
    authHandlers,
    communityImages,
    getImageForCard,
    refreshCommunityImages,
  } = useApp();
  const [searchParams] = useSearchParams();
  const inventoryUserId = searchParams.get("inventory");
  
  const [inventoryItems, setInventoryItems] = useState([]);
  const [enrichedItems, setEnrichedItems] = useState([]);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhoto, setVendorPhoto] = useState("");
  const [vendorCountry, setVendorCountry] = useState("");
  const [vendorRoundUpPrices, setVendorRoundUpPrices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [filterGraded, setFilterGraded] = useState("all"); // "all", "graded", "ungraded"

  // Load shared inventory
  useEffect(() => {
    if (!db || !inventoryUserId) {
      setLoading(false);
      return;
    }

    const loadInventory = async () => {
      try {
        setLoading(true);
        
        // Load vendor profile
        const userRef = doc(db, "users", inventoryUserId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const profile = userSnap.data();
          setVendorName(profile.username || profile.displayName || "Vendor");
          setVendorPhoto(profile.photoURL || "");
          setVendorCountry(profile.country || "");
        }
        
        // Load inventory
        const inventoryRef = doc(db, "collections", inventoryUserId);
        const inventorySnap = await getDoc(inventoryRef);
        
        if (inventorySnap.exists()) {
          const data = inventorySnap.data();
          
          // Check if sharing is enabled
          if (!data.shareEnabled) {
            setInventoryItems([]);
            setLoading(false);
            return;
          }
          
          const allItems = Array.isArray(data.items) ? data.items : [];
          // Filter out excluded cards
          const items = allItems.filter(item => !item.excludeFromSale);
          
          setInventoryItems(items);
          
          // Set vendor display name if available
          if (data.shareUsername) {
            setVendorName(data.shareUsername);
          }
          
          // Get vendor's round-up prices preference
          if (typeof data.roundUp === "boolean") {
            setVendorRoundUpPrices(data.roundUp);
          }
        } else {
          setInventoryItems([]);
        }
      } catch (error) {
        console.error("Failed to load shared inventory:", error);
        setInventoryItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadInventory();
  }, [db, inventoryUserId]);

  // Lazy load community images only if needed
  useEffect(() => {
    const cardsWithoutImages = inventoryItems.filter(item => !item.image);
    
    // No cards without images? No need to fetch community images
    if (cardsWithoutImages.length === 0) {
      setEnrichedItems(inventoryItems);
      return;
    }
    
    // Cards without images exist - check if we have community images
    if (!communityImages && refreshCommunityImages) {
      // Lazy load community images on first need
      console.log('📸 Lazy loading community images for shared inventory...');
      refreshCommunityImages().then(() => {
        // After loading, apply images (will trigger this effect again with communityImages populated)
      });
      // Set items without enrichment for now
      setEnrichedItems(inventoryItems);
      return;
    }
    
    // We have community images - apply them
    const enriched = inventoryItems.map(item => {
      if (item.image) return item;
      const communityImage = getImageForCard(item);
      return communityImage ? { ...item, image: communityImage } : item;
    });
    
    setEnrichedItems(enriched);
  }, [inventoryItems, communityImages, getImageForCard, refreshCommunityImages]);

  // Filter items
  const filteredItems = useMemo(() => {
    let items = enrichedItems;
    
    // Apply graded filter
    if (filterGraded === "graded") {
      items = items.filter(item => item.isGraded);
    } else if (filterGraded === "ungraded") {
      items = items.filter(item => !item.isGraded);
    }
    
    // Apply search filter
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      String(item.name || "").toLowerCase().includes(term) ||
      String(item.set || "").toLowerCase().includes(term) ||
      String(item.number || "").toLowerCase().includes(term)
    );
  }, [enrichedItems, searchTerm, filterGraded]);

  // Sort items
  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    items.sort((a, b) => {
      if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "");
      } else if (sortBy === "set") {
        return (a.set || "").localeCompare(b.set || "");
      } else if (sortBy === "dateAdded") {
        // Sort by date added (newest first)
        const aDate = a.addedAt || 0;
        const bDate = b.addedAt || 0;
        return bDate - aDate;
      } else if (sortBy === "price") {
        const aMetrics = computeItemMetrics(a, currency);
        const bMetrics = computeItemMetrics(b, currency);
        
        // Calculate prices with graded card conversion and vendor rounding
        let aPrice, bPrice;
        
        // Get base price for A - use fresh calculation like MyInventory
        if (a.overridePrice != null) {
          const overrideCurrency = a.overridePriceCurrency || currency;
          aPrice = overrideCurrency !== currency 
            ? convertCurrency(a.overridePrice, currency, overrideCurrency)
            : a.overridePrice;
        } else if (a.isGraded && a.gradedPrice) {
          const storedCurrency = a.gradedPriceCurrency || 'USD';
          aPrice = storedCurrency !== currency
            ? convertCurrency(a.gradedPrice, currency, storedCurrency)
            : a.gradedPrice;
        } else {
          aPrice = aMetrics.suggested;
        }
        
        // Get base price for B - use fresh calculation like MyInventory
        if (b.overridePrice != null) {
          const overrideCurrency = b.overridePriceCurrency || currency;
          bPrice = overrideCurrency !== currency 
            ? convertCurrency(b.overridePrice, currency, overrideCurrency)
            : b.overridePrice;
        } else if (b.isGraded && b.gradedPrice) {
          const storedCurrency = b.gradedPriceCurrency || 'USD';
          bPrice = storedCurrency !== currency
            ? convertCurrency(b.gradedPrice, currency, storedCurrency)
            : b.gradedPrice;
        } else {
          bPrice = bMetrics.suggested;
        }
        
        // Apply vendor's round-up preference
        if (vendorRoundUpPrices) {
          aPrice = Math.ceil(aPrice);
          bPrice = Math.ceil(bPrice);
        }
        
        return bPrice - aPrice;
      }
      return 0;
    });
    return items;
  }, [filteredItems, sortBy, vendorRoundUpPrices, currency]);

  // Calculate totals using vendor prices
  const totals = useMemo(() => {
    let count = 0;
    let totalValue = 0;
    let gradedCount = 0;
    let newCount = 0;
    
    sortedItems.forEach(item => {
      const qty = item.quantity || 1;
      count += qty;
      if (item.isGraded) gradedCount += qty;
      if (isNewCard(item)) newCount += qty;
      
      const metrics = computeItemMetrics(item, currency);
      let itemPrice;
      
      if (item.overridePrice != null) {
        const overrideCurrency = item.overridePriceCurrency || currency;
        itemPrice = overrideCurrency !== currency 
          ? convertCurrency(item.overridePrice, currency, overrideCurrency)
          : item.overridePrice;
      } else if (item.isGraded && item.gradedPrice) {
        const storedCurrency = item.gradedPriceCurrency || 'USD';
        itemPrice = storedCurrency !== currency
          ? convertCurrency(item.gradedPrice, currency, storedCurrency)
          : item.gradedPrice;
      } else {
        itemPrice = metrics.suggested;
      }
      
      if (vendorRoundUpPrices) {
        itemPrice = Math.ceil(itemPrice);
      }
      
      totalValue += itemPrice * qty;
    });
    
    return { count, value: totalValue, gradedCount, newCount };
  }, [sortedItems, vendorRoundUpPrices, currency]);

  const formatPrice = (amount) => formatCurrency(amount, currency);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            Loading inventory...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!inventoryUserId) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No inventory specified</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (inventoryItems.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">Inventory Not Available</p>
            <p className="text-muted-foreground">
              This vendor's inventory is not shared or doesn't exist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Variant badge helper
  const VARIANT_CONFIG = {
    isReverseHolo:  { label: "Reverse Holo",   color: "bg-blue-100 text-blue-700" },
    isStampedPromo: { label: "Stamped",        color: "bg-purple-100 text-purple-700" },
    isSealed:       { label: "Sealed",         color: "bg-emerald-100 text-emerald-700" },
    isAutographed:  { label: "Autographed",    color: "bg-rose-100 text-rose-700" },
    isFirstEdition: { label: "1st Edition",    color: "bg-amber-100 text-amber-800" },
    isPokeBall:     { label: "Poké Ball",      color: "bg-red-100 text-red-700" },
    isMasterBall:   { label: "Master Ball",    color: "bg-violet-100 text-violet-700" },
    isUnlimited:    { label: "Unlimited",     color: "bg-gray-100 text-gray-700" },
  };

  const getVariantBadges = (item) =>
    Object.entries(VARIANT_CONFIG)
      .filter(([key]) => item[key])
      .map(([key, cfg]) => ({ key, ...cfg }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* ── Shop Banner ─────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 text-white overflow-hidden">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-white/15 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            {vendorPhoto ? (
              <img
                src={vendorPhoto}
                alt={vendorName}
                className="h-24 w-24 rounded-2xl object-cover ring-4 ring-white/30 shadow-2xl"
              />
            ) : (
              <div className="h-24 w-24 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <Store className="h-11 w-11 text-white/80" />
              </div>
            )}

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight drop-shadow-sm">
                {vendorName}'s Shop
              </h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-sm text-white/80">
                {vendorCountry && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {vendorCountry}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  {inventoryItems.length} card{inventoryItems.length !== 1 ? "s" : ""} listed
                </span>
                {totals.newCount > 0 && (
                  <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                    <Sparkles className="h-4 w-4" />
                    {totals.newCount} new this week
                  </span>
                )}
              </div>
            </div>

            {!user && (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-700 font-bold text-sm hover:bg-white/90 transition-all shadow-lg hover:shadow-xl hover:scale-105"
              >
                <LogIn className="h-4 w-4" /> Sign In
              </button>
            )}
            {user && (
              <div className="text-sm text-white/70 bg-white/10 rounded-xl px-4 py-2 backdrop-blur-sm border border-white/10">
                Signed in as <span className="font-semibold text-white">{user.displayName || user.email}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Stats Bar ──────────────────────────────────────────────── */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-center sm:justify-start gap-6 sm:gap-10 py-3 overflow-x-auto">
            <div className="flex flex-col items-center sm:items-start min-w-fit">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Value</span>
              <span className="text-lg sm:text-xl font-extrabold text-slate-900">{formatPrice(totals.value)}</span>
            </div>
            <div className="w-px h-8 bg-slate-200 hidden sm:block" />
            <div className="flex flex-col items-center sm:items-start min-w-fit">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cards</span>
              <span className="text-lg sm:text-xl font-extrabold text-slate-900">{totals.count}</span>
            </div>
            {totals.gradedCount > 0 && (
              <>
                <div className="w-px h-8 bg-slate-200 hidden sm:block" />
                <div className="flex flex-col items-center sm:items-start min-w-fit">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Graded</span>
                  <span className="text-lg sm:text-xl font-extrabold text-amber-600 flex items-center gap-1">
                    <Award className="h-4 w-4" /> {totals.gradedCount}
                  </span>
                </div>
              </>
            )}
            {totals.newCount > 0 && (
              <>
                <div className="w-px h-8 bg-slate-200 hidden sm:block" />
                <div className="flex flex-col items-center sm:items-start min-w-fit">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Arrivals</span>
                  <span className="text-lg sm:text-xl font-extrabold text-emerald-600 flex items-center gap-1">
                    <Sparkles className="h-4 w-4" /> {totals.newCount}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Shop Toolbar ────────────────────────────────────────────────── */}
      <div className="sticky top-14 z-20 bg-white/90 backdrop-blur-xl border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, set, or number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white border-slate-200 focus:border-indigo-400 focus:ring-indigo-400/20"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterGraded}
              onChange={(e) => setFilterGraded(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 transition-colors cursor-pointer"
            >
              <option value="all">All Cards</option>
              <option value="graded">Graded Only</option>
              <option value="ungraded">Ungraded Only</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 transition-colors cursor-pointer"
            >
              <option value="name">Sort: Name</option>
              <option value="set">Sort: Set</option>
              <option value="price">Sort: Price</option>
              <option value="dateAdded">Sort: Newest</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Product Grid ────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Active filter indicator */}
        {(searchTerm || filterGraded !== "all") && sortedItems.length > 0 && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Showing {sortedItems.length} of {inventoryItems.length} cards
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {sortedItems.length === 0 && inventoryItems.length > 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Search className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl font-semibold text-slate-700">No cards match your search</p>
            <p className="text-sm mt-2 text-slate-500">Try adjusting your filters or search terms.</p>
            <button
              onClick={() => { setSearchTerm(""); setFilterGraded("all"); }}
              className="mt-4 px-4 py-2 rounded-lg bg-indigo-50 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {sortedItems.map((item) => {
            const metrics = computeItemMetrics(item, currency);
            const cardIsNew = isNewCard(item);

            let displayPrice;
            if (item.overridePrice != null) {
              const overrideCurrency = item.overridePriceCurrency || currency;
              displayPrice = overrideCurrency !== currency
                ? convertCurrency(item.overridePrice, currency, overrideCurrency)
                : item.overridePrice;
            } else if (item.isGraded && item.gradedPrice) {
              const storedCurrency = item.gradedPriceCurrency || "USD";
              displayPrice = storedCurrency !== currency
                ? convertCurrency(item.gradedPrice, currency, storedCurrency)
                : item.gradedPrice;
            } else {
              displayPrice = metrics.suggested;
            }
            if (vendorRoundUpPrices) displayPrice = Math.ceil(displayPrice);

            const variants = getVariantBadges(item);

            return (
              <div
                key={item.entryId}
                className="group relative bg-white rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-100 hover:shadow-xl hover:ring-indigo-200 hover:-translate-y-1.5 transition-all duration-300"
              >
                {/* NEW badge */}
                {cardIsNew && (
                  <div className="absolute top-2 right-2 z-10">
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-pulse">
                      <Sparkles className="h-2.5 w-2.5" />
                      New
                    </span>
                  </div>
                )}

                {/* Card image */}
                <div className="relative aspect-[3/4] bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 flex items-center justify-center overflow-hidden">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300">
                      <Package className="h-10 w-10" />
                      <span className="text-[10px] font-medium">No image</span>
                    </div>
                  )}
                  {/* Subtle gradient overlay at bottom for readability */}
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* Card info */}
                <div className="p-3">
                  {/* Condition / Graded badge + variants */}
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {item.isGraded && item.gradingCompany && item.grade ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-yellow-50 to-amber-100 text-amber-800 border border-amber-300 flex items-center gap-0.5 shadow-sm">
                        <Award className="h-2.5 w-2.5" />
                        {item.gradingCompany} {item.grade}
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${getConditionColorClass(item.condition)}`}>
                        {getConditionDisplayLabel(item.condition || "NM")}
                      </span>
                    )}
                    {variants.map((v) => (
                      <span
                        key={v.key}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${v.color}`}
                      >
                        {v.label}
                      </span>
                    ))}
                  </div>

                  <h3 className="font-bold text-sm leading-tight truncate text-slate-900" title={item.name}>
                    {item.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5" title={`${item.set} #${item.number}`}>
                    {item.set} {item.number ? `#${item.number}` : ""}
                  </p>
                  {item.quantity > 1 && (
                    <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Qty: {item.quantity}</p>
                  )}

                  {/* Price */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100">
                    <span className="text-lg font-extrabold text-emerald-600 tracking-tight">
                      {formatPrice(displayPrice)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {sortedItems.length > 0 && (
        <div className="border-t bg-white/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {totals.count} card{totals.count !== 1 ? "s" : ""} &middot; Total inventory value: <span className="font-bold text-slate-900">{formatPrice(totals.value)}</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Prices shown in {currency}
            </p>
          </div>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onGoogleLogin={authHandlers?.onGoogleLogin}
        onEmailSignUp={authHandlers?.onEmailSignUp}
        onEmailLogin={authHandlers?.onEmailLogin}
        onPasswordReset={authHandlers?.onPasswordReset}
      />
    </div>
  );
}

