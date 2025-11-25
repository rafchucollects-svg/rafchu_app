import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Search, LogIn } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { LoginModal } from "@/components/LoginModal";
import { formatCurrency, computeTcgPrice, getCardmarketAvg, getCardmarketLowest, getConditionColorClass, convertCurrency } from "@/utils/cardHelpers";
import { getDoc, doc } from "firebase/firestore";

/**
 * Shared Collection View (Read-only)
 * Displays a collector's collection when accessed via ?collection={userId}
 */

export function SharedCollection() {
  const { 
    user, 
    db, 
    currency,
    loginModalOpen,
    setLoginModalOpen,
    authHandlers 
  } = useApp();
  const [searchParams] = useSearchParams();
  const collectionUserId = searchParams.get("collection");
  
  const [collectionItems, setCollectionItems] = useState([]);
  const [collectorName, setCollectorName] = useState("");
  const [marketSource, setMarketSource] = useState("cardmarket");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");

  // Load shared collection
  useEffect(() => {
    if (!db || !collectionUserId) {
      setLoading(false);
      return;
    }

    const loadCollection = async () => {
      try {
        setLoading(true);
        
        // Load collector profile
        const userRef = doc(db, "users", collectionUserId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const profile = userSnap.data();
          setCollectorName(profile.username || profile.displayName || "Collector");
        }
        
        // Load collection
        const collectionRef = doc(db, "collector_collections", collectionUserId);
        const collectionSnap = await getDoc(collectionRef);
        
        if (collectionSnap.exists()) {
          const data = collectionSnap.data();
          
          // Check if sharing is enabled
          if (!data.shareEnabled) {
            setCollectionItems([]);
            setLoading(false);
            return;
          }
          
          const items = Array.isArray(data.items) ? data.items : [];
          setCollectionItems(items);
          
          // Set collector display name if available
          if (data.shareUsername) {
            setCollectorName(data.shareUsername);
          }
          
          // Set market source
          if (data.marketSource) {
            setMarketSource(data.marketSource);
          }
        } else {
          setCollectionItems([]);
        }
      } catch (error) {
        console.error("Failed to load shared collection:", error);
        setCollectionItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadCollection();
  }, [db, collectionUserId]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!searchTerm) return collectionItems;
    const term = searchTerm.toLowerCase();
    return collectionItems.filter(item =>
      String(item.name || "").toLowerCase().includes(term) ||
      String(item.set || "").toLowerCase().includes(term) ||
      String(item.number || "").toLowerCase().includes(term)
    );
  }, [collectionItems, searchTerm]);

  // Get card value based on market source
  const getCardValue = (item) => {
    // Priority 1: Graded cards use graded price (stored in USD, convert to user currency)
    if (item.isGraded && item.gradedPrice) {
      const gradedPriceUSD = parseFloat(item.gradedPrice);
      return convertCurrency(gradedPriceUSD, currency);
    }
    
    // Priority 2: Market-based pricing
    if (marketSource === "tcg") {
      return computeTcgPrice(item);
    } else {
      // CardMarket 30-day average
      return getCardmarketAvg(item);
    }
  };

  // Sort items
  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    items.sort((a, b) => {
      if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "");
      } else if (sortBy === "set") {
        return (a.set || "").localeCompare(b.set || "");
      } else if (sortBy === "price") {
        const aPrice = getCardValue(a);
        const bPrice = getCardValue(b);
        return bPrice - aPrice;
      }
      return 0;
    });
    return items;
  }, [filteredItems, sortBy]);

  // Calculate totals
  const totals = useMemo(() => {
    let count = 0;
    let value = 0;
    
    sortedItems.forEach(item => {
      const qty = item.quantity || 1;
      count += qty;
      value += getCardValue(item) * qty;
    });
    
    return { count, value };
  }, [sortedItems]);

  const formatPrice = (amount) => formatCurrency(amount, currency);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            Loading collection...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!collectionUserId) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No collection specified</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (collectionItems.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">Collection Not Available</p>
            <p className="text-muted-foreground">
              This collector's collection is not shared or doesn't exist.
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
              <Package className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">{collectorName}'s Collection</h1>
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
                placeholder="Search collection..."
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
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm font-semibold">
              Total Cards: {totals.count}
            </div>
            <div className="text-lg font-bold text-primary">
              Collection Value ({marketSource === "tcg" ? "TCGplayer" : "CardMarket 30d Avg"}): {formatPrice(totals.value)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collection Grid */}
      <div className="grid gap-3">
        {sortedItems.length === 0 && collectionItems.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards match your search.
            </CardContent>
          </Card>
        )}
        {sortedItems.map((item) => {
          const cardValue = getCardValue(item);
          const totalValue = cardValue * (item.quantity || 1);
          
          return (
            <Card
              key={item.entryId}
              className="rounded-2xl p-3 hover:bg-accent/40 transition"
            >
              <div className="flex items-center gap-3">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-16 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.set} • {item.rarity} • #{item.number}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity || 1}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${getConditionColorClass(item.condition)}`}>
                      {item.condition || "NM"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-sm font-bold text-primary">
                    {formatPrice(cardValue)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    per card
                  </div>
                  {(item.quantity || 1) > 1 && (
                    <div className="text-xs font-semibold text-muted-foreground mt-1">
                      Total: {formatPrice(totalValue)}
                    </div>
                  )}
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

