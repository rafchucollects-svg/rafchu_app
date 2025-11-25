import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, MapPin, Instagram, Youtube, MessageCircle, ThumbsUp, Search, Package, Heart, Award } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, computeItemMetrics, getConditionColorClass } from "@/utils/cardHelpers";
import { getDoc, doc, collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Vendor Profile Page
 * Displays vendor's profile, social links, ratings, and inventory
 */

export function VendorProfile() {
  const { db, user, currency, addToWishlist, triggerQuickAddFeedback, communityImages, getImageForCard, refreshCommunityImages } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vendorId = searchParams.get("vendor");
  
  const [vendor, setVendor] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [enrichedInventory, setEnrichedInventory] = useState([]);
  const [vendorRoundUpPrices, setVendorRoundUpPrices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [conditionFilter, setConditionFilter] = useState(""); // "NM", "LP", "MP", "HP", "DMG", or "" for all
  const [ratingPercentage, setRatingPercentage] = useState(null);
  const [totalRatings, setTotalRatings] = useState(0);
  const [selectedCards, setSelectedCards] = useState([]); // For card selection

  // Load vendor profile and inventory
  useEffect(() => {
    if (!db || !vendorId) {
      setLoading(false);
      return;
    }

    const loadVendor = async () => {
      try {
        setLoading(true);
        
        // Load vendor profile
        const userRef = doc(db, "users", vendorId);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          setLoading(false);
          return;
        }
        
        const profile = userSnap.data();
        
        // Only show vendor profiles
        if (!profile.isVendor) {
          setLoading(false);
          return;
        }
        
        setVendor({ id: vendorId, ...profile });
        
        // Load inventory
        const inventoryRef = doc(db, "collections", vendorId);
        const inventorySnap = await getDoc(inventoryRef);
        
        if (inventorySnap.exists()) {
          const data = inventorySnap.data();
          const allItems = Array.isArray(data.items) ? data.items : [];
          // Filter out excluded cards
          const items = allItems.filter(item => !item.excludeFromSale);
          setInventory(items);
          
          // Get vendor's round-up prices preference
          if (typeof data.roundUp === "boolean") {
            setVendorRoundUpPrices(data.roundUp);
          }
        }
      } catch (error) {
        console.error("Failed to load vendor:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVendor();
  }, [db, vendorId]);

  // Load vendor ratings
  useEffect(() => {
    if (!db || !vendorId) return;

    const loadRatings = async () => {
      try {
        const ratingsQuery = query(
          collection(db, "ratings"),
          where("toUserId", "==", vendorId)
        );
        const snapshot = await getDocs(ratingsQuery);
        const ratingsData = snapshot.docs.map(doc => doc.data());
        
        setTotalRatings(ratingsData.length);
        
        // Calculate thumbs up percentage
        if (ratingsData.length > 0) {
          const thumbsUpCount = ratingsData.filter(r => r.thumbsUp === true).length;
          const percentage = Math.round((thumbsUpCount / ratingsData.length) * 100);
          setRatingPercentage(percentage);
        } else {
          setRatingPercentage(null);
        }
      } catch (error) {
        console.error("Failed to load ratings:", error);
      }
    };

    loadRatings();
  }, [db, vendorId]);

  // Lazy load community images only if needed
  useEffect(() => {
    const cardsWithoutImages = inventory.filter(item => !item.image);
    
    // No cards without images? No need to fetch community images
    if (cardsWithoutImages.length === 0) {
      setEnrichedInventory(inventory);
      return;
    }
    
    // Cards without images exist - check if we have community images
    if (!communityImages && refreshCommunityImages) {
      // Lazy load community images on first need
      console.log('📸 Lazy loading community images for vendor profile...');
      refreshCommunityImages().then(() => {
        // After loading, apply images (will trigger this effect again with communityImages populated)
      });
      // Set items without enrichment for now
      setEnrichedInventory(inventory);
      return;
    }
    
    // We have community images - apply them
    const enriched = inventory.map(item => {
      if (item.image) return item;
      const communityImage = getImageForCard(item);
      return communityImage ? { ...item, image: communityImage } : item;
    });
    
    setEnrichedInventory(enriched);
  }, [inventory, communityImages, getImageForCard, refreshCommunityImages]);

  // Start conversation with vendor
  const handleMessageVendor = async () => {
    if (!user || !db) {
      alert("Please sign in to message vendors");
      return;
    }

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
        if (data.participants.includes(vendorId)) {
          existingConvo = doc.id;
        }
      });

      if (existingConvo) {
        // Navigate to existing conversation
        navigate(`/collector/messages?conversation=${existingConvo}`);
      } else {
        // Create new conversation
        const newConvo = await addDoc(conversationsRef, {
          participants: [user.uid, vendorId],
          createdAt: serverTimestamp(),
          lastMessage: "",
          lastMessageAt: serverTimestamp()
        });
        
        navigate(`/collector/messages?conversation=${newConvo.id}`);
      }
    } catch (error) {
      console.error("Failed to start conversation:", error);
      alert("Failed to start conversation. Please try again.");
    }
  };

  // Toggle card selection
  const toggleCardSelection = (card) => {
    setSelectedCards(prev => {
      const isSelected = prev.some(c => c.entryId === card.entryId);
      if (isSelected) {
        return prev.filter(c => c.entryId !== card.entryId);
      } else {
        return [...prev, card];
      }
    });
  };

  // Inquire about selected cards
  const handleInquireAboutSelected = async () => {
    if (!user || !db || selectedCards.length === 0) return;

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
        if (data.participants.includes(vendorId)) {
          existingConvo = doc.id;
        }
      });

      if (existingConvo) {
        // Send message about selected cards to existing conversation
        const messagesRef = collection(db, "conversations", existingConvo, "messages");
        const cardList = selectedCards.map(c => `- ${c.name} (${c.set} #${c.number})`).join('\n');
        await addDoc(messagesRef, {
          text: `Hi! I'm interested in the following cards:\n\n${cardList}`,
          imageUrl: null,
          senderId: user.uid,
          createdAt: serverTimestamp()
        });
        navigate(`/collector/messages?conversation=${existingConvo}`);
      } else {
        // Create new conversation with card list
        const newConvo = await addDoc(conversationsRef, {
          participants: [user.uid, vendorId],
          createdAt: serverTimestamp(),
          lastMessage: `Interested in ${selectedCards.length} card(s)`,
          lastMessageAt: serverTimestamp()
        });
        
        // Send initial message about selected cards
        const messagesRef = collection(db, "conversations", newConvo.id, "messages");
        const cardList = selectedCards.map(c => `- ${c.name} (${c.set} #${c.number})`).join('\n');
        await addDoc(messagesRef, {
          text: `Hi! I'm interested in the following cards:\n\n${cardList}`,
          imageUrl: null,
          senderId: user.uid,
          createdAt: serverTimestamp()
        });
        
        navigate(`/collector/messages?conversation=${newConvo.id}`);
      }
      
      setSelectedCards([]);
    } catch (error) {
      console.error("Failed to start conversation:", error);
      alert("Failed to start conversation. Please try again.");
    }
  };

  // Filter inventory
  const filteredItems = useMemo(() => {
    let items = enrichedInventory;
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(item =>
        String(item.name || "").toLowerCase().includes(term) ||
        String(item.set || "").toLowerCase().includes(term) ||
        String(item.number || "").toLowerCase().includes(term)
      );
    }
    
    // Filter by condition
    if (conditionFilter) {
      items = items.filter(item => 
        (item.condition || "NM").toUpperCase() === conditionFilter
      );
    }
    
    return items;
  }, [enrichedInventory, searchTerm, conditionFilter]);

  // Sort inventory
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
        let aPrice = a.overridePrice ?? a.calculatedSuggestedPrice ?? aMetrics.suggested;
        let bPrice = b.overridePrice ?? b.calculatedSuggestedPrice ?? bMetrics.suggested;
        // Apply rounding if vendor preference is enabled
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

  const formatPrice = (amount) => formatCurrency(amount, currency);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            Loading vendor profile...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">Vendor Not Found</p>
            <p className="text-muted-foreground">
              This vendor profile doesn't exist or is not available.
            </p>
            <Link to="/collector/marketplace">
              <Button className="mt-4" variant="outline">
                Back to Marketplace
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Vendor Header */}
      <Card className="rounded-2xl p-6 shadow">
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-4">
            {vendor.photoURL ? (
              <img
                src={vendor.photoURL}
                alt={vendor.username || vendor.displayName}
                className="h-24 w-24 rounded-full object-cover border-4 border-primary shadow-lg"
              />
            ) : (
              <Store className="h-16 w-16 text-primary p-3 bg-primary/10 rounded-full" />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold">{vendor.username || vendor.displayName}</h1>
              {vendor.country && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1">
                  <MapPin className="h-4 w-4" />
                  <span>{vendor.country}</span>
                </div>
              )}
              {/* Rating display */}
              <div className="flex items-center gap-2 mt-2">
                {ratingPercentage !== null ? (
                  <>
                    <ThumbsUp className="h-5 w-5 text-green-600" />
                    <span className="font-semibold">{ratingPercentage}%</span>
                    <span className="text-sm text-muted-foreground">
                      ({totalRatings} rating{totalRatings !== 1 ? 's' : ''})
                    </span>
                  </>
                ) : (
                  <>
                    <ThumbsUp className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold">New Vendor</span>
                    <span className="text-sm text-muted-foreground">(No ratings yet)</span>
                  </>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {vendor.socialLinks?.instagram && (
                <a
                  href={vendor.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-accent"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </a>
              )}
              {vendor.socialLinks?.youtube && (
                <a
                  href={vendor.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-accent"
                >
                  <Youtube className="h-4 w-4" />
                  YouTube
                </a>
              )}
              {user && user.uid !== vendorId && (
                <Button 
                  className="flex items-center gap-2"
                  onClick={handleMessageVendor}
                >
                  <MessageCircle className="h-4 w-4" />
                  Message Vendor
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Section */}
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Inventory ({inventory.length} cards)</h2>
          </div>
          
          {/* Search, Filter, and Sort */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm bg-background"
            >
              <option value="">All Conditions</option>
              <option value="NM">Near Mint (NM)</option>
              <option value="LP">Lightly Played (LP)</option>
              <option value="MP">Moderately Played (MP)</option>
              <option value="HP">Heavily Played (HP)</option>
              <option value="DMG">Damaged (DMG)</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm bg-background"
            >
              <option value="name">Sort by Name</option>
              <option value="set">Sort by Set</option>
              <option value="price">Sort by Price</option>
              <option value="dateAdded">Sort by Date Added</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Selection Actions */}
      {selectedCards.length > 0 && user && user.uid !== vendorId && (
        <Card className="rounded-2xl p-4 shadow">
          <CardContent className="p-0">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">{selectedCards.length}</span> card{selectedCards.length !== 1 ? 's' : ''} selected
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedCards([])}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleInquireAboutSelected}
                  >
                    <MessageCircle className="mr-1 h-4 w-4" />
                    Inquire About Selected
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Grid */}
      <div className="grid gap-3">
        {sortedItems.length === 0 && inventory.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              This vendor has no items for sale.
            </CardContent>
          </Card>
        )}
        {sortedItems.length === 0 && inventory.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards match your search.
            </CardContent>
          </Card>
        )}
        {sortedItems.map((item) => {
          const metrics = computeItemMetrics(item, currency);
          const isSelected = selectedCards.some(c => c.entryId === item.entryId);
          
          // Calculate display price with vendor's rounding preference
          let displayPrice;
          if (item.overridePrice != null) {
            displayPrice = item.overridePrice;
          } else if (item.isGraded && item.gradedPrice) {
            // For graded cards, ALWAYS use fresh calculation with currency conversion
            displayPrice = metrics.suggested;
          } else if (item.calculatedSuggestedPrice != null) {
            displayPrice = item.calculatedSuggestedPrice;
          } else {
            displayPrice = metrics.suggested;
          }
          
          // Apply vendor's round-up preference to all prices
          if (vendorRoundUpPrices) {
            displayPrice = Math.ceil(displayPrice);
          }
          
          return (
            <Card
              key={item.entryId}
              className={`rounded-2xl p-3 hover:shadow-lg transition-all duration-200 ${
                isSelected ? 'bg-purple-100 border-purple-400 border-2' : 'hover:bg-accent/40'
              } ${user && user.uid !== vendorId ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (user && user.uid !== vendorId) {
                  toggleCardSelection(item);
                }
              }}
            >
              <div className="flex items-center gap-3">
                {user && user.uid !== vendorId && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="h-4 w-4 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-16 rounded-lg object-cover shadow-sm"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.set} • {item.rarity} • #{item.number}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity || 1}</span>
                    {item.isGraded && item.gradingCompany && item.grade ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded border border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-900 flex items-center gap-1">
                        <Award className="h-3 w-3" />
                        {item.gradingCompany} {item.grade}
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${getConditionColorClass(item.condition)}`}>
                        {item.condition || "NM"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-center">
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
                  {user && user.uid !== vendorId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await addToWishlist(item);
                          triggerQuickAddFeedback(`${item.name} added to wishlist`);
                        } catch (error) {
                          console.error("Error adding to wishlist:", error);
                        }
                      }}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Heart className="h-3 w-3" />
                      Wishlist
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

