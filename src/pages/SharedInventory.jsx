import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, Package, Search, LogIn, Award } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { LoginModal } from "@/components/LoginModal";
import { computeInventoryTotals, formatCurrency, computeItemMetrics, getConditionColorClass, convertCurrency } from "@/utils/cardHelpers";
import { getDoc, doc } from "firebase/firestore";

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
        
        // Get base price for A
        if (a.overridePrice != null) {
          const overrideCurrency = a.overridePriceCurrency || currency;
          aPrice = overrideCurrency !== currency 
            ? convertCurrency(a.overridePrice, currency, overrideCurrency)
            : a.overridePrice;
        } else if (a.isGraded && a.calculatedSuggestedPrice) {
          aPrice = convertCurrency(a.calculatedSuggestedPrice, currency);
        } else {
          aPrice = a.calculatedSuggestedPrice ?? aMetrics.suggested;
        }
        
        // Get base price for B
        if (b.overridePrice != null) {
          const overrideCurrency = b.overridePriceCurrency || currency;
          bPrice = overrideCurrency !== currency 
            ? convertCurrency(b.overridePrice, currency, overrideCurrency)
            : b.overridePrice;
        } else if (b.isGraded && b.calculatedSuggestedPrice) {
          bPrice = convertCurrency(b.calculatedSuggestedPrice, currency);
        } else {
          bPrice = b.calculatedSuggestedPrice ?? bMetrics.suggested;
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
    
    sortedItems.forEach(item => {
      const qty = item.quantity || 1;
      count += qty;
      
      const metrics = computeItemMetrics(item, currency);
      let itemPrice;
      
      // Get the base price
      if (item.overridePrice != null) {
        // Manual override price
        const overrideCurrency = item.overridePriceCurrency || currency;
        itemPrice = overrideCurrency !== currency 
          ? convertCurrency(item.overridePrice, currency, overrideCurrency)
          : item.overridePrice;
      } else if (item.isGraded && item.calculatedSuggestedPrice) {
        // Graded card calculated price is in USD, convert it
        itemPrice = convertCurrency(item.calculatedSuggestedPrice, currency);
      } else if (item.calculatedSuggestedPrice != null) {
        itemPrice = item.calculatedSuggestedPrice;
      } else {
        itemPrice = metrics.suggested;
      }
      
      // Apply vendor's round-up preference
      if (vendorRoundUpPrices) {
        itemPrice = Math.ceil(itemPrice);
      }
      
      totalValue += itemPrice * qty;
    });
    
    return { count, value: totalValue };
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

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Header */}
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <Store className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">{vendorName}'s Inventory</h1>
                <p className="text-sm text-muted-foreground">Read-only view</p>
              </div>
            </div>
            {!user && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setLoginModalOpen(true)}
                className="flex items-center gap-2"
              >
                <LogIn className="h-4 w-4" />
                Sign In / Sign Up
              </Button>
            )}
            {user && (
              <div className="text-sm text-muted-foreground">
                Signed in as <span className="font-semibold">{user.displayName || user.email}</span>
              </div>
            )}
          </div>
          
          {/* Search and Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="name">Sort by Name</option>
              <option value="set">Sort by Set</option>
              <option value="price">Sort by Price</option>
              <option value="dateAdded">Sort by Date Added</option>
            </select>
          </div>
          
          {/* Filter Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={filterGraded === "all" ? "default" : "outline"}
              onClick={() => setFilterGraded("all")}
            >
              All Cards
            </Button>
            <Button
              size="sm"
              variant={filterGraded === "graded" ? "default" : "outline"}
              onClick={() => setFilterGraded("graded")}
            >
              <Award className="h-4 w-4 mr-1" />
              Graded Only
            </Button>
            <Button
              size="sm"
              variant={filterGraded === "ungraded" ? "default" : "outline"}
              onClick={() => setFilterGraded("ungraded")}
            >
              Ungraded Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Grid */}
      <div className="grid gap-3">
        {sortedItems.length === 0 && inventoryItems.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards match your search.
            </CardContent>
          </Card>
        )}
        {sortedItems.map((item) => {
          const metrics = computeItemMetrics(item, currency);
          
          // Calculate display price with vendor's rounding preference
          let displayPrice;
          
          // Get the base price
          if (item.overridePrice != null) {
            // Manual override price
            const overrideCurrency = item.overridePriceCurrency || currency;
            displayPrice = overrideCurrency !== currency 
              ? convertCurrency(item.overridePrice, currency, overrideCurrency)
              : item.overridePrice;
          } else if (item.isGraded && item.calculatedSuggestedPrice) {
            // Graded card calculated price is in USD, convert it
            displayPrice = convertCurrency(item.calculatedSuggestedPrice, currency);
          } else if (item.calculatedSuggestedPrice != null) {
            displayPrice = item.calculatedSuggestedPrice;
          } else {
            // Fallback: calculate on the fly
            displayPrice = metrics.suggested;
          }
          
          // Apply vendor's round-up preference
          if (vendorRoundUpPrices) {
            displayPrice = Math.ceil(displayPrice);
          }
          
          return (
            <Card
              key={item.entryId}
              className="rounded-2xl p-3 hover:bg-accent/40 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-center gap-3">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-16 rounded-lg object-cover shadow-sm"
                  />
                ) : (
                  <div className="h-20 w-16 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                    <span className="text-[8px] text-gray-400 text-center px-1">No Image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.set} • {item.rarity} • #{item.number}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity || 1}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {/* Condition or Graded Badge */}
                  {item.isGraded && item.gradingCompany && item.grade ? (
                    <span className="text-xs font-semibold px-2 py-1 rounded border border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-900 flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      {item.gradingCompany} {item.grade}
                    </span>
                  ) : (
                    <span className={`text-xs font-semibold px-2 py-1 rounded border ${getConditionColorClass(item.condition)}`}>
                      {item.condition || "NM"}
                    </span>
                  )}
                  
                  <div 
                    className="text-2xl font-extrabold text-green-600"
                    style={{ textShadow: '0 0 20px rgba(34, 197, 94, 0.5), 0 0 40px rgba(34, 197, 94, 0.3)' }}
                  >
                    {formatPrice(displayPrice)}
                  </div>
                  <div className="text-xs font-medium text-green-700 uppercase tracking-wide">
                    Sales Price
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

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

