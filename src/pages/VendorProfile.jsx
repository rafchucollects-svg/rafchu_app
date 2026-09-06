import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, MapPin, Instagram, Youtube, MessageCircle, ThumbsUp, Search, Package, Heart, Award } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency, computeItemMetrics, getConditionColorClass, getConditionDisplayLabel } from "@/utils/cardHelpers";
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
        const userRef = doc(db, "public_profiles", vendorId);
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
        const inventoryRef = doc(db, "public_inventories", vendorId);
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

  const canInteract = user && user.uid !== vendorId;

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* ── Shop Banner ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            {vendor.photoURL ? (
              <img
                src={vendor.photoURL}
                alt={vendor.username || vendor.displayName}
                className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/30 shadow-xl"
              />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-white/20 flex items-center justify-center">
                <Store className="h-10 w-10 text-white/80" />
              </div>
            )}

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {vendor.username || vendor.displayName}
              </h1>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2 text-sm text-white/80">
                {vendor.country && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {vendor.country}
                  </span>
                )}
                {ratingPercentage !== null ? (
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5 text-green-300" />
                    <span className="font-semibold text-white">{ratingPercentage}%</span>
                    ({totalRatings} rating{totalRatings !== 1 ? "s" : ""})
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5" /> New Vendor
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {inventory.length} item{inventory.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 justify-center">
              {vendor.socialLinks?.instagram && (
                <a
                  href={vendor.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium transition-colors"
                >
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              )}
              {vendor.socialLinks?.youtube && (
                <a
                  href={vendor.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium transition-colors"
                >
                  <Youtube className="h-4 w-4" /> YouTube
                </a>
              )}
              {canInteract && (
                <button
                  onClick={handleMessageVendor}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-indigo-700 font-semibold text-sm hover:bg-white/90 transition-colors shadow"
                >
                  <MessageCircle className="h-4 w-4" /> Message
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Shop Toolbar ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-lg border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <select
            value={conditionFilter}
            onChange={(e) => setConditionFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">All Conditions</option>
            <option value="NM">Near Mint</option>
            <option value="LP">Lightly Played</option>
            <option value="MP">Moderately Played</option>
            <option value="HP">Heavily Played</option>
            <option value="DMG">Damaged</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="name">Sort: Name</option>
            <option value="set">Sort: Set</option>
            <option value="price">Sort: Price</option>
            <option value="dateAdded">Sort: Newest</option>
          </select>
        </div>
      </div>

      {/* ── Selection Bar (sticky bottom) ───────────────────────────────── */}
      {selectedCards.length > 0 && canInteract && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-indigo-600 text-white shadow-xl border-t border-indigo-500">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              <span className="text-lg font-bold">{selectedCards.length}</span> card{selectedCards.length !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCards([])}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/20 hover:bg-white/30 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleInquireAboutSelected}
                className="px-4 py-1.5 rounded-lg text-sm bg-white text-indigo-700 font-semibold hover:bg-white/90 transition-colors flex items-center gap-1.5"
              >
                <MessageCircle className="h-4 w-4" />
                Inquire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Grid ────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {sortedItems.length === 0 && inventory.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Store className="h-14 w-14 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-semibold">No items for sale</p>
            <p className="text-sm mt-1">This vendor hasn't listed any cards yet.</p>
          </div>
        )}
        {sortedItems.length === 0 && inventory.length > 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-14 w-14 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-semibold">No cards match your search</p>
            <p className="text-sm mt-1">Try adjusting your filters.</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {sortedItems.map((item) => {
            const metrics = computeItemMetrics(item, currency);
            const isSelected = selectedCards.some(c => c.entryId === item.entryId);

            let displayPrice;
            if (item.overridePrice != null) {
              displayPrice = item.overridePrice;
            } else if (item.isGraded && item.gradedPrice) {
              displayPrice = metrics.suggested;
            } else if (item.calculatedSuggestedPrice != null) {
              displayPrice = item.calculatedSuggestedPrice;
            } else {
              displayPrice = metrics.suggested;
            }
            if (vendorRoundUpPrices) displayPrice = Math.ceil(displayPrice);

            return (
              <div
                key={item.entryId}
                onClick={() => canInteract && toggleCardSelection(item)}
                className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-200 ${
                  canInteract ? "cursor-pointer" : ""
                } ${isSelected ? "ring-2 ring-indigo-500 ring-offset-2" : "hover:-translate-y-1 hover:scale-[1.03]"}`}
              >
                {/* Selection indicator */}
                {canInteract && (
                  <div className={`absolute top-2 left-2 z-10 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-white/70 bg-black/20 text-transparent group-hover:border-white group-hover:bg-black/30"
                  }`}>
                    {isSelected && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}

                {/* Card image */}
                <div className="aspect-[3/4] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-slate-300" />
                  )}
                </div>

                {/* Card info */}
                <div className="p-2.5">
                  {/* Condition / Graded badge + variant badges (below image) */}
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {item.isGraded && item.gradingCompany && item.grade ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-800 border border-amber-300 flex items-center gap-0.5">
                        <Award className="h-2.5 w-2.5" />
                        {item.gradingCompany} {item.grade}
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${getConditionColorClass(item.condition)}`}>
                        {getConditionDisplayLabel(item.condition || "NM")}
                      </span>
                    )}
                    {getVariantBadges(item).map((v) => (
                      <span key={v.key} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${v.color}`}>
                        {v.label}
                      </span>
                    ))}
                  </div>

                  <h3 className="font-semibold text-sm leading-tight truncate" title={item.name}>
                    {item.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={`${item.set} #${item.number}`}>
                    {item.set} {item.number ? `#${item.number}` : ""}
                  </p>
                  {item.quantity > 1 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">Qty: {item.quantity}</p>
                  )}

                  {/* Price */}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-base font-extrabold text-green-600">
                      {formatPrice(displayPrice)}
                    </span>
                    {canInteract && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await addToWishlist(item);
                            triggerQuickAddFeedback(`${item.name} added to wishlist`);
                          } catch (err) {
                            console.error("Error adding to wishlist:", err);
                          }
                        }}
                        className="p-1.5 rounded-full hover:bg-pink-50 text-slate-400 hover:text-pink-500 transition-colors"
                        title="Add to Wishlist"
                      >
                        <Heart className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom padding when selection bar is visible */}
        {selectedCards.length > 0 && canInteract && <div className="h-16" />}
      </div>
    </div>
  );
}

