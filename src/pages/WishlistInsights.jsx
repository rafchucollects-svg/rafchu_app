import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, TrendingUp, Users } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency } from "@/utils/cardHelpers";
import { collection, getDocs } from "firebase/firestore";

/**
 * Wishlist Insights Page (Vendor Toolkit)
 * Shows the most wishlisted cards across all collector users
 */

export function WishlistInsights() {
  const { db, currency } = useApp();
  const [wishlistData, setWishlistData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all wishlists and aggregate
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const loadWishlistInsights = async () => {
      try {
        setLoading(true);
        const wishlistsRef = collection(db, "collector_wishlists");
        const snapshot = await getDocs(wishlistsRef);
        
        // Aggregate wishlisted cards
        const cardCounts = {};
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const items = Array.isArray(data.items) ? data.items : [];
          
          items.forEach((item) => {
            const key = `${item.cardId || item.name}-${item.set}-${item.number}`;
            
            if (!cardCounts[key]) {
              cardCounts[key] = {
                ...item,
                wishlistCount: 0,
                users: new Set(),
              };
            }
            
            cardCounts[key].wishlistCount++;
            cardCounts[key].users.add(doc.id);
          });
        });
        
        // Convert to array and sort by wishlist count
        const sortedData = Object.values(cardCounts)
          .map(item => ({
            ...item,
            userCount: item.users.size,
            users: undefined, // Remove Set object before setting state
          }))
          .sort((a, b) => b.wishlistCount - a.wishlistCount)
          .slice(0, 50); // Top 50 most wishlisted cards
        
        setWishlistData(sortedData);
      } catch (error) {
        console.error("Failed to load wishlist insights:", error);
      } finally {
        setLoading(false);
      }
    };

    loadWishlistInsights();
  }, [db]);

  // Format price
  const formatPrice = (value) => formatCurrency(Number(value ?? 0), currency);

  // Get current market price
  const getCurrentPrice = (item) => {
    if (!item.prices?.cardmarket) return 0;
    return Number(item.prices.cardmarket.avg30 || item.prices.cardmarket.avg7 || 0);
  };

  // Calculate total market demand value
  const totalDemandValue = useMemo(() => {
    return wishlistData.reduce((sum, item) => {
      return sum + (getCurrentPrice(item) * item.wishlistCount);
    }, 0);
  }, [wishlistData]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Heart className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold">Wishlist Insights</h1>
          <p className="text-muted-foreground">Vendor Toolkit</p>
        </div>
      </div>

      {/* Summary */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-sm text-muted-foreground">Total Wishlisted Cards</div>
              <div className="text-2xl font-bold">{wishlistData.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Market Demand</div>
              <div className="text-2xl font-bold text-green-600">{formatPrice(totalDemandValue)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Most Wishlisted</div>
              <div className="text-2xl font-bold">{wishlistData[0]?.wishlistCount || 0} users</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Loading wishlist data...
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && wishlistData.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No wishlist data available yet.
          </CardContent>
        </Card>
      )}

      {/* Wishlist Data Grid */}
      {!loading && wishlistData.length > 0 && (
        <div className="grid gap-3">
          {wishlistData.map((item, index) => {
            const currentPrice = getCurrentPrice(item);
            const demandValue = currentPrice * item.wishlistCount;
            
            return (
              <Card
                key={item.entryId || index}
                className="rounded-2xl p-3 hover:bg-accent/40 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 text-center">
                    <div className="text-lg font-bold text-muted-foreground">#{index + 1}</div>
                  </div>
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
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-4 w-4 text-pink-600" />
                        <span className="font-semibold">{item.wishlistCount}</span>
                        <span className="text-muted-foreground">
                          {item.wishlistCount === 1 ? 'user' : 'users'}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Price: </span>
                        <span className="font-semibold">{formatPrice(currentPrice)}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Demand: </span>
                        <span className="font-semibold text-green-600">{formatPrice(demandValue)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

