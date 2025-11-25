import { useMemo, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, computeTcgPrice, getCardmarketAvg } from "@/utils/cardHelpers";

/**
 * Wishlist Page (Collector Toolkit)
 * Manages cards the user wants to acquire with price tracking
 */

export function Wishlist() {
  const {
    user,
    db,
    wishlistItems,
    setWishlistItems,
    removeFromWishlist,
    marketSource,
    currency,
    triggerQuickAddFeedback,
  } = useApp();

  const [wishlistSearch, setWishlistSearch] = useState("");

  // Load wishlist from Firestore
  useEffect(() => {
    if (!db || !user) {
      setWishlistItems([]);
      return undefined;
    }

    const loadWishlist = async () => {
      const { doc, onSnapshot } = await import("firebase/firestore");
      const ref = doc(db, "collector_wishlists", user.uid);

      return onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() || {};
            const rawItems = Array.isArray(data.items) ? data.items : [];
            const items = rawItems.map((item) => ({
              ...item,
              entryId: item.entryId || crypto.randomUUID(),
            }));
            setWishlistItems(items);
          } else {
            setWishlistItems([]);
          }
        },
        (error) => {
          console.error("Failed to load wishlist", error);
          setWishlistItems([]);
        }
      );
    };

    loadWishlist();
  }, [db, user, setWishlistItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!wishlistSearch) return wishlistItems;
    const term = wishlistSearch.toLowerCase();
    return wishlistItems.filter(
      (item) =>
        String(item.name || "").toLowerCase().includes(term) ||
        String(item.set || "").toLowerCase().includes(term) ||
        String(item.number || "").toLowerCase().includes(term)
    );
  }, [wishlistItems, wishlistSearch]);

  // Helper to get current price
  const getCurrentPrice = (item) => {
    if (!item.prices) return 0;
    
    if (marketSource === "cardmarket") {
      return getCardmarketAvg(item) || 0;
    } else {
      return computeTcgPrice(item, "NM") || 0;
    }
  };

  // Helper to calculate price trend (using 30d avg as baseline)
  const getPriceTrend = (item) => {
    if (!item.prices?.cardmarket) return null;
    
    const currentPrice = getCurrentPrice(item);
    const avg30 = Number(item.prices.cardmarket.avg30 || 0);
    
    if (!currentPrice || !avg30) return null;
    
    const percentChange = ((currentPrice - avg30) / avg30) * 100;
    return {
      percent: percentChange,
      isUp: percentChange > 0,
      isDown: percentChange < 0,
    };
  };

  // Format price
  const formatPrice = (value) => formatCurrency(Number(value ?? 0), currency);

  // Delete item
  const deleteItem = async (entryId) => {
    if (!user || !db) return;
    const confirmed = window.confirm("Remove this card from wishlist?");
    if (!confirmed) return;

    try {
      await removeFromWishlist(entryId);
      triggerQuickAddFeedback("Card removed from wishlist");
    } catch (error) {
      console.error("Failed to delete card", error);
      alert("Failed to delete card. Please try again.");
    }
  };

  // Calculate total wishlist value
  const totalValue = useMemo(() => {
    return wishlistItems.reduce((sum, item) => sum + getCurrentPrice(item), 0);
  }, [wishlistItems, marketSource]);

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Please sign in to view your wishlist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Heart className="h-8 w-8 text-pink-600" />
        <div>
          <h1 className="text-3xl font-bold">Wishlist</h1>
          <p className="text-muted-foreground">Collector Toolkit</p>
        </div>
      </div>

      {/* Controls */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Search wishlist..."
              value={wishlistSearch}
              onChange={(e) => setWishlistSearch(e.target.value)}
              className="w-56"
            />
            <div className="text-sm text-muted-foreground">
              {filteredItems.length} card{filteredItems.length !== 1 ? 's' : ''} • Total value: {formatPrice(totalValue)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wishlist Grid */}
      <div className="grid gap-3">
        {filteredItems.length === 0 && wishlistItems.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards in wishlist yet. Use the <Heart className="inline h-4 w-4 text-pink-600" /> button in Card Search to add cards.
            </CardContent>
          </Card>
        )}
        {filteredItems.length === 0 && wishlistItems.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards match your search.
            </CardContent>
          </Card>
        )}
        {filteredItems.map((item) => {
          const currentPrice = getCurrentPrice(item);
          const trend = getPriceTrend(item);
          
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
                  <div className="flex items-center gap-3 mt-1">
                    <div className="text-sm font-semibold text-primary">
                      {formatPrice(currentPrice)}
                    </div>
                    {trend && (
                      <div
                        className={`flex items-center gap-1 text-xs font-medium ${
                          trend.isUp
                            ? "text-green-600"
                            : trend.isDown
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {trend.isUp && <TrendingUp className="h-3 w-3" />}
                        {trend.isDown && <TrendingDown className="h-3 w-3" />}
                        {!trend.isUp && !trend.isDown && <Minus className="h-3 w-3" />}
                        {Math.abs(trend.percent).toFixed(1)}% 
                        <span className="text-muted-foreground">(vs 30d avg)</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Added: {new Date(item.addedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteItem(item.entryId)}
                  className="text-pink-600 hover:text-pink-700 hover:bg-pink-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
