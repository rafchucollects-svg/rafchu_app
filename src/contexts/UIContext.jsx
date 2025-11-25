import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { useCommunityImages } from "@/hooks/useCommunityImages";

/**
 * UIContext provides UI state (modals, search, currency, etc.)
 * This changes frequently with user interactions
 */

const UIContext = createContext(null);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within UIProvider");
  }
  return context;
};

export const UIProvider = ({ children }) => {
  const { user, db, userProfile, setUserProfile } = useAuth();

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

  // Load user preferences
  useEffect(() => {
    if (userProfile) {
      if (typeof userProfile.defaultCondition === "string") {
        setDefaultCondition(userProfile.defaultCondition);
      }
      if (typeof userProfile.roundUpPrices === "boolean") {
        setRoundUpPrices(userProfile.roundUpPrices);
      }
      if (typeof userProfile.marketSource === "string") {
        setMarketSource(userProfile.marketSource);
      }
      if (typeof userProfile.currency === "string") {
        setCurrency(userProfile.currency);
      }
      if (typeof userProfile.secondaryCurrency === "string") {
        setSecondaryCurrency(userProfile.secondaryCurrency);
      }
    }
  }, [userProfile]);

  // Toggle card selection
  const toggleCardSelection = useCallback((card) => {
    setSelectedCards((prev) => {
      const isSelected = prev.some((c) => c.id === card.id);
      if (isSelected) {
        return prev.filter((c) => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  }, []);

  // Clear selected cards
  const clearSelectedCards = useCallback(() => {
    setSelectedCards([]);
  }, []);

  // Trigger quick add feedback toast
  const triggerQuickAddFeedback = useCallback((message) => {
    setQuickAddFeedback(message);
    setTimeout(() => setQuickAddFeedback(null), 2000);
  }, []);

  // Update currency and persist
  const updateCurrency = useCallback(
    async (newCurrency) => {
      if (!user || !db) return;
      setCurrency(newCurrency);
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { currency: newCurrency }, { merge: true });
      
      // Update local userProfile too
      if (userProfile) {
        setUserProfile({ ...userProfile, currency: newCurrency });
      }
    },
    [user, db, userProfile, setUserProfile]
  );

  // Update secondary currency and persist
  const updateSecondaryCurrency = useCallback(
    async (newCurrency) => {
      if (!user || !db) return;
      setSecondaryCurrency(newCurrency);
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { secondaryCurrency: newCurrency }, { merge: true });
      
      // Update local userProfile too
      if (userProfile) {
        setUserProfile({ ...userProfile, secondaryCurrency: newCurrency });
      }
    },
    [user, db, userProfile, setUserProfile]
  );

  const value = {
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

    // UI
    quickAddFeedback,
    triggerQuickAddFeedback,
    vendorRequestModalOpen,
    setVendorRequestModalOpen,
    feedbackModalOpen,
    setFeedbackModalOpen,
    loginModalOpen,
    setLoginModalOpen,

    // Settings
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
    setCurrency: updateCurrency, // Use wrapper that persists to Firestore
    secondaryCurrency,
    setSecondaryCurrency: updateSecondaryCurrency, // Use wrapper that persists to Firestore

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

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

