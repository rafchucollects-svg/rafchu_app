import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, Trash, CheckSquare, Square, Save, FolderOpen, Share2, Copy, Link, Check, X, Plus, Scissors } from "lucide-react";
import { ManualCardEntry } from "@/components/ManualCardEntry";
import { useApp } from "@/contexts/AppContext";
import { ConditionSelect } from "@/components/CardComponents";
import { GradingBadge } from "@/components/GradingCompanyLogo";
import { computeTcgPrice, getCardmarketAvg, getCardmarketLowest, formatCurrency, recordTransaction, computeItemMetrics, convertCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";
import { collection, addDoc, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

/**
 * Trade Calculator Page (Vendor Toolkit)
 * Calculate trade values with adjustable percentages and condition
 */

// Percent select component
function PercentSelect({ value, onChange, className = "" }) {
  return (
    <select
      className={`rounded-md border px-2 py-1 ${className}`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {[40, 50, 60, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120].map((p) => (
        <option key={p} value={p}>
          {p}%
        </option>
      ))}
    </select>
  );
}

export function TradeCalculator() {
  const { user, db, tradeItems, setTradeItems, currency, secondaryCurrency, collectionItems, setCollectionItems, triggerQuickAddFeedback, userProfile } = useApp();
  const [tradeDefaultPct, setTradeDefaultPct] = useState(userProfile?.defaultTradePct || 90);
  const [tradeSortBy, setTradeSortBy] = useState("addedAt");
  const [tradeSortDir, setTradeSortDir] = useState("desc");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pendingDeals, setPendingDeals] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState(new Set());
  const [pendingTradeConfirmation, setPendingTradeConfirmation] = useState(null);
  const [loadedFromPendingDealId, setLoadedFromPendingDealId] = useState(null);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [tradeCurrency, setTradeCurrency] = useState(currency); // Currency for trade input
  const [cashAmount, setCashAmount] = useState(""); // Cash amount in trade
  const [cashDirection, setCashDirection] = useState("in"); // "in" = receiving cash, "out" = paying cash
  
  // Share trade offer state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Manual card entry state
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Threshold percentage state
  const [thresholdPrice, setThresholdPrice] = useState("");
  const [thresholdPct, setThresholdPct] = useState(60);

  // Split offer state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitShareLinks, setSplitShareLinks] = useState({});
  const [splitCopied, setSplitCopied] = useState({});
  const [splitShareLoading, setSplitShareLoading] = useState({});

  // Load default percentage from user profile
  useEffect(() => {
    if (userProfile?.defaultTradePct != null) {
      setTradeDefaultPct(userProfile.defaultTradePct);
    }
  }, [userProfile?.defaultTradePct]);

  // Helper function to save pending deals to Firestore
  const savePendingDealsToFirestore = useCallback(async (deals) => {
    if (!user?.uid || !db) return;
    try {
      const docRef = doc(db, "pendingDeals", user.uid);
      // First get current doc to preserve buyDeals
      const snapshot = await getDoc(docRef);
      const currentData = snapshot.exists() ? snapshot.data() : {};
      await setDoc(docRef, {
        ...currentData,
        tradeDeals: deals
      });
    } catch (error) {
      console.error("Failed to save pending deals to Firestore:", error);
      // Fallback to localStorage
      localStorage.setItem(`trade_pending_${user.uid}`, JSON.stringify(deals));
    }
  }, [user, db]);

  // Load pending deals from Firestore (real-time sync across devices)
  useEffect(() => {
    if (!user?.uid || !db) return;

    const docRef = doc(db, "pendingDeals", user.uid);
    
    // Use onSnapshot for real-time sync across devices
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPendingDeals(data.tradeDeals || []);
      } else {
        setPendingDeals([]);
      }
    }, (error) => {
      console.error("Failed to load pending deals:", error);
      // Fallback to localStorage if Firestore fails
      try {
        const saved = localStorage.getItem(`trade_pending_${user.uid}`);
        if (saved) {
          setPendingDeals(JSON.parse(saved));
        }
      } catch (e) {
        console.error("localStorage fallback also failed:", e);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  const removeFromTrade = (id) => {
    setTradeItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const updateTradeCondition = (id, condition) =>
    setTradeItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, condition } : i)),
    );

  const updateTradePct = (id, pct) =>
    setTradeItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, tradePct: Math.max(40, Math.min(120, pct)) } : i)),
    );
  
  const updateOverrideValue = (id, value) =>
    setTradeItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, overrideValue: value === "" ? null : parseFloat(value) } : i)),
    );

  const clearTradeBinder = () => {
    setTradeItems([]);
    setSelectedIds(new Set());
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tradeItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tradeItems.map(it => it.id)));
    }
  };

  const handleTradeDefaultChange = (pct) => {
    const next = Math.max(40, Math.min(120, pct));
    const prevDefault = tradeDefaultPct;
    setTradeDefaultPct(next);
    setTradeItems((prev) =>
      prev.map((item) =>
        item.tradePct === prevDefault || item.tradePct === undefined
          ? { ...item, tradePct: next }
          : item,
      ),
    );
  };

  const handleApplyThreshold = () => {
    const threshold = parseFloat(thresholdPrice);
    if (!threshold || threshold <= 0) {
      triggerQuickAddFeedback("Please enter a valid price threshold.");
      return;
    }
    let count = 0;
    setTradeItems(prev => prev.map(item => {
      let marketPrice = 0;
      if (item.isGraded && item.gradedPrice) {
        const src = item.gradedPriceCurrency || 'USD';
        marketPrice = convertCurrency(parseFloat(item.gradedPrice), currency, src);
      } else if (item.isManualEntry && item.manualPrice) {
        const src = item.manualPriceCurrency || 'USD';
        marketPrice = convertCurrency(parseFloat(item.manualPrice), currency, src);
      } else {
        const tcg = computeTcgPrice(item, item.condition);
        const cmAvg = getCardmarketAvg(item, item.condition) || 0;
        const cmLow = getCardmarketLowest(item, item.condition) || 0;
        const valid = [tcg, cmAvg, cmLow].filter(p => p > 0);
        marketPrice = valid.length > 0 ? Math.min(...valid) : 0;
      }
      if (marketPrice > 0 && marketPrice < threshold) {
        count++;
        return { ...item, tradePct: thresholdPct };
      }
      return item;
    }));
    triggerQuickAddFeedback(`Updated ${count} card${count !== 1 ? 's' : ''} to ${thresholdPct}%`);
  };

  // Format price helper - defined early so it can be used by other functions
  const formatPrice = (amount) => formatCurrency(amount, currency);

  // Dual-currency formatter: primary + secondary in parentheses
  const formatDual = (amount) => {
    const primary = formatCurrency(amount, currency);
    if (!secondaryCurrency || secondaryCurrency === currency) return primary;
    const converted = convertCurrency(amount, secondaryCurrency, currency);
    return `${primary} (${formatCurrency(converted, secondaryCurrency)})`;
  };

  const calculateItemValue = (item) => {
    const pct = (item.tradePct ?? tradeDefaultPct) / 100;
    
    // For graded cards, use graded price
    if (item.isGraded && item.gradedPrice) {
      // gradedPriceCurrency tells us what currency the price was entered in
      // API-fetched graded prices are in USD, manual entries use user's currency
      const sourceCurrency = item.gradedPriceCurrency || 'USD';
      const gradedPriceInCurrency = convertCurrency(parseFloat(item.gradedPrice), currency, sourceCurrency);
      const gradedValue = gradedPriceInCurrency * pct;
      const finalValue = item.overrideValue ?? gradedValue;
      return { graded: gradedValue, finalValue, isGraded: true };
    }
    
    // For manual cards with manual price (not graded), use that price
    if (item.isManualEntry && item.manualPrice) {
      const sourceCurrency = item.manualPriceCurrency || 'USD';
      const manualPriceInCurrency = convertCurrency(parseFloat(item.manualPrice), currency, sourceCurrency);
      const manualValue = manualPriceInCurrency * pct;
      const finalValue = item.overrideValue ?? manualValue;
      return { tcg: manualValue, cmAvg: manualValue, cmLowest: manualValue, suggested: manualValue, finalValue, isGraded: false };
    }
    
    // For ungraded cards, use market prices
    const tcg = computeTcgPrice(item, item.condition) * pct;
    const cmAvg = (getCardmarketAvg(item, item.condition) || 0) * pct;
    const cmLowest = (getCardmarketLowest(item, item.condition) || 0) * pct;
    
    // Check for PriceCharting fallback if other prices are 0
    let suggested = 0;
    if (tcg > 0 || cmAvg > 0 || cmLowest > 0) {
      const validPrices = [tcg, cmAvg, cmLowest].filter(p => p > 0);
      suggested = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    } else if (item.prices?.pricecharting) {
      // Use PriceCharting fallback (in USD, need to convert)
      const pcPrice = convertCurrency(parseFloat(item.prices.pricecharting), currency, 'USD');
      suggested = pcPrice * pct;
    }
    
    const finalValue = item.overrideValue ?? suggested;
    return { tcg, cmAvg, cmLowest, suggested, finalValue, isGraded: false };
  };

  const tradeTotals = useMemo(() => {
    return tradeItems.reduce(
      (acc, item) => {
        const values = calculateItemValue(item);
        if (values.isGraded) {
          // For graded cards, only accumulate graded value and final value
          acc.finalValue += values.finalValue;
        } else {
          // For ungraded cards, accumulate all values
          acc.tcgMarket += values.tcg || 0;
          acc.cmAvg += values.cmAvg || 0;
          acc.cmLowest += values.cmLowest || 0;
          acc.finalValue += values.finalValue;
        }
        return acc;
      },
      { tcgMarket: 0, cmAvg: 0, cmLowest: 0, finalValue: 0 },
    );
  }, [tradeItems, tradeDefaultPct]);

  const selectedTotals = useMemo(() => {
    const selectedItems = tradeItems.filter(it => selectedIds.has(it.id));
    return selectedItems.reduce(
      (acc, item) => {
        const { tcg, cmAvg, cmLowest, finalValue } = calculateItemValue(item);
        acc.tcgMarket += tcg;
        acc.cmAvg += cmAvg;
        acc.cmLowest += cmLowest;
        acc.finalValue += finalValue;
        return acc;
      },
      { tcgMarket: 0, cmAvg: 0, cmLowest: 0, finalValue: 0 },
    );
  }, [tradeItems, selectedIds, tradeDefaultPct]);

  const sortedTradeItems = useMemo(() => {
    const direction = tradeSortDir === "desc" ? -1 : 1;
    const getValue = (item) => {
      const values = calculateItemValue(item);
      switch (tradeSortBy) {
        case "price_suggested":
          return values.isGraded ? (values.graded || 0) : (values.suggested || 0);
        case "price_tcg":
          return values.tcg || 0;
        case "price_cm":
          return values.cmAvg || 0;
        case "price_diff":
          return (values.tcg || 0) - (values.cmAvg || 0);
        case "addedAt":
        default:
          return item.addedAt || 0;
      }
    };
    return [...tradeItems].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === bv) return 0;
      return av > bv ? direction : -direction;
    });
  }, [tradeItems, tradeSortBy, tradeSortDir, tradeDefaultPct]);

  const groupedTradeItems = useMemo(() => {
    const groups = new Map();
    sortedTradeItems.forEach(item => {
      const pct = item.tradePct ?? tradeDefaultPct;
      if (!groups.has(pct)) groups.set(pct, []);
      groups.get(pct).push(item);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([pct, items]) => {
        const total = items.reduce((sum, item) => {
          const values = calculateItemValue(item);
          return sum + (values.finalValue ?? 0);
        }, 0);
        return { pct, items, total };
      });
  }, [sortedTradeItems, tradeDefaultPct]);

  const hasMultipleTiers = groupedTradeItems.length > 1;

  const handleConfirmTrade = () => {
    if (selectedIds.size === 0) {
      alert("Please select cards to confirm the trade.");
      return;
    }

    if (!user || !db) {
      alert("Please sign in to confirm trades.");
      return;
    }

    const selectedItems = tradeItems.filter(it => selectedIds.has(it.id));
    
    // Store pending confirmation and show inventory selection modal
    setPendingTradeConfirmation({
      selectedItems,
      selectedIds: new Set(selectedIds)
    });
    setShowInventoryModal(true);
  };

  const handleCompleteTradeWithInventory = async () => {
    if (!pendingTradeConfirmation) return;
    if (selectedInventoryIds.size === 0) {
      alert("Please select cards from your inventory to trade out.");
      return;
    }

    try {
      const { selectedItems } = pendingTradeConfirmation;
      const selectedInventoryItems = collectionItems.filter(it => selectedInventoryIds.has(it.entryId));

      // Prepare itemsIn (cards coming in from trade)
      const itemsIn = selectedItems.map(item => {
        // For graded cards, use the graded price; for ungraded, use market suggested
        let marketSuggested;
        if (item.isGraded && item.gradedPrice) {
          // Graded price is in USD, convert to current currency
          marketSuggested = convertCurrency(item.gradedPrice, currency);
        } else {
          // Calculate market suggested price (100%, not trade percentage)
          const tcgFull = computeTcgPrice(item, item.condition) || 0;
          const cmAvgFull = getCardmarketAvg(item, item.condition) || 0;
          const cmLowFull = getCardmarketLowest(item, item.condition) || 0;
          marketSuggested = Math.min(tcgFull, cmAvgFull, cmLowFull);
        }
        
        const cardData = {
          name: item.name || "",
          set: item.set || "",
          number: item.number || "",
          condition: item.condition || "NM",
          quantity: 1,
          unitPrice: marketSuggested || 0, // Market suggested price (inventory value)
          totalPrice: marketSuggested || 0,
          marketValue: marketSuggested || 0, // For value gained calculation
          image: item.image || item.imageUrl || "",
          // Include graded card information for transaction log display
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || "",
          grade: item.grade || ""
        };
        
        // Filter out undefined values
        return Object.fromEntries(
          Object.entries(cardData).filter(([_, value]) => value !== undefined)
        );
      });

      // Prepare itemsOut (cards going out from inventory)
      const itemsOut = selectedInventoryItems.map(item => {
        // Use vendor's calculated price for display
        let vendorPrice;
        if (item.overridePrice != null) {
          // Convert override price if needed
          if (item.overridePriceCurrency && item.overridePriceCurrency !== currency) {
            vendorPrice = convertCurrency(Number(item.overridePrice), currency, item.overridePriceCurrency);
          } else {
            vendorPrice = Number(item.overridePrice);
          }
        } else {
          // Use computeItemMetrics which handles currency correctly for all cases
          const metrics = computeItemMetrics(item, currency);
          vendorPrice = metrics.suggested;
        }
        
        // Use market value for value gained calculation
        // computeItemMetrics handles graded cards and currency correctly
        const metrics = computeItemMetrics(item, currency);
        const marketValue = metrics.suggested;
        
        const cardData = {
          name: item.name || "",
          set: item.set || "",
          number: item.number || "",
          condition: item.condition || "NM",
          quantity: 1,
          unitPrice: vendorPrice || 0, // Display vendor's price
          totalPrice: vendorPrice || 0,
          marketValue: marketValue || 0, // Keep for value gained calculation
          image: item.image || item.imageUrl || "",
          // Include graded card information for transaction log display
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || "",
          grade: item.grade || ""
        };
        
        // Filter out undefined values
        return Object.fromEntries(
          Object.entries(cardData).filter(([_, value]) => value !== undefined)
        );
      });

      // Calculate value difference
      const totalValueIn = itemsIn.reduce((sum, item) => sum + (item.marketValue || 0), 0);
      const totalValueOut = itemsOut.reduce((sum, item) => sum + (item.marketValue || 0), 0);
      
      // Handle cash in trade
      const cashValue = parseFloat(cashAmount) || 0;
      let cashInPrimaryCurrency = 0;
      if (cashValue > 0) {
        // Convert cash from trade currency to primary currency
        cashInPrimaryCurrency = tradeCurrency !== currency 
          ? convertCurrency(cashValue, currency, tradeCurrency)
          : cashValue;
      }
      
      // Adjust value gained based on cash direction
      let valueGained = totalValueIn - totalValueOut;
      if (cashValue > 0) {
        if (cashDirection === "in") {
          // Receiving cash increases value gained
          valueGained += cashInPrimaryCurrency;
        } else {
          // Paying cash decreases value gained
          valueGained -= cashInPrimaryCurrency;
        }
      }

      // Convert totalValue if needed
      let totalValue = selectedTotals.finalValue;
      const inputCurrency = tradeCurrency;
      if (inputCurrency !== currency) {
        console.log(`Converting trade value from ${inputCurrency} to ${currency}: ${totalValue}`);
        totalValue = convertCurrency(totalValue, currency, inputCurrency);
        console.log(`Converted trade value: ${totalValue}`);
      }
      
      const transactionData = {
        type: "trade",
        totalValue: totalValue,
        itemsIn,
        itemsOut,
        valueGained,
        notes: `Trade: ${itemsOut.length} card(s) out, ${itemsIn.length} card(s) in${cashValue > 0 ? `, ${cashDirection === 'in' ? 'received' : 'paid'} ${formatCurrency(cashValue, tradeCurrency)} cash` : ''}`,
        currency
      };
      
      // Add cash information if present
      if (cashValue > 0) {
        transactionData.cashAmount = cashInPrimaryCurrency;
        transactionData.cashDirection = cashDirection;
      }
      
      // Only add inputCurrency if it's different from primary currency
      if (inputCurrency && inputCurrency !== currency) {
        transactionData.inputCurrency = inputCurrency;
      }
      
      await recordTransaction(db, user.uid, transactionData);

      // Add incoming cards to inventory
      const inventoryItems = selectedItems.map(item => {
        const inventoryItem = {
          entryId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          id: item.id || item.baseId || "",
          name: item.name || "",
          set: item.set || "",
          number: item.number || "",
          rarity: item.rarity || "",
          image: item.image || item.imageUrl || "",
          condition: item.condition || "NM",
          quantity: 1,
          prices: item.prices || {},
          addedAt: Date.now()
        };
        
        // Preserve manual entry information
        if (item.isManualEntry) {
          inventoryItem.isManualEntry = true;
          inventoryItem.manualPrice = item.manualPrice;
          inventoryItem.manualPriceCurrency = item.manualPriceCurrency;
          inventoryItem.notes = item.notes || "";
        }
        
        // Preserve graded card information
        if (item.isGraded) {
          inventoryItem.isGraded = true;
          inventoryItem.gradingCompany = item.gradingCompany || "";
          inventoryItem.grade = item.grade || "";
          inventoryItem.gradedPrice = item.gradedPrice || 0; // Stored in USD
          inventoryItem.gradedPriceCurrency = item.gradedPriceCurrency || "USD";
        }
        
        // Filter out undefined values
        return Object.fromEntries(
          Object.entries(inventoryItem).filter(([_, value]) => value !== undefined)
        );
      });

      // Remove outgoing cards from inventory
      const updatedInventory = [
        ...collectionItems.filter(it => !selectedInventoryIds.has(it.entryId)),
        ...inventoryItems
      ];
      
      const inventoryRef = doc(db, "collections", user.uid);
      await setDoc(inventoryRef, { items: updatedInventory }, { merge: true });
      setCollectionItems(updatedInventory);

      // Remove confirmed items from trade list
      setTradeItems(prev => prev.filter(it => !pendingTradeConfirmation.selectedIds.has(it.id)));
      setSelectedIds(new Set());

      // If this was loaded from a pending deal, delete it
      if (loadedFromPendingDealId) {
        const updated = pendingDeals.filter(d => d.id !== loadedFromPendingDealId);
        setPendingDeals(updated);
        savePendingDealsToFirestore(updated);
        setLoadedFromPendingDealId(null);
      }

      // Reset modal states
      setShowInventoryModal(false);
      setPendingTradeConfirmation(null);
      setSelectedInventoryIds(new Set());
      setCashAmount("");
      setCashDirection("in");

      triggerQuickAddFeedback(`Trade completed! ${itemsIn.length} card(s) added, ${itemsOut.length} removed.`);
    } catch (error) {
      console.error("Failed to complete trade:", error);
      alert("Failed to complete trade. Please try again.");
    }
  };

  const handleSaveAsPending = () => {
    if (selectedIds.size === 0) {
      alert("Please select cards to save as pending.");
      return;
    }

    if (pendingDeals.length >= 5) {
      alert("Maximum 5 pending deals allowed. Please complete or delete existing deals first.");
      return;
    }

    const description = prompt("Enter a description for this deal (max 20 characters):");
    if (!description) {
      return; // User cancelled or entered empty string
    }

    const trimmedDescription = description.trim().slice(0, 20);

    const selectedItems = tradeItems.filter(it => selectedIds.has(it.id));
    const newDeal = {
      id: Date.now(),
      date: new Date().toISOString(),
      description: trimmedDescription,
      items: selectedItems,
      totalValue: selectedTotals.finalValue
    };

    const updated = [...pendingDeals, newDeal];
    setPendingDeals(updated);
    savePendingDealsToFirestore(updated);

    // Remove saved items from current list
    setTradeItems(prev => prev.filter(it => !selectedIds.has(it.id)));
    setSelectedIds(new Set());

    triggerQuickAddFeedback(`Pending deal saved! (${selectedItems.length} cards)`);
  };

  const handleLoadPending = (deal) => {
    setTradeItems(prev => [...prev, ...deal.items]);
    setLoadedFromPendingDealId(deal.id);
    setShowPendingModal(false);
    triggerQuickAddFeedback(`Loaded ${deal.items.length} cards from pending deal`);
  };

  const handleDeletePending = (dealId) => {
    const updated = pendingDeals.filter(d => d.id !== dealId);
    setPendingDeals(updated);
    savePendingDealsToFirestore(updated);
    triggerQuickAddFeedback("Pending deal deleted");
  };

  // Handle manual card entry
  const handleManualCardAdd = useCallback((manualCard) => {
    // Add the manual card to the trade calculator
    const tradeItem = {
      id: `${manualCard.id}-trade-${Date.now()}`,
      baseId: manualCard.id,
      name: manualCard.name,
      set: manualCard.set,
      number: manualCard.number,
      rarity: manualCard.rarity,
      image: manualCard.image,
      condition: 'NM',
      tradePct: tradeDefaultPct,
      addedAt: Date.now(),
      isManualEntry: true,
      // Manual price handling
      manualPrice: manualCard.manualPrice,
      manualPriceCurrency: manualCard.manualPriceCurrency,
      // Graded card fields
      isGraded: manualCard.isGraded,
      gradingCompany: manualCard.gradingCompany,
      grade: manualCard.grade,
      gradedPrice: manualCard.gradedPrice,
      gradedPriceCurrency: manualCard.gradedPriceCurrency,
      notes: manualCard.notes,
    };
    
    setTradeItems(prev => [...prev, tradeItem]);
    setShowManualEntry(false);
    triggerQuickAddFeedback(`"${manualCard.name}" added to trade calculator`);
  }, [tradeDefaultPct, setTradeItems, triggerQuickAddFeedback]);

  // Generate text summary for sharing
  const generateTextSummary = useCallback(() => {
    const selectedItems = tradeItems.filter(it => selectedIds.has(it.id));
    if (selectedItems.length === 0) return "";
    
    const vendorName = userProfile?.username || userProfile?.displayName || "Vendor";
    let summary = `🔄 Trade Offer from ${vendorName}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📦 Cards in this offer (${selectedItems.length}):\n\n`;
    
    const fmtDualText = (amount) => {
      const primary = formatCurrency(amount, currency);
      if (!secondaryCurrency || secondaryCurrency === currency) return primary;
      const converted = convertCurrency(amount, secondaryCurrency, currency);
      return `${primary} (${formatCurrency(converted, secondaryCurrency)})`;
    };
    
    selectedItems.forEach((item, index) => {
      const values = calculateItemValue(item);
      const conditionLabel = getConditionDisplayLabel(item.condition || "NM");
      
      if (item.isGraded) {
        summary += `${index + 1}. ${item.name}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   [${item.gradingCompany} ${item.grade}]\n`;
        summary += `   💰 Trade Value: ${fmtDualText(values.finalValue)}\n\n`;
      } else {
        summary += `${index + 1}. ${item.name}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   📋 Condition: ${conditionLabel}\n`;
        summary += `   💰 Trade Value: ${fmtDualText(values.finalValue)}\n\n`;
      }
    });
    
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `💵 Total Offer Value: ${fmtDualText(selectedTotals.finalValue)}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `Interested? Contact ${vendorName} to discuss!`;
    
    return summary;
  }, [tradeItems, selectedIds, selectedTotals, userProfile, currency, secondaryCurrency]);

  // Copy text summary to clipboard
  const handleCopyTextSummary = async () => {
    const summary = generateTextSummary();
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("Failed to copy to clipboard");
    }
  };

  // Generate shareable link by saving to Firestore
  const handleGenerateShareLink = async () => {
    if (!user || !db) {
      alert("Please sign in to generate a share link.");
      return;
    }
    
    setShareLoading(true);
    try {
      const selectedItems = tradeItems.filter(it => selectedIds.has(it.id));
      
      // Prepare items for storage (remove unnecessary data)
      const shareItems = selectedItems.map(item => {
        const values = calculateItemValue(item);
        return {
          name: item.name,
          set: item.set,
          number: item.number,
          rarity: item.rarity,
          condition: item.condition,
          image: item.image || item.imageUrl || null,
          tradeValue: values.finalValue,
          tradePct: item.tradePct ?? tradeDefaultPct,
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || null,
          grade: item.grade || null,
        };
      });
      
      // Save to Firestore
      const tradeOffer = {
        vendorId: user.uid,
        vendorName: userProfile?.username || userProfile?.displayName || "Vendor",
        vendorAvatar: userProfile?.photoURL || null,
        items: shareItems,
        totalValue: selectedTotals.finalValue,
        currency: currency,
        secondaryCurrency: secondaryCurrency || null,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours expiry
      };
      
      const docRef = await addDoc(collection(db, "tradeOffers"), tradeOffer);
      const link = `${window.location.origin}/trade-offer?id=${docRef.id}`;
      setShareLink(link);
      
    } catch (err) {
      console.error("Failed to generate share link:", err);
      alert("Failed to generate share link. Please try again.");
    } finally {
      setShareLoading(false);
    }
  };

  // Copy share link to clipboard
  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      alert("Failed to copy to clipboard");
    }
  };

  // Open share modal
  const handleOpenShareModal = () => {
    if (selectedIds.size === 0) {
      alert("Please select cards to share.");
      return;
    }
    setShareLink(""); // Reset link
    setCopiedText(false);
    setCopiedLink(false);
    setShowShareModal(true);
  };

  // --- Split offer helpers ---
  const handleOpenSplitModal = () => {
    setSplitShareLinks({});
    setSplitCopied({});
    setSplitShareLoading({});
    setShowSplitModal(true);
  };

  const generateTextSummaryForItems = useCallback((items) => {
    if (items.length === 0) return "";
    const vendorName = userProfile?.username || userProfile?.displayName || "Vendor";
    let summary = `🔄 Trade Offer from ${vendorName}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📦 Cards in this offer (${items.length}):\n\n`;
    const fmtDualText = (amount) => {
      const primary = formatCurrency(amount, currency);
      if (!secondaryCurrency || secondaryCurrency === currency) return primary;
      const converted = convertCurrency(amount, secondaryCurrency, currency);
      return `${primary} (${formatCurrency(converted, secondaryCurrency)})`;
    };
    let totalValue = 0;
    items.forEach((item, index) => {
      const values = calculateItemValue(item);
      const conditionLabel = getConditionDisplayLabel(item.condition || "NM");
      const itemVal = values.finalValue ?? 0;
      totalValue += itemVal;
      if (item.isGraded) {
        summary += `${index + 1}. ${item.name}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   [${item.gradingCompany} ${item.grade}]\n`;
        summary += `   💰 Trade Value: ${fmtDualText(itemVal)}\n\n`;
      } else {
        summary += `${index + 1}. ${item.name}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   📋 Condition: ${conditionLabel}\n`;
        summary += `   💰 Trade Value: ${fmtDualText(itemVal)}\n\n`;
      }
    });
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `💵 Total Offer Value: ${fmtDualText(totalValue)}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `Interested? Contact ${vendorName} to discuss!`;
    return summary;
  }, [userProfile, currency, secondaryCurrency, tradeDefaultPct]);

  const handleCopySplitText = async (pct, items) => {
    const text = generateTextSummaryForItems(items);
    try {
      await navigator.clipboard.writeText(text);
      setSplitCopied(prev => ({ ...prev, [pct]: 'text' }));
      setTimeout(() => setSplitCopied(prev => ({ ...prev, [pct]: null })), 2000);
    } catch (err) {
      alert("Failed to copy to clipboard");
    }
  };

  const handleGenerateSplitShareLink = async (pct, items, totalValue) => {
    if (!user || !db) return;
    setSplitShareLoading(prev => ({ ...prev, [pct]: true }));
    try {
      const shareItems = items.map(item => {
        const values = calculateItemValue(item);
        return {
          name: item.name, set: item.set, number: item.number, rarity: item.rarity,
          condition: item.condition, image: item.image || item.imageUrl || null,
          tradeValue: values.finalValue ?? 0,
          tradePct: item.tradePct ?? tradeDefaultPct,
          isGraded: item.isGraded || false, gradingCompany: item.gradingCompany || null, grade: item.grade || null,
        };
      });
      const tradeOffer = {
        vendorId: user.uid,
        vendorName: userProfile?.username || userProfile?.displayName || "Vendor",
        vendorAvatar: userProfile?.photoURL || null,
        items: shareItems, totalValue, currency,
        secondaryCurrency: secondaryCurrency || null,
        createdAt: Date.now(), expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };
      const docRef = await addDoc(collection(db, "tradeOffers"), tradeOffer);
      const link = `${window.location.origin}/trade-offer?id=${docRef.id}`;
      setSplitShareLinks(prev => ({ ...prev, [pct]: link }));
    } catch (err) {
      alert("Failed to generate share link.");
    } finally {
      setSplitShareLoading(prev => ({ ...prev, [pct]: false }));
    }
  };

  const handleCopySplitLink = async (pct) => {
    try {
      await navigator.clipboard.writeText(splitShareLinks[pct]);
      setSplitCopied(prev => ({ ...prev, [pct]: 'link' }));
      setTimeout(() => setSplitCopied(prev => ({ ...prev, [pct]: null })), 2000);
    } catch (err) {
      alert("Failed to copy to clipboard");
    }
  };

  const handleSaveSplitTierAsPending = (tierItems, pct, totalValue) => {
    if (pendingDeals.length >= 5) {
      alert("Maximum 5 pending deals allowed. Delete existing deals first.");
      return;
    }
    const desc = `${pct}% tier (${tierItems.length} cards)`;
    const newDeal = {
      id: Date.now() + pct,
      date: new Date().toISOString(),
      description: desc.slice(0, 20),
      items: tierItems,
      totalValue,
    };
    const updated = [...pendingDeals, newDeal];
    setPendingDeals(updated);
    savePendingDealsToFirestore(updated);
    triggerQuickAddFeedback(`Saved ${pct}% tier (${tierItems.length} cards) to pending`);
  };

  const toggleInventorySelection = (entryId) => {
    setSelectedInventoryIds(prev => {
      const updated = new Set(prev);
      if (updated.has(entryId)) {
        updated.delete(entryId);
      } else {
        updated.add(entryId);
      }
      return updated;
    });
  };

  const handleSelectAllInventory = () => {
    // Select all FILTERED items (or deselect if all filtered items are selected)
    const filteredIds = new Set(filteredInventoryItems.map(it => it.entryId));
    const allFilteredSelected = filteredInventoryItems.every(it => selectedInventoryIds.has(it.entryId));
    
    if (allFilteredSelected) {
      // Deselect all filtered items
      setSelectedInventoryIds(prev => {
        const newSet = new Set(prev);
        filteredIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all filtered items
      setSelectedInventoryIds(prev => new Set([...prev, ...filteredIds]));
    }
  };

  const handleCancelInventorySelection = () => {
    setShowInventoryModal(false);
    setPendingTradeConfirmation(null);
    setSelectedInventoryIds(new Set());
    setInventorySearchQuery(""); // Reset search
  };

  // Filter inventory items based on search query
  const filteredInventoryItems = useMemo(() => {
    if (!inventorySearchQuery.trim()) return collectionItems;
    
    const query = inventorySearchQuery.toLowerCase();
    return collectionItems.filter(item => {
      const name = (item.name || "").toLowerCase();
      const set = (item.set || "").toLowerCase();
      const number = (item.number || "").toString().toLowerCase();
      const condition = (item.condition || "").toLowerCase();
      const grade = item.isGraded ? `${item.gradingCompany} ${item.grade}`.toLowerCase() : "";
      
      return name.includes(query) || 
             set.includes(query) || 
             number.includes(query) || 
             condition.includes(query) ||
             grade.includes(query);
    });
  }, [collectionItems, inventorySearchQuery]);

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please sign in to use the Trade Calculator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calculator className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold">Trade Calculator</h1>
            <p className="text-muted-foreground">Vendor Toolkit</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowManualEntry(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Manual Add
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowPendingModal(true)}
            disabled={pendingDeals.length === 0}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Pending Deals ({pendingDeals.length})
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl p-4 shadow mb-4">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="text-sm font-semibold">Default Trade %</label>
              <PercentSelect
                value={tradeDefaultPct}
                onChange={handleTradeDefaultChange}
              />
              <div className="flex items-center gap-2">
                <label className="text-sm">Sort by</label>
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={tradeSortBy}
                  onChange={(e) => setTradeSortBy(e.target.value)}
                >
                  <option value="addedAt">Date Added</option>
                  <option value="price_suggested">Suggested Price</option>
                  <option value="price_tcg">Price (TCG)</option>
                  <option value="price_cm">Price (Market Avg)</option>
                  <option value="price_diff">Price Difference</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setTradeSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
                  }
                >
                  {tradeSortDir === "desc" ? "↓" : "↑"}
                </Button>
              </div>
            </div>
            {/* Threshold percentage bulk action */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="text-sm text-muted-foreground">For cards under</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={thresholdPrice}
                onChange={(e) => setThresholdPrice(e.target.value)}
                placeholder="price"
                className="h-7 w-20 text-xs"
              />
              <span className="text-sm text-muted-foreground">{currency}, use</span>
              <PercentSelect
                value={thresholdPct}
                onChange={setThresholdPct}
                className="text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleApplyThreshold}
                disabled={tradeItems.length === 0}
                className="h-7 text-xs"
              >
                Apply
              </Button>
            </div>
            <div className="text-sm">
              <div className="font-semibold mb-1">Total Trade Value:</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>TCG: {formatPrice(tradeTotals.tcgMarket)}</span>
                <span>CM Avg: {formatPrice(tradeTotals.cmAvg)}</span>
                <span>CM Low: {formatPrice(tradeTotals.cmLowest)}</span>
                <span className="font-semibold text-green-600">Final: {formatDual(tradeTotals.finalValue)}</span>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className="text-sm border-t pt-2">
                <div className="font-semibold mb-1">Selected ({selectedIds.size}) Value:</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>TCG: {formatPrice(selectedTotals.tcgMarket)}</span>
                  <span>CM Avg: {formatPrice(selectedTotals.cmAvg)}</span>
                  <span>CM Low: {formatPrice(selectedTotals.cmLowest)}</span>
                  <span className="font-semibold text-green-600">Final: {formatDual(selectedTotals.finalValue)}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {tradeItems.length > 0 && (
        <Card className="rounded-2xl p-4 shadow mb-4">
          <CardContent className="p-0">
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
              >
                {selectedIds.size === tradeItems.length ? (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Deselect All
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Select All
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleConfirmTrade}
                disabled={selectedIds.size === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                Confirm Trade ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveAsPending}
                disabled={selectedIds.size === 0 || pendingDeals.length >= 5}
              >
                <Save className="h-4 w-4 mr-2" />
                Save as Pending ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenShareModal}
                disabled={selectedIds.size === 0}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Offer ({selectedIds.size})
              </Button>
              {hasMultipleTiers && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenSplitModal}
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  <Scissors className="h-4 w-4 mr-2" />
                  Split Offer
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={clearTradeBinder}
              >
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {tradeItems.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No trade items yet. Add cards from Card Search (Vendor Toolkit → Search).
            </CardContent>
          </Card>
        )}
        {groupedTradeItems.map((group) => (
          <div key={group.pct}>
            {hasMultipleTiers && (
              <div className="flex items-center gap-2 mb-2 mt-3 px-1">
                <div className="h-px flex-1 bg-green-200" />
                <span className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full">
                  {group.pct}% tier — {group.items.length} card{group.items.length !== 1 ? 's' : ''} — Total: {formatDual(group.total)}
                </span>
                <div className="h-px flex-1 bg-green-200" />
              </div>
            )}
            {group.items.map((it) => {
              const values = calculateItemValue(it);
              const isSelected = selectedIds.has(it.id);
              
              return (
                <Card key={it.id} className={`rounded-2xl p-3 mb-3 ${isSelected ? 'ring-2 ring-green-600' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 cursor-pointer mt-1"
                      onClick={() => toggleSelection(it.id)}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-green-600" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    {it.image && (
                      <img
                        src={it.image}
                        alt={it.name}
                        className="h-20 w-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {it.set} • {it.rarity} • #{it.number}
                      </div>
                      {it.isGraded ? (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div className="col-span-2">
                            <GradingBadge company={it.gradingCompany} grade={it.grade} />
                          </div>
                          <div className="font-semibold col-span-2">
                            Graded Value ({it.tradePct ?? tradeDefaultPct}%): {formatDual(values.isGraded ? values.graded : values.suggested)}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div>TCG ({it.tradePct ?? tradeDefaultPct}%): {formatPrice(values.tcg)}</div>
                          <div>CM Avg ({it.tradePct ?? tradeDefaultPct}%): {formatPrice(values.cmAvg)}</div>
                          <div>CM Low ({it.tradePct ?? tradeDefaultPct}%): {formatPrice(values.cmLowest)}</div>
                          <div className="font-semibold">Suggested: {formatDual(values.suggested)}</div>
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs font-semibold">Final Value:</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={it.overrideValue ?? (values.isGraded ? values.graded.toFixed(2) : values.suggested.toFixed(2))}
                          onChange={(e) => updateOverrideValue(it.id, e.target.value)}
                          className="h-7 w-24 text-xs"
                        />
                        {it.overrideValue && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateOverrideValue(it.id, "")}
                            className="h-7 text-xs"
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {!it.isGraded && (
                        <ConditionSelect
                          value={it.condition}
                          onChange={(v) => updateTradeCondition(it.id, v)}
                        />
                      )}
                      <PercentSelect
                        value={it.tradePct ?? tradeDefaultPct}
                        onChange={(val) => updateTradePct(it.id, val)}
                        className="text-xs"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeFromTrade(it.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      {/* Manual Card Entry Modal */}
      {showManualEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-auto">
            <CardContent className="p-6">
              <ManualCardEntry
                onAddCard={handleManualCardAdd}
                onCancel={() => setShowManualEntry(false)}
                mode="vendor"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Deals Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-auto">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Pending Trade Deals</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPendingModal(false)}
                >
                  ×
                </Button>
              </div>
              
              {pendingDeals.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No pending deals</p>
              ) : (
                <div className="space-y-3">
                  {pendingDeals.map(deal => (
                    <Card key={deal.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-semibold">{deal.description || `${deal.items.length} cards`}</div>
                          <div className="text-sm text-muted-foreground">
                            {deal.items.length} card{deal.items.length !== 1 ? 's' : ''} • {new Date(deal.date).toLocaleString()}
                          </div>
                          <div className="text-sm font-semibold text-green-600">
                            Value: {formatPrice(deal.totalValue)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleLoadPending(deal)}
                          >
                            Load
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeletePending(deal.id)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Inventory Selection Modal */}
      {showInventoryModal && pendingTradeConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-4xl w-full max-h-[80vh] overflow-auto">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">Select Cards to Trade Out</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose cards from your inventory to give away in this trade
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelInventorySelection}
                >
                  ×
                </Button>
              </div>

              {/* Search Input */}
              <div className="mb-4">
                <Input
                  type="text"
                  placeholder="Search inventory (card name, set, number, condition, grade...)"
                  value={inventorySearchQuery}
                  onChange={(e) => setInventorySearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="mb-4 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAllInventory}
                >
                  {selectedInventoryIds.size === filteredInventoryItems.length ? "Deselect All" : "Select All"}
                </Button>
                <div className="text-sm text-muted-foreground">
                  {selectedInventoryIds.size} card{selectedInventoryIds.size !== 1 ? 's' : ''} selected
                  {inventorySearchQuery && ` • ${filteredInventoryItems.length} match${filteredInventoryItems.length !== 1 ? 'es' : ''}`}
                </div>
              </div>

              {collectionItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No cards in inventory</p>
              ) : filteredInventoryItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No cards match your search</p>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {filteredInventoryItems.map(item => {
                    const isSelected = selectedInventoryIds.has(item.entryId);
                    
                    // Calculate vendor price (same logic as MyInventory)
                    const metrics = computeItemMetrics(item);
                    const vendorPrice = item.overridePrice ?? item.calculatedSuggestedPrice ?? metrics.suggested;

                    return (
                      <div
                        key={item.entryId}
                        onClick={() => toggleInventorySelection(item.entryId)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'border-border hover:bg-muted'
                        }`}
                      >
                        <div className="flex-shrink-0">
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-16 w-12 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.name}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {item.set} • #{item.number} • {item.condition}
                          </div>
                          <div className="text-sm font-semibold text-green-600 mt-1">
                            Vendor Price: {formatPrice(vendorPrice)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Currency Selector - only show if secondary currency is enabled */}
              {secondaryCurrency && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold mb-2">
                    Enter trade value in:
                  </label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="tradeCurrency"
                        checked={tradeCurrency === currency}
                        onChange={() => setTradeCurrency(currency)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{currency} (Primary)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="tradeCurrency"
                        checked={tradeCurrency === secondaryCurrency}
                        onChange={() => setTradeCurrency(secondaryCurrency)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{secondaryCurrency} (Secondary)</span>
                    </label>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    💡 Trade value will be converted to {currency} for storage
                  </p>
                </div>
              )}

              {/* Cash Component */}
              <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <label className="block text-sm font-semibold mb-2">
                  💵 Include Cash in Trade (Optional)
                </label>
                <div className="flex gap-3 items-center mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cashDirection"
                      checked={cashDirection === "in"}
                      onChange={() => setCashDirection("in")}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Receiving Cash</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cashDirection"
                      checked={cashDirection === "out"}
                      onChange={() => setCashDirection("out")}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">Paying Cash</span>
                  </label>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Cash amount (${tradeCurrency})`}
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-purple-600 mt-2">
                  💡 Cash will be converted to {currency} and counted in cash sales
                </p>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancelInventorySelection}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCompleteTradeWithInventory}
                  disabled={selectedInventoryIds.size === 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Complete Trade
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Condition Pricing Note */}
      {tradeItems.some(it => it.condition !== "NM") && (
        <Card className="mt-4 border-yellow-200 bg-yellow-50">
          <CardContent className="p-3">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Prices for non-NM condition cards are estimated based on TCGPlayer condition pricing ratios, as CardMarket API only provides actual data for Near Mint (NM) cards.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Split Offer Modal */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSplitModal(false)} />
          <Card className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Scissors className="h-6 w-6 text-purple-600" />
                  <h2 className="text-xl font-bold">Split Offer by Tier</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSplitModal(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {groupedTradeItems.map(({ pct, items, total }) => (
                  <Card key={pct} className="p-4 border-2 border-purple-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-lg font-bold text-purple-700">{pct}% Tier</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {items.length} card{items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-green-600">
                        {formatDual(total)}
                      </div>
                    </div>

                    {/* Card preview */}
                    <div className="space-y-1 max-h-32 overflow-y-auto mb-3 border rounded-lg p-2 bg-gray-50">
                      {items.map(item => {
                        const values = calculateItemValue(item);
                        return (
                          <div key={item.id} className="flex items-center gap-2 text-xs">
                            {item.image && (
                              <img src={item.image} alt={item.name} className="h-8 w-6 rounded object-cover" />
                            )}
                            <span className="flex-1 truncate">{item.name}</span>
                            <span className="font-semibold">{formatPrice(values.finalValue ?? 0)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopySplitText(pct, items)}
                      >
                        {splitCopied[pct] === 'text' ? (
                          <><Check className="h-3 w-3 mr-1 text-green-600" /> Copied!</>
                        ) : (
                          <><Copy className="h-3 w-3 mr-1" /> Copy Text</>
                        )}
                      </Button>

                      {!splitShareLinks[pct] ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateSplitShareLink(pct, items, total)}
                          disabled={splitShareLoading[pct]}
                          className="border-blue-300 text-blue-700"
                        >
                          {splitShareLoading[pct] ? (
                            <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1" /> Generating...</>
                          ) : (
                            <><Link className="h-3 w-3 mr-1" /> Share Link</>
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopySplitLink(pct)}
                          className="border-green-300 text-green-700"
                        >
                          {splitCopied[pct] === 'link' ? (
                            <><Check className="h-3 w-3 mr-1 text-green-600" /> Copied!</>
                          ) : (
                            <><Link className="h-3 w-3 mr-1" /> Copy Link</>
                          )}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveSplitTierAsPending(items, pct, total)}
                        disabled={pendingDeals.length >= 5}
                        className="border-orange-300 text-orange-700"
                      >
                        <Save className="h-3 w-3 mr-1" /> Save to Pending
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <Button variant="outline" onClick={() => setShowSplitModal(false)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Share Trade Offer Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowShareModal(false)}
          />
          <Card className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Share2 className="h-6 w-6 text-blue-600" />
                  <h2 className="text-xl font-bold">Share Trade Offer</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowShareModal(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Preview of cards being shared */}
              <div className="mb-6">
                <h3 className="font-semibold mb-3">Cards in this offer ({selectedIds.size})</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                  {tradeItems.filter(it => selectedIds.has(it.id)).map(item => {
                    const values = calculateItemValue(item);
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-9 rounded object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{item.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {item.set} #{item.number}
                            {item.isGraded && ` • ${item.gradingCompany} ${item.grade}`}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-green-600">
                          {formatDual(values.finalValue)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-lg font-bold text-green-700">
                    Total Offer: {formatDual(selectedTotals.finalValue)}
                  </div>
                </div>
              </div>

              {/* Share Options */}
              <div className="space-y-4">
                {/* Copy Text Summary */}
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    Copy Text Summary
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Copy a formatted text summary to paste in messages, social media, or anywhere else.
                  </p>
                  <Button
                    onClick={handleCopyTextSummary}
                    variant="outline"
                    className="w-full"
                  >
                    {copiedText ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy to Clipboard
                      </>
                    )}
                  </Button>
                </div>

                {/* Generate Share Link */}
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    Generate Share Link
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Create a link that shows your trade offer with card images. Link expires in 24 hours.
                  </p>
                  
                  {!shareLink ? (
                    <Button
                      onClick={handleGenerateShareLink}
                      disabled={shareLoading}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {shareLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Link className="h-4 w-4 mr-2" />
                          Generate Link
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={shareLink}
                          readOnly
                          className="bg-gray-50 text-sm"
                        />
                        <Button
                          onClick={handleCopyShareLink}
                          variant="outline"
                          className="flex-shrink-0"
                        >
                          {copiedLink ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {copiedLink && (
                        <p className="text-sm text-green-600">Link copied to clipboard!</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowShareModal(false)}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
