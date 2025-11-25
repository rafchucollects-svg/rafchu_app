import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Store, Plus, ShoppingBag, Heart, LayoutGrid, Calculator, TrendingUp, MessageSquare, Upload, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { 
  apiSearchCards, 
  apiSearchCardsHybrid,
  apiSearchCardsCached,
  apiFetchCardDetails,
  apiFetchMarketPrices,
  apiFetchGradedPrices,
  formatSearchResults,
  canonicalizeQuery,
  getSearchCacheEntry,
  DEFAULT_SUGGESTION_LIMIT,
  MAX_SUGGESTION_LIMIT 
} from "@/utils/apiHelpers";
import { 
  SuggestionItem, 
  ConditionSelect,
  CardPrices,
  ExternalLinks 
} from "@/components/CardComponents";
import { AddCardModal } from "@/components/AddCardModal";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { GradedCardModal } from "@/components/GradedCardModal";
import { formatCurrency, convertCurrency } from "@/utils/cardHelpers";
import { needsImage } from "@/utils/imageHelpers";

/**
 * Card Search Page
 * Shared between Collector and Vendor toolkits
 * Full search functionality with API integration
 */

// Debounce hook
function useDebouncedValue(value, delay = 500) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return v;
}

export function CardSearch({ mode = "collector" }) {
  const isVendor = mode === "vendor";
  
  const {
    user,
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
    defaultCondition,
    setDefaultCondition,
    roundUpPrices,
    marketSource,
    currency,
    addToCollection,
    addToWishlist,
    tradeItems,
    setTradeItems,
    buyItems,
    setBuyItems,
    triggerQuickAddFeedback,
    setFeedbackModalOpen,
    userProfile,
    db,
    communityImages,
    getImageForCard,
    refreshCommunityImages,
  } = useApp();

  const debounced = useDebouncedValue(query, 500);
  const lastFetchedCanonicalRef = useRef("");
  const activeSearchTokenRef = useRef(null);
  
  // v2.1: Add Card Modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [cardToAdd, setCardToAdd] = useState(null);
  
  // Community Image Upload Modal state
  const [imageUploadModalOpen, setImageUploadModalOpen] = useState(false);
  const [cardForImageUpload, setCardForImageUpload] = useState(null);
  
  // Graded filter state - persist to localStorage per mode
  const [isGradedFilter, setIsGradedFilter] = useState(() => {
    const stored = localStorage.getItem(`cardSearch_isGradedFilter_${mode}`);
    return stored === 'true';
  });
  
  // Save graded filter preference to localStorage
  useEffect(() => {
    localStorage.setItem(`cardSearch_isGradedFilter_${mode}`, isGradedFilter.toString());
  }, [isGradedFilter, mode]);
  
  const [gradedModalOpen, setGradedModalOpen] = useState(false);
  const [cardForGraded, setCardForGraded] = useState(null);
  const [gradedModalTarget, setGradedModalTarget] = useState('collection'); // 'collection', 'trade', 'buy'
  
  // Graded pricing selection (for card detail view)
  const [selectedGradingCompany, setSelectedGradingCompany] = useState("PSA");
  const [selectedGrade, setSelectedGrade] = useState("10");
  const [gradedPrice, setGradedPrice] = useState(null);
  const [loadingGradedPrice, setLoadingGradedPrice] = useState(false);
  
  // Community image state
  const [communityImage, setCommunityImage] = useState(null);

  // Format price with rounding and selected currency
  const formatPrice = useCallback(
    (value) => formatCurrency(roundUpPrices ? Math.ceil(Number(value ?? 0)) : Number(value ?? 0), currency),
    [roundUpPrices, currency],
  );

  // Visible suggestions (first 5 or all)
  const visibleSuggestions = useMemo(
    () =>
      showAllSuggestions
        ? suggestions
        : suggestions.slice(0, DEFAULT_SUGGESTION_LIMIT),
    [suggestions, showAllSuggestions],
  );

  const hasMoreSuggestions = useMemo(
    () => suggestions.length > DEFAULT_SUGGESTION_LIMIT,
    [suggestions],
  );

  // Search effect
  useEffect(() => {
    let cancelled = false;
    setError("");
    setShowAllSuggestions(false);

    const canonical = canonicalizeQuery(debounced);
    if (!canonical) {
      setSuggestions([]);
      setLoading(false);
      lastFetchedCanonicalRef.current = "";
      activeSearchTokenRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    const cached = getSearchCacheEntry(canonical);
    if (cached?.results?.length) {
      const prepared = formatSearchResults(
        cached.results,
        debounced,
        MAX_SUGGESTION_LIMIT,
      );
      setSuggestions(prepared);
      lastFetchedCanonicalRef.current = canonical;
      if (!cached.expired) {
        setLoading(false);
        activeSearchTokenRef.current = null;
        return () => {
          cancelled = true;
        };
      }
    } else {
      setSuggestions([]);
    }

    setLoading(!(cached?.results?.length));
    const token = Symbol("search");
    activeSearchTokenRef.current = token;

    (async () => {
      try {
        // Use hybrid search for comprehensive pricing from PriceCharting + CardMarket
        const results = await apiSearchCardsHybrid(debounced, {
          useCache: false,
          maxResults: MAX_SUGGESTION_LIMIT,
        });
        if (cancelled || activeSearchTokenRef.current !== token) return;
        const prepared = formatSearchResults(
          results,
          debounced,
          MAX_SUGGESTION_LIMIT,
        );
        
        // Apply community images - lazy load only if needed
        let enrichedResults = prepared;
        const cardsWithoutImages = prepared.filter(card => !card.image);
        
        if (cardsWithoutImages.length > 0) {
          // Cards without images exist
          if (!communityImages && refreshCommunityImages) {
            // Lazy load community images on first need
            console.log('📸 Lazy loading community images for search results...');
            refreshCommunityImages().then(() => {
              // After loading, re-apply images to current suggestions
              setSuggestions(prev => prev.map(card => {
                if (!card.image) {
                  const image = getImageForCard(card);
                  if (image) return { ...card, image };
                }
                return card;
              }));
            });
          } else if (communityImages) {
            // We have community images - apply them
            enrichedResults = prepared.map(card => {
              if (!card.image) {
                const image = getImageForCard(card);
                if (image) return { ...card, image };
              }
              return card;
            });
          }
        }
        
        setSuggestions(enrichedResults);
        lastFetchedCanonicalRef.current = canonical;
      } catch (err) {
        if (!cancelled) {
          console.error("Search failed", err);
          setError("Search failed. Check API key and endpoint.");
        }
      } finally {
        if (!cancelled && activeSearchTokenRef.current === token) {
          setLoading(false);
          activeSearchTokenRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced, setError, setShowAllSuggestions, setSuggestions, setLoading]);

  // Pick card handler
  const pickCard = async (item) => {
    if (!item) return;
    setActiveCard(item);
    
    // Reset graded pricing and community image when selecting a new card
    setGradedPrice(null);
    setSelectedGradingCompany("PSA");
    setSelectedGrade("10");
    setCommunityImage(null);
    
    // Get community image from shared cache (no Firestore read!)
    if (!item.image) {
      const image = getImageForCard(item);
      if (image) {
        setCommunityImage(image);
      }
    }
    
    // Fetch card details and on-demand pricing in parallel
    // Skip market prices if graded filter is active (will fetch graded prices separately)
    try {
      const [full, marketPrices] = await Promise.all([
        apiFetchCardDetails(item),
        isGradedFilter ? Promise.resolve(null) : apiFetchMarketPrices(item).catch(err => {
          console.error("Failed to fetch market prices:", err);
          return null;
        })
      ]);
      
      // Merge card details with market prices
      const enrichedCard = { ...item };
      
      // Preserve original card identity before merging (API shouldn't overwrite these)
      const preservedData = {
        name: item.name,
        set: item.set,
        number: item.number,
        rarity: item.rarity,
        image: item.image || communityImage
      };
      
      if (full) {
        Object.assign(enrichedCard, full);
      }
      
      // Restore preserved identity fields if they were overwritten or empty
      if (preservedData.name) enrichedCard.name = preservedData.name;
      if (preservedData.set) enrichedCard.set = preservedData.set;
      if (preservedData.number) enrichedCard.number = preservedData.number;
      if (preservedData.rarity) enrichedCard.rarity = preservedData.rarity;
      if (preservedData.image && !enrichedCard.image) {
        enrichedCard.image = preservedData.image;
      }
      
      // Add market prices if available (only if not in graded mode)
      if (!isGradedFilter && marketPrices) {
        console.log('💰 Market prices response:', marketPrices);
        enrichedCard.prices = enrichedCard.prices || {};
        enrichedCard.isFallbackPrice = false; // Reset fallback flag
        
        // Add US/TCGPlayer prices
        if (marketPrices.us?.found) {
          console.log('🇺🇸 US prices found:', marketPrices.us);
          enrichedCard.prices.tcgplayer = {
            market_price: marketPrices.us.market,
            low_price: marketPrices.us.low,
            mid_price: marketPrices.us.mid,
            high_price: marketPrices.us.high,
          };
          enrichedCard.priceSource = marketPrices.us.fallback ? 'PriceCharting' : 'TCGPlayer';
          // Only set fallback flag if it's actually a fallback
          if (marketPrices.us.fallback === true) {
            console.log('🔔 PriceCharting fallback active!');
            enrichedCard.isFallbackPrice = true;
            // Store PriceCharting price separately for calculators
            enrichedCard.prices.pricecharting = marketPrices.us.market;
          }
        } else {
          console.log('⚠️ No US prices found');
        }
        
        // Add EU/CardMarket prices
        if (marketPrices.eu?.found) {
          console.log('🇪🇺 EU prices found:', marketPrices.eu);
          enrichedCard.prices.cardmarket = {
            avg30: marketPrices.eu.avg,           // 30d average
            avg7: marketPrices.eu.trend,          // 7d average (trend)
            lowest_near_mint: marketPrices.eu.low, // Lowest NM listing
            averageSellPrice: marketPrices.eu.avg, // Legacy field
            lowPrice: marketPrices.eu.low,         // Legacy field
            trendPrice: marketPrices.eu.trend,     // Legacy field
          };
        } else {
          console.log('⚠️ No EU prices found');
        }
      }
      
      setActiveCard((current) => {
        if (!current) return enrichedCard;
        const currentKey =
          current.entryId || current.id || current.slug || current.name;
        const incomingKey =
          item.entryId || item.id || item.slug || item.name;
        if (currentKey && incomingKey && currentKey !== incomingKey) {
          return current;
        }
        return enrichedCard;
      });
    } catch (err) {
      console.error("Failed to fetch card details", err);
    }
  };

  // Quick add handlers - v2.1: Direct add for ungraded, graded modal for graded cards
  const handleQuickAddCollection = useCallback(async (card) => {
    if (!user) {
      alert("Please sign in to add cards to your collection");
      return;
    }
    if (isGradedFilter) {
      setCardForGraded(card);
      setGradedModalTarget('collection');
      setGradedModalOpen(true);
    } else {
      // Direct add with selected condition
      try {
        // Fetch market prices before adding (to ensure price data is available)
        console.log('💰 Quick add: Fetching market prices for:', card.name);
        const marketPrices = await apiFetchMarketPrices(card);
        
        // Enrich card with market prices
        const enrichedCard = { ...card };
        enrichedCard.prices = enrichedCard.prices || {};
        
        if (marketPrices.us?.found) {
          enrichedCard.prices.tcgplayer = {
            market_price: marketPrices.us.market,
            low_price: marketPrices.us.low,
            mid_price: marketPrices.us.mid,
            high_price: marketPrices.us.high,
          };
          // Store PriceCharting separately for calculators if it's a fallback
          if (marketPrices.us.fallback === true) {
            enrichedCard.prices.pricecharting = marketPrices.us.market;
          }
        }
        
        if (marketPrices.eu?.found) {
          enrichedCard.prices.cardmarket = {
            avg30: marketPrices.eu.avg,
            avg7: marketPrices.eu.trend,
            lowest_near_mint: marketPrices.eu.low,
            averageSellPrice: marketPrices.eu.avg,
            lowPrice: marketPrices.eu.low,
            trendPrice: marketPrices.eu.trend,
          };
        }
        
        console.log('✅ Quick add: Prices fetched and card enriched', enrichedCard.prices);
        
        const newItem = await addToCollection(enrichedCard, {
          condition: defaultCondition,
          quantity: 1,
          mode: mode,
        });
        
        if (newItem) {
          triggerQuickAddFeedback(`${card.name} added to ${isVendor ? 'inventory' : 'collection'}`);
        }
      } catch (error) {
        console.error("Error adding to collection:", error);
        alert("Failed to add card. Please try again.");
      }
    }
  }, [user, isGradedFilter, defaultCondition, mode, addToCollection, triggerQuickAddFeedback, isVendor]);

  const handleQuickAddTrade = useCallback(async (card) => {
    // If in graded mode, open modal to select company/grade
    if (isGradedFilter) {
      setCardForGraded(card);
      setGradedModalTarget('trade');
      setGradedModalOpen(true);
      return;
    }
    
    // Regular ungraded card - fetch prices if not already available
    let cardWithPrices = card;
    if (!card.prices || (!card.prices.tcgplayer && !card.prices.cardmarket && !card.prices.pricecharting)) {
      try {
        console.log('💰 Quick add trade: Fetching market prices for:', card.name);
        const marketPrices = await apiFetchMarketPrices(card);
        if (marketPrices) {
          const prices = {};
          
          // Format US prices correctly
          if (marketPrices.us?.found) {
            prices.tcgplayer = {
              market_price: marketPrices.us.market,
              low_price: marketPrices.us.low,
              mid_price: marketPrices.us.mid,
              high_price: marketPrices.us.high,
            };
            // Store PriceCharting separately if it's a fallback
            if (marketPrices.us.fallback === true) {
              prices.pricecharting = marketPrices.us.market;
            }
          }
          
          // Format EU prices correctly
          if (marketPrices.eu?.found) {
            prices.cardmarket = {
              avg30: marketPrices.eu.avg,
              avg7: marketPrices.eu.trend,
              lowest_near_mint: marketPrices.eu.low,
              averageSellPrice: marketPrices.eu.avg,
              lowPrice: marketPrices.eu.low,
              trendPrice: marketPrices.eu.trend,
            };
          }
          
          cardWithPrices = { ...card, prices };
          console.log('✅ Quick add trade: Prices fetched and formatted', prices);
        }
      } catch (error) {
        console.error("Failed to fetch prices for trade:", error);
      }
    }
    
    setTradeItems(prev => [...prev, {
      id: `${cardWithPrices.id}-trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      baseId: cardWithPrices.id,
      name: cardWithPrices.name,
      set: cardWithPrices.set,
      number: cardWithPrices.number,
      rarity: cardWithPrices.rarity,
      image: cardWithPrices.image,
      links: cardWithPrices.links,
      condition: defaultCondition,
      prices: cardWithPrices.prices,
      tradePct: userProfile?.defaultTradePct || 90,
      addedAt: Date.now(),
    }]);
    triggerQuickAddFeedback(`${card.name} added to trade binder`);
  }, [setTradeItems, defaultCondition, triggerQuickAddFeedback, userProfile?.defaultTradePct, isGradedFilter, setCardForGraded, setGradedModalOpen]);

  const handleQuickAddBuy = useCallback(async (card) => {
    // If in graded mode, open modal to select company/grade
    if (isGradedFilter) {
      setCardForGraded(card);
      setGradedModalTarget('buy');
      setGradedModalOpen(true);
      return;
    }
    
    // Regular ungraded card
    const exists = buyItems.find(it => it.id === card.id);
    if (exists) {
      triggerQuickAddFeedback(`${card.name} already in buy list`);
      return;
    }
    
    // Fetch prices if not already available
    let cardWithPrices = card;
    if (!card.prices || (!card.prices.tcgplayer && !card.prices.cardmarket && !card.prices.pricecharting)) {
      try {
        console.log('💰 Quick add buy: Fetching market prices for:', card.name);
        const marketPrices = await apiFetchMarketPrices(card);
        if (marketPrices) {
          const prices = {};
          
          // Format US prices correctly
          if (marketPrices.us?.found) {
            prices.tcgplayer = {
              market_price: marketPrices.us.market,
              low_price: marketPrices.us.low,
              mid_price: marketPrices.us.mid,
              high_price: marketPrices.us.high,
            };
            // Store PriceCharting separately if it's a fallback
            if (marketPrices.us.fallback === true) {
              prices.pricecharting = marketPrices.us.market;
            }
          }
          
          // Format EU prices correctly
          if (marketPrices.eu?.found) {
            prices.cardmarket = {
              avg30: marketPrices.eu.avg,
              avg7: marketPrices.eu.trend,
              lowest_near_mint: marketPrices.eu.low,
              averageSellPrice: marketPrices.eu.avg,
              lowPrice: marketPrices.eu.low,
              trendPrice: marketPrices.eu.trend,
            };
          }
          
          cardWithPrices = { ...card, prices };
          console.log('✅ Quick add buy: Prices fetched and formatted', prices);
        }
      } catch (error) {
        console.error("Failed to fetch prices for buy list:", error);
      }
    }
    
    setBuyItems(prev => [...prev, {
      entryId: crypto.randomUUID(),
      id: cardWithPrices.id,
      name: cardWithPrices.name,
      set: cardWithPrices.set,
      number: cardWithPrices.number,
      rarity: cardWithPrices.rarity,
      image: cardWithPrices.image,
      links: cardWithPrices.links,
      condition: defaultCondition,
      prices: cardWithPrices.prices,
      quantity: 1,
      buyPct: userProfile?.defaultBuyPct || 70,
      addedAt: Date.now(),
    }]);
    triggerQuickAddFeedback(`${card.name} added to buy list`);
  }, [buyItems, setBuyItems, defaultCondition, triggerQuickAddFeedback, userProfile?.defaultBuyPct, isGradedFilter, setCardForGraded, setGradedModalOpen]);

  const handleQuickAddWishlist = useCallback(async (card) => {
    if (!user) {
      alert("Please sign in to add cards to your wishlist");
      return;
    }
    try {
      const newItem = await addToWishlist(card);
      if (newItem) {
        triggerQuickAddFeedback(`${card.name} added to wishlist`);
      }
    } catch (error) {
      console.error("Error adding to wishlist:", error);
      alert("Failed to add card to wishlist. Please try again.");
    }
  }, [user, addToWishlist, triggerQuickAddFeedback]);

  // v2.1: Handle modal card add with all new fields
  const handleModalAddCard = useCallback(async (cardData) => {
    try {
      const newItem = await addToCollection(cardData.card || cardData, {
        mode: mode, // Pass the current mode (collector or vendor)
        condition: cardData.condition,
        quantity: cardData.quantity,
        notes: cardData.notes,
        // v2.1 fields
        variant: cardData.variant,
        variantSource: cardData.variantSource,
        isGraded: cardData.isGraded,
        gradingCompany: cardData.gradingCompany,
        grade: cardData.grade,
        gradedPrice: cardData.gradedPrice,
        language: cardData.language,
        isJapanese: cardData.isJapanese,
        manualPrice: cardData.manualPrice,
        // Vendor fields
        buyPrice: cardData.buyPrice,
        tradePrice: cardData.tradePrice,
        sellPrice: cardData.sellPrice,
      });
      if (newItem) {
        triggerQuickAddFeedback(`${cardData.name} added to ${isVendor ? 'inventory' : 'collection'}`);
      }
    } catch (error) {
      console.error("Error adding to collection:", error);
      alert("Failed to add card. Please try again.");
    }
  }, [addToCollection, triggerQuickAddFeedback, isVendor, mode]);

  // Full card add handlers
  const handleAddToCollection = useCallback(async () => {
    if (!activeCard) return;
    
    if (!user) {
      alert("Please sign in to add cards to your collection");
      return;
    }
    
    // If in graded mode with a price, add directly with graded info
    if (isGradedFilter && gradedPrice?.success && gradedPrice?.graded?.price > 0) {
      // Store graded price in USD (will be converted on display)
      const priceInUSD = gradedPrice.graded.price;
      
      const newItem = await addToCollection(activeCard, {
        condition: 'NM',
        quantity: 1,
        isGraded: true,
        gradingCompany: selectedGradingCompany,
        grade: selectedGrade,
        gradedPrice: priceInUSD, // Store in USD, convert on display
        mode: mode, // Pass the mode explicitly
      });
      
      if (newItem) {
        triggerQuickAddFeedback(`${activeCard.name} (${selectedGradingCompany} ${selectedGrade}) added to ${isVendor ? 'inventory' : 'collection'}`);
      }
    } else {
      // Ungraded mode: add directly using selected condition from dropdown
      const newItem = await addToCollection(activeCard, {
        condition: defaultCondition,
        quantity: 1,
        mode: mode, // Pass the mode explicitly
      });
      
      if (newItem) {
        triggerQuickAddFeedback(`${activeCard.name} added to ${isVendor ? 'inventory' : 'collection'}`);
      }
    }
  }, [activeCard, isGradedFilter, gradedPrice, user, selectedGradingCompany, selectedGrade, defaultCondition, addToCollection, triggerQuickAddFeedback, isVendor, mode]);

  const handleAddToWishlist = useCallback(() => {
    if (!activeCard) return;
    if (!user) {
      alert("Please sign in to add cards to your wishlist");
      return;
    }
    const newItem = addToWishlist(activeCard);
    triggerQuickAddFeedback(`${activeCard.name} added to wishlist`);
  }, [activeCard, user, addToWishlist, triggerQuickAddFeedback]);

  const handleAddToTrade = useCallback(() => {
    if (!activeCard) return;
    
    // If in graded mode with a price, add directly with graded info
    if (isGradedFilter && gradedPrice?.success && gradedPrice?.graded?.price > 0) {
      const priceInUSD = gradedPrice.graded.price;
      
      setTradeItems(prev => [...prev, {
        id: `${activeCard.id}-trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        baseId: activeCard.id,
        name: activeCard.name,
        set: activeCard.set,
        number: activeCard.number,
        rarity: activeCard.rarity,
        image: activeCard.image,
        links: activeCard.links,
        condition: 'NM',
        prices: activeCard.prices,
        tradePct: userProfile?.defaultTradePct || 90,
        addedAt: Date.now(),
        isGraded: true,
        gradingCompany: selectedGradingCompany,
        grade: selectedGrade,
        gradedPrice: priceInUSD, // Store in USD
      }]);
      
      triggerQuickAddFeedback(`${activeCard.name} (${selectedGradingCompany} ${selectedGrade}) added to trade list`);
    } else {
      handleQuickAddTrade(activeCard);
    }
  }, [activeCard, isGradedFilter, gradedPrice, selectedGradingCompany, selectedGrade, currency, userProfile, setTradeItems, triggerQuickAddFeedback, handleQuickAddTrade]);

  const handleAddToBuy = useCallback(() => {
    if (!activeCard) return;
    
    // If in graded mode with a price, add directly with graded info
    if (isGradedFilter && gradedPrice?.success && gradedPrice?.graded?.price > 0) {
      const exists = buyItems.find(it => it.id === activeCard.id && it.isGraded && it.gradingCompany === selectedGradingCompany && it.grade === selectedGrade);
      if (exists) {
        triggerQuickAddFeedback(`${activeCard.name} (${selectedGradingCompany} ${selectedGrade}) already in buy list`);
        return;
      }
      
      const priceInUSD = gradedPrice.graded.price;
      
      setBuyItems(prev => [...prev, {
        entryId: crypto.randomUUID(),
        id: activeCard.id,
        name: activeCard.name,
        set: activeCard.set,
        number: activeCard.number,
        rarity: activeCard.rarity,
        image: activeCard.image,
        links: activeCard.links,
        condition: 'NM',
        prices: activeCard.prices,
        addedAt: Date.now(),
        isGraded: true,
        gradingCompany: selectedGradingCompany,
        grade: selectedGrade,
        gradedPrice: priceInUSD, // Store in USD
      }]);
      
      triggerQuickAddFeedback(`${activeCard.name} (${selectedGradingCompany} ${selectedGrade}) added to buy list`);
    } else {
      handleQuickAddBuy(activeCard);
    }
  }, [activeCard, isGradedFilter, gradedPrice, selectedGradingCompany, selectedGrade, currency, buyItems, setBuyItems, triggerQuickAddFeedback, handleQuickAddBuy]);
  
  // Handler for graded modal submission
  const handleGradedModalSubmit = useCallback(async ({ card, gradingCompany, grade, isGraded }) => {
    // Fetch graded price before adding
    let gradedPriceUSD = null;
    if (isGraded) {
      try {
        const priceData = await apiFetchGradedPrices(card, gradingCompany, grade);
        if (priceData?.success && priceData?.graded?.price > 0) {
          gradedPriceUSD = priceData.graded.price;
        }
      } catch (error) {
        console.error('Failed to fetch graded price:', error);
      }
    }
    
    // Handle based on target
    if (gradedModalTarget === 'trade') {
      setTradeItems(prev => [...prev, {
        id: `${card.id}-trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        baseId: card.id,
        name: card.name,
        set: card.set,
        number: card.number,
        rarity: card.rarity,
        image: card.image,
        links: card.links,
        condition: 'NM',
        prices: card.prices,
        isGraded: true,
        gradingCompany,
        grade,
        gradedPrice: gradedPriceUSD,
        tradePct: userProfile?.defaultTradePct || 90,
        addedAt: Date.now(),
      }]);
      triggerQuickAddFeedback(`${card.name} (${gradingCompany} ${grade}) added to trade binder`);
    } else if (gradedModalTarget === 'buy') {
      setBuyItems(prev => [...prev, {
        entryId: crypto.randomUUID(),
        id: card.id,
        name: card.name,
        set: card.set,
        number: card.number,
        rarity: card.rarity,
        image: card.image,
        links: card.links,
        condition: 'NM',
        prices: card.prices,
        isGraded: true,
        gradingCompany,
        grade,
        gradedPrice: gradedPriceUSD,
        quantity: 1,
        buyPct: userProfile?.defaultBuyPct || 70,
        addedAt: Date.now(),
      }]);
      triggerQuickAddFeedback(`${card.name} (${gradingCompany} ${grade}) added to buy list`);
    } else {
      // Default: collection
      const newItem = await addToCollection(card, {
        mode: mode, // Explicitly pass the mode (collector or vendor)
        condition: 'NM', // Graded cards are typically NM
        isGraded,
        gradingCompany,
        grade,
        gradedPrice: gradedPriceUSD, // Pass the fetched price in USD
      });
      if (newItem) {
        triggerQuickAddFeedback(`${card.name} (${gradingCompany} ${grade}) added to ${isVendor ? 'inventory' : 'collection'}`);
      }
    }
  }, [addToCollection, mode, isVendor, triggerQuickAddFeedback, gradedModalTarget, setTradeItems, setBuyItems, userProfile]);
  
  // Fetch graded price when company or grade changes
  useEffect(() => {
    if (!isGradedFilter || !activeCard || !selectedGradingCompany || !selectedGrade) {
      return;
    }
    
    // Validate that card has required data
    const cardName = activeCard.name || activeCard.fullName;
    if (!cardName) {
      console.warn('Cannot fetch graded prices: Card has no name', activeCard);
      setGradedPrice({ success: false, error: 'Card information incomplete' });
      setLoadingGradedPrice(false);
      return;
    }
    
    const fetchGraded = async () => {
      setLoadingGradedPrice(true);
      try {
        const result = await apiFetchGradedPrices(activeCard, selectedGradingCompany, selectedGrade);
        setGradedPrice(result);
      } catch (error) {
        console.error("Error fetching graded price:", error);
        setGradedPrice({ success: false, error: error.message });
      } finally {
        setLoadingGradedPrice(false);
      }
    };
    
    fetchGraded();
  }, [isGradedFilter, activeCard, selectedGradingCompany, selectedGrade]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        {isVendor ? (
          <Store className="h-8 w-8 text-green-600" />
        ) : (
          <Package className="h-8 w-8 text-purple-600" />
        )}
        <div>
          <h1 className="text-3xl font-bold">Card Search</h1>
          <p className="text-muted-foreground">
            {isVendor ? "Vendor" : "Collector"} Toolkit
          </p>
        </div>
      </div>

      {/* Quick Access Buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link to="/collector/marketplace">
          <Button variant="outline" size="sm">
            <ShoppingBag className="h-4 w-4 mr-1" />
            Marketplace
          </Button>
        </Link>
        {isVendor ? (
          <>
            <Link to="/vendor/inventory">
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4 mr-1" />
                My Inventory
              </Button>
            </Link>
            <Link to="/vendor/trade-calculator">
              <Button variant="outline" size="sm">
                <Calculator className="h-4 w-4 mr-1" />
                Trade Calculator
              </Button>
            </Link>
            <Link to="/vendor/buy-calculator">
              <Button variant="outline" size="sm">
                <TrendingUp className="h-4 w-4 mr-1" />
                Buy Calculator
              </Button>
            </Link>
          </>
        ) : (
          <>
            <Link to="/collector/collection">
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4 mr-1" />
                My Collection
              </Button>
            </Link>
            <Link to="/collector/wishlist">
              <Button variant="outline" size="sm">
                <Heart className="h-4 w-4 mr-1" />
                Wishlist
              </Button>
            </Link>
          </>
        )}
      </div>

      {/* Search Input */}
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              placeholder="Search by name, set (e.g., Crown Zenith), or number (e.g., GG69)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {!isGradedFilter && (
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-70">
                  Default condition
                </span>
                <ConditionSelect
                  value={defaultCondition}
                  onChange={setDefaultCondition}
                />
              </div>
            )}
            <Button
              variant={isGradedFilter ? "default" : "outline"}
              size="sm"
              onClick={() => setIsGradedFilter(!isGradedFilter)}
              className="whitespace-nowrap"
            >
              {isGradedFilter ? "✓ Graded Only" : "Ungraded"}
            </Button>
          </div>
          
          {loading && <div className="text-sm opacity-70">Searching…</div>}
          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
          
          {/* Suggestions */}
          {visibleSuggestions.length > 0 && (
            <div className="divide-y rounded-xl border">
              {visibleSuggestions.map((s) => (
                <SuggestionItem
                  key={`${s.id}-${s.slug}`}
                  item={s}
                  onPick={pickCard}
                  onQuickAddCollection={handleQuickAddCollection}
                  onQuickAddTrade={handleQuickAddTrade}
                  onQuickAddBuy={handleQuickAddBuy}
                  onQuickAddWishlist={handleQuickAddWishlist}
                  mode={mode}
                />
              ))}
            </div>
          )}
          
          {hasMoreSuggestions && (
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAllSuggestions((prev) => !prev)}
              >
                {showAllSuggestions ? "Show fewer results" : "Show more results"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Card Details */}
      {activeCard && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <Card className="rounded-2xl p-4 shadow">
            <CardContent className="p-0">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-1">
                  {activeCard.image || communityImage ? (
                    <img
                      src={communityImage || activeCard.image}
                      alt={activeCard.name}
                      className="w-full rounded-xl"
                    />
                  ) : (
                    <div className="relative">
                      <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted">
                        <div className="text-center p-4">
                          <p className="text-sm text-muted-foreground mb-3">No image available</p>
                          {user && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setCardForImageUpload(activeCard);
                                setImageUploadModalOpen(true);
                              }}
                              className="text-xs"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload Image
                            </Button>
                          )}
                        </div>
                      </div>
                      {!user && (
                        <p className="text-xs text-center text-muted-foreground mt-2">
                          Sign in to contribute an image
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3 md:col-span-2">
                  <div>
                    <h2 className="text-xl font-bold">
                      {activeCard.name}
                    </h2>
                    <div className="text-sm opacity-70">
                      {activeCard.set} • {activeCard.rarity} • #
                      {activeCard.number}
                    </div>
                  </div>
                  <ExternalLinks links={activeCard.links} />
                  
                  {/* Graded Mode: Show company and grade selectors */}
                  {isGradedFilter ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-2">Grading Company</label>
                          <select
                            value={selectedGradingCompany}
                            onChange={(e) => setSelectedGradingCompany(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            <option value="PSA">PSA</option>
                            <option value="BGS">BGS</option>
                            <option value="CGC">CGC</option>
                            <option value="SGC">SGC</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Grade</label>
                          <select
                            value={selectedGrade}
                            onChange={(e) => setSelectedGrade(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md"
                          >
                            {["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4", "3", "2", "1"].map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      {/* Display Graded Price */}
                      {loadingGradedPrice ? (
                        <Card className="rounded-2xl p-4 shadow">
                          <CardContent className="p-0">
                            <div className="text-center py-8">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                              <p className="text-sm text-muted-foreground">Fetching graded price...</p>
                            </div>
                          </CardContent>
                        </Card>
                      ) : gradedPrice?.success && gradedPrice?.graded?.price > 0 ? (
                        <Card className="rounded-2xl p-4 shadow border-purple-200 bg-purple-50">
                          <CardContent className="p-0">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="font-semibold text-purple-700">
                                PriceCharting - {selectedGradingCompany} {selectedGrade} ({currency || 'USD'})
                              </span>
                              {gradedPrice.card?.priceChartingId && (
                                <a
                                  href={`https://www.pricecharting.com/game/pokemon-cards?q=${encodeURIComponent(activeCard.name)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 underline"
                                >
                                  View <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm">Graded Price</span>
                                <span className="font-medium">{formatPrice(convertCurrency(gradedPrice.graded.price, currency || 'USD'))}</span>
                              </div>
                              {gradedPrice.graded.label && (
                                <p className="text-xs text-purple-600 mt-2 pt-2 border-t border-purple-200">
                                  {gradedPrice.graded.label}
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className="rounded-2xl p-4 shadow border-yellow-200 bg-yellow-50">
                          <CardContent className="p-0">
                            <div className="text-center py-4">
                              <p className="text-sm text-yellow-700">
                                ⚠️ No graded price available for {selectedGradingCompany} {selectedGrade}
                              </p>
                              <p className="text-xs text-yellow-600 mt-1">
                                Try a different grade or grading company
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  ) : (
                    <CardPrices
                      card={activeCard}
                      condition={defaultCondition}
                      formatPrice={formatPrice}
                      mode={mode}
                      marketSource={marketSource}
                      currency={currency || 'USD'}
                    />
                  )}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button onClick={handleAddToCollection}>
                      <Plus className="mr-1 h-4 w-4" /> Add to {isVendor ? 'Inventory' : 'Collection'}
                    </Button>
                    {!isVendor && (
                      <Button
                        variant="outline"
                        onClick={handleAddToWishlist}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add to Wishlist
                      </Button>
                    )}
                    {isVendor && (
                      <>
                        <Button
                          variant="outline"
                          onClick={handleAddToTrade}
                        >
                          <Plus className="mr-1 h-4 w-4" /> Add to Trade
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleAddToBuy}
                        >
                          <Plus className="mr-1 h-4 w-4" /> Add to Buy List
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Submit Feedback Button */}
      <div className="mt-8 text-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFeedbackModalOpen(true)}
          className="text-gray-500 hover:text-gray-700"
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Submit Feedback
        </Button>
      </div>

      {/* v2.1: Add Card Modal with Variants, Graded, and Japanese support */}
      <AddCardModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setCardToAdd(null);
        }}
        card={cardToAdd}
        defaultCondition={defaultCondition}
        onAdd={handleModalAddCard}
        mode={mode}
      />

      {/* Community Image Upload Modal */}
      <ImageUploadModal
        isOpen={imageUploadModalOpen}
        onClose={() => {
          setImageUploadModalOpen(false);
          setCardForImageUpload(null);
        }}
        card={cardForImageUpload}
      />
      
      {/* Graded Card Modal (Simplified) */}
      <GradedCardModal
        isOpen={gradedModalOpen}
        onClose={() => {
          setGradedModalOpen(false);
          setCardForGraded(null);
        }}
        card={cardForGraded}
        onSubmit={handleGradedModalSubmit}
        mode={mode}
        target={gradedModalTarget}
      />
    </div>
  );
}
