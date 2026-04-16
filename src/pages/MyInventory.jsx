import { useMemo, useState, useEffect, useCallback, useDeferredValue } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Store, Trash2, Edit2, Check, X, Download, Share2, Copy, DollarSign, CheckSquare, Square, Filter, ExternalLink, Upload, Camera, History, Search, ChevronDown, ChevronUp, RotateCcw, Wallet, EyeOff, Eye } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { computeInventoryTotals, formatCurrency, computeItemMetrics, exportToCSV, getConditionColorClass, recordTransaction, convertCurrency } from "@/utils/cardHelpers";
import { ConditionSelect, CardPrices, ExternalLinks } from "@/components/CardComponents";
import { CardBadges, CardPriceInfo, GradedCardInfo, VariantInfo } from "@/components/CardBadges";
import { GradingBadge } from "@/components/GradingCompanyLogo";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { CashManager } from "@/components/CashManager";
import { needsImage } from "@/utils/imageHelpers";
import { CardLadderImport } from "@/components/CardLadderImport";
import { CardImageReplacer } from "@/components/CardImageReplacer";
import { apiFetchMarketPrices } from "@/utils/apiHelpers";
import { setDoc, doc, addDoc, collection, serverTimestamp, getDocs, query, orderBy, deleteDoc, updateDoc } from "firebase/firestore";
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
    cashData,
    updateCashData,
    updateCollectionItem,
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
  const [renamingSnapshotId, setRenamingSnapshotId] = useState(null);
  const [renameSnapshotValue, setRenameSnapshotValue] = useState("");
  
  // Quick Add Search toggle
  const [showQuickAddSearch, setShowQuickAddSearch] = useState(false);
  
  // Edit condition/grade states
  const [editingCondition, setEditingCondition] = useState(false);
  const [editConditionValue, setEditConditionValue] = useState("");
  const [editGradingCompany, setEditGradingCompany] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [updatingGradePrice, setUpdatingGradePrice] = useState(false);

  // Edit card details (name, set, number) states
  const [editingCardDetails, setEditingCardDetails] = useState(false);
  const [editCardName, setEditCardName] = useState("");
  const [editCardSet, setEditCardSet] = useState("");
  const [editCardNumber, setEditCardNumber] = useState("");
  
  // Filter states
  const [filterRarity, setFilterRarity] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterSet, setFilterSet] = useState("all");
  const [filterGraded, setFilterGraded] = useState("all"); // "all", "graded", "ungraded", "manualPrice"
  const [filterVisibility, setFilterVisibility] = useState("all"); // "all", "visible", "hidden"
  const [showFilters, setShowFilters] = useState(false);
  
  // Image upload modal state
  const [imageUploadModalOpen, setImageUploadModalOpen] = useState(false);
  const [cardForImageUpload, setCardForImageUpload] = useState(null);
  
  // CardLadder import modal state
  const [showCardLadderImport, setShowCardLadderImport] = useState(false);
  
  // Image replacer modal state
  const [imageReplaceCard, setImageReplaceCard] = useState(null);
  
  const handleImageUpdate = useCallback(async (entryId, newImageUrl) => {
    try {
      // Persist to Firestore FIRST — if this fails, nothing changes
      const docRef = doc(db, "collections", user.uid);
      const { getDoc: gd } = await import("firebase/firestore");
      const snap = await gd(docRef);
      const data = snap.exists() ? snap.data() : {};
      const updatedItems = (data.items || []).map(it =>
        it.entryId === entryId ? { ...it, image: newImageUrl, imageManuallySet: true } : it
      );
      await setDoc(docRef, { ...data, items: updatedItems }, { merge: true });
      updateCollectionItem(entryId, { image: newImageUrl, imageManuallySet: true });
      console.log("[ImageUpdate] Persisted image for", entryId);
    } catch (err) {
      console.error("[ImageUpdate] Firestore write failed:", err);
      throw err; // CardImageReplacer will catch and show error
    }
  }, [db, user, updateCollectionItem]);
  
  // Reset "Select All" flag when filters change (since the visible set changed), but keep individual selections
  useEffect(() => {
    setSelectAll(false);
  }, [filterGraded, filterVisibility, filterRarity, filterCondition, filterSet, collectionSearch]);

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

  // Defer the search term so typing in the box stays responsive even when
  // the inventory has thousands of cards. React will keep rendering the
  // previously-filtered list while the new one computes in the background,
  // then swap it in when ready.
  const deferredSearch = useDeferredValue(collectionSearch);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let items = enrichedItems;

    // Text search
    if (deferredSearch) {
      const term = deferredSearch.toLowerCase();
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
    } else if (filterGraded === "manualPrice") {
      items = items.filter(item =>
        (item.overridePrice != null && !isNaN(Number(item.overridePrice))) ||
        (item.manualPrice != null && item.manualPrice > 0)
      );
    }

    // Visibility filter (stacks with other filters)
    if (filterVisibility === "hidden") {
      items = items.filter(item => item.excludeFromSale === true);
    } else if (filterVisibility === "visible") {
      items = items.filter(item => !item.excludeFromSale);
    }

    return items;
  }, [enrichedItems, deferredSearch, filterRarity, filterCondition, filterSet, filterGraded, filterVisibility]);

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

  // Calculate totals based on filtered items (respects All/Graded/Ungraded filter)
  const totals = useMemo(() => {
    return computeInventoryTotals(filteredItems, currency);
  }, [filteredItems, currency]);

  // Format price with rounding and selected currency
  const formatPrice = (value) => formatCurrency(roundUpPrices ? Math.ceil(Number(value ?? 0)) : Number(value ?? 0), currency);

  // Round up to nearest multiple of 5
  const roundUpMarkup = (basePrice, pct) => Math.ceil((basePrice * (1 + pct / 100)) / 5) * 5;

  // Quick-apply a markup percentage on a graded card's market price
  const applyGradedMarkup = async (item, pct) => {
    if (!item?.isGraded || !item?.gradedPrice) return;
    const baseInCurrency = convertCurrency(parseFloat(item.gradedPrice), currency, "USD");
    const rounded = roundUpMarkup(baseInCurrency, pct);
    const updatedItems = collectionItems.map(i =>
      i.entryId === item.entryId ? { ...i, overridePrice: rounded, overridePriceCurrency: currency } : i
    );
    await saveInventory(updatedItems);
    triggerQuickAddFeedback(`Set to +${pct}% → ${formatCurrency(rounded, currency)}`);
  };

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
          number: String(item.number || ""),
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
          isFirstEdition: item.isFirstEdition || false,
          isStampedPromo: item.isStampedPromo || false,
          isSealed: item.isSealed || false,
          isAutographed: item.isAutographed || false,
          isPokeBall: item.isPokeBall || false,
          isMasterBall: item.isMasterBall || false,
          isUnlimited: item.isUnlimited || false,
        };
        
        // Filter out undefined values
        return Object.fromEntries(
          Object.entries(itemData).filter(([_, value]) => value !== undefined)
        );
      });
      
      // Include cash balance data
      const physicalCash = (cashData.physical || []).map(e => ({
        currency: e.currency || "",
        amount: e.amount || 0,
      }));
      const digitalCash = (cashData.digital || []).map(e => ({
        platform: e.platform || "",
        currency: e.currency || "",
        amount: e.amount || 0,
        note: e.note || "",
      }));
      const pendingCash = (cashData.pending || []).map(e => ({
        platform: e.platform || "",
        currency: e.currency || "",
        amount: e.amount || 0,
        note: e.note || "",
      }));
      const cashPhysicalTotal = physicalCash.reduce((sum, e) => sum + convertCurrency(e.amount, currency, e.currency), 0);
      const cashDigitalTotal = digitalCash.reduce((sum, e) => sum + convertCurrency(e.amount, currency, e.currency), 0);
      const cashPendingTotal = pendingCash.reduce((sum, e) => sum + convertCurrency(e.amount, currency, e.currency), 0);

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
        cashBalance: {
          physical: physicalCash,
          digital: digitalCash,
          pending: pendingCash,
          physicalTotal: cashPhysicalTotal,
          digitalTotal: cashDigitalTotal,
          pendingTotal: cashPendingTotal,
          grandTotal: cashPhysicalTotal + cashDigitalTotal,
          projectedTotal: cashPhysicalTotal + cashDigitalTotal + cashPendingTotal,
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
      loadSnapshots();
    } catch (error) {
      console.error("Failed to delete snapshot:", error);
      alert("Failed to delete snapshot.");
    }
  };

  const renameSnapshot = async (snapshotId, newName) => {
    if (!user || !db) return;
    try {
      const snapshotRef = doc(db, "inventory_snapshots", user.uid, "snapshots", snapshotId);
      await updateDoc(snapshotRef, { name: newName.trim() });
      setSnapshots(prev => prev.map(s => s.id === snapshotId ? { ...s, name: newName.trim() } : s));
      if (selectedSnapshot?.id === snapshotId) {
        setSelectedSnapshot(prev => prev ? { ...prev, name: newName.trim() } : prev);
      }
      setRenamingSnapshotId(null);
      setRenameSnapshotValue("");
      triggerQuickAddFeedback("Snapshot renamed");
    } catch (error) {
      console.error("Failed to rename snapshot:", error);
      alert("Failed to rename snapshot.");
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
        String(item.name || "").toLowerCase().includes(query) ||
        String(item.set || "").toLowerCase().includes(query) ||
        String(item.number || "").toLowerCase().includes(query)
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

  // Toggle select all visible cards (preserves selections from other searches)
  const toggleSelectAll = () => {
    const visibleIds = new Set(filteredItems.map(item => item.entryId));
    if (selectAll) {
      // Deselect only the currently visible cards, keep others
      setSelectedCards(prev => {
        const newSet = new Set(prev);
        visibleIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Add all visible cards to selection
      setSelectedCards(prev => new Set([...prev, ...visibleIds]));
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

  // Bulk toggle visibility (hide/show from sale)
  const handleBulkToggleVisibility = async (hide) => {
    if (selectedCards.size === 0) return;
    try {
      const updatedItems = collectionItems.map(item =>
        selectedCards.has(item.entryId)
          ? { ...item, excludeFromSale: hide }
          : item
      );
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { items: updatedItems }, { merge: true });
      setSelectedCards(new Set());
      setSelectAll(false);
      triggerQuickAddFeedback(
        hide
          ? `${selectedCards.size} card(s) hidden from marketplace`
          : `${selectedCards.size} card(s) now visible in marketplace`
      );
    } catch (error) {
      console.error("Failed to update card visibility", error);
      alert("Failed to update card visibility");
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
    } else {
      // Use metrics.suggested which handles currency correctly for all cases
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
      } else {
        // Use metrics.suggested which handles currency correctly for all cases
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
      <div className="mb-4 sm:mb-6 flex items-center gap-3">
        <Store className="h-6 w-6 sm:h-8 sm:w-8 text-green-600" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">My Inventory</h1>
          <p className="text-sm text-muted-foreground">Vendor Toolkit</p>
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
      <Card className="rounded-2xl p-3 sm:p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3">
            {/* Quick Filter Buttons */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
              <Button
                size="sm"
                className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                variant={filterGraded === "all" ? "default" : "outline"}
                onClick={() => setFilterGraded("all")}
              >
                All
              </Button>
              <Button
                size="sm"
                className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                variant={filterGraded === "graded" ? "default" : "outline"}
                onClick={() => setFilterGraded("graded")}
              >
                Graded
              </Button>
              <Button
                size="sm"
                className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                variant={filterGraded === "ungraded" ? "default" : "outline"}
                onClick={() => setFilterGraded("ungraded")}
              >
                Ungraded
              </Button>
              <Button
                size="sm"
                className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                variant={filterGraded === "manualPrice" ? "default" : "outline"}
                onClick={() => setFilterGraded("manualPrice")}
              >
                Manual
              </Button>

              <div className="w-px h-5 sm:h-6 bg-border mx-0.5 sm:mx-1" />

              <Button
                size="sm"
                variant={filterVisibility === "hidden" ? "default" : "outline"}
                onClick={() => setFilterVisibility(filterVisibility === "hidden" ? "all" : "hidden")}
                className={`text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3 ${filterVisibility === "hidden" ? "bg-orange-600 hover:bg-orange-700" : ""}`}
              >
                <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                Hidden
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <Input
                  placeholder="Search inventory..."
                  value={collectionSearch}
                  onChange={(e) => setCollectionSearch(e.target.value)}
                  className="w-full sm:w-56 h-8 sm:h-9 text-sm"
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

      {/* Cash Balance Manager */}
      <CashManager
        cashData={cashData}
        onUpdate={updateCashData}
        primaryCurrency={currency}
        isCollapsed={true}
      />

      {/* Totals */}
      <Card className="rounded-2xl p-3 sm:p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>
                  {filterGraded === "graded" ? "Graded Cards" : filterGraded === "ungraded" ? "Ungraded Cards" : filterGraded === "manualPrice" ? "Manual Price Cards" : "Total Cards"}{filterVisibility === "hidden" ? " (Hidden)" : filterVisibility === "visible" ? " (Visible)" : ""}: {totals.count}
                </span>
                {(filterGraded !== "all" || filterVisibility !== "all") && (
                  <span className="text-xs text-muted-foreground">
                    (of {collectionItems.length} total)
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm font-semibold">
              <div>TCG: {formatPrice(totals.tcg)}</div>
              <div>Avg: {formatPrice(totals.cmAvg)}</div>
              <div>Low: {formatPrice(totals.cmLowest)}</div>
              <div className="text-primary">Suggested: {formatPrice(totals.suggested)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={() => setShowCardLadderImport(true)}
              >
                <Upload className="mr-1 h-3.5 w-3.5" />
                Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                disabled={collectionItems.length === 0}
                onClick={exportInventoryToCSV}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                disabled={collectionItems.length === 0}
                onClick={saveInventorySnapshot}
              >
                <Camera className="mr-1 h-3.5 w-3.5" />
                Snapshot
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={() => setShowSnapshotsModal(true)}
              >
                <History className="mr-1 h-3.5 w-3.5" />
                Snapshots
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                disabled={collectionItems.length === 0}
                onClick={clearInventory}
              >
                Clear
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
        <Card className="rounded-2xl p-3 sm:p-4 shadow">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 px-3 py-1.5 sm:py-2 rounded-lg border hover:bg-accent transition"
              >
                {selectAll || selectedCards.size > 0 ? (
                  <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Square className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
                <span className="text-xs sm:text-sm font-semibold">
                  {selectedCards.size > 0 ? `${selectedCards.size} selected` : 'Select All'}
                </span>
              </button>

              {selectedCards.size > 0 && (
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  {(() => {
                    const selectedItems = collectionItems.filter(item => selectedCards.has(item.entryId));
                    const allHidden = selectedItems.every(item => item.excludeFromSale);
                    return allHidden ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 sm:h-9"
                        onClick={() => handleBulkToggleVisibility(false)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Show
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-orange-300 text-orange-700 hover:bg-orange-50 text-xs h-7 sm:h-9"
                        onClick={() => handleBulkToggleVisibility(true)}
                      >
                        <EyeOff className="h-3.5 w-3.5 mr-1" />
                        Hide
                      </Button>
                    );
                  })()}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 sm:h-9"
                    onClick={handleBulkDuplicate}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 sm:h-9"
                    onClick={handleBulkMarkSale}
                  >
                    <DollarSign className="h-3.5 w-3.5 mr-1" />
                    Sold
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-xs h-7 sm:h-9"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
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
          } else {
            // Use metrics.suggested for all other cases (including graded cards)
            // computeItemMetrics already handles currency conversion correctly for:
            // - Manual graded prices (uses gradedPriceCurrency)
            // - API-fetched graded prices (assumes USD, converts to user currency)
            // - Regular cards (calculates from market data)
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
              className={`rounded-2xl p-2.5 sm:p-3 cursor-pointer transition-all duration-200 ${isSelected ? 'bg-purple-50 border-purple-300' : 'hover:bg-accent/40 hover:shadow-lg hover:scale-[1.02]'}`}
              onClick={() => setCardDetailsModal(item)}
            >
              <div className="flex flex-col gap-1.5">
                {/* Row 1: checkbox + image + card name/set */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCardSelection(item.entryId)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 cursor-pointer rounded border-2 border-gray-400 checked:bg-primary checked:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageReplaceCard(item);
                    }}
                    className="relative group flex-shrink-0"
                    title="Click to change image"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-14 w-10 sm:h-20 sm:w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-14 w-10 sm:h-20 sm:w-16 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center">
                        <span className="text-[8px] text-gray-400 text-center px-1">No Image</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                      <Edit2 className="h-4 w-4 text-white" />
                    </div>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm leading-tight truncate">{item.name}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                      {item.set} • {item.rarity} • #{item.number}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Qty: {item.quantity || 1} • {new Date(item.addedAt).toLocaleDateString()}
                    </div>
                    {(item.isReverseHolo || item.isStampedPromo || item.isSealed || item.isAutographed || item.isFirstEdition || item.isPokeBall || item.isMasterBall || item.isUnlimited) && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {item.isReverseHolo && <span className="text-[9px] font-semibold px-1 rounded bg-blue-100 text-blue-700">RH</span>}
                        {item.isStampedPromo && <span className="text-[9px] font-semibold px-1 rounded bg-purple-100 text-purple-700">Stamp</span>}
                        {item.isSealed && <span className="text-[9px] font-semibold px-1 rounded bg-emerald-100 text-emerald-700">Sealed</span>}
                        {item.isAutographed && <span className="text-[9px] font-semibold px-1 rounded bg-rose-100 text-rose-700">Auto</span>}
                        {item.isFirstEdition && <span className="text-[9px] font-semibold px-1 rounded bg-amber-100 text-amber-800">1st Ed</span>}
                        {item.isPokeBall && <span className="text-[9px] font-semibold px-1 rounded bg-red-100 text-red-700">Poké</span>}
                        {item.isMasterBall && <span className="text-[9px] font-semibold px-1 rounded bg-violet-100 text-violet-700">Master</span>}
                        {item.isUnlimited && <span className="text-[9px] font-semibold px-1 rounded bg-gray-100 text-gray-700">Unl.</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: price + condition + vs market — own row so it's always visible */}
                <div className="flex items-center gap-2 pl-6 sm:pl-7 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="number"
                        step="0.01"
                        value={editingPriceValue}
                        onChange={(e) => setEditingPriceValue(e.target.value)}
                        className="w-28 h-9 text-base font-bold"
                        placeholder="Price"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") savePriceOverride(item.entryId);
                          else if (e.key === "Escape") cancelEditingPrice();
                        }}
                      />
                      <Button size="sm" onClick={() => savePriceOverride(item.entryId)} className="h-9 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold">
                        <Check className="h-4 w-4 mr-1" /> Save
                      </Button>
                      {hasOverride && (
                        <Button size="sm" variant="outline" onClick={() => resetPriceToSuggested(item.entryId)} className="h-9 px-3 text-xs border-blue-300 text-blue-600 hover:bg-blue-50">
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={cancelEditingPrice} className="h-9 px-3 text-xs border-red-300 text-red-600 hover:bg-red-50">
                        <X className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditingPrice(item.entryId, hasOverride ? item.overridePrice : displayPrice)}
                        className={`text-sm font-bold ${hasOverride ? 'text-red-600' : 'text-primary'} hover:underline cursor-pointer`}
                        title="Tap to edit price"
                      >
                        {formatPrice(displayPrice)}
                      </button>
                      <Edit2 className="h-3 w-3 text-muted-foreground/50" />
                      {secondaryDisplayPrice !== null && (
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          ({formatCurrency(secondaryDisplayPrice, secondaryCurrency)})
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {hasOverride ? 'Manual' : 'Suggested'}
                      </span>
                      {hasOverride && (() => {
                        const marketPrice = metrics.suggested;
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
                          <span className={`text-[10px] font-medium ${colorClass}`}>
                            {arrow} {Math.abs(percentDiff).toFixed(1)}% vs mkt
                          </span>
                        );
                      })()}
                    </>
                  )}
                  {!isEditing && (item.isGraded ? (
                    <GradingBadge company={item.gradingCompany} grade={item.grade} />
                  ) : (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getConditionColorClass(item.condition)}`}>
                      {item.condition || "NM"}
                    </span>
                  ))}
                </div>

                {/* Row 3: exclude + markup buttons + actions */}
                <div className="flex items-center gap-1.5 pl-6 sm:pl-7" onClick={(e) => e.stopPropagation()}>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer whitespace-nowrap flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={item.excludeFromSale || false}
                      onChange={() => toggleExcludeFromSale(item.entryId, item.excludeFromSale)}
                      className="w-3 h-3 rounded border-2 border-gray-400 checked:bg-orange-600 checked:border-orange-600"
                    />
                    <span className={item.excludeFromSale ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                      {item.excludeFromSale ? '🔒' : 'Excl.'}
                    </span>
                  </label>

                  <div className="flex-1" />

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.isGraded && item.gradedPrice && (
                      <>
                        {[5, 10].map((pct) => {
                          const base = convertCurrency(parseFloat(item.gradedPrice), currency, "USD");
                          const rounded = roundUpMarkup(base, pct);
                          return (
                            <Button
                              key={pct}
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                applyGradedMarkup(item, pct);
                              }}
                              className="text-[10px] h-6 px-1.5 gap-0.5 border-purple-300 text-purple-700 hover:bg-purple-100 flex-shrink-0"
                            >
                              +{pct}% → {formatPrice(rounded)}
                            </Button>
                          );
                        })}
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleMarkSale(item)}
                      className="bg-green-600 hover:bg-green-700 h-6 px-1.5 text-[10px] flex-shrink-0"
                    >
                      <DollarSign className="h-3 w-3 mr-0.5" />
                      Sale
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={() => deleteItem(item.entryId)} title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
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
                <div className="flex-1 min-w-0 mr-3">
                  {editingCardDetails ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editCardName}
                        onChange={(e) => setEditCardName(e.target.value)}
                        className="w-full text-xl font-bold border-b-2 border-primary bg-transparent outline-none px-0 py-1"
                        placeholder="Card name"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editCardSet}
                          onChange={(e) => setEditCardSet(e.target.value)}
                          className="flex-1 text-sm border-b border-gray-300 bg-transparent outline-none px-0 py-1"
                          placeholder="Set"
                        />
                        <input
                          type="text"
                          value={editCardNumber}
                          onChange={(e) => setEditCardNumber(e.target.value)}
                          className="w-24 text-sm border-b border-gray-300 bg-transparent outline-none px-0 py-1"
                          placeholder="#Number"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={async () => {
                            const updates = {
                              name: editCardName.trim(),
                              set: editCardSet.trim(),
                              number: editCardNumber.trim(),
                            };
                            updateCollectionItem(cardDetailsModal.entryId, updates);
                            setCardDetailsModal(prev => prev ? { ...prev, ...updates } : prev);
                            setEditingCardDetails(false);
                            try {
                              const ref = doc(db, "collections", user.uid);
                              const updatedItems = collectionItems.map(it =>
                                it.entryId === cardDetailsModal.entryId ? { ...it, ...updates } : it
                              );
                              await setDoc(ref, { items: updatedItems }, { merge: true });
                              triggerQuickAddFeedback("Card details updated");
                            } catch (err) {
                              console.error("Failed to save card details:", err);
                            }
                          }}
                          className="text-sm font-medium px-3 py-1 rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCardDetails(false)}
                          className="text-sm font-medium px-3 py-1 rounded-md border hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="group cursor-pointer"
                      onClick={() => {
                        setEditCardName(cardDetailsModal.name || "");
                        setEditCardSet(cardDetailsModal.set || "");
                        setEditCardNumber(cardDetailsModal.number || "");
                        setEditingCardDetails(true);
                      }}
                      title="Click to edit name, set, or number"
                    >
                      <h2 className="text-2xl font-bold group-hover:text-primary transition-colors">
                        {cardDetailsModal.name}
                        <Edit2 className="h-4 w-4 inline ml-2 opacity-0 group-hover:opacity-50 transition-opacity" />
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {cardDetailsModal.set} • {cardDetailsModal.rarity} • #{cardDetailsModal.number}
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setCardDetailsModal(null); setEditingCardDetails(false); }}
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
                                <option value="ACE">ACE</option>
                                <option value="Other">Other</option>
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

                  {/* Variant Tags */}
                  <div className="border-t pt-3">
                    <p className="text-sm font-semibold mb-2">Variants / Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "isReverseHolo",  label: "Reverse Holo",  on: "bg-blue-100 text-blue-700 border-blue-300" },
                        { key: "isStampedPromo", label: "Stamped Promo", on: "bg-purple-100 text-purple-700 border-purple-300" },
                        { key: "isSealed",       label: "Sealed",        on: "bg-emerald-100 text-emerald-700 border-emerald-300" },
                        { key: "isAutographed",  label: "Autographed",   on: "bg-rose-100 text-rose-700 border-rose-300" },
                        { key: "isFirstEdition", label: "1st Edition",   on: "bg-amber-100 text-amber-800 border-amber-300" },
                        { key: "isPokeBall",     label: "Poké Ball",     on: "bg-red-100 text-red-700 border-red-300" },
                        { key: "isMasterBall",   label: "Master Ball",   on: "bg-violet-100 text-violet-700 border-violet-300" },
                        { key: "isUnlimited",    label: "Unlimited",     on: "bg-gray-100 text-gray-700 border-gray-300" },
                      ].map(({ key, label, on }) => {
                        const active = cardDetailsModal[key] || false;
                        return (
                          <button
                            key={key}
                            onClick={async () => {
                              const newVal = !active;
                              updateCollectionItem(cardDetailsModal.entryId, { [key]: newVal });
                              setCardDetailsModal(prev => prev ? { ...prev, [key]: newVal } : prev);
                              try {
                                const ref = doc(db, "collections", user.uid);
                                const updatedItems = collectionItems.map(it =>
                                  it.entryId === cardDetailsModal.entryId ? { ...it, [key]: newVal } : it
                                );
                                await setDoc(ref, { items: updatedItems }, { merge: true });
                              } catch (err) {
                                console.error("Failed to save variant:", err);
                              }
                            }}
                            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                              active
                                ? on
                                : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                            }`}
                          >
                            {active ? "✓ " : ""}{label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vendor Price */}
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold">Your Price:</span>
                      {editingPriceId === cardDetailsModal.entryId ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value)}
                            className="w-28 h-8 text-sm"
                            placeholder="Price"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = editingPriceValue.trim();
                                const numVal = val === "" ? null : parseFloat(val);
                                savePriceOverride(cardDetailsModal.entryId);
                                setCardDetailsModal((prev) => prev ? { ...prev, overridePrice: numVal, overridePriceCurrency: numVal !== null ? currency : null } : prev);
                              } else if (e.key === "Escape") {
                                cancelEditingPrice();
                              }
                            }}
                          />
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
                            const val = editingPriceValue.trim();
                            const numVal = val === "" ? null : parseFloat(val);
                            savePriceOverride(cardDetailsModal.entryId);
                            setCardDetailsModal((prev) => prev ? { ...prev, overridePrice: numVal, overridePriceCurrency: numVal !== null ? currency : null } : prev);
                          }} title="Save">
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={cancelEditingPrice} title="Cancel">
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`text-xl font-bold ${cardDetailsModal.overridePrice != null ? 'text-red-600' : 'text-primary'}`}>
                            {(() => {
                              let price;
                              if (cardDetailsModal.overridePrice != null) {
                                price = cardDetailsModal.overridePrice;
                              } else {
                                price = computeItemMetrics(cardDetailsModal, currency).suggested;
                              }
                              return formatPrice(price);
                            })()}
                          </span>
                          <button
                            onClick={() => startEditingPrice(cardDetailsModal.entryId, cardDetailsModal.overridePrice)}
                            className="text-primary hover:text-primary/80"
                            title="Edit price"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {editingPriceId !== cardDetailsModal.entryId && cardDetailsModal.overridePrice != null && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-red-600 font-medium">Manual override</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            resetPriceToSuggested(cardDetailsModal.entryId);
                            setCardDetailsModal((prev) => prev ? { ...prev, overridePrice: null, overridePriceCurrency: null } : prev);
                          }}
                          className="h-6 px-2 text-[11px] text-blue-600 hover:text-blue-700"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reset to market
                        </Button>
                      </div>
                    )}

                    {/* Price Comparison for Manual Overrides */}
                    {editingPriceId !== cardDetailsModal.entryId && cardDetailsModal.overridePrice != null && (() => {
                      const marketPrice = computeItemMetrics(cardDetailsModal, currency).suggested;
                      
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
                    
                    {editingPriceId !== cardDetailsModal.entryId && !cardDetailsModal.overridePrice && (
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
                      <div className="flex flex-wrap gap-2 mt-3">
                        {[5, 10].map((pct) => {
                          const base = convertCurrency(parseFloat(cardDetailsModal.gradedPrice), currency, "USD");
                          const rounded = roundUpMarkup(base, pct);
                          return (
                            <Button
                              key={pct}
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                applyGradedMarkup(cardDetailsModal, pct);
                                setCardDetailsModal((prev) => prev ? { ...prev, overridePrice: rounded, overridePriceCurrency: currency } : prev);
                              }}
                              className="text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-100"
                            >
                              +{pct}% → {formatPrice(rounded)}
                            </Button>
                          );
                        })}
                        {cardDetailsModal.overridePrice != null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              resetPriceToSuggested(cardDetailsModal.entryId);
                              setCardDetailsModal((prev) => prev ? { ...prev, overridePrice: null, overridePriceCurrency: null } : prev);
                            }}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Reset to market
                          </Button>
                        )}
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
                    {selectedSnapshot.name && (
                      <h3 className="text-2xl font-bold text-primary">{selectedSnapshot.name}</h3>
                    )}
                    <h3 className={selectedSnapshot.name ? "text-sm text-muted-foreground mt-1" : "text-xl font-semibold"}>
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

                  {/* Cash Balance (if saved in snapshot) */}
                  {selectedSnapshot.cashBalance && (selectedSnapshot.cashBalance.physical?.length > 0 || selectedSnapshot.cashBalance.digital?.length > 0) && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                        <Wallet className="h-4 w-4" /> Cash Balance at Snapshot
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div className="bg-white/70 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">Physical Cash</div>
                          <div className="text-lg font-bold text-amber-800">{formatCurrency(selectedSnapshot.cashBalance.physicalTotal || 0, selectedSnapshot.currency)}</div>
                        </div>
                        <div className="bg-white/70 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">Digital Cash</div>
                          <div className="text-lg font-bold text-amber-800">{formatCurrency(selectedSnapshot.cashBalance.digitalTotal || 0, selectedSnapshot.currency)}</div>
                        </div>
                        <div className="bg-white/70 rounded-lg p-2 text-center">
                          <div className="text-xs text-muted-foreground">Total Cash</div>
                          <div className="text-lg font-bold text-amber-900">{formatCurrency(selectedSnapshot.cashBalance.grandTotal || 0, selectedSnapshot.currency)}</div>
                        </div>
                      </div>
                      {/* Detailed breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {selectedSnapshot.cashBalance.physical?.length > 0 && (
                          <div>
                            <div className="font-semibold text-amber-800 mb-1">Physical</div>
                            {selectedSnapshot.cashBalance.physical.map((e, i) => (
                              <div key={i} className="flex justify-between py-0.5">
                                <span className="text-muted-foreground">{e.currency}</span>
                                <span className="font-medium">{formatCurrency(e.amount, e.currency)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {selectedSnapshot.cashBalance.digital?.length > 0 && (
                          <div>
                            <div className="font-semibold text-amber-800 mb-1">Digital</div>
                            {selectedSnapshot.cashBalance.digital.map((e, i) => (
                              <div key={i} className="flex justify-between py-0.5">
                                <span className="text-muted-foreground">{e.platform}{e.note ? ` (${e.note})` : ""}</span>
                                <span className="font-medium">{formatCurrency(e.amount, e.currency)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

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
                          <div className="flex-1 min-w-0">
                            {renamingSnapshotId === snapshot.id ? (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={renameSnapshotValue}
                                  onChange={(e) => setRenameSnapshotValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") renameSnapshot(snapshot.id, renameSnapshotValue);
                                    if (e.key === "Escape") { setRenamingSnapshotId(null); setRenameSnapshotValue(""); }
                                  }}
                                  className="flex-1 text-sm font-semibold border-b-2 border-primary bg-transparent outline-none px-0 py-1"
                                  placeholder="Snapshot name"
                                  autoFocus
                                />
                                <Button size="sm" variant="ghost" onClick={() => renameSnapshot(snapshot.id, renameSnapshotValue)}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setRenamingSnapshotId(null); setRenameSnapshotValue(""); }}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                {snapshot.name && (
                                  <div className="font-bold text-primary truncate">{snapshot.name}</div>
                                )}
                                <div className={snapshot.name ? "text-sm text-muted-foreground" : "font-semibold"}>
                                  {new Date(snapshot.createdAt).toLocaleDateString()} at {new Date(snapshot.createdAt).toLocaleTimeString()}
                                </div>
                              </>
                            )}
                            <div className="text-sm text-muted-foreground mt-1">
                              {snapshot.totalItems} items • Total Value: {formatCurrency(snapshot.totalValue, snapshot.currency)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Rename snapshot"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingSnapshotId(snapshot.id);
                                setRenameSnapshotValue(snapshot.name || "");
                              }}
                            >
                              <Edit2 className="h-4 w-4 text-blue-600" />
                            </Button>
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

      {/* CardLadder Import Modal */}
      {showCardLadderImport && (
        <CardLadderImport
          onClose={() => setShowCardLadderImport(false)}
          collectionName="collections"
        />
      )}

      {/* Image Replacer Modal */}
      {imageReplaceCard && (
        <CardImageReplacer
          item={imageReplaceCard}
          onImageUpdate={handleImageUpdate}
          onClose={() => setImageReplaceCard(null)}
        />
      )}
    </div>
  );
}

