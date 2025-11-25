import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Search, MessageCircle, MapPin, Star, Package, X, TrendingUp, Mail, Store, User, Heart, ThumbsUp, Award } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, computeTcgPrice, getCardmarketAvg, getCardmarketLowest, computeItemMetrics, getConditionColorClass } from "@/utils/cardHelpers";
import { collection, getDocs, doc as firestoreDoc, getDoc, query, where, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Marketplace Page (Collector Toolkit)
 * Browse vendors, discover recommended cards, and search for specific cards or vendors
 */

export function Marketplace() {
  const { db, user, wishlistItems, collectionItems, currency, marketSource, userProfile, setVendorRequestModalOpen, addToWishlist, triggerQuickAddFeedback, communityImages, getImageForCard, refreshCommunityImages } = useApp();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [enrichedVendors, setEnrichedVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState("all"); // "all", "cards", "vendors"
  const [selectedCard, setSelectedCard] = useState(null); // For card detail modal
  const [messageModal, setMessageModal] = useState(null); // { vendor, cards }
  const [countryFilter, setCountryFilter] = useState(""); // Country filter
  const [vendorCtaDismissed, setVendorCtaDismissed] = useState(() => {
    return localStorage.getItem('vendorCtaDismissed') === 'true';
  });
  
  const dismissVendorCta = () => {
    setVendorCtaDismissed(true);
    localStorage.setItem('vendorCtaDismissed', 'true');
  };

  // Load all vendors and their inventories
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const loadVendors = async () => {
      try {
        setLoading(true);
        
        // Get all user profiles
        const usersRef = collection(db, "users");
        const usersSnapshot = await getDocs(usersRef);
        
        // Load all wishlists to calculate popular cards
        const wishlistsRef = collection(db, "collector_wishlists");
        const wishlistsSnapshot = await getDocs(wishlistsRef);
        const allWishlistItems = [];
        wishlistsSnapshot.forEach(doc => {
          const data = doc.data();
          if (Array.isArray(data.items)) {
            allWishlistItems.push(...data.items);
          }
        });
        
        // Create a popularity map: cardId/name+set+number -> count
        const popularityMap = new Map();
        allWishlistItems.forEach(item => {
          const key = item.cardId || `${item.name}-${item.set}-${item.number}`;
          popularityMap.set(key, (popularityMap.get(key) || 0) + 1);
        });
        
        const vendorData = [];
        
        for (const userDoc of usersSnapshot.docs) {
          const profile = userDoc.data();
          
          // Skip vendors who had access revoked (vendorAccess explicitly disabled)
          if (profile.vendorAccess?.enabled === false) continue;
          
          // Only include vendors with active vendor access or legacy vendors
          const hasActiveVendorAccess = profile.vendorAccess?.enabled === true && profile.vendorAccess?.status === "active";
          const isLegacyVendor = profile.isVendor === true && profile.vendorAccess?.enabled !== false;
          
          if (!hasActiveVendorAccess && !isLegacyVendor) continue;
          
          // Get their inventory
          const inventoryRef = firestoreDoc(db, "collections", userDoc.id);
          const inventorySnap = await getDoc(inventoryRef);
          
          if (inventorySnap.exists()) {
            const inventoryData = inventorySnap.data();
            const allItems = Array.isArray(inventoryData.items) ? inventoryData.items : [];
            // Filter out cards excluded from sale
            const items = allItems.filter(item => !item.excludeFromSale);
            
            // Skip vendors with empty inventory
            if (items.length === 0) continue;
            
            const vendorRoundUpPrices = inventoryData.roundUp || false; // Get vendor's round-up preference
            
            // Calculate matches with wishlist
            const wishlistMatches = wishlistItems.filter(wishItem =>
              items.some(invItem =>
                invItem.cardId === wishItem.cardId ||
                (invItem.name === wishItem.name && invItem.set === wishItem.set && invItem.number === wishItem.number)
              )
            );
            
            // Calculate popular cards count (cards that appear in many wishlists)
            let popularCardsCount = 0;
            items.forEach(item => {
              const key = item.cardId || `${item.name}-${item.set}-${item.number}`;
              const popularity = popularityMap.get(key) || 0;
              if (popularity >= 2) { // Card is in 2+ wishlists = popular
                popularCardsCount++;
              }
            });
            
            // Load vendor ratings
            const ratingsQuery = query(
              collection(db, "ratings"),
              where("toUserId", "==", userDoc.id)
            );
            const ratingsSnap = await getDocs(ratingsQuery);
            const ratingsData = ratingsSnap.docs.map(doc => doc.data());
            
            let ratingPercentage = null;
            if (ratingsData.length > 0) {
              const thumbsUpCount = ratingsData.filter(r => r.thumbsUp === true).length;
              ratingPercentage = Math.round((thumbsUpCount / ratingsData.length) * 100);
            }
            
            // Check location match
            const locationMatch = userProfile?.country && profile.country === userProfile.country;
            
            vendorData.push({
              userId: userDoc.id,
              profile,
              inventory: items,
              wishlistMatches: wishlistMatches.length,
              totalCards: items.length,
              roundUpPrices: vendorRoundUpPrices,
              ratingPercentage,
              totalRatings: ratingsData.length,
              popularCardsCount,
              locationMatch,
            });
          }
        }
        
        // Smart sorting: prioritize location match, wishlist matches, popular cards, and ratings
        vendorData.sort((a, b) => {
          // 1. Location match (same country as user) - highest priority
          if (a.locationMatch !== b.locationMatch) {
            return a.locationMatch ? -1 : 1;
          }
          
          // 2. Wishlist matches - very important
          if (a.wishlistMatches !== b.wishlistMatches) {
            return b.wishlistMatches - a.wishlistMatches;
          }
          
          // 3. Popular cards count - helps discover new cards
          if (a.popularCardsCount !== b.popularCardsCount) {
            return b.popularCardsCount - a.popularCardsCount;
          }
          
          // 4. Rating percentage - quality indicator
          const aRating = a.ratingPercentage || 0;
          const bRating = b.ratingPercentage || 0;
          if (aRating !== bRating) {
            return bRating - aRating;
          }
          
          // 5. Total inventory size - more options
          return b.totalCards - a.totalCards;
        });
        
        setVendors(vendorData);
      } catch (error) {
        console.error("Failed to load marketplace:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVendors();
  }, [db, wishlistItems]);

  // Lazy load community images for all vendor inventories
  useEffect(() => {
    if (vendors.length === 0) {
      setEnrichedVendors([]);
      return;
    }
    
    // Check if any cards are missing images
    const hasCardsWithoutImages = vendors.some(vendor => 
      vendor.inventory.some(item => !item.image)
    );
    
    // No cards without images? No need to fetch community images
    if (!hasCardsWithoutImages) {
      setEnrichedVendors(vendors);
      return;
    }
    
    // Cards without images exist - check if we have community images
    if (!communityImages && refreshCommunityImages) {
      // Lazy load community images on first need
      console.log('📸 Lazy loading community images for marketplace...');
      refreshCommunityImages().then(() => {
        // After loading, apply images (will trigger this effect again with communityImages populated)
      });
      // Set vendors without enrichment for now
      setEnrichedVendors(vendors);
      return;
    }
    
    // We have community images - enrich all vendor inventories
    const enriched = vendors.map(vendor => ({
      ...vendor,
      inventory: vendor.inventory.map(item => {
        if (item.image) return item;
        const communityImage = getImageForCard(item);
        return communityImage ? { ...item, image: communityImage } : item;
      })
    }));
    
    setEnrichedVendors(enriched);
  }, [vendors, communityImages, getImageForCard, refreshCommunityImages]);

  // Generate recommendations based on collector's collection
  const recommendations = useMemo(() => {
    if (enrichedVendors.length === 0 || collectionItems.length === 0) return [];

    // Extract sets and types from collector's collection
    const collectorSets = new Set(collectionItems.map(item => item.set).filter(Boolean));
    const collectorTypes = new Set(collectionItems.map(item => item.type).filter(Boolean));
    
    // Find cards in vendor inventories that match collector's interests
    const allVendorCards = [];
    enrichedVendors.forEach(vendor => {
      vendor.inventory.forEach(card => {
        // Skip if collector already has this card
        const alreadyHas = collectionItems.some(c => 
          c.cardId === card.cardId || 
          (c.name === card.name && c.set === card.set && c.number === card.number)
        );
        if (alreadyHas) return;

        // Score based on set and type match
        let score = 0;
        if (collectorSets.has(card.set)) score += 2;
        if (collectorTypes.has(card.type)) score += 1;

        if (score > 0) {
          allVendorCards.push({
            ...card,
            vendorId: vendor.userId,
            vendorName: vendor.profile.username,
            wishlistMatchCount: vendor.wishlistMatches,
            score,
          });
        }
      });
    });

    // Sort by score and take top 5 unique cards (reduced from 10 for split layout)
    const uniqueCards = [];
    const seenCards = new Set();
    
    allVendorCards
      .sort((a, b) => b.score - a.score)
      .forEach(card => {
        const key = `${card.name}-${card.set}-${card.number}`;
        if (!seenCards.has(key) && uniqueCards.length < 5) {
          seenCards.add(key);
          uniqueCards.push(card);
        }
      });

    return uniqueCards;
  }, [enrichedVendors, collectionItems]);

  // Generate recommended vendors
  const recommendedVendors = useMemo(() => {
    if (enrichedVendors.length === 0) return [];

    const userCountry = userProfile?.country;
    
    // Score vendors based on:
    // 1. Wishlist matches (most important)
    // 2. Same country as user
    // 3. Total inventory size
    const scoredVendors = enrichedVendors.map(vendor => {
      let score = 0;
      
      // Wishlist matches (10 points each)
      score += vendor.wishlistMatches * 10;
      
      // Same country (20 points)
      if (userCountry && vendor.profile.country === userCountry) {
        score += 20;
      }
      
      // Inventory size (0.1 points per card, max 10 points)
      score += Math.min(vendor.totalCards * 0.1, 10);
      
      return {
        ...vendor,
        recommendationScore: score,
      };
    });
    
    // Sort by score and take top 5
    return scoredVendors
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 5);
  }, [enrichedVendors, userProfile]);

  // Get all unique countries from vendors
  const availableCountries = useMemo(() => {
    const countries = new Set();
    enrichedVendors.forEach(vendor => {
      if (vendor.profile.country) {
        countries.add(vendor.profile.country);
      }
    });
    return Array.from(countries).sort();
  }, [enrichedVendors]);

  // Search results: unified card and vendor search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { cards: [], vendors: [] };

    const term = searchQuery.toLowerCase();
    const cardResults = new Map(); // key: cardId or name+set+number, value: { card, vendors: [] }
    const vendorResults = [];

    enrichedVendors.forEach(vendor => {
      // Check if vendor name matches
      const vendorMatches = vendor.profile.username?.toLowerCase().includes(term);
      if (vendorMatches) {
        vendorResults.push(vendor);
      }

      // Check inventory for card matches
      if (searchMode === "all" || searchMode === "cards") {
        vendor.inventory.forEach(card => {
          const cardMatches = 
            String(card.name || "").toLowerCase().includes(term) ||
            String(card.set || "").toLowerCase().includes(term) ||
            String(card.number || "").toLowerCase().includes(term);

          if (cardMatches) {
            const key = card.cardId || `${card.name}-${card.set}-${card.number}`;
            if (!cardResults.has(key)) {
              cardResults.set(key, { card, vendors: [] });
            }
            cardResults.get(key).vendors.push({
              ...vendor,
              cardInstance: card, // Specific instance with condition and price
            });
          }
        });
      }
    });

    return {
      cards: Array.from(cardResults.values()),
      vendors: searchMode === "cards" ? [] : vendorResults,
    };
  }, [searchQuery, enrichedVendors, searchMode]);

  // Get market price for a card (based on collector's preference)
  const getMarketPrice = (card) => {
    if (!card || !card.prices) return 0;
    
    if (marketSource === "tcg") {
      // Pass the full card object, not just prices
      return computeTcgPrice(card, card.condition || "NM");
    } else {
      // Pass the full card object, not just prices
      return getCardmarketAvg(card) || getCardmarketLowest(card) || 0;
    }
  };

  // Get vendor's asking price for a card (respecting their round-up preference)
  const getVendorPrice = (card, vendorRoundUpPrices = false) => {
    if (!card) return 0;
    
    let price;
    
    // Use override price if vendor manually set it
    if (card.overridePrice != null && !isNaN(Number(card.overridePrice))) {
      price = Number(card.overridePrice);
    }
    // Use pre-calculated suggested price if available
    else if (card.calculatedSuggestedPrice != null && !isNaN(Number(card.calculatedSuggestedPrice))) {
      price = Number(card.calculatedSuggestedPrice);
    }
    // Calculate on the fly
    else {
      const metrics = computeItemMetrics(card);
      price = metrics.suggested;
    }
    
    // Apply vendor's round-up preference to all prices
    return vendorRoundUpPrices ? Math.ceil(price) : price;
  };

  // Format price
  const formatPrice = (value) => formatCurrency(Number(value ?? 0), currency);

  // Open card detail modal
  const handleCardClick = (cardData) => {
    setSelectedCard(cardData);
  };

  // Open vendor inventory modal
  const handleVendorClick = (vendor) => {
    // Navigate directly to vendor's full profile page
    navigate(`/collector/vendor-profile?vendor=${vendor.userId}`);
  };

  // Toggle card selection in vendor inventory
  const toggleCardSelection = (card) => {
    setSelectedCardsFromVendor(prev => {
      const isSelected = prev.some(c => c === card);
      if (isSelected) {
        return prev.filter(c => c !== card);
      } else {
        return [...prev, card];
      }
    });
  };

  // Open message modal
  const handleOpenMessage = (vendor, cards = []) => {
    setMessageModal({ vendor, cards });
  };

  // Send message - Create conversation and navigate to messages
  const handleSendMessage = async () => {
    if (!user || !db || !messageModal) return;

    try {
      // Check if conversation already exists
      const conversationsRef = collection(db, "conversations");
      const q = query(
        conversationsRef,
        where("participants", "array-contains", user.uid)
      );
      const snapshot = await getDocs(q);
      
      let existingConvo = null;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.participants.includes(messageModal.vendor.userId)) {
          existingConvo = doc.id;
        }
      });

      const vendorId = messageModal.vendor.userId;

      if (existingConvo) {
        // Navigate to existing conversation
        navigate(`/collector/messages?conversation=${existingConvo}`);
      } else {
        // Create new conversation
        const newConvo = await addDoc(conversationsRef, {
          participants: [user.uid, vendorId],
          createdAt: serverTimestamp(),
          lastMessage: messageModal.cards.length > 0 
            ? `Interested in ${messageModal.cards.length} card(s)` 
            : "New inquiry",
          lastMessageAt: serverTimestamp()
        });
        
        // Send initial message about selected cards if any
        if (messageModal.cards.length > 0) {
          const messagesRef = collection(db, "conversations", newConvo.id, "messages");
          const cardList = messageModal.cards.map(c => `- ${c.name} (${c.set} #${c.number})`).join('\n');
          await addDoc(messagesRef, {
            text: `Hi! I'm interested in the following cards:\n\n${cardList}`,
            imageUrl: null,
            senderId: user.uid,
            createdAt: serverTimestamp()
          });
        }
        
        navigate(`/collector/messages?conversation=${newConvo.id}`);
      }
      
      setMessageModal(null);
      setSelectedVendor(null);
    } catch (error) {
      console.error("Failed to start conversation:", error);
      alert("Failed to start conversation. Please try again.");
    }
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Please sign in to browse the marketplace.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <ShoppingBag className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-3xl font-bold">Marketplace</h1>
          <p className="text-muted-foreground">Find vendors with cards you're looking for</p>
        </div>
      </div>

      {/* Vendor Toolkit Promotion - Only show if user doesn't have vendor access */}
      {!userProfile?.vendorAccess?.enabled && !userProfile?.isVendor && !vendorCtaDismissed && (
        <Card className="rounded-2xl shadow mb-4 border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 relative">
          <button
            onClick={dismissVendorCta}
            className="absolute top-3 right-3 p-1 hover:bg-green-200 rounded-full transition-colors z-10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-green-700" />
          </button>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="bg-green-600 p-3 rounded-xl flex-shrink-0">
                <Store className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="font-bold text-green-900 text-lg mb-1">
                  Are You a Vendor? Join Our Marketplace! 🎉
                </h3>
                <p className="text-sm text-green-700">
                  Get access to professional inventory management, analytics, and connect with collectors looking for your cards.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setVendorRequestModalOpen(true)}
                >
                  Request Early Access
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Access Buttons */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-3">
            <Link to="/collector/collection">
              <Button variant="outline" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                My Collection
              </Button>
            </Link>
            <Link to="/collector/wishlist">
              <Button variant="outline" className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Wishlist
              </Button>
            </Link>
            <Link to="/collector/search">
              <Button variant="outline" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Card Search
              </Button>
            </Link>
            <Link to="/user/profile">
              <Button variant="outline" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile & Settings
              </Button>
            </Link>
            {userProfile?.isVendor && (
              <Link to="/vendor/inventory">
                <Button variant="outline" className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Vendor Toolkit
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search Bar */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Search for cards or vendors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-background"
                >
                  <option value="">All Countries</option>
                  {availableCountries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={searchMode === "all" ? "default" : "outline"}
                onClick={() => setSearchMode("all")}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={searchMode === "cards" ? "default" : "outline"}
                onClick={() => setSearchMode("cards")}
              >
                Cards Only
              </Button>
              <Button
                size="sm"
                variant={searchMode === "vendors" ? "default" : "outline"}
                onClick={() => setSearchMode("vendors")}
              >
                Vendors Only
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Loading marketplace...
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {!loading && searchQuery.trim() && (
        <>
          {/* Card Results */}
          {searchResults.cards.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3">Card Results ({searchResults.cards.length})</h2>
              <div className="grid gap-3">
                {searchResults.cards.map((result, idx) => {
                  const marketPrice = getMarketPrice(result.card);
                  return (
                    <Card
                      key={idx}
                      className="rounded-2xl p-4 hover:bg-accent/40 transition cursor-pointer"
                      onClick={() => handleCardClick(result)}
                    >
                      <div className="flex gap-4 items-center">
                        {/* Card Image */}
                        {result.card.image && (
                          <div className="flex-shrink-0">
                            <img
                              src={result.card.image}
                              alt={result.card.name}
                              className="w-20 h-28 object-contain rounded-lg border shadow-sm"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="font-bold">{result.card.name}</h3>
                          <div className="text-sm text-muted-foreground">
                            {result.card.set} · #{result.card.number}
                          </div>
                          <div className="text-sm mt-2">
                            <span className="text-muted-foreground">Market Price:</span>{" "}
                            <span className="font-semibold">{formatPrice(marketPrice)}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col gap-2 items-end">
                          <div>
                            <div className="text-sm text-muted-foreground">Available from</div>
                            <div className="text-2xl font-bold text-green-600">
                              {result.vendors.length}
                            </div>
                            <div className="text-sm text-muted-foreground">vendor{result.vendors.length !== 1 ? 's' : ''}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!user) {
                                alert("Please sign in to add cards to your wishlist");
                                return;
                              }
                              try {
                                await addToWishlist(result.card);
                                triggerQuickAddFeedback(`${result.card.name} added to wishlist`);
                              } catch (error) {
                                console.error("Error adding to wishlist:", error);
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <Heart className="h-3 w-3" />
                            Add to Wishlist
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vendor Results */}
          {searchResults.vendors.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3">Vendor Results ({searchResults.vendors.length})</h2>
              <div className="grid gap-3">
                {searchResults.vendors.map((vendor) => (
                  <Card
                    key={vendor.userId}
                    className="rounded-2xl p-4 hover:bg-accent/40 transition cursor-pointer"
                    onClick={() => handleVendorClick(vendor)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {vendor.profile.photoURL ? (
                          <img
                            src={vendor.profile.photoURL}
                            alt={vendor.profile.username}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <Store className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold">{vendor.profile.username}</h3>
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                              VENDOR
                            </span>
                          </div>
                          {vendor.profile.country && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <MapPin className="h-3 w-3" />
                              {vendor.profile.country}
                            </div>
                          )}
                          {vendor.ratingPercentage !== null && (
                            <div className="flex items-center gap-1 text-sm mt-1">
                              <ThumbsUp className="h-3 w-3 text-green-600" />
                              <span className="font-semibold">{vendor.ratingPercentage}%</span>
                              <span className="text-muted-foreground">({vendor.totalRatings})</span>
                            </div>
                          )}
                          <div className="text-sm mt-2">
                            <span className="text-muted-foreground">Total Cards:</span>{" "}
                            <span className="font-semibold">{vendor.totalCards}</span>
                            {vendor.wishlistMatches > 0 && (
                              <span className="ml-3 text-green-600 font-semibold">
                                <Star className="h-4 w-4 inline fill-current mr-1" />
                                {vendor.wishlistMatches} Wishlist Match{vendor.wishlistMatches !== 1 ? 'es' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button size="sm">
                        View Inventory
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {searchResults.cards.length === 0 && searchResults.vendors.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-3" />
                <p>No cards or vendors found matching "{searchQuery}"</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Recommendations (shown when no search) */}
      {!loading && !searchQuery.trim() && (
        <>
          {/* Recommendations Section - Split into Cards and Vendors */}
          {(recommendations.length > 0 || recommendedVendors.length > 0) && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <h2 className="text-2xl font-bold">Recommended for You</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Based on your collection, wishlist, and location
              </p>
              
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Recommended Cards Column */}
                <div>
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <Package className="h-5 w-5 text-green-600" />
                    Cards You Might Like
                  </h3>
                  {recommendations.length > 0 ? (
                    <div className="space-y-3">
                      {recommendations.map((card, idx) => {
                        const marketPrice = getMarketPrice(card);
                        return (
                          <Card
                            key={idx}
                            className="rounded-xl p-3 hover:bg-accent/40 transition cursor-pointer"
                            onClick={() => {
                              const vendor = vendors.find(v => v.userId === card.vendorId);
                              handleCardClick({
                                card,
                                vendors: vendor ? [{
                                  ...vendor,
                                  cardInstance: card,
                                }] : [],
                              });
                            }}
                          >
                            <div className="flex gap-3">
                              {card.image && (
                                <div className="flex-shrink-0">
                                  <img
                                    src={card.image}
                                    alt={card.name}
                                    className="w-16 h-22 object-contain rounded border shadow-sm"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm">{card.name}</h4>
                                <div className="text-xs text-muted-foreground">
                                  {card.set} · #{card.number}
                                </div>
                                <div className="text-sm mt-1">
                                  <span className="font-semibold text-green-600">{formatPrice(marketPrice)}</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  from {card.vendorName}
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <Card className="rounded-xl p-6 text-center">
                      <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Add cards to your collection to see personalized recommendations
                      </p>
                    </Card>
                  )}
                </div>

                {/* Recommended Vendors Column */}
                <div>
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <Store className="h-5 w-5 text-purple-600" />
                    Top Vendors for You
                  </h3>
                  {recommendedVendors.length > 0 ? (
                    <div className="space-y-3">
                      {recommendedVendors.map((vendor, idx) => (
                        <Card
                          key={idx}
                          className="rounded-xl p-3 hover:bg-accent/40 transition cursor-pointer"
                          onClick={() => handleVendorClick(vendor)}
                        >
                          <div className="flex items-start gap-3">
                            {vendor.profile.photoURL ? (
                              <img
                                src={vendor.profile.photoURL}
                                alt={vendor.profile.username}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <Store className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{vendor.profile.username}</span>
                                {vendor.profile.country === userProfile?.country && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                    {vendor.profile.country}
                                  </span>
                                )}
                              </div>
                              {vendor.profile.country && vendor.profile.country !== userProfile?.country && (
                                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <MapPin className="h-3 w-3" />
                                  {vendor.profile.country}
                                </div>
                              )}
                              {vendor.ratingPercentage !== null && (
                                <div className="flex items-center gap-1 text-xs mt-1">
                                  <ThumbsUp className="h-3 w-3 text-green-600" />
                                  <span className="font-semibold">{vendor.ratingPercentage}%</span>
                                </div>
                              )}
                              <div className="flex items-center gap-3 text-xs mt-2">
                                <span className="text-muted-foreground">{vendor.totalCards} cards</span>
                                {vendor.wishlistMatches > 0 && (
                                  <span className="text-green-600 font-semibold flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-current" />
                                    {vendor.wishlistMatches} matches
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="rounded-xl p-6 text-center">
                      <Store className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No vendors available yet
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* All Vendors Summary */}
          <div className="mb-4">
            <h2 className="text-xl font-bold mb-3">Browse All Vendors</h2>
            <Card className="rounded-2xl p-4 shadow mb-4">
              <CardContent className="p-0">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {countryFilter ? `Vendors in ${countryFilter}` : 'Total Vendors'}
                    </div>
                    <div className="text-2xl font-bold">
                      {enrichedVendors.filter(v => !countryFilter || v.profile.country === countryFilter).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Wishlist Items</div>
                    <div className="text-2xl font-bold">{wishlistItems.length}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Vendors with Matches</div>
                    <div className="text-2xl font-bold text-green-600">
                      {enrichedVendors.filter(v => v.wishlistMatches > 0 && (!countryFilter || v.profile.country === countryFilter)).length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Vendors List */}
          <div className="grid gap-3">
            {vendors
              .filter(vendor => !countryFilter || vendor.profile.country === countryFilter)
              .map((vendor) => (
              <Card
                key={vendor.userId}
                className="rounded-2xl p-4 hover:bg-accent/40 transition cursor-pointer"
                onClick={() => handleVendorClick(vendor)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {vendor.profile.photoURL ? (
                      <img
                        src={vendor.profile.photoURL}
                        alt={vendor.profile.username}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <Store className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold">{vendor.profile.username}</h3>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                          VENDOR
                        </span>
                      </div>
                      {vendor.profile.country && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <MapPin className="h-3 w-3" />
                          {vendor.profile.country}
                        </div>
                      )}
                      {vendor.ratingPercentage !== null && (
                        <div className="flex items-center gap-1 text-sm mt-1">
                          <ThumbsUp className="h-3 w-3 text-green-600" />
                          <span className="font-semibold">{vendor.ratingPercentage}%</span>
                          <span className="text-muted-foreground">({vendor.totalRatings})</span>
                        </div>
                      )}
                      <div className="text-sm mt-2">
                        <span className="text-muted-foreground">Total Cards:</span>{" "}
                        <span className="font-semibold">{vendor.totalCards}</span>
                        {vendor.wishlistMatches > 0 && (
                          <span className="ml-3 text-green-600 font-semibold">
                            <Star className="h-4 w-4 inline fill-current mr-1" />
                            {vendor.wishlistMatches} Wishlist Match{vendor.wishlistMatches !== 1 ? 'es' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button size="sm">
                    View Inventory
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Card Detail Modal */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex gap-4 flex-1">
                  {/* Card Image */}
                  {selectedCard.card.image && (
                    <div className="flex-shrink-0">
                      <img
                        src={selectedCard.card.image}
                        alt={selectedCard.card.name}
                        className="w-32 h-44 object-contain rounded-lg border shadow-md"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{selectedCard.card.name}</h2>
                    <div className="text-muted-foreground">
                      {selectedCard.card.set} · #{selectedCard.card.number}
                    </div>
                    {selectedCard.card.type && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {selectedCard.card.type}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedCard(null)}
                  className="flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Market Price */}
              <div className="bg-muted/50 rounded-lg p-4 mb-4">
                <div className="text-sm text-muted-foreground">Market Price</div>
                <div className="text-3xl font-bold text-green-600">
                  {formatPrice(getMarketPrice(selectedCard.card))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {marketSource === "tcg" ? "TCGplayer" : "CardMarket"} · 30-day average
                </div>
              </div>

              {/* Vendor Listings */}
              <h3 className="font-bold mb-3">Available from {selectedCard.vendors.length} vendor{selectedCard.vendors.length !== 1 ? 's' : ''}</h3>
              <div className="space-y-2">
                {selectedCard.vendors.map((vendor, idx) => {
                  const vendorPrice = getVendorPrice(vendor.cardInstance, vendor.roundUpPrices);
                  return (
                    <div
                      key={idx}
                      className="border rounded-lg p-4 hover:bg-accent/20 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold">{vendor.profile.username}</span>
                            {vendor.profile.country && (
                              <span className="text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 inline mr-1" />
                                {vendor.profile.country}
                              </span>
                            )}
                            {vendor.wishlistMatches > 0 && (
                              <span className="text-xs text-green-600">
                                <Star className="h-3 w-3 inline fill-current mr-1" />
                                {vendor.wishlistMatches} wishlist items
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Condition:</span>{" "}
                              {vendor.cardInstance.isGraded && vendor.cardInstance.gradingCompany && vendor.cardInstance.grade ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-900">
                                  <Award className="h-3 w-3" />
                                  {vendor.cardInstance.gradingCompany} {vendor.cardInstance.grade}
                                </span>
                              ) : (
                                <span className="font-semibold">{vendor.cardInstance.condition || "N/A"}</span>
                              )}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Asking Price:</span>{" "}
                              <span className="font-semibold text-lg text-purple-600">
                                {formatPrice(vendorPrice)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenMessage(vendor, [vendor.cardInstance]);
                          }}
                        >
                          <MessageCircle className="mr-1 h-4 w-4" />
                          Contact
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Message Modal */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-2xl w-full">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Message {messageModal.vendor.profile.username}</h2>
                  <div className="text-sm text-muted-foreground">
                    {messageModal.cards.length > 0 
                      ? `Inquiring about ${messageModal.cards.length} card${messageModal.cards.length !== 1 ? 's' : ''}`
                      : 'General inquiry'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMessageModal(null)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {messageModal.cards.length > 0 && (
                <div className="bg-muted rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Cards of Interest:</div>
                  {messageModal.cards.map((card, idx) => (
                    <div key={idx} className="text-sm">
                      · {card.name} ({card.set} #{card.number}) - {card.condition}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Your Message</label>
                  <textarea
                    className="w-full border rounded-lg p-3 min-h-32"
                    placeholder="Hi! I'm interested in the cards listed above. Are they still available?"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setMessageModal(null)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSendMessage}>
                    <Mail className="mr-1 h-4 w-4" />
                    Send Message
                  </Button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                💡 <strong>Coming Soon:</strong> Full messaging system with real-time notifications and image uploads!
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
