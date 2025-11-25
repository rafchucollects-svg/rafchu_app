import { useMemo, useState, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Package, Trash2, ArrowRight, X, Download, Share2, Filter, Edit2, Check, Upload, Award } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { computeInventoryTotals, formatCurrency, saveCollection, computeTcgPrice, getCardmarketAvg, getCardmarketLowest, exportToCSV, getConditionColorClass, convertCurrency } from "@/utils/cardHelpers";
import { ConditionSelect, PriceRow } from "@/components/CardComponents";
import { CardBadges, CardPriceInfo, GradedCardInfo, VariantInfo } from "@/components/CardBadges";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { needsImage } from "@/utils/imageHelpers";

/**
 * My Collection Page (Collector Toolkit)
 * Displays and manages collector's personal collection with full Firestore integration
 */

export function MyCollection() {
  const {
    user,
    db,
    collectionItems,
    collectionSearch,
    setCollectionSearch,
    collectionSortBy,
    setCollectionSortBy,
    collectionSortDir,
    setCollectionSortDir,
    marketSource,
    currency,
    tradeItems,
    setTradeItems,
    triggerQuickAddFeedback,
    communityImages,
    getImageForCard,
    refreshCommunityImages,
  } = useApp();

  const [selectedForTrade, setSelectedForTrade] = useState(new Set());
  const [selectedCardDetails, setSelectedCardDetails] = useState(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUsername, setShareUsername] = useState("");
  
  // Edit condition/grade states
  const [editingCondition, setEditingCondition] = useState(false);
  const [editConditionValue, setEditConditionValue] = useState("");
  const [editGradingCompany, setEditGradingCompany] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [updatingGradePrice, setUpdatingGradePrice] = useState(false);
  
  // Filter states
  const [filterRarity, setFilterRarity] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterSet, setFilterSet] = useState("all");
  const [filterGraded, setFilterGraded] = useState("all"); // "all", "graded", "ungraded"
  const [showFilters, setShowFilters] = useState(false);
  
  // Image upload modal state
  const [imageUploadModalOpen, setImageUploadModalOpen] = useState(false);
  const [cardForImageUpload, setCardForImageUpload] = useState(null);
  
  // Manual price editing state
  const [editingManualValueId, setEditingManualValueId] = useState(null);
  const [editingManualValue, setEditingManualValue] = useState("");
  
  // Enriched collection items with community images
  const [enrichedItems, setEnrichedItems] = useState([]);

  // Load sharing settings from Firestore
  useEffect(() => {
    if (!db || !user) return;
    
    const loadSharingSettings = async () => {
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const ref = doc(db, "collector_collections", user.uid);
        const snap = await getDoc(ref);
        
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.shareEnabled === "boolean") {
            setShareEnabled(data.shareEnabled);
          }
          if (typeof data.shareUsername === "string") {
            setShareUsername(data.shareUsername);
          }
        }
      } catch (error) {
        console.error("Failed to load sharing settings", error);
      }
    };
    
    loadSharingSettings();
  }, [db, user]);
  
  // Lazy load community images only if needed
  useEffect(() => {
    const cardsWithoutImages = collectionItems.filter(item => !item.image);
    
    // No cards without images? No need to fetch community images
    if (cardsWithoutImages.length === 0) {
      setEnrichedItems(collectionItems);
      return;
    }
    
    // Cards without images exist - check if we have community images
    if (!communityImages && refreshCommunityImages) {
      // Lazy load community images on first need
      console.log('📸 Lazy loading community images for collection...');
      refreshCommunityImages().then(() => {
        // After loading, apply images (will trigger this effect again with communityImages populated)
      });
      // Set items without enrichment for now
      setEnrichedItems(collectionItems);
      return;
    }
    
    // We have community images - apply them
    const enriched = collectionItems.map(item => {
      if (item.image) return item;
      const communityImage = getImageForCard(item);
      return communityImage ? { ...item, image: communityImage } : item;
    });
    
    setEnrichedItems(enriched);
  }, [collectionItems, communityImages, getImageForCard, refreshCommunityImages]);

  // Get unique sets and rarities for filters
  const uniqueSets = useMemo(() => {
    const sets = new Set(collectionItems.map(item => item.set).filter(Boolean));
    return Array.from(sets).sort();
  }, [collectionItems]);

  const uniqueRarities = useMemo(() => {
    const rarities = new Set(collectionItems.map(item => item.rarity).filter(Boolean));
    return Array.from(rarities).sort();
  }, [collectionItems]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let items = enrichedItems;

    // Text search
    if (collectionSearch) {
      const term = collectionSearch.toLowerCase();
      items = items.filter(item =>
        String(item.name || "").toLowerCase().includes(term) ||
        String(item.set || "").toLowerCase().includes(term) ||
        String(item.number || "").toLowerCase().includes(term)
      );
    }

    // Rarity filter
    if (filterRarity !== "all") {
      items = items.filter(item => item.rarity === filterRarity);
    }

    // Condition filter
    if (filterCondition !== "all") {
      items = items.filter(item => item.condition === filterCondition);
    }

    // Set filter
    if (filterSet !== "all") {
      items = items.filter(item => item.set === filterSet);
    }

    // Graded filter
    if (filterGraded === "graded") {
      items = items.filter(item => item.isGraded === true);
    } else if (filterGraded === "ungraded") {
      items = items.filter(item => !item.isGraded);
    }

    return items;
  }, [enrichedItems, collectionSearch, filterRarity, filterCondition, filterSet, filterGraded]);

  // Helper function to get card value based on market source
  const getCardValue = useCallback((item) => {
    // Priority 1: Graded cards use graded price (stored in USD, convert to user currency)
    if (item.isGraded && item.gradedPrice) {
      const gradedPriceUSD = parseFloat(item.gradedPrice);
      return convertCurrency(gradedPriceUSD, currency);
    }
    
    // Priority 2: If manual price is set, use it
    if (item.manualPrice !== undefined && item.manualPrice !== null && item.manualPrice !== "") {
      return parseFloat(item.manualPrice) || 0;
    }
    
    // Priority 3: Standard pricing based on market source
    if (!item.prices) return 0;
    
    const condition = item.condition || "NM";
    
    if (marketSource === "cardmarket") {
      // CardMarket: For non-NM cards, require manual input (return 0 to indicate missing price)
      if (condition !== "NM") {
        return 0; // This will trigger the manual input requirement
      }
      // CardMarket NM: use 30d average (prioritized in helper function)
      return getCardmarketAvg(item) || getCardmarketLowest(item) || 0;
    } else {
      // TCGplayer: use market price adjusted for condition
      return computeTcgPrice(item, condition) || 0;
    }
  }, [marketSource, currency]);

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    items.sort((a, b) => {
      let aVal, bVal;
      if (collectionSortBy === "addedAt") {
        aVal = a.addedAt || 0;
        bVal = b.addedAt || 0;
      } else if (collectionSortBy === "name") {
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
      } else if (collectionSortBy === "price") {
        aVal = getCardValue(a);
        bVal = getCardValue(b);
      } else if (collectionSortBy === "quantity") {
        aVal = a.quantity || 0;
        bVal = b.quantity || 0;
      }
      
      if (collectionSortDir === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return items;
  }, [filteredItems, collectionSortBy, collectionSortDir, getCardValue]);

  // Calculate totals based on selected market source
  const totals = useMemo(() => {
    const totalValue = collectionItems.reduce((sum, item) => {
      const value = getCardValue(item);
      const qty = item.quantity || 1;
      return sum + (value * qty);
    }, 0);
    
    return {
      count: collectionItems.reduce((sum, item) => sum + (item.quantity || 1), 0),
      value: totalValue,
    };
  }, [collectionItems, getCardValue]);

  // Format price with selected currency
  const formatPrice = (value) => formatCurrency(Number(value ?? 0), currency);

  // Helper to save to Firestore (collector uses different collection)
  const saveCollectorCollection = async (items) => {
    if (!user || !db) return;
    const { setDoc, doc } = await import("firebase/firestore");
    const ref = doc(db, "collector_collections", user.uid);
    await setDoc(ref, { items }, { merge: true });
  };

  // Delete item
  const deleteItem = async (entryId) => {
    if (!user || !db) return;
    // Delete directly without confirmation (trash icon is confirmation enough)

    try {
      const updatedItems = collectionItems.filter(item => item.entryId !== entryId);
      await saveCollectorCollection(updatedItems);
      triggerQuickAddFeedback("Card removed from collection");
    } catch (error) {
      console.error("Failed to delete card", error);
      alert("Failed to delete card. Please try again.");
    }
  };

  // Update condition
  const updateCondition = async (entryId, newCondition) => {
    if (!user || !db) return;
    try {
      const updatedItems = collectionItems.map(item =>
        item.entryId === entryId ? { ...item, condition: newCondition } : item
      );
      await saveCollectorCollection(updatedItems);
    } catch (error) {
      console.error("Failed to update condition", error);
    }
  };

  // Update manual price
  const updateManualPrice = async (entryId, manualPrice) => {
    if (!user || !db) return;
    try {
      const updatedItems = collectionItems.map(item =>
        item.entryId === entryId ? { ...item, manualPrice: manualPrice } : item
      );
      await saveCollectorCollection(updatedItems);
    } catch (error) {
      console.error("Failed to update manual price", error);
    }
  };

  // Start editing manual value
  const startEditingManualValue = (entryId, currentValue) => {
    setEditingManualValueId(entryId);
    setEditingManualValue(currentValue?.toString() || "");
  };

  // Cancel editing manual value
  const cancelEditingManualValue = () => {
    setEditingManualValueId(null);
    setEditingManualValue("");
  };

  // Save manual value
  const saveManualValue = async (entryId) => {
    if (!user || !db) return;
    try {
      const value = editingManualValue.trim();
      const numValue = value === "" ? null : Number(value);
      
      await updateManualPrice(entryId, numValue);
      setEditingManualValueId(null);
      setEditingManualValue("");
      triggerQuickAddFeedback("Value updated");
    } catch (error) {
      console.error("Failed to update value", error);
      alert("Failed to update value. Please try again.");
    }
  };

  // Clear all
  const clearCollection = async () => {
    if (!user || !db) return;
    const confirmed = window.confirm("Clear entire collection? This cannot be undone.");
    if (!confirmed) return;

    try {
      await saveCollectorCollection([]);
      triggerQuickAddFeedback("Collection cleared");
    } catch (error) {
      console.error("Failed to clear collection", error);
      alert("Failed to clear collection. Please try again.");
    }
  };

  // Start editing condition/grade
  const startEditingCondition = (card) => {
    setEditingCondition(true);
    if (card.isGraded) {
      setEditGradingCompany(card.gradingCompany || "PSA");
      setEditGrade(card.grade || "10");
    } else {
      setEditConditionValue(card.condition || "NM");
    }
  };

  // Cancel editing condition/grade
  const cancelEditingCondition = () => {
    setEditingCondition(false);
    setEditConditionValue("");
    setEditGradingCompany("");
    setEditGrade("");
  };

  // Save condition/grade changes
  const saveConditionGrade = async () => {
    if (!selectedCardDetails || !user || !db) return;

    try {
      setUpdatingGradePrice(true);
      let newGradedPrice = selectedCardDetails.gradedPrice;

      // If graded card, fetch new price from PriceCharting
      if (selectedCardDetails.isGraded) {
        try {
          const apiUrl = `https://us-central1-rafchu-tcg-app.cloudfunctions.net/fetchGradedPrices?name=${encodeURIComponent(
            selectedCardDetails.name || ''
          )}&set=${encodeURIComponent(selectedCardDetails.set || '')}&number=${encodeURIComponent(
            selectedCardDetails.number || ''
          )}&company=${encodeURIComponent(editGradingCompany)}&grade=${encodeURIComponent(editGrade)}`;
          
          const response = await fetch(apiUrl);

          if (response.ok) {
            const data = await response.json();
            if (data.graded && data.graded.price) {
              newGradedPrice = data.graded.price; // Price is in USD
            }
          }
        } catch (err) {
          console.warn("Failed to fetch updated graded price:", err);
        }
      }

      const updatedItems = collectionItems.map(item => {
        if (item.entryId === selectedCardDetails.entryId) {
          if (selectedCardDetails.isGraded) {
            return {
              ...item,
              gradingCompany: editGradingCompany,
              grade: editGrade,
              gradedPrice: newGradedPrice,
            };
          } else {
            return { ...item, condition: editConditionValue };
          }
        }
        return item;
      });

      await saveCollection(db, user.uid, updatedItems);
      
      // Update modal with new values
      if (selectedCardDetails.isGraded) {
        setSelectedCardDetails({
          ...selectedCardDetails,
          gradingCompany: editGradingCompany,
          grade: editGrade,
          gradedPrice: newGradedPrice,
        });
      } else {
        setSelectedCardDetails({ ...selectedCardDetails, condition: editConditionValue });
      }

      setEditingCondition(false);
      setUpdatingGradePrice(false);
      triggerQuickAddFeedback(selectedCardDetails.isGraded ? "Grade and price updated" : "Condition updated");
    } catch (error) {
      console.error("Failed to update condition/grade", error);
      setUpdatingGradePrice(false);
      alert("Failed to update. Please try again.");
    }
  };

  // Toggle card selection for trade
  const toggleCardForTrade = useCallback((entryId) => {
    setSelectedForTrade(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  }, []);

  // Move selected cards to trade binder
  const moveToTradeBinder = useCallback(() => {
    if (selectedForTrade.size === 0) {
      alert("Please select cards to move to trade binder");
      return;
    }

    const selectedItems = collectionItems.filter(item => selectedForTrade.has(item.entryId));
    
    // Add to trade items
    const newTradeItems = selectedItems.map(item => ({
      entryId: crypto.randomUUID(),
      cardId: item.cardId,
      card: item,
      addedAt: Date.now(),
      condition: item.condition || "NM",
      quantity: item.quantity || 1,
    }));

    setTradeItems(prev => [...prev, ...newTradeItems]);
    setSelectedForTrade(new Set());
    triggerQuickAddFeedback(`${selectedItems.length} card(s) added to trade binder`);
  }, [selectedForTrade, collectionItems, setTradeItems, triggerQuickAddFeedback]);

  // Export collection to CSV
  const exportCollectionToCSV = useCallback(() => {
    exportToCSV(collectionItems, "my-collection.csv");
    triggerQuickAddFeedback("Collection exported successfully");
  }, [collectionItems, triggerQuickAddFeedback]);

  // Sharing functionality
  const handleShareToggle = useCallback(async (enabled) => {
    if (!user || !db) return;
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { shareEnabled: enabled }, { merge: true });
      setShareEnabled(enabled);
      triggerQuickAddFeedback(enabled ? "Collection sharing enabled" : "Collection sharing disabled");
    } catch (err) {
      console.error("Failed to update sharing", err);
      alert("Failed to update sharing preference");
    }
  }, [user, db, triggerQuickAddFeedback]);

  const handleShareNameSave = useCallback(async () => {
    if (!user || !db) return;
    const trimmed = shareUsername.trim();
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { shareUsername: trimmed }, { merge: true });
      triggerQuickAddFeedback("Shareable name updated");
    } catch (err) {
      console.error("Failed to update shareable name", err);
      alert("Failed to update shareable name");
    }
  }, [user, db, shareUsername, triggerQuickAddFeedback]);

  const copyCollectionShareLink = useCallback(async () => {
    if (!user) return;
    const shareUrl = `${window.location.origin}?collection=${user.uid}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      triggerQuickAddFeedback("Collection share link copied to clipboard");
    } catch (err) {
      console.error("Failed to copy link", err);
      alert("Failed to copy share link");
    }
  }, [user, triggerQuickAddFeedback]);

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Please sign in to view your collection.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Package className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-3xl font-bold">My Collection</h1>
          <p className="text-muted-foreground">Collector Toolkit</p>
        </div>
      </div>

      {/* Controls */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3">
            {/* Quick Filter Buttons */}
            <div className="flex gap-2">
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

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search collection..."
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                  className="w-56"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  Filters
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="opacity-70">Sort by</label>
                <Select
                  value={collectionSortBy}
                  onChange={(e) => setCollectionSortBy(e.target.value)}
                  className="w-36"
                >
                  <option value="addedAt">Date Added</option>
                  <option value="name">Name</option>
                  <option value="price">Price</option>
                  <option value="quantity">Quantity</option>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setCollectionSortDir((prev) =>
                      prev === "desc" ? "asc" : "desc"
                    )
                  }
                >
                  {collectionSortDir === "desc" ? "↓" : "↑"}
                </Button>
              </div>
            </div>

            {/* Advanced Filters */}
            {showFilters && (
              <div className="flex flex-wrap gap-3 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <label className="text-sm opacity-70">Rarity:</label>
                  <Select
                    value={filterRarity}
                    onChange={(e) => setFilterRarity(e.target.value)}
                    className="w-40"
                  >
                    <option value="all">All Rarities</option>
                    {uniqueRarities.map(rarity => (
                      <option key={rarity} value={rarity}>{rarity}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm opacity-70">Condition:</label>
                  <Select
                    value={filterCondition}
                    onChange={(e) => setFilterCondition(e.target.value)}
                    className="w-32"
                  >
                    <option value="all">All Conditions</option>
                    <option value="NM">Near Mint</option>
                    <option value="LP">Lightly Played</option>
                    <option value="MP">Moderately Played</option>
                    <option value="HP">Heavily Played</option>
                    <option value="DMG">Damaged</option>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm opacity-70">Set:</label>
                  <Select
                    value={filterSet}
                    onChange={(e) => setFilterSet(e.target.value)}
                    className="w-48"
                  >
                    <option value="all">All Sets</option>
                    {uniqueSets.map(set => (
                      <option key={set} value={set}>{set}</option>
                    ))}
                  </Select>
                </div>
                {(filterRarity !== "all" || filterCondition !== "all" || filterSet !== "all") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFilterRarity("all");
                      setFilterCondition("all");
                      setFilterSet("all");
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </div>
          {selectedForTrade.size > 0 && (
            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t">
              <div className="text-sm font-semibold">
                {selectedForTrade.size} card(s) selected
              </div>
              <Button
                size="sm"
                variant="default"
                onClick={moveToTradeBinder}
              >
                <ArrowRight className="mr-1 h-4 w-4" />
                Move to Trade Binder
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              Total Cards: {totals.count}
            </div>
            <div className="text-lg font-bold text-primary">
              Collection Value: {formatPrice(totals.value)}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={collectionItems.length === 0}
                onClick={exportCollectionToCSV}
              >
                <Download className="mr-1 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={collectionItems.length === 0}
                onClick={clearCollection}
              >
                Clear Collection
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sharing Settings */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Collection Sharing
            </h3>
            <Button
              size="sm"
              variant={shareEnabled ? "default" : "outline"}
              onClick={() => handleShareToggle(!shareEnabled)}
            >
              {shareEnabled ? "Enabled" : "Enable Sharing"}
            </Button>
          </div>
          
          {shareEnabled && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Shareable Display Name</label>
                <Input
                  value={shareUsername}
                  onChange={(e) => setShareUsername(e.target.value)}
                  onBlur={handleShareNameSave}
                  placeholder="e.g., Rafchu"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This name will be shown when you share your collection
                </p>
              </div>
              
              <Button
                size="sm"
                onClick={copyCollectionShareLink}
                className="w-full"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Copy Collection Share Link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collection Grid */}
      <div className="grid gap-3">
        {sortedItems.length === 0 && collectionItems.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Start Building Your Collection</h3>
              <p className="text-muted-foreground mb-4">
                Your collection is empty. Here's how to get started:
              </p>
              <div className="text-left max-w-md mx-auto space-y-2 text-sm text-muted-foreground mb-6">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Go to <strong>Card Search</strong> to find cards</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>Click the <strong>+ icon</strong> next to any card to quick-add</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>Or select a card and use <strong>"Add to Collection"</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-primary">4.</span>
                  <span>Track values, export data, and manage your cards</span>
                </div>
              </div>
              <Button variant="default" onClick={() => window.location.href = '/collector/search'}>
                Go to Card Search
              </Button>
            </CardContent>
          </Card>
        )}
        {sortedItems.length === 0 && collectionItems.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-muted-foreground">
                <Filter className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="font-medium mb-1">No cards match your filters</p>
                <p className="text-sm">Try adjusting your search or filter settings</p>
              </div>
            </CardContent>
          </Card>
        )}
        {sortedItems.map((item) => {
          const cardValue = getCardValue(item);
          const totalValue = cardValue * (item.quantity || 1);
          
          return (
            <Card
              key={item.entryId}
              className="rounded-2xl p-3 hover:bg-accent/40 transition cursor-pointer"
              onClick={(e) => {
                // Don't trigger if clicking on interactive elements
                if (e.target.closest('input, button, select')) return;
                setSelectedCardDetails(item);
              }}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 border-2 border-gray-400 checked:bg-primary checked:border-primary focus:ring-2 focus:ring-primary/30"
                  checked={selectedForTrade.has(item.entryId)}
                  onChange={() => toggleCardForTrade(item.entryId)}
                  onClick={(e) => e.stopPropagation()}
                />
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-20 w-16 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center relative group">
                    <span className="text-[8px] text-gray-400 text-center px-1">No Image</span>
                    {user && needsImage(item) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCardForImageUpload(item);
                          setImageUploadModalOpen(true);
                        }}
                        className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
                        title="Upload image"
                      >
                        <Upload className="h-4 w-4 text-white" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.set} • {item.rarity} • #{item.number}
                  </div>
                  {/* v2.1: Show variant, graded, and language badges */}
                  <div className="mt-1">
                    <CardBadges item={item} size="sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity || 1} • Added: {new Date(item.addedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <div className="text-sm font-bold text-primary">
                        {formatPrice(totalValue)}
                      </div>
                      {item.manualPrice != null && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingManualValue(item.entryId, item.manualPrice);
                          }}
                          className="text-blue-600 hover:text-blue-700 transition"
                          title="Manually set value - click to edit"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.manualPrice != null ? 'Manual Value' : 'Value'}
                    </div>
                  </div>
                  
                  {/* Condition or Graded Badge */}
                  {item.isGraded ? (
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300 whitespace-nowrap">
                      🏆 {item.gradingCompany} {item.grade}
                    </span>
                  ) : (
                    <span className={`text-xs font-semibold px-2 py-1 rounded border whitespace-nowrap ${getConditionColorClass(item.condition)}`}>
                      {item.condition || "NM"}
                    </span>
                  )}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(item.entryId);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Warning and manual price input for non-NM CardMarket cards */}
              {marketSource === "cardmarket" && (item.condition || "NM") !== "NM" && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-yellow-600 text-xs font-semibold">⚠️ Manual Price Required</span>
                  </div>
                  <p className="text-xs text-yellow-700 mb-2">
                    CardMarket doesn't provide reliable pricing for non-NM conditions. Please enter a manual price or consider using TCGplayer pricing.
                  </p>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Enter price (€)"
                      value={item.manualPrice || ""}
                      onChange={(e) => updateManualPrice(item.entryId, e.target.value)}
                      className="flex-1 h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">or</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const tcgPrice = computeTcgPrice(item, item.condition || "NM");
                        if (tcgPrice) {
                          updateManualPrice(item.entryId, tcgPrice.toFixed(2));
                          triggerQuickAddFeedback("Using TCGplayer price");
                        }
                      }}
                      className="text-xs whitespace-nowrap"
                    >
                      Use TCGplayer
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual Price Override - Available for all cards */}
              {cardValue > 0 && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-purple-600 text-xs font-semibold">💰 Custom Value Override</span>
                  </div>
                  <p className="text-xs text-purple-700 mb-2">
                    ⚠️ <strong>Warning:</strong> Setting a custom value will override market pricing. You'll need to manually update this value to keep it current with market prices.
                  </p>
                  {editingManualValueId === item.entryId ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={`Enter value (${currency})`}
                          value={editingManualValue}
                          onChange={(e) => setEditingManualValue(e.target.value)}
                          className="flex-1 h-8 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveManualValue(item.entryId);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditingManualValue();
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Current market value: {formatPrice(cardValue)}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditingManualValue(item.entryId, item.manualPrice || cardValue);
                        }}
                        className="gap-2"
                      >
                        <Edit2 className="h-3 w-3" />
                        {item.manualPrice ? `Edit Custom Value (${formatPrice(item.manualPrice)})` : 'Set Custom Value'}
                      </Button>
                      {item.manualPrice && (
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">
                            Market value: {formatPrice(cardValue)}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateManualPrice(item.entryId, null);
                              triggerQuickAddFeedback("Reverted to market pricing");
                            }}
                            className="h-6 text-xs text-red-600 hover:text-red-700"
                          >
                            Reset to Market
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Visual cue and manual value input for $0 value cards */}
              {cardValue === 0 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-blue-600 text-xs font-semibold">💡 No Value Data Available</span>
                  </div>
                  <p className="text-xs text-blue-700 mb-2">
                    This card doesn't have pricing data from our sources. You can manually set a value to track it in your collection.
                  </p>
                  {editingManualValueId === item.entryId ? (
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={`Enter value (${currency})`}
                        value={editingManualValue}
                        onChange={(e) => setEditingManualValue(e.target.value)}
                        className="flex-1 h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveManualValue(item.entryId);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelEditingManualValue();
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingManualValue(item.entryId, item.manualPrice);
                      }}
                      className="gap-2"
                    >
                      <Edit2 className="h-3 w-3" />
                      {item.manualPrice ? `Edit Value (${formatPrice(item.manualPrice)})` : 'Set Value'}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Card Details Modal */}
      {selectedCardDetails && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedCardDetails(null)}
        >
          <Card 
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-2xl font-bold">{selectedCardDetails.name}</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedCardDetails(null)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  {selectedCardDetails.image ? (
                    <img
                      src={selectedCardDetails.image}
                      alt={selectedCardDetails.name}
                      className="w-full rounded-xl shadow-lg"
                    />
                  ) : (
                    <div className="w-full h-64 bg-muted rounded-xl flex flex-col items-center justify-center gap-3 relative group">
                      <p className="text-muted-foreground">No image available</p>
                      {user && needsImage(selectedCardDetails) && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardForImageUpload(selectedCardDetails);
                            setImageUploadModalOpen(true);
                          }}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          Upload Image
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {selectedCardDetails.set} • {selectedCardDetails.rarity} • #{selectedCardDetails.number}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Quantity: {selectedCardDetails.quantity || 1}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Added: {selectedCardDetails.addedAt ? new Date(selectedCardDetails.addedAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>

                  {/* Condition/Grade Section */}
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    {!selectedCardDetails.isGraded ? (
                      // Ungraded card
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Condition:</span>
                        {!editingCondition ? (
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold px-2 py-0.5 rounded border ${getConditionColorClass(selectedCardDetails.condition)}`}>
                              {selectedCardDetails.condition || "NM"}
                            </span>
                            <button
                              onClick={() => startEditingCondition(selectedCardDetails)}
                              className="text-xs text-primary hover:text-primary/80"
                              title="Edit condition"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Select
                              value={editConditionValue}
                              onChange={(e) => setEditConditionValue(e.target.value)}
                              className="w-24 h-8 text-sm"
                            >
                              <option value="NM">NM</option>
                              <option value="LP">LP</option>
                              <option value="MP">MP</option>
                              <option value="HP">HP</option>
                              <option value="DMG">DMG</option>
                            </Select>
                            <button
                              onClick={saveConditionGrade}
                              className="text-green-600 hover:text-green-700"
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEditingCondition}
                              className="text-red-600 hover:text-red-700"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Graded card
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Grade:</span>
                        {!editingCondition ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{selectedCardDetails.gradingCompany} {selectedCardDetails.grade}</span>
                            <button
                              onClick={() => startEditingCondition(selectedCardDetails)}
                              className="text-xs text-primary hover:text-primary/80"
                              title="Edit grade"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <Select
                                value={editGradingCompany}
                                onChange={(e) => setEditGradingCompany(e.target.value)}
                                className="w-20 h-8 text-sm"
                              >
                                <option value="PSA">PSA</option>
                                <option value="BGS">BGS</option>
                                <option value="CGC">CGC</option>
                                <option value="SGC">SGC</option>
                              </Select>
                              <Select
                                value={editGrade}
                                onChange={(e) => setEditGrade(e.target.value)}
                                className="w-16 h-8 text-sm"
                              >
                                <option value="10">10</option>
                                <option value="9.5">9.5</option>
                                <option value="9">9</option>
                                <option value="8.5">8.5</option>
                                <option value="8">8</option>
                                <option value="7.5">7.5</option>
                                <option value="7">7</option>
                                <option value="6">6</option>
                                <option value="5">5</option>
                                <option value="4">4</option>
                                <option value="3">3</option>
                                <option value="2">2</option>
                                <option value="1">1</option>
                              </Select>
                              {!updatingGradePrice && (
                                <>
                                  <button
                                    onClick={saveConditionGrade}
                                    disabled={updatingGradePrice}
                                    className="text-green-600 hover:text-green-700 disabled:opacity-50"
                                    title="Save"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={cancelEditingCondition}
                                    disabled={updatingGradePrice}
                                    className="text-red-600 hover:text-red-700 disabled:opacity-50"
                                    title="Cancel"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                            {updatingGradePrice && (
                              <div className="text-xs text-muted-foreground">Updating price...</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Pricing for selected market */}
                  {selectedCardDetails.isGraded && selectedCardDetails.gradedPrice ? (
                    // Graded card - show graded price
                    <Card className="rounded-2xl p-4 shadow">
                      <CardContent className="space-y-2 p-0">
                        <div className="mb-2 font-semibold flex items-center gap-2">
                          <Award className="h-4 w-4" />
                          Card Value
                        </div>
                        <PriceRow
                          label={`${selectedCardDetails.gradingCompany} ${selectedCardDetails.grade}`}
                          value={formatPrice(convertCurrency(selectedCardDetails.gradedPrice, currency, 'USD'))}
                        />
                      </CardContent>
                    </Card>
                  ) : (
                    // Ungraded card - show market prices
                    <Card className="rounded-2xl p-4 shadow">
                      <CardContent className="space-y-2 p-0">
                        <div className="mb-2 font-semibold">Card Value</div>
                        {marketSource === "tcg" ? (
                          <>
                            {selectedCardDetails.prices?.tcgplayer?.market_price > 0 ? (
                              <>
                                <PriceRow
                                  label={`Market (${selectedCardDetails.condition || "NM"})`}
                                  value={formatPrice(computeTcgPrice(selectedCardDetails, selectedCardDetails.condition || "NM"))}
                                />
                                <PriceRow
                                  label="Market (NM)"
                                  value={formatPrice(selectedCardDetails.prices?.tcgplayer?.market_price || 0)}
                                />
                                <PriceRow
                                  label="Mid"
                                  value={formatPrice(selectedCardDetails.prices?.tcgplayer?.mid_price || 0)}
                                />
                              </>
                            ) : (
                              <>
                                {selectedCardDetails.prices?.pricecharting ? (
                                  <PriceRow
                                    label="Market Price"
                                    value={formatPrice(convertCurrency(selectedCardDetails.prices.pricecharting, currency, 'USD'))}
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">No pricing data available</div>
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {getCardmarketAvg(selectedCardDetails) > 0 || getCardmarketLowest(selectedCardDetails) > 0 ? (
                              <>
                                <PriceRow 
                                  label="Lowest Listing" 
                                  value={formatPrice(getCardmarketLowest(selectedCardDetails))} 
                                />
                                <PriceRow
                                  label="Lowest (NM)"
                                  value={formatPrice(selectedCardDetails.prices?.cardmarket?.lowest_near_mint || 0)}
                                />
                                <PriceRow 
                                  label="7d Avg" 
                                  value={formatPrice(selectedCardDetails.prices?.cardmarket?.avg7 || 0)} 
                                />
                                <PriceRow 
                                  label="30d Avg" 
                                  value={formatPrice(selectedCardDetails.prices?.cardmarket?.avg30 || 0)} 
                                />
                              </>
                            ) : (
                              <>
                                {selectedCardDetails.prices?.pricecharting ? (
                                  <PriceRow
                                    label="Market Price"
                                    value={formatPrice(convertCurrency(selectedCardDetails.prices.pricecharting, currency, 'USD'))}
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">No pricing data available</div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Manual Value Edit Section */}
                  {selectedCardDetails.manualPrice != null && (
                    <Card className="rounded-2xl p-4 shadow bg-blue-50 border-blue-200">
                      <CardContent className="space-y-2 p-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Edit2 className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-semibold text-blue-700">Manual Value Set</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingManualValue(selectedCardDetails.entryId, selectedCardDetails.manualPrice);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 underline"
                          >
                            Edit
                          </button>
                        </div>
                        <p className="text-xs text-blue-700">
                          You've manually set this card's value to track it in your collection.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Image Upload Modal */}
      {imageUploadModalOpen && cardForImageUpload && (
        <ImageUploadModal
          isOpen={imageUploadModalOpen}
          card={cardForImageUpload}
          onClose={() => {
            setImageUploadModalOpen(false);
            setCardForImageUpload(null);
          }}
        />
      )}
    </div>
  );
}
