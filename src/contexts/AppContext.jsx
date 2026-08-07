import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  collection as fsCollection,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useCommunityImages } from "@/hooks/useCommunityImages";
import { initSetCatalog } from "@/utils/searchHelpers";
import { toast } from "@/components/ui/Toaster";

/**
 * AppContext provides shared state and functions across all pages
 * Including user auth, card selections, collection, wishlist, and transactions
 */

const AppContext = createContext(null);

const normalizeInventoryValue = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const normalizeInventoryNumber = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/^#/, "").replace(/^0+(\d)/, "$1");

const normalizeOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : normalizeInventoryValue(value);
};

const getMergeableInventoryKey = (item) => {
  if (!item) return "";
  return [
    normalizeInventoryValue(item.name),
    normalizeInventoryValue(item.set),
    normalizeInventoryNumber(item.number),
    normalizeInventoryValue(item.condition || "NM"),
    item.isGraded ? "graded" : "raw",
    normalizeInventoryValue(item.gradingCompany),
    normalizeInventoryValue(item.grade),
    normalizeInventoryValue(item.language || "English"),
    normalizeInventoryValue(item.variant),
    normalizeInventoryValue(item.variantSource),
    item.isJapanese ? "jp" : "non-jp",
    item.isManualEntry ? "manual" : "api",
  ].join("|");
};

const canMergeInventoryItems = (existingItem, newItem) => {
  if (!existingItem || !newItem) return false;
  if (getMergeableInventoryKey(existingItem) !== getMergeableInventoryKey(newItem)) return false;

  // Keep deliberately distinct rows separate when user-entered business data differs.
  const guardedFields = [
    "overridePrice",
    "overridePriceCurrency",
    "manualPrice",
    "manualPriceCurrency",
    "buyPrice",
    "tradePrice",
    "sellPrice",
    "notes",
  ];

  return guardedFields.every((field) => {
    if (field.toLowerCase().includes("price")) {
      return normalizeOptionalNumber(existingItem[field]) === normalizeOptionalNumber(newItem[field]);
    }
    return normalizeInventoryValue(existingItem[field]) === normalizeInventoryValue(newItem[field]);
  });
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
};

export const AppProvider = ({ children, auth, db, authHandlers }) => {
  // Auth state
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Track current path for collection selection
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Navigation state
  const [workspace, setWorkspace] = useState("vendor"); // 'user' | 'collector' | 'vendor'
  
  // Card search & selection state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeCard, setActiveCard] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]); // For multi-select operations
  
  // Collection/Inventory state
  const [collectionItems, setCollectionItems] = useState([]);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionSortBy, setCollectionSortBy] = useState("addedAt");
  const [collectionSortDir, setCollectionSortDir] = useState("desc");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);
  const [viewingUid, setViewingUid] = useState(null);
  
  // Cash balance state (vendor toolkit)
  const [cashData, setCashData] = useState({ physical: [], digital: [], pending: [] });

  // Consignors registry (vendor toolkit) — people who consign inventory to you
  const [consignors, setConsignors] = useState([]);
  const [consignorsLoading, setConsignorsLoading] = useState(false);
  
  // Wishlist state
  const [wishlistItems, setWishlistItems] = useState([]);
  
  // Legacy trade calculator state; Deal Calculator migrates this into buyItems.
  const [tradeItems, setTradeItems] = useState([]);
  
  // Deal Calculator incoming-card list.
  const [buyItems, setBuyItems] = useState([]);
  
  // Transaction state
  const [transactions, setTransactions] = useState([]);
  
  // UI state
  const [quickAddFeedback, setQuickAddFeedback] = useState(null);
  
  // Vendor request modal state
  const [vendorRequestModalOpen, setVendorRequestModalOpen] = useState(false);
  
  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  
  // Login modal state
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  
  const [defaultCondition, setDefaultCondition] = useState("NM");
  const [roundUpPrices, setRoundUpPrices] = useState(false);
  
  // Share state
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUsernameInput, setShareUsernameInput] = useState("");
  const [shareUsernameStored, setShareUsernameStored] = useState("");
  const [shareOwnerTitle, setShareOwnerTitle] = useState("");
  const [shareTargetUid, setShareTargetUid] = useState(null);
  const [isShareView, setIsShareView] = useState(false);
  const [marketSource, setMarketSource] = useState("cardmarket"); // "tcg" or "cardmarket"
  const [currency, setCurrency] = useState("EUR"); // EUR, USD, GBP, SEK, NOK, DKK, ISK
  const [secondaryCurrency, setSecondaryCurrency] = useState(null); // Optional secondary currency for vendors
  
  // History & insights
  const [historyData, setHistoryData] = useState([]);
  const [historyMetric, setHistoryMetric] = useState("suggested");
  const [historyRange, setHistoryRange] = useState("all");
  
  // Community images (shared across app)
  const communityImagesHook = useCommunityImages(db);

  // Auth listener
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setViewingUid(currentUser?.uid || null);
      
      // Check if user has completed onboarding
      if (currentUser && db) {
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const profile = userSnap.data();
            setUserProfile(profile);
            setNeedsOnboarding(!profile.onboardingCompleted);
          } else {
            setUserProfile(null);
            setNeedsOnboarding(true);
          }
        } catch (error) {
          console.error("Failed to load user profile:", error);
          setNeedsOnboarding(true);
        }
      } else {
        setUserProfile(null);
        setNeedsOnboarding(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [auth, db]);

  // Load dynamic set catalog from Firestore (non-blocking)
  useEffect(() => {
    if (!db) return;
    initSetCatalog(db);
  }, [db]);

  // Route changes come in via `<RouteSyncer />` (lives inside the Router tree
  // and calls setCurrentPath with location.pathname). We also listen to
  // popstate here as a belt-and-suspenders fallback for non-router navigation
  // (e.g. direct calls to window.history.back()).
  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load collection from Firestore based on current URL path
  useEffect(() => {
    if (!db || !viewingUid) {
      setCollectionItems([]);
      return undefined;
    }
    
    // Determine collection based on current path
    const isCollectorPath = currentPath.includes('/collector/');
    
    // Vendor/default uses "collections" (existing data)
    // Collector uses "collector_collections" (new/separate)
    const collectionName = isCollectorPath ? "collector_collections" : "collections";
    const ref = doc(db, collectionName, viewingUid);
    
    console.log('[AppContext] Loading from:', collectionName, 'for path:', currentPath);
    
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          const rawItems = Array.isArray(data.items) ? data.items : [];
          const missingEntryIds = rawItems.some((item) => !item.entryId);
          const items = rawItems.map((item) => ({
            ...item,
            entryId: item.entryId || crypto.randomUUID(),
          }));
          
          setCollectionItems(items);

          // Persist freshly minted entryIds once so identity is stable across
          // reloads (deletes/edits key off entryId). Owner-only, guarded by
          // missingEntryIds so it runs at most once per doc and never loops.
          if (missingEntryIds && user && viewingUid === user.uid) {
            setDoc(ref, { items }, { merge: true }).catch((err) =>
              console.error("Failed to persist entryIds", err),
            );
          }
          
          // Load other metadata
          if (Array.isArray(data.history)) {
            setHistoryData(data.history);
          }
          if (typeof data.roundUp === "boolean") {
            setRoundUpPrices(data.roundUp);
          }
          if (typeof data.shareEnabled === "boolean") {
            setShareEnabled(data.shareEnabled);
          }
          if (typeof data.shareUsername === "string") {
            setShareUsernameInput(data.shareUsername);
            setShareUsernameStored(data.shareUsername);
          }
          if (typeof data.marketSource === "string") {
            setMarketSource(data.marketSource);
          }
          if (typeof data.currency === "string") {
            setCurrency(data.currency);
          }
          if (typeof data.secondaryCurrency === "string") {
            setSecondaryCurrency(data.secondaryCurrency);
          }
          // Load cash data
          if (data.cashData && typeof data.cashData === "object") {
            setCashData({
              physical: Array.isArray(data.cashData.physical) ? data.cashData.physical : [],
              digital: Array.isArray(data.cashData.digital) ? data.cashData.digital : [],
              pending: Array.isArray(data.cashData.pending) ? data.cashData.pending : [],
            });
          } else {
            setCashData({ physical: [], digital: [], pending: [] });
          }
        } else {
          setCollectionItems([]);
          setCashData({ physical: [], digital: [], pending: [] });
        }
      },
      (error) => {
        console.error("Failed to load collection", error);
        setCollectionItems([]);
      },
    );
  }, [db, viewingUid, currentPath]);

  // Automatic price refresh DISABLED
  // This feature was causing data corruption and has been disabled until it can be properly fixed

  // Load consignors registry (vendor-owned, at consignors/{uid}/entries)
  useEffect(() => {
    if (!db || !user?.uid) {
      setConsignors([]);
      return undefined;
    }
    setConsignorsLoading(true);
    const col = fsCollection(db, "consignors", user.uid, "entries");
    const unsub = onSnapshot(
      col,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setConsignors(rows);
        setConsignorsLoading(false);
      },
      (error) => {
        console.error("Failed to load consignors", error);
        setConsignors([]);
        setConsignorsLoading(false);
      },
    );
    return () => unsub();
  }, [db, user?.uid]);

  const addConsignor = useCallback(async ({ name, contact = "", defaultConsignorPct = 80, notes = "" } = {}) => {
    if (!user || !db) {
      toast.error("Please sign in to add a consignor");
      return null;
    }
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      toast.error("Consignor name is required");
      return null;
    }
    try {
      const col = fsCollection(db, "consignors", user.uid, "entries");
      const ref = await addDoc(col, {
        name: trimmedName,
        contact: (contact || "").trim(),
        defaultConsignorPct: Number(defaultConsignorPct) || 80,
        notes: (notes || "").trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error("Failed to add consignor", error);
      toast.error("Failed to add consignor");
      return null;
    }
  }, [user, db]);

  const updateConsignor = useCallback(async (consignorId, updates = {}) => {
    if (!user || !db || !consignorId) return false;
    try {
      const ref = doc(db, "consignors", user.uid, "entries", consignorId);
      await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
      return true;
    } catch (error) {
      console.error("Failed to update consignor", error);
      toast.error("Failed to update consignor");
      return false;
    }
  }, [user, db]);

  const removeConsignor = useCallback(async (consignorId) => {
    if (!user || !db || !consignorId) return false;
    try {
      const ref = doc(db, "consignors", user.uid, "entries", consignorId);
      await deleteDoc(ref);
      return true;
    } catch (error) {
      console.error("Failed to delete consignor", error);
      toast.error("Failed to delete consignor");
      return false;
    }
  }, [user, db]);

  // Helper functions
  const triggerQuickAddFeedback = useCallback((message) => {
    setQuickAddFeedback(message);
    setTimeout(() => setQuickAddFeedback(null), 2000);
  }, []);

  const addToCollection = useCallback(async (card, options = {}) => {
    if (!user || !db) {
      toast.error("Please sign in to add cards");
      return null;
    }
    
    const newItem = {
      entryId: crypto.randomUUID(),
      cardId: card.id || crypto.randomUUID(),
      name: card.name || 'Unknown Card',
      set: card.set || '',
      number: card.number || '',
      rarity: card.rarity || '',
      image: card.image || null,
      prices: card.prices || {},
      links: card.links || {},
      addedAt: Date.now(),
      condition: options.condition || defaultCondition,
      quantity: options.quantity || 1,
      tags: options.tags || [],
      overridePrice: options.customPrice || null,
      overridePriceCurrency: options.customPrice ? currency : null, // Store currency at time of override
      notes: options.notes || card.notes || null,
      
      // v2.1: Variant support
      variant: options.variant || null,
      variantSource: options.variantSource || null,
      
      // v2.1: Graded card support
      isGraded: options.isGraded || false,
      gradingCompany: options.gradingCompany || null,
      grade: options.grade || null,
      gradedPrice: options.gradedPrice || null,
      
      // v2.1: Language and Japanese support
      language: options.language || 'English',
      isJapanese: options.isJapanese || false,
      manualPrice: options.manualPrice || card.manualPrice || null,
      manualPriceCurrency: options.manualPriceCurrency || card.manualPriceCurrency || null,
      
      // Manual entry support - preserve custom image
      isManualEntry: options.isManualEntry || card.isManualEntry || false,
      
      // Vendor-specific fields
      buyPrice: options.buyPrice || null,
      tradePrice: options.tradePrice || null,
      sellPrice: options.sellPrice || null,
    };
    
    // Determine if this is for vendor inventory based on:
    // 1. Explicit mode passed in options
    // 2. Current path includes '/vendor/' or is at '/search' with vendor mode
    // 3. Fallback to path not containing '/collector/'
    const isVendorMode = options.mode === 'vendor' || currentPath.includes('/vendor/') || (!currentPath.includes('/collector/') && !options.mode);
    const isCollectorMode = options.mode === 'collector' || currentPath.includes('/collector/');
    
    // Calculate suggested price
    let suggestedPrice;
    
    // For graded cards, use graded price directly (no calculations)
    if (newItem.isGraded && newItem.gradedPrice) {
      suggestedPrice = parseFloat(newItem.gradedPrice);
    } else {
      // For ungraded cards, compute metrics
      const { computeItemMetrics } = await import("@/utils/cardHelpers");
      const metrics = computeItemMetrics(newItem);
      suggestedPrice = metrics.suggested;
    }
    
    newItem.calculatedSuggestedPrice = isVendorMode && roundUpPrices 
      ? Math.ceil(suggestedPrice) 
      : suggestedPrice;
    
    try {
      // Determine collection based on mode or current path
      const collectionName = isCollectorMode ? "collector_collections" : "collections";
      
      // Read latest data to avoid race condition
      const ref = doc(db, collectionName, user.uid);
      const snap = await getDoc(ref);
      const latestData = snap.exists() ? snap.data() : {};
      const latestItems = Array.isArray(latestData.items) ? latestData.items : [];
      
      const existingIndex = latestItems.findIndex((item) => canMergeInventoryItems(item, newItem));
      const updatedItems = existingIndex >= 0
        ? latestItems.map((item, index) => {
            if (index !== existingIndex) return item;
            const existingQuantity = Number(item.quantity) || 1;
            const addedQuantity = Number(newItem.quantity) || 1;
            return {
              ...item,
              quantity: existingQuantity + addedQuantity,
              prices: Object.keys(newItem.prices || {}).length > 0 ? newItem.prices : item.prices,
              links: Object.keys(newItem.links || {}).length > 0 ? newItem.links : item.links,
              image: item.image || newItem.image,
              updatedAt: Date.now(),
            };
          })
        : [...latestItems, newItem];
      const savedItem = existingIndex >= 0 ? updatedItems[existingIndex] : newItem;
      
      await setDoc(ref, { items: updatedItems }, { merge: true });
      // setCollectionItems will be updated by Firestore listener
      return savedItem;
    } catch (error) {
      console.error("Failed to add to collection", error);
      toast.error("Failed to add card. Please try again.");
      return null;
    }
    // NB: we intentionally DO NOT depend on collectionItems. We re-read the
    // latest items from Firestore inside the function to avoid a race
    // condition, so keeping collectionItems in deps just churns this callback
    // on every add/edit for no benefit.
  }, [user, db, defaultCondition, currentPath, currency, roundUpPrices]);

  const removeFromCollection = useCallback(async (entryId) => {
    if (!user || !db) return;
    try {
      const isCollectorPath = currentPath.includes('/collector/');
      const collectionName = isCollectorPath ? "collector_collections" : "collections";
      const ref = doc(db, collectionName, user.uid);
      const snap = await getDoc(ref);
      const latestData = snap.exists() ? snap.data() : {};
      const latestItems = Array.isArray(latestData.items) ? latestData.items : [];
      const updatedItems = latestItems.filter(item => item.entryId !== entryId);
      await setDoc(ref, { items: updatedItems }, { merge: true });
    } catch (error) {
      console.error("Failed to remove from collection", error);
      toast.error("Failed to remove card. Please try again.");
    }
  }, [user, db, currentPath]);

  const updateCollectionItem = useCallback(async (entryId, updates) => {
    if (!user || !db) return;
    try {
      const isCollectorPath = currentPath.includes('/collector/');
      const collectionName = isCollectorPath ? "collector_collections" : "collections";
      const ref = doc(db, collectionName, user.uid);
      const snap = await getDoc(ref);
      const latestData = snap.exists() ? snap.data() : {};
      const latestItems = Array.isArray(latestData.items) ? latestData.items : [];
      const updatedItems = latestItems.map(item =>
        item.entryId === entryId ? { ...item, ...updates } : item
      );
      await setDoc(ref, { items: updatedItems }, { merge: true });
    } catch (error) {
      console.error("Failed to update collection item", error);
      toast.error("Failed to update card. Please try again.");
    }
  }, [user, db, currentPath]);

  // Update cash data and save to Firestore
  const updateCashData = useCallback(async (newCashData) => {
    if (!user || !db) {
      console.error("Cannot update cash data - not logged in");
      return;
    }
    
    setCashData(newCashData);
    
    try {
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { cashData: newCashData }, { merge: true });
    } catch (error) {
      console.error("Failed to save cash data:", error);
    }
  }, [user, db]);

  const addToWishlist = useCallback(async (card) => {
    if (!user || !db) {
      toast.error("Please sign in to add cards to your wishlist");
      return null;
    }
    
    const newItem = {
      entryId: crypto.randomUUID(),
      cardId: card.id,
      name: card.name,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      prices: card.prices,
      links: card.links,
      addedAt: Date.now(),
    };
    
    try {
      // Collector uses "collector_wishlists"
      const isCollectorPath = currentPath.includes('/collector/');
      const collectionName = isCollectorPath ? "collector_wishlists" : "wishlists";
      
      console.log('[addToWishlist] Saving to:', collectionName, 'for path:', currentPath);
      
      // Read the latest stored items before writing so concurrent adds (or a
      // lagging listener) don't overwrite each other by spreading a stale
      // in-memory array.
      const ref = doc(db, collectionName, user.uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() && Array.isArray(snap.data().items) ? snap.data().items : [];
      const updatedItems = [...existing, newItem];
      
      await setDoc(ref, { items: updatedItems }, { merge: true });
      return newItem;
    } catch (error) {
      console.error("Failed to add to wishlist", error);
      toast.error("Failed to add card. Please try again.");
      return null;
    }
  }, [user, db, currentPath]);

  const removeFromWishlist = useCallback(async (entryId) => {
    if (!user || !db) return;
    
    try {
      const isCollectorPath = currentPath.includes('/collector/');
      const collectionName = isCollectorPath ? "collector_wishlists" : "wishlists";
      
      // Read fresh so we filter against the authoritative stored list.
      const ref = doc(db, collectionName, user.uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() && Array.isArray(snap.data().items) ? snap.data().items : [];
      const updatedItems = existing.filter(item => item.entryId !== entryId);
      
      await setDoc(ref, { items: updatedItems }, { merge: true });
    } catch (error) {
      console.error("Failed to remove from wishlist", error);
      toast.error("Failed to remove card. Please try again.");
    }
  }, [user, db, wishlistItems, currentPath]);

  const addTransaction = useCallback((transaction) => {
    const newTransaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...transaction,
    };
    setTransactions(prev => [newTransaction, ...prev]);
    return newTransaction;
  }, []);

  const clearSelectedCards = useCallback(() => {
    setSelectedCards([]);
  }, []);

  const toggleCardSelection = useCallback((card) => {
    setSelectedCards(prev => {
      const exists = prev.find(c => c.id === card.id);
      if (exists) {
        return prev.filter(c => c.id !== card.id);
      }
      return [...prev, card];
    });
  }, []);

  // Memoize the context value so consumers only re-render when one of the
  // underlying pieces of state actually changes, rather than on every render
  // of AppProvider.
  const value = useMemo(() => ({
    // Auth
    user,
    userProfile,
    setUserProfile,
    needsOnboarding,
    setNeedsOnboarding,
    authLoading,
    auth,
    db,

    // Navigation
    workspace,
    setWorkspace,
    currentPath,
    setCurrentPath,

    // Card search
    query,
    setQuery,
    suggestions,
    setSuggestions,
    showAllSuggestions,
    setShowAllSuggestions,
    loading,
    setLoading,
    error,
    setError,
    activeCard,
    setActiveCard,
    selectedCards,
    setSelectedCards,
    toggleCardSelection,
    clearSelectedCards,

    // Collection
    collectionItems,
    collection: collectionItems, // Alias for Insights pages
    setCollectionItems,
    collectionSearch,
    setCollectionSearch,
    collectionSortBy,
    setCollectionSortBy,
    collectionSortDir,
    setCollectionSortDir,
    selectedCollectionIds,
    setSelectedCollectionIds,
    viewingUid,
    setViewingUid,
    addToCollection,
    removeFromCollection,
    updateCollectionItem,

    // Cash balance
    cashData,
    updateCashData,

    // Wishlist
    wishlistItems,
    setWishlistItems,
    addToWishlist,
    removeFromWishlist,

    // Trade & Buy
    tradeItems,
    setTradeItems,
    buyItems,
    setBuyItems,

    // Transactions
    transactions,
    setTransactions,
    addTransaction,

    // UI
    quickAddFeedback,
    triggerQuickAddFeedback,
    vendorRequestModalOpen,
    setVendorRequestModalOpen,
    feedbackModalOpen,
    setFeedbackModalOpen,
    loginModalOpen,
    setLoginModalOpen,

    // Auth handlers
    authHandlers,
    defaultCondition,
    setDefaultCondition,
    roundUpPrices,
    setRoundUpPrices,

    // Share
    shareEnabled,
    setShareEnabled,
    shareUsernameInput,
    setShareUsernameInput,
    shareUsernameStored,
    setShareUsernameStored,
    shareOwnerTitle,
    setShareOwnerTitle,
    shareTargetUid,
    setShareTargetUid,
    isShareView,
    setIsShareView,
    marketSource,
    setMarketSource,
    currency,
    setCurrency,
    secondaryCurrency,
    setSecondaryCurrency,

    // Consignors
    consignors,
    consignorsLoading,
    addConsignor,
    updateConsignor,
    removeConsignor,

    // Community images
    communityImages: communityImagesHook.communityImages,
    getImageForCard: communityImagesHook.getImageForCard,
    refreshCommunityImages: communityImagesHook.refresh,
    invalidateCommunityImagesCache: communityImagesHook.invalidateCache,

    // History & insights
    historyData,
    setHistoryData,
    historyMetric,
    setHistoryMetric,
    historyRange,
    setHistoryRange,
  }), [
    // Auth
    user, userProfile, needsOnboarding, authLoading, auth, db,
    // Navigation
    workspace, currentPath,
    // Card search
    query, suggestions, showAllSuggestions, loading, error, activeCard,
    selectedCards, toggleCardSelection, clearSelectedCards,
    // Collection
    collectionItems, collectionSearch, collectionSortBy, collectionSortDir,
    selectedCollectionIds, viewingUid,
    addToCollection, removeFromCollection, updateCollectionItem,
    // Cash balance
    cashData, updateCashData,
    // Wishlist
    wishlistItems, addToWishlist, removeFromWishlist,
    // Trade & Buy
    tradeItems, buyItems,
    // Transactions
    transactions, addTransaction,
    // UI
    quickAddFeedback, triggerQuickAddFeedback,
    vendorRequestModalOpen, feedbackModalOpen, loginModalOpen,
    // Auth handlers & prefs
    authHandlers, defaultCondition, roundUpPrices,
    // Share
    shareEnabled, shareUsernameInput, shareUsernameStored, shareOwnerTitle,
    shareTargetUid, isShareView, marketSource, currency, secondaryCurrency,
    // Consignors
    consignors, consignorsLoading, addConsignor, updateConsignor, removeConsignor,
    // Community images
    communityImagesHook.communityImages,
    communityImagesHook.getImageForCard,
    communityImagesHook.refresh,
    communityImagesHook.invalidateCache,
    // History
    historyData, historyMetric, historyRange,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

