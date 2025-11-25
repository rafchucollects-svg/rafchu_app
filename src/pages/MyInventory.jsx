import { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Store, Trash2, Edit2, Check, X, Download, Share2, Copy, DollarSign, CheckSquare, Square, Filter, ExternalLink, Upload, Camera, History, Search, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { computeInventoryTotals, formatCurrency, computeItemMetrics, exportToCSV, getConditionColorClass, recordTransaction, convertCurrency } from "@/utils/cardHelpers";
import { ConditionSelect, CardPrices, ExternalLinks } from "@/components/CardComponents";
import { CardBadges, CardPriceInfo, GradedCardInfo, VariantInfo } from "@/components/CardBadges";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { needsImage } from "@/utils/imageHelpers";
import { apiFetchMarketPrices } from "@/utils/apiHelpers";
import { setDoc, doc, addDoc, collection, serverTimestamp, getDocs, query, orderBy, deleteDoc } from "firebase/firestore";
import { CardSearch } from "./CardSearch";

/**
 * My Inventory Page (Vendor Toolkit)
 * Displays and manages vendor's inventory with full Firestore integration
 */

export function MyInventory() {
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
    roundUpPrices,
    setRoundUpPrices,
    currency,
    secondaryCurrency,
    triggerQuickAddFeedback,
    communityImages,
    getImageForCard,
    refreshCommunityImages,
  } = useApp();

  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUsername, setShareUsername] = useState("");
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [salesModal, setSalesModal] = useState(null); // { cards: [], defaultPrice: 0 }
  const [cardDetailsModal, setCardDetailsModal] = useState(null); // Selected card for details view
  const [salesCurrency, setSalesCurrency] = useState(currency); // Currency for sale input
  
  // Snapshot states
  const [snapshots, setSnapshots] = useState([]);
  const [showSnapshotsModal, setShowSnapshotsModal] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  // Snapshot filtering/sorting/search
  const [snapshotSearch, setSnapshotSearch] = useState("");
  const [snapshotSortBy, setSnapshotSortBy] = useState("name"); // name, price, set
  const [snapshotSortDir, setSnapshotSortDir] = useState("asc");
  const [snapshotConditionFilter, setSnapshotConditionFilter] = useState("all");
  const [snapshotGradedFilter, setSnapshotGradedFilter] = useState("all"); // all, graded, ungraded
  const [snapshotCurrentPrices, setSnapshotCurrentPrices] = useState(null);
  const [loadingCurrentPrices, setLoadingCurrentPrices] = useState(false);
  
  // Quick Add Search toggle
  const [showQuickAddSearch, setShowQuickAddSearch] = useState(false);
  
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
  
  // Enriched collection items with community images
  const [enrichedItems, setEnrichedItems] = useState([]);

  // Load sharing settings from Firestore
  useEffect(() => {
    if (!db || !user) return;
    
    const loadSharingSettings = async () => {
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const ref = doc(db, "collections", user.uid);
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
  
  // Lazy load community images and fetch prices for $0 cards
  useEffect(() => {
    const enrichAndFetchPrices = async () => {
      const cardsWithoutImages = collectionItems.filter(item => !item.image);
      
      // Step 1: Handle community images
      if (cardsWithoutImages.length > 0 && !communityImages && refreshCommunityImages) {
        // Lazy load community images on first need
        console.log('📸 Lazy loading community images for inventory...');
        refreshCommunityImages().then(() => {
          // After loading, apply images (will trigger this effect again with communityImages populated)
        });
        // Set items without enrichment for now
        setEnrichedItems(collectionItems);
        return;
      }
      
      // Apply community images
      const enriched = collectionItems.map(item => {
        if (item.image) return item;
        const communityImage = getImageForCard(item);
        return communityImage ? { ...item, image: communityImage } : item;
      });
      
      setEnrichedItems(enriched);
    };
    
    enrichAndFetchPrices();
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
      } else if (collectionSortBy === "quantity") {
        aVal = a.quantity || 0;
        bVal = b.quantity || 0;
      } else if (collectionSortBy === "price") {
        // Sort by vendor's calculated/override price
        const aMetrics = computeItemMetrics(a);
        const bMetrics = computeItemMetrics(b);
        aVal = a.overridePrice ?? a.calculatedSuggestedPrice ?? aMetrics.suggested;
        bVal = b.overridePrice ?? b.calculatedSuggestedPrice ?? bMetrics.suggested;
      }
      
      if (collectionSortDir === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return items;
  }, [filteredItems, collectionSortBy, collectionSortDir]);

  // Calculate totals
  const totals = useMemo(() => {
    return computeInventoryTotals(collectionItems, currency);
  }, [collectionItems, currency]);

  // Format price with rounding and selected currency
  const formatPrice = (value) => formatCurrency(roundUpPrices ? Math.ceil(Number(value ?? 0)) : Number(value ?? 0), currency);

  // Helper to save to Firestore
  const saveInventory = async (items, metadata = {}) => {
    if (!user || !db) return;
    const ref = doc(db, "collections", user.uid);
    await setDoc(ref, { items, ...metadata }, { merge: true });
  };

  // Handler for roundUpPrices toggle
  const handleRoundUpToggle = async (checked) => {
    if (!user || !db) return;
    setRoundUpPrices(checked);
    try {
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { roundUp: checked }, { merge: true });
    } catch (error) {
      console.error("Failed to save round up preference", error);
      // Revert on error
      setRoundUpPrices(!checked);
    }
  };

  // Delete item
  const deleteItem = async (entryId) => {
    if (!user || !db) return;
    // Delete directly without confirmation (trash icon is confirmation enough)

    try {
      const updatedItems = collectionItems.filter(item => item.entryId !== entryId);
      await saveInventory(updatedItems);
      triggerQuickAddFeedback("Card removed from inventory");
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
      await saveInventory(updatedItems);
    } catch (error) {
      console.error("Failed to update condition", error);
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
    if (!cardDetailsModal || !user || !db) return;

    try {
      setUpdatingGradePrice(true);
      let newGradedPrice = cardDetailsModal.gradedPrice;

      // If graded card, fetch new price from PriceCharting
      if (cardDetailsModal.isGraded) {
        try {
          const apiUrl = `https://us-central1-rafchu-tcg-app.cloudfunctions.net/fetchGradedPrices?name=${encodeURIComponent(
            cardDetailsModal.name || ''
          )}&set=${encodeURIComponent(cardDetailsModal.set || '')}&number=${encodeURIComponent(
            cardDetailsModal.number || ''
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
        if (item.entryId === cardDetailsModal.entryId) {
          if (cardDetailsModal.isGraded) {
            return {
              ...item,
              gradingCompany: editGradingCompany,
              grade: editGrade,
              gradedPrice: newGradedPrice,
              calculatedSuggestedPrice: parseFloat(newGradedPrice),
            };
          } else {
            return { ...item, condition: editConditionValue };
          }
        }
        return item;
      });

      await saveInventory(updatedItems);
      
      // Update modal with new values
      if (cardDetailsModal.isGraded) {
        setCardDetailsModal({
          ...cardDetailsModal,
          gradingCompany: editGradingCompany,
          grade: editGrade,
          gradedPrice: newGradedPrice,
          calculatedSuggestedPrice: parseFloat(newGradedPrice),
        });
      } else {
        setCardDetailsModal({ ...cardDetailsModal, condition: editConditionValue });
      }

      setEditingCondition(false);
      setUpdatingGradePrice(false);
      triggerQuickAddFeedback(cardDetailsModal.isGraded ? "Grade and price updated" : "Condition updated");
    } catch (error) {
      console.error("Failed to update condition/grade", error);
      setUpdatingGradePrice(false);
      alert("Failed to update. Please try again.");
    }
  };

  // Start editing price
  const startEditingPrice = (entryId, currentPrice) => {
    setEditingPriceId(entryId);
    setEditingPriceValue(currentPrice != null ? String(currentPrice) : "");
  };

  // Save price override
  const savePriceOverride = async (entryId) => {
    if (!user || !db) return;
    try {
      const value = editingPriceValue.trim();
      const numValue = value === "" ? null : Number(value);
      
      const updatedItems = collectionItems.map(item =>
        item.entryId === entryId ? { 
          ...item, 
          overridePrice: numValue,
          overridePriceCurrency: numValue !== null ? currency : null // Store currency with override
        } : item
      );
      await saveInventory(updatedItems);
      setEditingPriceId(null);
      setEditingPriceValue("");
      triggerQuickAddFeedback("Price updated");
    } catch (error) {
      console.error("Failed to update price", error);
      alert("Failed to update price. Please try again.");
    }
  };

  // Cancel editing price
  const cancelEditingPrice = () => {
    setEditingPriceId(null);
    setEditingPriceValue("");
  };

  // Reset price to suggested (clear override)
  const resetPriceToSuggested = async (entryId) => {
    if (!user || !db) return;
    try {
      const updatedItems = collectionItems.map(item =>
        item.entryId === entryId ? { 
          ...item, 
          overridePrice: null,
          overridePriceCurrency: null
        } : item
      );
      await saveInventory(updatedItems);
      setEditingPriceId(null);
      setEditingPriceValue("");
      triggerQuickAddFeedback("Price reset to suggested");
    } catch (error) {
      console.error("Failed to reset price", error);
      alert("Failed to reset price. Please try again.");
    }
  };

  // Clear all
  const clearInventory = async () => {
    if (!user || !db) return;
    const confirmed = window.confirm("Clear entire inventory? This cannot be undone.");
    if (!confirmed) return;

    try {
      await saveInventory([]);
      triggerQuickAddFeedback("Inventory cleared");
    } catch (error) {
      console.error("Failed to clear inventory", error);
      alert("Failed to clear inventory. Please try again.");
    }
  };

  // Export inventory to CSV
  const exportInventoryToCSV = () => {
    exportToCSV(collectionItems, "my-inventory.csv");
    triggerQuickAddFeedback("Inventory exported successfully");
  };

  // Snapshot functionality
  const saveInventorySnapshot = async () => {
    if (!user || !db || collectionItems.length === 0) return;
    
    try {
      const totals = computeInventoryTotals(collectionItems, currency, roundUpPrices);
      
      // Create snapshot with current inventory data and hard-coded prices
      // Filter out undefined values to prevent Firestore errors
      const cleanItems = collectionItems.map(item => {
        const metrics = computeItemMetrics(item, currency);
        
        const itemData = {
          name: item.name || "",
          set: item.set || "",
          number: item.number || "",
          condition: item.condition || "NM",
          quantity: item.quantity || 1,
          image: item.image || item.imageUrl || "",
          // Hard-code the current prices
          suggestedPrice: (item.overridePrice ?? item.calculatedSuggestedPrice ?? metrics.suggested) || 0,
          tcgPrice: metrics.tcgPrice || 0,
          cmAvg: metrics.cmAvg || 0,
          cmLowest: metrics.cmLowest || 0,
          // Include graded info
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || "",
          grade: item.grade || "",
          // Include variant info
          isReverseHolo: item.isReverseHolo || false,
          isFirstEdition: item.isFirstEdition || false
        };
        
        // Filter out undefined values
        return Object.fromEntries(
          Object.entries(itemData).filter(([_, value]) => value !== undefined)
        );
      });
      
      const snapshotData = {
        timestamp: serverTimestamp(),
        createdAt: Date.now(),
        currency: currency || "EUR",
        totalItems: collectionItems.length,
        totalValue: totals.suggested || 0,
        totals: {
          tcgAvg: totals.tcgAvg || 0,
          cmAvg: totals.cmAvg || 0,
          cmLowest: totals.cmLowest || 0,
          suggested: totals.suggested || 0
        },
        items: cleanItems
      };
      
      console.log("Saving snapshot with data:", snapshotData);
      
      const snapshotsRef = collection(db, "inventory_snapshots", user.uid, "snapshots");
      const docRef = await addDoc(snapshotsRef, snapshotData);
      
      console.log("Snapshot saved successfully with ID:", docRef.id);
      
      triggerQuickAddFeedback("Inventory snapshot saved!");
      loadSnapshots(); // Reload the list
    } catch (error) {
      console.error("Failed to save snapshot - detailed error:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      alert(`Failed to save snapshot: ${error.message || "Unknown error"}. Please check console for details.`);
    }
  };

  const loadSnapshots = async () => {
    if (!user || !db) return;
    
    setLoadingSnapshots(true);
    try {
      const snapshotsRef = collection(db, "inventory_snapshots", user.uid, "snapshots");
      const q = query(snapshotsRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      
      const snapshotList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setSnapshots(snapshotList);
    } catch (error) {
      console.error("Failed to load snapshots:", error);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const deleteSnapshot = async (snapshotId) => {
    if (!user || !db) return;
    
    try {
      const snapshotRef = doc(db, "inventory_snapshots", user.uid, "snapshots", snapshotId);
      await deleteDoc(snapshotRef);
      
      triggerQuickAddFeedback("Snapshot deleted");
      loadSnapshots(); // Reload the list
    } catch (error) {
      console.error("Failed to delete snapshot:", error);
      alert("Failed to delete snapshot.");
    }
  };

  // Fetch current prices for snapshot items
  const fetchSnapshotCurrentPrices = async (snapshot) => {
    if (!snapshot || !snapshot.items) return;
    
    setLoadingCurrentPrices(true);
    try {
      const pricesMap = {};
      
      // Fetch prices for each unique card (batched by card to avoid duplicate API calls)
      const uniqueCards = new Map();
      snapshot.items.forEach((item, idx) => {
        const key = `${item.name}-${item.set}-${item.number}`;
        if (!uniqueCards.has(key)) {
          uniqueCards.set(key, { ...item, originalIndex: idx });
        }
      });
      
      for (const [key, item] of uniqueCards) {
        try {
          const marketPrices = await apiFetchMarketPrices(item);
          
          let currentPrice = 0;
          if (item.isGraded && marketPrices.graded) {
            // For graded cards, convert from USD
            currentPrice = convertCurrency(marketPrices.graded, snapshot.currency);
          } else {
            // For ungraded, calculate the same way as snapshot
            const tcgFull = marketPrices.us?.market || 0;
            const cmAvgFull = marketPrices.eu?.avg || 0;
            const cmLowFull = marketPrices.eu?.low || 0;
            currentPrice = Math.min(tcgFull, cmAvgFull, cmLowFull);
          }
          
          pricesMap[key] = currentPrice;
        } catch (error) {
          console.error(`Failed to fetch price for ${item.name}:`, error);
          pricesMap[key] = null;
        }
      }
      
      setSnapshotCurrentPrices(pricesMap);
    } catch (error) {
      console.error("Failed to fetch current prices:", error);
    } finally {
      setLoadingCurrentPrices(false);
    }
  };

  // Filter and sort snapshot items
  const getFilteredAndSortedSnapshotItems = (items) => {
    if (!items) return [];
    
    let filtered = [...items];
    
    // Apply search filter
    if (snapshotSearch) {
      const query = snapshotSearch.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(query) ||
        item.set?.toLowerCase().includes(query) ||
        item.number?.toLowerCase().includes(query)
      );
    }
    
    // Apply condition filter
    if (snapshotConditionFilter !== "all") {
      filtered = filtered.filter(item => item.condition === snapshotConditionFilter);
    }
    
    // Apply graded filter
    if (snapshotGradedFilter === "graded") {
      filtered = filtered.filter(item => item.isGraded);
    } else if (snapshotGradedFilter === "ungraded") {
      filtered = filtered.filter(item => !item.isGraded);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (snapshotSortBy) {
        case "name":
          aVal = a.name || "";
          bVal = b.name || "";
          break;
        case "price":
          aVal = a.suggestedPrice || 0;
          bVal = b.suggestedPrice || 0;
          break;
        case "set":
          aVal = a.set || "";
          bVal = b.set || "";
          break;
        case "condition":
          aVal = a.condition || "";
          bVal = b.condition || "";
          break;
        default:
          return 0;
      }
      
      if (typeof aVal === "string") {
        return snapshotSortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return snapshotSortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
    });
    
    return filtered;
  };

  // Reset snapshot filters when closing
  const resetSnapshotFilters = () => {
    setSnapshotSearch("");
    setSnapshotSortBy("name");
    setSnapshotSortDir("asc");
    setSnapshotConditionFilter("all");
    setSnapshotGradedFilter("all");
    setSnapshotCurrentPrices(null);
  };

  // Load snapshots when opening the modal
  useEffect(() => {
    if (showSnapshotsModal && snapshots.length === 0) {
      loadSnapshots();
    }
  }, [showSnapshotsModal]);

  // Fetch current prices when viewing a snapshot
  useEffect(() => {
    if (selectedSnapshot && !snapshotCurrentPrices) {
      fetchSnapshotCurrentPrices(selectedSnapshot);
    }
  }, [selectedSnapshot]);

  // Reset filters when closing snapshot modal
  useEffect(() => {
    if (!showSnapshotsModal) {
      resetSnapshotFilters();
      setSelectedSnapshot(null);
    }
  }, [showSnapshotsModal]);

  // Sharing functionality
  const handleShareToggle = async (enabled) => {
    if (!user || !db) return;
    try {
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { shareEnabled: enabled }, { merge: true });
      setShareEnabled(enabled);
      triggerQuickAddFeedback(enabled ? "Inventory sharing enabled" : "Inventory sharing disabled");
    } catch (err) {
      console.error("Failed to update sharing", err);
      alert("Failed to update sharing preference");
    }
  };

  const handleShareNameSave = async () => {
    if (!user || !db) return;
    const trimmed = shareUsername.trim();
    try {
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { shareUsername: trimmed }, { merge: true });
      triggerQuickAddFeedback("Shareable name updated");
    } catch (err) {
      console.error("Failed to update shareable name", err);
      alert("Failed to update shareable name");
    }
  };

  const copyInventoryShareLink = async () => {
    if (!user) return;
    const shareUrl = `${window.location.origin}?inventory=${user.uid}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      triggerQuickAddFeedback("Inventory share link copied to clipboard");
    } catch (err) {
      console.error("Failed to copy link", err);
      alert("Failed to copy share link");
    }
  };

  // Toggle exclude from sale
  const toggleExcludeFromSale = async (entryId, currentValue) => {
    if (!user || !db) return;
    try {
      const updatedItems = collectionItems.map(item =>
        item.entryId === entryId
          ? { ...item, excludeFromSale: !currentValue }
          : item
      );
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { items: updatedItems }, { merge: true });
      triggerQuickAddFeedback(
        !currentValue ? "Card hidden from marketplace" : "Card visible in marketplace"
      );
    } catch (error) {
      console.error("Failed to update exclude status", error);
      alert("Failed to update card visibility");
    }
  };

  // Toggle card selection
  const toggleCardSelection = (entryId) => {
    setSelectedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedCards(new Set());
    } else {
      const allIds = new Set(filteredItems.map(item => item.entryId));
      setSelectedCards(allIds);
    }
    setSelectAll(!selectAll);
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedCards.size === 0) return;
    // Delete directly without confirmation
    try {
      const updatedItems = collectionItems.filter(item => !selectedCards.has(item.entryId));
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { items: updatedItems }, { merge: true });
      setSelectedCards(new Set());
      setSelectAll(false);
      triggerQuickAddFeedback(`${selectedCards.size} card(s) deleted`);
    } catch (error) {
      console.error("Failed to delete cards", error);
      alert("Failed to delete cards");
    }
  };

  // Bulk duplicate
  const handleBulkDuplicate = async () => {
    if (selectedCards.size === 0) return;
    
    try {
      const itemsToDuplicate = collectionItems.filter(item => selectedCards.has(item.entryId));
      const duplicatedItems = itemsToDuplicate.map(item => ({
        ...item,
        entryId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        addedAt: Date.now() // Set new timestamp for duplicated card
      }));
      
      const updatedItems = [...collectionItems, ...duplicatedItems];
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { items: updatedItems }, { merge: true });
      setSelectedCards(new Set());
      setSelectAll(false);
      triggerQuickAddFeedback(`${duplicatedItems.length} card(s) duplicated`);
    } catch (error) {
      console.error("Failed to duplicate cards", error);
      alert("Failed to duplicate cards");
    }
  };

  // Open sales modal for single card
  const handleMarkSale = (item) => {
    const metrics = computeItemMetrics(item, currency);
    
    // For graded cards, calculatedSuggestedPrice is in USD and needs conversion
    let defaultPrice;
    if (item.overridePrice != null) {
      // If there's an override price, convert it if needed
      if (item.overridePriceCurrency && item.overridePriceCurrency !== currency) {
        defaultPrice = convertCurrency(Number(item.overridePrice), currency, item.overridePriceCurrency);
      } else {
        defaultPrice = Number(item.overridePrice);
      }
    } else if (item.isGraded && item.calculatedSuggestedPrice) {
      // Graded card price is in USD, convert to current currency
      defaultPrice = convertCurrency(item.calculatedSuggestedPrice, currency);
    } else {
      defaultPrice = metrics.suggested;
    }
    
    const cardWithPrice = {
      ...item,
      unitPrice: defaultPrice,
      quantity: item.quantity || 1,
      totalPrice: defaultPrice * (item.quantity || 1)
    };
    const totalValue = cardWithPrice.totalPrice;
    setSalesModal({ 
      cards: [cardWithPrice], 
      defaultTotal: totalValue,
      cardPrices: [cardWithPrice.unitPrice]
    });
  };

  // Open sales modal for multiple cards
  const handleBulkMarkSale = () => {
    if (selectedCards.size === 0) return;
    
    const itemsToSell = collectionItems.filter(item => selectedCards.has(item.entryId));
    const cardsWithPrices = itemsToSell.map(item => {
      const metrics = computeItemMetrics(item, currency);
      
      // For graded cards, calculatedSuggestedPrice is in USD and needs conversion
      let unitPrice;
      if (item.overridePrice != null) {
        // If there's an override price, convert it if needed
        if (item.overridePriceCurrency && item.overridePriceCurrency !== currency) {
          unitPrice = convertCurrency(Number(item.overridePrice), currency, item.overridePriceCurrency);
        } else {
          unitPrice = Number(item.overridePrice);
        }
      } else if (item.isGraded && item.calculatedSuggestedPrice) {
        // Graded card price is in USD, convert to current currency
        unitPrice = convertCurrency(item.calculatedSuggestedPrice, currency);
      } else {
        unitPrice = metrics.suggested;
      }
      
      return {
        ...item,
        unitPrice,
        quantity: item.quantity || 1,
        totalPrice: unitPrice * (item.quantity || 1)
      };
    });
    const totalValue = cardsWithPrices.reduce((sum, c) => sum + c.totalPrice, 0);
    
    setSalesModal({
      cards: cardsWithPrices,
      defaultTotal: totalValue,
      cardPrices: cardsWithPrices.map(c => c.unitPrice)
    });
    setSalesCurrency(currency); // Reset to primary currency
  };

  // Confirm sale and log transaction
  const handleConfirmSale = async (finalTotal, cardPrices) => {
    if (!salesModal || !user || !db) {
      console.error("Missing required data:", { salesModal, user: !!user, db: !!db });
      return;
    }
    
    try {
      const { cards, defaultTotal } = salesModal;
      let finalPrice = parseFloat(finalTotal);
      
      if (isNaN(finalPrice) || finalPrice <= 0) {
        alert("Please enter a valid sales price");
        return;
      }
      
      // Convert from sales currency to primary currency if needed
      const inputCurrency = salesCurrency;
      if (inputCurrency !== currency) {
        console.log(`Converting sale from ${inputCurrency} to ${currency}: ${finalPrice}`);
        finalPrice = convertCurrency(finalPrice, currency, inputCurrency);
        console.log(`Converted price: ${finalPrice}`);
      }
      
      // Calculate proportional prices if total changed
      const originalTotal = cards.reduce((sum, c) => sum + (parseFloat(cardPrices[cards.indexOf(c)]) * c.quantity), 0);
      const discountRatio = finalPrice / originalTotal;
      
      const cardsWithFinalPrices = cards.map((c, idx) => {
        const originalUnitPrice = parseFloat(cardPrices[idx]);
        const originalCardTotal = originalUnitPrice * c.quantity;
        const finalUnitPrice = originalUnitPrice * discountRatio;
        const finalCardTotal = finalUnitPrice * c.quantity;
        
        const imageUrl = c.image || c.imageUrl || null;
        console.log("Card image data:", { name: c.name, image: c.image, imageUrl: c.imageUrl, finalImageUrl: imageUrl });
        
        // Create object and filter out undefined values (Firestore doesn't accept undefined)
        const cardData = {
          name: c.name || null,
          set: c.set || null,
          number: c.number || null,
          condition: c.condition || null,
          quantity: c.quantity || 1,
          unitPrice: finalUnitPrice,
          totalPrice: finalCardTotal,
          image: imageUrl,
          // Include graded card information for transaction log display
          isGraded: c.isGraded || false,
          gradingCompany: c.gradingCompany || null,
          grade: c.grade || null
        };
        
        // Filter out any remaining undefined values
        return Object.fromEntries(
          Object.entries(cardData).filter(([_, value]) => value !== undefined)
        );
      });
      
      console.log("Logging sale with images:", { 
        cardsWithFinalPrices: cardsWithFinalPrices.map(c => ({ name: c.name, image: c.image })), 
        finalPrice, 
        currency,
        inputCurrency
      });
      
      // Log to vendor_transactions collection
      const transactionRef = collection(db, "vendor_transactions");
      
      // Prepare transaction data, ensuring no undefined values
      const transactionData = {
        userId: user.uid,
        type: "sale",
        cards: cardsWithFinalPrices,
        totalAmount: finalPrice,
        currency: currency,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      
      // Only add inputCurrency if it's different from primary currency
      if (inputCurrency && inputCurrency !== currency) {
        transactionData.inputCurrency = inputCurrency;
      }
      
      const vendorTransDoc = await addDoc(transactionRef, transactionData);
      console.log("Vendor transaction logged:", vendorTransDoc.id);
      
      // Log to transaction log (for Transaction Log page)
      try {
        const logData = {
          type: "sale",
          totalValue: finalPrice,
          itemsOut: cardsWithFinalPrices,
          itemsIn: [],
          notes: `Sale of ${cards.length} card(s)`,
          currency: currency
        };
        
        // Only add inputCurrency if it's different from primary currency
        if (inputCurrency && inputCurrency !== currency) {
          logData.inputCurrency = inputCurrency;
        }
        
        await recordTransaction(db, user.uid, logData);
        console.log("Transaction log entry created");
      } catch (logError) {
        console.error("Failed to create transaction log entry:", logError);
        // Continue even if transaction log fails
      }
      
      // Remove sold cards from inventory
      const soldIds = new Set(cards.map(c => c.entryId));
      const updatedItems = collectionItems.filter(item => !soldIds.has(item.entryId));
      
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { items: updatedItems }, { merge: true });
      console.log("Inventory updated");
      
      setSalesModal(null);
      setSelectedCards(new Set());
      setSelectAll(false);
      triggerQuickAddFeedback(`Sale logged: ${formatCurrency(finalPrice, currency)}`);
    } catch (error) {
      console.error("Failed to log sale - detailed error:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      alert(`Failed to log sale: ${error.message || "Unknown error"}. Please try again.`);
    }
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Please sign in to view your inventory.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Store className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold">My Inventory</h1>
          <p className="text-muted-foreground">Vendor Toolkit</p>
        </div>
      </div>

      {/* Quick Add Card Search */}
      <Card className="rounded-2xl shadow mb-4">
        <CardContent className="p-4">
          <Button
            variant="outline"
            onClick={() => setShowQuickAddSearch(!showQuickAddSearch)}
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="font-semibold">Quick Add Cards to Inventory</span>
            </span>
            {showQuickAddSearch ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          
          {showQuickAddSearch && (
            <div className="mt-4">
              <CardSearch mode="vendor" />
            </div>
          )}
        </CardContent>
      </Card>

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
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Search inventory..."
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                  className="w-56"
                />
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-2 border-gray-400 checked:bg-primary checked:border-primary focus:ring-2 focus:ring-primary/30"
                  checked={roundUpPrices}
                  onChange={(e) => handleRoundUpToggle(e.target.checked)}
                />
                Round up prices
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="opacity-70">Sort by</label>
              <select
                className="rounded-md border px-2 py-1"
                value={collectionSortBy}
                onChange={(e) => setCollectionSortBy(e.target.value)}
              >
                <option value="addedAt">Date Added</option>
                <option value="name">Name</option>
                <option value="price">Price</option>
              </select>
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
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              Total Cards: {totals.count}
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-semibold">
              <div>TCG: {formatPrice(totals.tcg)}</div>
              <div>Market Avg: {formatPrice(totals.cmAvg)}</div>
              <div>Market Low: {formatPrice(totals.cmLowest)}</div>
              <div className="text-primary">Suggested: {formatPrice(totals.suggested)}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={collectionItems.length === 0}
              onClick={exportInventoryToCSV}
            >
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={collectionItems.length === 0}
              onClick={saveInventorySnapshot}
            >
              <Camera className="mr-1 h-4 w-4" />
              Save Snapshot
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSnapshotsModal(true)}
            >
              <History className="mr-1 h-4 w-4" />
              View Snapshots
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={collectionItems.length === 0}
              onClick={clearInventory}
            >
              Clear Inventory
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sharing Settings */}
      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Inventory Sharing
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
                  placeholder="e.g., Rafchu's Shop"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This name will be shown when you share your inventory
                </p>
              </div>
              
              <Button
                size="sm"
                onClick={copyInventoryShareLink}
                className="w-full"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Copy Inventory Share Link
              </Button>
              
              <p className="text-xs text-muted-foreground">
                💡 Shared inventory only shows vendor prices (suggested or overridden)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {sortedItems.length > 0 && (
        <Card className="rounded-2xl p-4 shadow">
          <CardContent className="p-0">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-accent transition"
                >
                  {selectAll || selectedCards.size > 0 ? (
                    <CheckSquare className="h-5 w-5" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                  <span className="text-sm font-semibold">
                    {selectedCards.size > 0 ? `${selectedCards.size} selected` : 'Select All'}
                  </span>
                </button>
              </div>

              {selectedCards.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkDuplicate}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkMarkSale}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Mark as Sold
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Grid */}
      <div className="grid gap-3">
        {sortedItems.length === 0 && collectionItems.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards in inventory yet. Use Card Search to add cards.
            </CardContent>
          </Card>
        )}
        {sortedItems.length === 0 && collectionItems.length > 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No cards match your search.
            </CardContent>
          </Card>
        )}
        {sortedItems.map((item) => {
          const metrics = computeItemMetrics(item, currency);
          const hasOverride = item.overridePrice != null && !isNaN(Number(item.overridePrice));
          
          // Calculate display price - for graded cards, convert USD price to user's currency
          let displayPrice;
          let secondaryDisplayPrice = null;
          
          if (hasOverride) {
            // If override price is in a different currency, convert it
            if (item.overridePriceCurrency && item.overridePriceCurrency !== currency) {
              displayPrice = convertCurrency(Number(item.overridePrice), currency, item.overridePriceCurrency);
            } else {
              displayPrice = Number(item.overridePrice);
            }
            
            // Calculate secondary currency if enabled
            if (secondaryCurrency && secondaryCurrency !== currency) {
              if (item.overridePriceCurrency && item.overridePriceCurrency !== secondaryCurrency) {
                secondaryDisplayPrice = convertCurrency(Number(item.overridePrice), secondaryCurrency, item.overridePriceCurrency);
              } else if (item.overridePriceCurrency === secondaryCurrency) {
                secondaryDisplayPrice = Number(item.overridePrice);
              } else {
                // Convert from current display currency to secondary
                secondaryDisplayPrice = convertCurrency(displayPrice, secondaryCurrency, currency);
              }
            }
          } else if (item.isGraded && item.calculatedSuggestedPrice) {
            // Graded card calculated price is in USD, convert it
            displayPrice = convertCurrency(item.calculatedSuggestedPrice, currency);
            if (secondaryCurrency && secondaryCurrency !== currency) {
              secondaryDisplayPrice = convertCurrency(item.calculatedSuggestedPrice, secondaryCurrency);
            }
          } else {
            displayPrice = metrics.suggested;
            if (secondaryCurrency && secondaryCurrency !== currency) {
              // metrics.suggested is already in user's currency, convert to secondary
              secondaryDisplayPrice = convertCurrency(displayPrice, secondaryCurrency, currency);
            }
          }
          
          const isEditing = editingPriceId === item.entryId;
          const isSelected = selectedCards.has(item.entryId);
          
          return (
            <Card
              key={item.entryId}
              className={`rounded-2xl p-3 transition cursor-pointer ${isSelected ? 'bg-purple-50 border-purple-300' : 'hover:bg-accent/40'}`}
              onClick={() => setCardDetailsModal(item)}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCardSelection(item.entryId)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-5 flex-shrink-0 cursor-pointer rounded border-2 border-gray-400 checked:bg-primary checked:border-primary focus:ring-2 focus:ring-primary/30"
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
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity || 1} • Added: {new Date(item.addedAt).toLocaleDateString()}</span>
                  </div>
                  {/* Only show ungraded prices for non-graded cards */}
                  {!item.isGraded && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="text-xs text-muted-foreground">
                        TCG: {formatPrice(metrics.tcg)} • Avg: {formatPrice(metrics.cmAvg)} • Low: {formatPrice(metrics.cmLowest)}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={item.excludeFromSale || false}
                        onChange={() => toggleExcludeFromSale(item.entryId, item.excludeFromSale)}
                        className="w-4 h-4 rounded border-2 border-gray-400 checked:bg-orange-600 checked:border-orange-600 focus:ring-2 focus:ring-orange-600/30"
                      />
                      <span className={item.excludeFromSale ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                        {item.excludeFromSale ? '🔒 Hidden from sale' : 'Exclude from sale'}
                      </span>
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {isEditing ? (
                    <>
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="number"
                          step="0.01"
                          value={editingPriceValue}
                          onChange={(e) => setEditingPriceValue(e.target.value)}
                          className="w-20 h-8"
                          placeholder="Price"
                        />
                        {hasOverride && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Suggested: {formatPrice(item.isGraded && item.calculatedSuggestedPrice ? convertCurrency(item.calculatedSuggestedPrice, currency) : metrics.suggested)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => savePriceOverride(item.entryId)}
                          title="Save price"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        {hasOverride && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resetPriceToSuggested(item.entryId)}
                            title="Reset to suggested price"
                          >
                            <RotateCcw className="h-3 w-3 text-blue-600" />
                          </Button>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditingPrice}
                        title="Cancel"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-end gap-1">
                        <div className={`text-sm font-bold ${hasOverride ? 'text-red-600' : 'text-primary'}`}>
                          {formatPrice(displayPrice)}
                        </div>
                        {secondaryDisplayPrice !== null && (
                          <div className="text-xs text-muted-foreground font-semibold">
                            {formatCurrency(secondaryDisplayPrice, secondaryCurrency)}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {hasOverride ? 'Manual' : 'Suggested'}
                        </div>
                        
                        {/* Price Comparison for Manual Overrides - Compact */}
                        {hasOverride && (() => {
                          // Calculate market price
                          let marketPrice;
                          if (item.isGraded && item.calculatedSuggestedPrice) {
                            marketPrice = convertCurrency(item.calculatedSuggestedPrice, currency);
                          } else if (item.calculatedSuggestedPrice) {
                            marketPrice = item.calculatedSuggestedPrice;
                          } else {
                            marketPrice = metrics.suggested;
                          }
                          
                          // Convert override price to current currency if needed
                          const overrideCurrency = item.overridePriceCurrency || currency;
                          const vendorPrice = overrideCurrency !== currency 
                            ? convertCurrency(item.overridePrice, currency, overrideCurrency)
                            : item.overridePrice;
                          
                          const difference = vendorPrice - marketPrice;
                          const percentDiff = marketPrice > 0 ? ((difference / marketPrice) * 100) : 0;
                          const isBelow = difference < 0;
                          const colorClass = isBelow ? 'text-red-600' : 'text-yellow-600';
                          const arrow = isBelow ? '↓' : '↑';
                          
                          return (
                            <div className={`text-[10px] font-medium ${colorClass} whitespace-nowrap`}>
                              {arrow} {Math.abs(percentDiff).toFixed(1)}% vs market
                            </div>
                          );
                        })()}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditingPrice(item.entryId, item.overridePrice)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  
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
                    variant="default"
                    onClick={() => handleMarkSale(item)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Sale
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteItem(item.entryId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Sales Modal */}
      {salesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-4">Confirm Sale</h2>
              
              {/* Currency Selector - only show if secondary currency is enabled */}
              {secondaryCurrency && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold mb-2">
                    Enter sales price in:
                  </label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="salesCurrency"
                        checked={salesCurrency === currency}
                        onChange={() => setSalesCurrency(currency)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{currency} (Primary)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="salesCurrency"
                        checked={salesCurrency === secondaryCurrency}
                        onChange={() => setSalesCurrency(secondaryCurrency)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{secondaryCurrency} (Secondary)</span>
                    </label>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    💡 Price will be converted to {currency} for storage
                  </p>
                </div>
              )}
              
              <div className="mb-4">
                <p className="text-sm font-semibold mb-3">
                  Selling {salesModal.cards.length} card{salesModal.cards.length !== 1 ? 's' : ''}:
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
                  {salesModal.cards.map((card, idx) => (
                    <div key={idx} className="flex justify-between items-start gap-3 pb-2 border-b last:border-0">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{card.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {card.set} #{card.number} • {card.condition} • Qty: {card.quantity}
                        </div>
                      </div>
                      <div className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={card.unitPrice.toFixed(2)}
                          id={`cardPrice-${idx}`}
                          className="w-24 text-sm h-8"
                          onChange={(e) => {
                            const newPrices = salesModal.cardPrices.map((p, i) => 
                              i === idx ? parseFloat(e.target.value) || 0 : p
                            );
                            const newTotal = salesModal.cards.reduce((sum, c, i) => 
                              sum + (newPrices[i] * c.quantity), 0
                            );
                            document.getElementById('totalPriceInput').value = newTotal.toFixed(2);
                          }}
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          = {formatCurrency(card.unitPrice * card.quantity, currency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6 bg-green-50 p-4 rounded-lg border border-green-200">
                <label className="text-sm font-semibold mb-2 block">
                  Total Sales Price ({salesCurrency})
                </label>
                <Input
                  type="number"
                  step="0.01"
                  defaultValue={salesModal.defaultTotal.toFixed(2)}
                  id="totalPriceInput"
                  className="text-lg font-bold"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Original total: {formatCurrency(salesModal.defaultTotal, currency)}
                  {secondaryCurrency && salesCurrency !== currency && (
                    <>
                      <br />
                      <span className="text-blue-600">
                        💱 Will be converted from {salesCurrency} to {currency} for storage
                      </span>
                    </>
                  )}
                  <br />
                  <span className="text-xs italic">
                    Editing the total will distribute the discount proportionally across all cards
                  </span>
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSalesModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    const totalInput = document.getElementById('totalPriceInput');
                    const total = totalInput?.value || salesModal.defaultTotal;
                    
                    // Get individual card prices
                    const cardPrices = salesModal.cards.map((_, idx) => {
                      const input = document.getElementById(`cardPrice-${idx}`);
                      return parseFloat(input?.value) || 0;
                    });
                    
                    handleConfirmSale(total, cardPrices);
                  }}
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Confirm Sale
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Card Details Modal */}
      {cardDetailsModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setCardDetailsModal(null)}
        >
          <Card 
            className="max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{cardDetailsModal.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {cardDetailsModal.set} • {cardDetailsModal.rarity} • #{cardDetailsModal.number}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCardDetailsModal(null)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Card Image and Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Image */}
                <div className="flex justify-center">
                  {cardDetailsModal.image ? (
                    <img
                      src={cardDetailsModal.image}
                      alt={cardDetailsModal.name}
                      className="max-w-full h-auto rounded-xl shadow-lg"
                    />
                  ) : (
                    <div className="w-full h-64 bg-muted rounded-xl flex flex-col items-center justify-center gap-3 relative group">
                      <p className="text-muted-foreground">No image available</p>
                      {user && needsImage(cardDetailsModal) && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardForImageUpload(cardDetailsModal);
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

                {/* Info */}
                <div className="space-y-4">
                  {/* Badges */}
                  <div>
                    <CardBadges item={cardDetailsModal} size="md" />
                  </div>

                  {/* Inventory Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium">{cardDetailsModal.quantity || 1}</span>
                    </div>
                    
                    {/* Condition/Grade - Editable */}
                    {!cardDetailsModal.isGraded && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Condition:</span>
                        {!editingCondition ? (
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold px-2 py-0.5 rounded border ${getConditionColorClass(cardDetailsModal.condition)}`}>
                              {cardDetailsModal.condition || "NM"}
                            </span>
                            <button
                              onClick={() => startEditingCondition(cardDetailsModal)}
                              className="text-xs text-primary hover:text-primary/80"
                              title="Edit condition"
                            >
                              ✏️
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Select
                              value={editConditionValue}
                              onChange={(e) => setEditConditionValue(e.target.value)}
                              className="h-8 text-sm"
                            >
                              <option value="M">Mint (M)</option>
                              <option value="NM">Near Mint (NM)</option>
                              <option value="LP">Lightly Played (LP)</option>
                              <option value="MP">Moderately Played (MP)</option>
                              <option value="HP">Heavily Played (HP)</option>
                              <option value="DMG">Damaged (DMG)</option>
                            </Select>
                            <button
                              onClick={saveConditionGrade}
                              className="text-green-600 hover:text-green-700"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              onClick={cancelEditingCondition}
                              className="text-red-600 hover:text-red-700"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {cardDetailsModal.isGraded && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Grade:</span>
                        {!editingCondition ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{cardDetailsModal.gradingCompany} {cardDetailsModal.grade}</span>
                            <button
                              onClick={() => startEditingCondition(cardDetailsModal)}
                              className="text-xs text-primary hover:text-primary/80"
                              title="Edit grade"
                            >
                              ✏️
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <Select
                                value={editGradingCompany}
                                onChange={(e) => setEditGradingCompany(e.target.value)}
                                className="h-8 text-sm"
                              >
                                <option value="PSA">PSA</option>
                                <option value="BGS">BGS</option>
                                <option value="CGC">CGC</option>
                                <option value="SGC">SGC</option>
                              </Select>
                              <Select
                                value={editGrade}
                                onChange={(e) => setEditGrade(e.target.value)}
                                className="h-8 text-sm"
                              >
                                <option value="10">10</option>
                                <option value="9.5">9.5</option>
                                <option value="9">9</option>
                                <option value="8.5">8.5</option>
                                <option value="8">8</option>
                                <option value="7.5">7.5</option>
                                <option value="7">7</option>
                              </Select>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              {updatingGradePrice && (
                                <span className="text-xs text-muted-foreground">Updating...</span>
                              )}
                              <button
                                onClick={saveConditionGrade}
                                disabled={updatingGradePrice}
                                className="text-green-600 hover:text-green-700 disabled:opacity-50"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                onClick={cancelEditingCondition}
                                disabled={updatingGradePrice}
                                className="text-red-600 hover:text-red-700 disabled:opacity-50"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Added:</span>
                      <span className="font-medium">{new Date(cardDetailsModal.addedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Vendor Price */}
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold">Your Price:</span>
                      <span className="text-xl font-bold text-primary">
                        {(() => {
                          let price;
                          if (cardDetailsModal.overridePrice != null) {
                            price = cardDetailsModal.overridePrice;
                          } else if (cardDetailsModal.isGraded && cardDetailsModal.calculatedSuggestedPrice) {
                            // Graded card calculated price is in USD, convert it
                            price = convertCurrency(cardDetailsModal.calculatedSuggestedPrice, currency);
                          } else if (cardDetailsModal.calculatedSuggestedPrice) {
                            price = cardDetailsModal.calculatedSuggestedPrice;
                          } else {
                            price = computeItemMetrics(cardDetailsModal, currency).suggested;
                          }
                          return formatPrice(price);
                        })()}
                      </span>
                    </div>
                    
                    {/* Price Comparison for Manual Overrides */}
                    {cardDetailsModal.overridePrice != null && (() => {
                      // Calculate market price
                      let marketPrice;
                      if (cardDetailsModal.isGraded && cardDetailsModal.calculatedSuggestedPrice) {
                        marketPrice = convertCurrency(cardDetailsModal.calculatedSuggestedPrice, currency);
                      } else if (cardDetailsModal.calculatedSuggestedPrice) {
                        marketPrice = cardDetailsModal.calculatedSuggestedPrice;
                      } else {
                        marketPrice = computeItemMetrics(cardDetailsModal, currency).suggested;
                      }
                      
                      // Convert override price to current currency if needed
                      const overrideCurrency = cardDetailsModal.overridePriceCurrency || currency;
                      const vendorPrice = overrideCurrency !== currency 
                        ? convertCurrency(cardDetailsModal.overridePrice, currency, overrideCurrency)
                        : cardDetailsModal.overridePrice;
                      
                      const difference = vendorPrice - marketPrice;
                      const percentDiff = marketPrice > 0 ? ((difference / marketPrice) * 100) : 0;
                      const isBelow = difference < 0;
                      const colorClass = isBelow ? 'text-red-600 bg-red-50 border-red-200' : 'text-yellow-600 bg-yellow-50 border-yellow-200';
                      const arrow = isBelow ? '↓' : '↑';
                      
                      return (
                        <div className={`text-xs p-2 rounded border ${colorClass} space-y-1`}>
                          <div className="flex justify-between items-center">
                            <span className="font-medium">vs. Market Price:</span>
                            <span className="font-semibold">{formatPrice(marketPrice)}</span>
                          </div>
                          <div className="flex justify-between items-center font-bold">
                            <span>{arrow} Difference:</span>
                            <span>
                              {formatPrice(Math.abs(difference))} ({Math.abs(percentDiff).toFixed(1)}%)
                            </span>
                          </div>
                          <div className="text-[10px] opacity-75 text-center pt-1 border-t border-current/20">
                            {isBelow ? 'Below market' : 'Above market'}
                          </div>
                        </div>
                      );
                    })()}
                    
                    {!cardDetailsModal.overridePrice && (
                      <p className="text-xs text-muted-foreground">Suggested market price</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Market Prices */}
              {!cardDetailsModal.isGraded && cardDetailsModal.prices && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Market Prices</h3>
                  <CardPrices
                    card={cardDetailsModal}
                    condition={cardDetailsModal.condition || "NM"}
                    formatPrice={formatPrice}
                    mode="vendor"
                    marketSource="tcg"
                    currency={currency}
                  />
                </div>
              )}

              {/* Graded Price Info */}
              {cardDetailsModal.isGraded && cardDetailsModal.gradedPrice && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Graded Price</h3>
                  <Card className="rounded-2xl p-4 shadow border-purple-200 bg-purple-50">
                    <CardContent className="p-0">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-semibold text-purple-700">
                          PriceCharting - {cardDetailsModal.gradingCompany} {cardDetailsModal.grade} ({currency})
                        </span>
                        {cardDetailsModal.name && (
                          <a
                            href={`https://www.pricecharting.com/game/pokemon-cards?q=${encodeURIComponent(cardDetailsModal.name)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-lg font-bold">
                        {formatPrice(convertCurrency(parseFloat(cardDetailsModal.gradedPrice), currency))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* External Links */}
              {cardDetailsModal.links && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">External Links</h3>
                  <ExternalLinks links={cardDetailsModal.links} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Inventory Snapshots Modal */}
      {showSnapshotsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => {
          setShowSnapshotsModal(false);
          setSelectedSnapshot(null);
        }}>
          <Card className="max-w-6xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <History className="h-6 w-6" />
                  Inventory Snapshots
                </h2>
                <Button variant="ghost" size="icon" onClick={() => {
                  setShowSnapshotsModal(false);
                  setSelectedSnapshot(null);
                }}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {selectedSnapshot ? (
                // View snapshot details
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSnapshot(null)}
                    className="mb-4"
                  >
                    ← Back to List
                  </Button>

                  <div className="mb-4">
                    <h3 className="text-xl font-semibold">
                      Snapshot from {new Date(selectedSnapshot.createdAt).toLocaleString()}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 mb-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-sm text-muted-foreground">Total Items</div>
                        <div className="text-2xl font-bold">{selectedSnapshot.totalItems}</div>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="text-sm text-muted-foreground">Total Value (Saved)</div>
                        <div className="text-2xl font-bold">{formatCurrency(selectedSnapshot.totalValue, selectedSnapshot.currency)}</div>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <div className="text-sm text-muted-foreground">TCG Avg</div>
                        <div className="text-xl font-bold">{formatCurrency(selectedSnapshot.totals?.tcgAvg || 0, selectedSnapshot.currency)}</div>
                      </div>
                      <div className="bg-orange-50 p-3 rounded-lg">
                        <div className="text-sm text-muted-foreground">Market Avg</div>
                        <div className="text-xl font-bold">{formatCurrency(selectedSnapshot.totals?.cmAvg || 0, selectedSnapshot.currency)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Search and Filters */}
                  <div className="mb-4 space-y-3">
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search cards by name, set, or number..."
                        value={snapshotSearch}
                        onChange={(e) => setSnapshotSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {/* Filters and Sorting Row */}
                    <div className="flex flex-wrap gap-2">
                      {/* Sort By */}
                      <select
                        value={snapshotSortBy}
                        onChange={(e) => setSnapshotSortBy(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="name">Sort by Name</option>
                        <option value="price">Sort by Price</option>
                        <option value="set">Sort by Set</option>
                        <option value="condition">Sort by Condition</option>
                      </select>

                      {/* Sort Direction */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSnapshotSortDir(snapshotSortDir === "asc" ? "desc" : "asc")}
                      >
                        {snapshotSortDir === "asc" ? "↑ Asc" : "↓ Desc"}
                      </Button>

                      {/* Condition Filter */}
                      <select
                        value={snapshotConditionFilter}
                        onChange={(e) => setSnapshotConditionFilter(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="all">All Conditions</option>
                        <option value="NM">Near Mint</option>
                        <option value="LP">Lightly Played</option>
                        <option value="MP">Moderately Played</option>
                        <option value="HP">Heavily Played</option>
                        <option value="DM">Damaged</option>
                      </select>

                      {/* Graded Filter */}
                      <select
                        value={snapshotGradedFilter}
                        onChange={(e) => setSnapshotGradedFilter(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="all">All Cards</option>
                        <option value="graded">Graded Only</option>
                        <option value="ungraded">Ungraded Only</option>
                      </select>

                      {/* Clear Filters */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={resetSnapshotFilters}
                      >
                        Clear Filters
                      </Button>
                    </div>
                  </div>

                  {/* Loading Current Prices Indicator */}
                  {loadingCurrentPrices && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg text-center text-sm text-blue-700">
                      Fetching current market prices for comparison...
                    </div>
                  )}

                  {/* Cards List */}
                  <div className="space-y-2">
                    {getFilteredAndSortedSnapshotItems(selectedSnapshot.items).map((item, idx) => {
                      const cardKey = `${item.name}-${item.set}-${item.number}`;
                      const currentPrice = snapshotCurrentPrices?.[cardKey];
                      const savedPrice = item.suggestedPrice || 0;
                      const priceDiff = currentPrice !== null && currentPrice !== undefined ? currentPrice - savedPrice : null;
                      const percentChange = savedPrice > 0 && priceDiff !== null ? ((priceDiff / savedPrice) * 100) : null;

                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-20 w-16 object-cover rounded border shadow-sm flex-shrink-0"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold">{item.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.set} #{item.number}
                              {item.isGraded && item.gradingCompany && item.grade ? (
                                <span className="ml-2 text-yellow-600 font-semibold">
                                  {item.gradingCompany} {item.grade}
                                </span>
                              ) : (
                                <span className="ml-2">• {item.condition}</span>
                              )}
                              {item.quantity > 1 && <span> • Qty: {item.quantity}</span>}
                              {item.isReverseHolo && <span className="ml-2 text-blue-600">⭐ Reverse Holo</span>}
                              {item.isFirstEdition && <span className="ml-2 text-purple-600">1st Edition</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-lg">{formatCurrency(savedPrice, selectedSnapshot.currency)}</div>
                            {item.quantity > 1 && (
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(savedPrice / item.quantity, selectedSnapshot.currency)} each
                              </div>
                            )}
                            
                            {/* Price Comparison */}
                            {currentPrice !== null && currentPrice !== undefined && (
                              <div className="mt-1 text-sm">
                                <div className="text-muted-foreground">
                                  Now: {formatCurrency(currentPrice, selectedSnapshot.currency)}
                                </div>
                                {priceDiff !== null && (
                                  <div className={`font-semibold ${priceDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {priceDiff >= 0 ? '+' : ''}{formatCurrency(priceDiff, selectedSnapshot.currency)}
                                    {percentChange !== null && ` (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%)`}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* No Results Message */}
                  {getFilteredAndSortedSnapshotItems(selectedSnapshot.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No cards match your filters.
                    </div>
                  )}
                </div>
              ) : (
                // List of snapshots
                <div>
                  {loadingSnapshots ? (
                    <div className="text-center py-8 text-muted-foreground">Loading snapshots...</div>
                  ) : snapshots.length === 0 ? (
                    <div className="text-center py-8">
                      <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No snapshots saved yet.</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Click "Save Snapshot" to capture your current inventory.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {snapshots.map((snapshot) => (
                        <div
                          key={snapshot.id}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition cursor-pointer"
                          onClick={() => setSelectedSnapshot(snapshot)}
                        >
                          <div className="flex-1">
                            <div className="font-semibold">
                              {new Date(snapshot.createdAt).toLocaleDateString()} at {new Date(snapshot.createdAt).toLocaleTimeString()}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {snapshot.totalItems} items • Total Value: {formatCurrency(snapshot.totalValue, snapshot.currency)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this snapshot?')) {
                                  deleteSnapshot(snapshot.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={imageUploadModalOpen}
        card={cardForImageUpload}
        onClose={() => {
          setImageUploadModalOpen(false);
          setCardForImageUpload(null);
        }}
      />
    </div>
  );
}

