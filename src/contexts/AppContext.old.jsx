import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
import { useCommunityImages } from "@/hooks/useCommunityImages";

/**
 * AppContext provides shared state and functions across all pages
 * Including user auth, card selections, collection, wishlist, and transactions
 */

const AppContext = createContext(null);

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
  
  // Wishlist state
  const [wishlistItems, setWishlistItems] = useState([]);
  
  // Trade Binder state (collector mode)
  const [tradeItems, setTradeItems] = useState([]);
  
  // Buy List state (collector mode)
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
  const [currency, setCurrency] = useState("EUR"); // EUR, USD, SEK, NOK, DKK, ISK
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
    });
    return () => unsubscribe();
  }, [auth, db]);

  // Listen to route changes
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    
    // Listen for popstate (back/forward) and custom navigation events
    window.addEventListener('popstate', handleLocationChange);
    
    // Listen for pushState/replaceState (for React Router navigation)
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    window.history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleLocationChange();
    };
    
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleLocationChange();
    };
    
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
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
          const items = rawItems.map((item) => ({
            ...item,
            entryId: item.entryId || crypto.randomUUID(),
          }));
          
          setCollectionItems(items);
          
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
        } else {
          setCollectionItems([]);
        }
      },
      (error) => {
        console.error("Failed to load collection", error);
        setCollectionItems([]);
      },
    );
  }, [db, viewingUid, currentPath]);

  // Helper functions
  const triggerQuickAddFeedback = useCallback((message) => {
    setQuickAddFeedback(message);
    setTimeout(() => setQuickAddFeedback(null), 2000);
  }, []);

  const addToCollection = useCallback(async (card, options = {}) => {
    if (!user || !db) {
      alert("Please sign in to add cards");
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
      notes: options.notes || null,
      
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
      manualPrice: options.manualPrice || null,
      
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
      
      const updatedItems = [...latestItems, newItem];
      
      await setDoc(ref, { items: updatedItems }, { merge: true });
      // setCollectionItems will be updated by Firestore listener
      return newItem;
    } catch (error) {
      console.error("Failed to add to collection", error);
      alert("Failed to add card. Please try again.");
      return null;
    }
  }, [user, db, defaultCondition, collectionItems, currentPath]);

  const removeFromCollection = useCallback((entryId) => {
    setCollectionItems(prev => prev.filter(item => item.entryId !== entryId));
  }, []);

  const updateCollectionItem = useCallback((entryId, updates) => {
    setCollectionItems(prev =>
      prev.map(item => (item.entryId === entryId ? { ...item, ...updates } : item))
    );
  }, []);

  const addToWishlist = useCallback(async (card) => {
    if (!user || !db) {
      alert("Please sign in to add cards to your wishlist");
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
      
      const updatedItems = [...wishlistItems, newItem];
      const ref = doc(db, collectionName, user.uid);
      
      await setDoc(ref, { items: updatedItems }, { merge: true });
      return newItem;
    } catch (error) {
      console.error("Failed to add to wishlist", error);
      alert("Failed to add card. Please try again.");
      return null;
    }
  }, [user, db, wishlistItems, currentPath]);

  const removeFromWishlist = useCallback(async (entryId) => {
    if (!user || !db) return;
    
    try {
      const isCollectorPath = currentPath.includes('/collector/');
      const collectionName = isCollectorPath ? "collector_wishlists" : "wishlists";
      
      const updatedItems = wishlistItems.filter(item => item.entryId !== entryId);
      const ref = doc(db, collectionName, user.uid);
      
      await setDoc(ref, { items: updatedItems }, { merge: true });
    } catch (error) {
      console.error("Failed to remove from wishlist", error);
      alert("Failed to remove card. Please try again.");
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

  const value = {
    // Auth
    user,
    userProfile,
    setUserProfile,
    needsOnboarding,
    setNeedsOnboarding,
    auth,
    db,
    
    // Navigation
    workspace,
    setWorkspace,
    
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

