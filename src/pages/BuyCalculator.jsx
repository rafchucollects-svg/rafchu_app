import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Calculator, Trash, CheckSquare, Square, Save, FolderOpen, Share2, Copy, Link, Check, X, Plus, Scissors, Camera } from "lucide-react";
import { ManualCardEntry } from "@/components/ManualCardEntry";
import { CardPhotoScanner } from "@/components/CardPhotoScanner";
import { TransactionDetailsFields } from "@/components/TransactionDetailsFields";
import { createEmptyTransactionDetails } from "@/utils/transactionHelpers";
import { useApp } from "@/contexts/AppContext";
import { ConditionSelect } from "@/components/CardComponents";
import { GradingBadge } from "@/components/GradingCompanyLogo";
import { computeTcgPrice, getCardmarketAvg, getCardmarketLowest, formatCurrency, cloneForFirestore, prepareTransactionRecord, computeItemMetrics, convertCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";
import { mergePendingDeals, readPendingDealsFromStorage } from "@/utils/pendingDealHelpers";
import { collection, addDoc, doc, setDoc, onSnapshot, writeBatch } from "firebase/firestore";
import { toast } from "@/components/ui/Toaster";

/**
 * Deal Calculator Page (Vendor Toolkit)
 * Plan deals that can finish as purchases, trades, or trades with cash.
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

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function BuyCalculator() {
  const { user, db, buyItems, setBuyItems, tradeItems, setTradeItems, currency, secondaryCurrency, collectionItems, setCollectionItems, triggerQuickAddFeedback, userProfile } = useApp();
  const [buyDefaultPct, setBuyDefaultPct] = useState(userProfile?.defaultBuyPct || 70);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pendingDeals, setPendingDeals] = useState([]);
  const [savingPending, setSavingPending] = useState(false);
  const [isCompletingDeal, setIsCompletingDeal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [buyCurrency, setBuyCurrency] = useState(currency); // Currency for purchase input
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState(new Set());
  const [pendingTradeConfirmation, setPendingTradeConfirmation] = useState(null);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashCurrency, setCashCurrency] = useState(secondaryCurrency || currency);
  const [cashDirection, setCashDirection] = useState("in"); // "in" = receiving cash, "out" = paying cash
  const [transactionDetails, setTransactionDetails] = useState(() => createEmptyTransactionDetails());
  const [loadedFromPendingDealId, setLoadedFromPendingDealId] = useState(null);
  
  // Share buy offer state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Manual card entry state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showCardScanner, setShowCardScanner] = useState(false);

  // Sorting state
  const [buySortBy, setBuySortBy] = useState("addedAt");
  const [buySortDir, setBuySortDir] = useState("desc");

  // Threshold percentage state
  const [thresholdPrice, setThresholdPrice] = useState("");
  const [thresholdPct, setThresholdPct] = useState(60);

  // Split offer state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitShareLinks, setSplitShareLinks] = useState({});
  const [splitCopied, setSplitCopied] = useState({});
  const [splitShareLoading, setSplitShareLoading] = useState({});
  const importedLegacyTradeItems = useRef(false);
  const pendingMigrationUid = useRef(null);
  const purchaseOperationId = useRef(null);

  // Load default percentage from user profile
  useEffect(() => {
    if (userProfile?.defaultBuyPct != null) {
      setBuyDefaultPct(userProfile.defaultBuyPct);
    }
  }, [userProfile?.defaultBuyPct]);

  useEffect(() => {
    const validCashCurrencies = new Set([currency, secondaryCurrency].filter(Boolean));
    if (!validCashCurrencies.has(cashCurrency)) {
      setCashCurrency(secondaryCurrency || currency);
    }
  }, [currency, secondaryCurrency, cashCurrency]);

  useEffect(() => {
    if (importedLegacyTradeItems.current || tradeItems.length === 0) return;
    importedLegacyTradeItems.current = true;

    const now = Date.now();
    const migratedItems = tradeItems.map((item, index) => ({
      ...item,
      entryId: item.entryId || `${item.baseId || item.id || "deal"}-deal-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      baseId: item.baseId || item.id,
      quantity: item.quantity || 1,
      buyPct: item.buyPct ?? item.tradePct ?? buyDefaultPct,
      addedAt: item.addedAt || now,
    }));

    setBuyItems(prev => [...prev, ...migratedItems]);
    setTradeItems([]);
    triggerQuickAddFeedback(`Moved ${migratedItems.length} trade item${migratedItems.length !== 1 ? 's' : ''} into Deal Calculator`);
  }, [tradeItems, setBuyItems, setTradeItems, buyDefaultPct, triggerQuickAddFeedback]);

  // Helper function to save pending deals to Firestore
  const savePendingDealsToFirestore = useCallback(async (deals) => {
    if (!user?.uid || !db) return { synced: false, savedLocally: false };
    const safeDeals = cloneForFirestore(Array.isArray(deals) ? deals : []);
    try {
      const docRef = doc(db, "pendingDeals", user.uid);
      await setDoc(docRef, {
        buyDeals: safeDeals,
        pendingDealsUpdatedAt: Date.now(),
      }, { merge: true });
      try {
        localStorage.removeItem(`buy_pending_${user.uid}`);
      } catch {
        // Firestore is authoritative; a blocked storage cleanup is harmless.
      }
      return { synced: true, savedLocally: false };
    } catch (error) {
      console.error("Failed to save pending deals to Firestore:", error);
      try {
        localStorage.setItem(`buy_pending_${user.uid}`, JSON.stringify(safeDeals));
        return { synced: false, savedLocally: true, error };
      } catch (storageError) {
        console.error("Failed to save pending deals locally:", storageError);
        return { synced: false, savedLocally: false, error };
      }
    }
  }, [user, db]);

  // Load pending deals from Firestore (real-time sync across devices)
  useEffect(() => {
    if (!user?.uid || !db) return;

    const docRef = doc(db, "pendingDeals", user.uid);
    
    // Use onSnapshot for real-time sync across devices
    pendingMigrationUid.current = null;
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      const localDeals = readPendingDealsFromStorage(localStorage, user.uid);
      const mergedDeals = mergePendingDeals([
        data.buyDeals,
        data.tradeDeals,
        localDeals.buyDeals,
        localDeals.tradeDeals,
      ], buyDefaultPct);
      setPendingDeals(mergedDeals);

      const hasLegacyOrLocalDeals = Boolean(
        data.tradeDeals?.length || localDeals.buyDeals.length || localDeals.tradeDeals.length
      );
      const remoteBuyDeals = mergePendingDeals([data.buyDeals], buyDefaultPct);
      const remoteNeedsNormalization = JSON.stringify(remoteBuyDeals) !== JSON.stringify(mergedDeals);

      if (pendingMigrationUid.current !== user.uid && (hasLegacyOrLocalDeals || remoteNeedsNormalization)) {
        pendingMigrationUid.current = user.uid;
        setDoc(docRef, {
          buyDeals: cloneForFirestore(mergedDeals),
          tradeDeals: [],
          pendingDealsMigratedAt: Date.now(),
        }, { merge: true }).then(() => {
          try {
            localStorage.removeItem(`buy_pending_${user.uid}`);
            localStorage.removeItem(`trade_pending_${user.uid}`);
          } catch {
            // The remote copy is saved even if browser storage is unavailable.
          }
          if (hasLegacyOrLocalDeals) {
            triggerQuickAddFeedback(`Recovered ${mergedDeals.length} pending deal${mergedDeals.length === 1 ? "" : "s"}`);
          }
        }).catch((error) => {
          console.error("Failed to migrate pending deals:", error);
          pendingMigrationUid.current = null;
        });
      }
    }, (error) => {
      console.error("Failed to load pending deals:", error);
      try {
        const localDeals = readPendingDealsFromStorage(localStorage, user.uid);
        setPendingDeals(mergePendingDeals([
          localDeals.buyDeals,
          localDeals.tradeDeals,
        ], buyDefaultPct));
      } catch (e) {
        console.error("localStorage fallback also failed:", e);
      }
    });

    return () => unsubscribe();
  }, [user, db, buyDefaultPct, triggerQuickAddFeedback]);

  const removeFromBuy = (entryId) => {
    setBuyItems((prev) => prev.filter((item) => item.entryId !== entryId));
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(entryId);
      return newSet;
    });
  };

  const updateBuyCondition = (entryId, condition) =>
    setBuyItems((prev) =>
      prev.map((item) => (item.entryId === entryId ? { ...item, condition } : item)),
    );

  const updateBuyQuantity = (entryId, quantity) => {
    const qty = Math.max(1, Number(quantity) || 1);
    setBuyItems((prev) =>
      prev.map((item) => (item.entryId === entryId ? { ...item, quantity: qty } : item)),
    );
  };

  const updateBuyPct = (entryId, pct) => {
    const next = Math.max(40, Math.min(120, pct));
    setBuyItems((prev) =>
      prev.map((item) => (item.entryId === entryId ? { ...item, buyPct: next } : item)),
    );
  };

  const updateOverrideValue = (entryId, value) =>
    setBuyItems((prev) =>
      prev.map((i) => (i.entryId === entryId ? { ...i, overrideValue: value === "" ? null : parseFloat(value) } : i)),
    );

  const clearBuyList = () => {
    setBuyItems([]);
    setSelectedIds(new Set());
  };

  const toggleSelection = (entryId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === buyItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(buyItems.map(it => it.entryId)));
    }
  };

  const handleBuyDefaultChange = (pct) => {
    const next = Math.max(40, Math.min(120, pct));
    setBuyDefaultPct(next);
    setBuyItems((prev) => prev.map((item) => ({ ...item, buyPct: next })));
  };

  const handleApplyThreshold = () => {
    const threshold = parseFloat(thresholdPrice);
    if (!threshold || threshold <= 0) {
      triggerQuickAddFeedback("Please enter a valid price threshold.");
      return;
    }
    let count = 0;
    setBuyItems(prev => prev.map(item => {
      let marketPrice = 0;
      if (item.isGraded && item.gradedPrice) {
        const src = item.gradedPriceCurrency || 'USD';
        marketPrice = convertCurrency(parseFloat(item.gradedPrice), currency, src);
      } else if (item.isManualEntry && item.manualPrice) {
        const src = item.manualPriceCurrency || 'USD';
        marketPrice = convertCurrency(parseFloat(item.manualPrice), currency, src);
      } else {
        const tcg = computeTcgPrice(item, item.condition, currency);
        const cmAvg = getCardmarketAvg(item, item.condition, currency) || 0;
        const cmLow = getCardmarketLowest(item, item.condition, currency) || 0;
        const valid = [tcg, cmAvg, cmLow].filter(p => p > 0);
        marketPrice = valid.length > 0 ? Math.min(...valid) : 0;
      }
      if (marketPrice > 0 && marketPrice < threshold) {
        count++;
        return { ...item, buyPct: thresholdPct };
      }
      return item;
    }));
    triggerQuickAddFeedback(`Updated ${count} card${count !== 1 ? 's' : ''} to ${thresholdPct}%`);
  };

  const calculateItemValue = (item) => {
    const qty = item.quantity || 1;
    const pct = (item.buyPct ?? buyDefaultPct) / 100;
    
    // For graded cards, use graded price
    if (item.isGraded && item.gradedPrice) {
      // gradedPriceCurrency tells us what currency the price was entered in
      // API-fetched graded prices are in USD, manual entries use user's currency
      const sourceCurrency = item.gradedPriceCurrency || 'USD';
      const gradedPriceInCurrency = convertCurrency(parseFloat(item.gradedPrice), currency, sourceCurrency);
      const gradedValue = gradedPriceInCurrency * pct;
      const finalUnit = item.overrideValue ?? gradedValue;
      const finalTotal = finalUnit * qty;
      return { graded: gradedValue, finalUnit, finalTotal, qty, isGraded: true };
    }
    
    // For manual cards with manual price (not graded), use that price
    if (item.isManualEntry && item.manualPrice) {
      const sourceCurrency = item.manualPriceCurrency || 'USD';
      const manualPriceInCurrency = convertCurrency(parseFloat(item.manualPrice), currency, sourceCurrency);
      const manualValue = manualPriceInCurrency * pct;
      const finalUnit = item.overrideValue ?? manualValue;
      const finalTotal = finalUnit * qty;
      return { tcg: manualValue, cmAvg: manualValue, cmLowest: manualValue, suggested: manualValue, finalUnit, finalTotal, qty, isGraded: false };
    }
    
    // For ungraded cards, use market prices
    const tcgBase = computeTcgPrice(item, item.condition, currency);
    const cmAvgBase = getCardmarketAvg(item, item.condition, currency) || 0;
    const cmLowBase = getCardmarketLowest(item, item.condition, currency) || 0;

    const tcg = tcgBase * pct;
    const cmAvg = cmAvgBase * pct;
    const cmLowest = cmLowBase * pct;
    
    let suggested = 0;
    if (tcg > 0 || cmAvg > 0 || cmLowest > 0) {
      const validPrices = [tcg, cmAvg, cmLowest].filter(p => p > 0);
      suggested = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    }
    
    const finalUnit = item.overrideValue ?? suggested;
    const finalTotal = finalUnit * qty;

    return { tcg, cmAvg, cmLowest, suggested, finalUnit, finalTotal, qty, isGraded: false };
  };

  const buyTotals = useMemo(() => {
    return buyItems.reduce(
      (acc, item) => {
        const values = calculateItemValue(item);
        if (values.isGraded) {
          // For graded cards, only accumulate final value
          acc.finalValue += values.finalTotal;
        } else {
          // For ungraded cards, accumulate all values
          acc.tcgMarket += values.tcg * values.qty;
          acc.cmAvg += values.cmAvg * values.qty;
          acc.cmLowest += values.cmLowest * values.qty;
          acc.finalValue += values.finalTotal;
        }
        return acc;
      },
      { tcgMarket: 0, cmAvg: 0, cmLowest: 0, finalValue: 0 },
    );
  }, [buyItems, buyDefaultPct]);

  const selectedTotals = useMemo(() => {
    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    return selectedItems.reduce(
      (acc, item) => {
        const values = calculateItemValue(item);
        if (values.isGraded) {
          acc.finalValue += values.finalTotal;
        } else {
          acc.tcgMarket += values.tcg * values.qty;
          acc.cmAvg += values.cmAvg * values.qty;
          acc.cmLowest += values.cmLowest * values.qty;
          acc.finalValue += values.finalTotal;
        }
        return acc;
      },
      { tcgMarket: 0, cmAvg: 0, cmLowest: 0, finalValue: 0 },
    );
  }, [buyItems, selectedIds, buyDefaultPct]);

  const sortedBuyItems = useMemo(() => {
    const direction = buySortDir === "desc" ? -1 : 1;
    const getValue = (item) => {
      const values = calculateItemValue(item);
      switch (buySortBy) {
        case "price_suggested":
          return values.isGraded ? (values.graded || 0) : (values.suggested || 0);
        case "price_tcg":
          return values.tcg || 0;
        case "price_cm":
          return values.cmAvg || 0;
        case "addedAt":
        default:
          return item.addedAt || 0;
      }
    };
    return [...buyItems].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === bv) return 0;
      return av > bv ? direction : -direction;
    });
  }, [buyItems, buySortBy, buySortDir, buyDefaultPct]);

  const groupedBuyItems = useMemo(() => {
    const groups = new Map();
    sortedBuyItems.forEach(item => {
      const pct = item.buyPct ?? buyDefaultPct;
      if (!groups.has(pct)) groups.set(pct, []);
      groups.get(pct).push(item);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([pct, items]) => {
        const total = items.reduce((sum, item) => {
          const values = calculateItemValue(item);
          return sum + (values.finalTotal ?? values.finalValue ?? 0);
        }, 0);
        return { pct, items, total };
      });
  }, [sortedBuyItems, buyDefaultPct]);

  const hasMultipleTiers = groupedBuyItems.length > 1;

  const handleConfirmBuy = async () => {
    if (isCompletingDeal) return;
    if (selectedIds.size === 0) {
      toast.info("Please select cards to confirm the purchase.");
      return;
    }

    if (!user || !db) {
      toast.error("Please sign in to confirm purchases.");
      return;
    }

    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    const selectionSignature = selectedItems.map((item) => item.entryId).sort().join("|");
    if (purchaseOperationId.current?.signature !== selectionSignature) {
      purchaseOperationId.current = { signature: selectionSignature, id: createOperationId() };
    }
    const operationId = purchaseOperationId.current.id;
    setIsCompletingDeal(true);
    
    try {
      // Create transaction log entry
      const itemsIn = selectedItems.map(item => {
        const qty = item.quantity || 1;
        const assignedValues = calculateItemValue(item);
        
        // For graded cards, use the graded price; for ungraded, use market suggested
        let unitPrice;
        if (item.isGraded && item.gradedPrice) {
          // Graded price is in USD, convert to current currency
          unitPrice = convertCurrency(item.gradedPrice, currency);
        } else {
          // Calculate market suggested price (100%, not buy percentage)
          const tcgFull = computeTcgPrice(item, item.condition, currency) || 0;
          const cmAvgFull = getCardmarketAvg(item, item.condition, currency) || 0;
          const cmLowFull = getCardmarketLowest(item, item.condition, currency) || 0;
          const validPrices = [tcgFull, cmAvgFull, cmLowFull].filter(p => p > 0);
          unitPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
        }
        
        return {
          name: item.name,
          set: item.set,
          number: item.number,
          condition: item.condition,
          quantity: qty,
          unitPrice: unitPrice, // Market suggested price (inventory value)
          totalPrice: unitPrice * qty,
          unitCost: assignedValues.finalUnit,
          totalCost: assignedValues.finalTotal,
          image: item.image,
          // Include graded card information for transaction log display
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || null,
          grade: item.grade || null
        };
      });

      // Calculate value gained (market value - cost)
      const totalMarketValue = itemsIn.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      const convertedTotalCost = selectedTotals.finalValue;

      // Calculated deal values are always held in the primary currency. When
      // the user chooses the secondary currency, preserve its converted amount
      // as the source value instead of misreading the primary number as foreign.
      const inputCurrency = buyCurrency;
      const originalTotalCost = inputCurrency !== currency
        ? convertCurrency(convertedTotalCost, inputCurrency, currency)
        : convertedTotalCost;
      const valueGained = totalMarketValue - convertedTotalCost;
      
      const transactionData = {
        ...transactionDetails,
        type: "buy",
        totalValue: convertedTotalCost,
        originalTotal: originalTotalCost,
        originalCurrency: inputCurrency,
        itemsIn,
        itemsOut: [],
        valueGained,
        notes: `Deal completed as purchase: ${selectedItems.reduce((sum, it) => sum + (it.quantity || 1), 0)} card(s)`,
        currency,
        source: "buy_calculator",
      };
      
      // Only add inputCurrency if it's different from primary currency
      if (inputCurrency && inputCurrency !== currency) {
        transactionData.inputCurrency = inputCurrency;
      }
      
      const savedTransaction = prepareTransactionRecord(db, user.uid, transactionData, {
        id: `deal-buy-${operationId}`,
      });

      // Add cards to inventory
      const inventoryItems = [];
      selectedItems.forEach((item, itemIndex) => {
        const qty = item.quantity || 1;
        const values = calculateItemValue(item);
        const persistedLine = savedTransaction?.payload?.itemsIn?.[itemIndex];
        const perUnitBuyPrice = persistedLine?.unitCost ?? values.finalUnit ?? 0;
        for (let i = 0; i < qty; i++) {
          const inventoryItem = {
            entryId: `${savedTransaction.id}-in-${itemIndex}-${i}`,
            id: item.id || item.baseId || "",
            name: item.name || "",
            set: item.set || "",
            number: item.number || "",
            rarity: item.rarity || "",
            image: item.image || "",
            condition: item.condition || "NM",
            quantity: 1,
            prices: item.prices || {},
            addedAt: savedTransaction.payload.ts,
            buyPrice: perUnitBuyPrice,
            buyPriceCurrency: currency,
            acquiredVia: "buy",
            acquisitionTransactionId: savedTransaction?.id || null,
            taxAcquisition: {
              marginSchemeEligibility: transactionDetails.marginSchemeEligibility || "unreviewed",
              counterpartyType: transactionDetails.counterpartyType || "unknown",
              documentNumber: transactionDetails.documentNumber || "",
              recordedCost: perUnitBuyPrice,
              currency,
            },
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
            inventoryItem.gradedPrice = item.gradedPrice || 0;
            inventoryItem.gradedPriceCurrency = item.gradedPriceCurrency || "USD";
          }
          
          inventoryItems.push(cloneForFirestore(inventoryItem));
        }
      });

      const updatedInventory = [...collectionItems, ...inventoryItems];
      const inventoryRef = doc(db, "collections", user.uid);
      const batch = writeBatch(db);
      batch.set(savedTransaction.ref, savedTransaction.payload);
      batch.set(inventoryRef, { items: cloneForFirestore(updatedInventory) }, { merge: true });

      let remainingPendingDeals = pendingDeals;
      if (loadedFromPendingDealId != null) {
        remainingPendingDeals = pendingDeals.filter((deal) => deal.id !== loadedFromPendingDealId);
        batch.set(doc(db, "pendingDeals", user.uid), {
          buyDeals: cloneForFirestore(remainingPendingDeals),
          pendingDealsUpdatedAt: Date.now(),
        }, { merge: true });
      }

      await batch.commit();
      setCollectionItems(updatedInventory);
      if (loadedFromPendingDealId != null) {
        setPendingDeals(remainingPendingDeals);
        setLoadedFromPendingDealId(null);
      }

      // Remove confirmed items from the deal list
      setBuyItems(prev => prev.filter(it => !selectedIds.has(it.entryId)));
      setSelectedIds(new Set());
      purchaseOperationId.current = null;

      const totalCards = selectedItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
      triggerQuickAddFeedback(`Deal completed as purchase! ${totalCards} card(s) added to inventory.`);
    } catch (error) {
      console.error("Failed to confirm purchase:", error);
      toast.error("Failed to confirm purchase. Please try again.");
    } finally {
      setIsCompletingDeal(false);
    }
  };

  const handleConfirmTradeFromBuy = () => {
    if (selectedIds.size === 0) {
      toast.info("Please select cards to confirm the trade.");
      return;
    }

    if (!user || !db) {
      toast.error("Please sign in to confirm trades.");
      return;
    }

    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    setPendingTradeConfirmation({
      selectedItems,
      selectedIds: new Set(selectedIds),
      operationId: createOperationId(),
    });
    setShowInventoryModal(true);
  };

  const handleCompleteTradeWithInventory = async () => {
    if (!pendingTradeConfirmation || isCompletingDeal) return;
    if (selectedInventoryIds.size === 0) {
      toast.info("Please select cards from your inventory to trade out.");
      return;
    }

    setIsCompletingDeal(true);
    try {
      const { selectedItems } = pendingTradeConfirmation;
      const selectedInventoryItems = collectionItems.filter(it => selectedInventoryIds.has(it.entryId));

      const itemsIn = selectedItems.map(item => {
        const qty = item.quantity || 1;
        const assignedValues = calculateItemValue(item);
        let unitPrice;
        if (item.isGraded && item.gradedPrice) {
          unitPrice = convertCurrency(item.gradedPrice, currency, item.gradedPriceCurrency || 'USD');
        } else if (item.isManualEntry && item.manualPrice) {
          unitPrice = convertCurrency(item.manualPrice, currency, item.manualPriceCurrency || 'USD');
        } else {
          const tcgFull = computeTcgPrice(item, item.condition, currency) || 0;
          const cmAvgFull = getCardmarketAvg(item, item.condition, currency) || 0;
          const cmLowFull = getCardmarketLowest(item, item.condition, currency) || 0;
          const validPrices = [tcgFull, cmAvgFull, cmLowFull].filter(p => p > 0);
          unitPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
        }

        return {
          name: item.name || "",
          set: item.set || "",
          number: item.number || "",
          condition: item.condition || "NM",
          quantity: qty,
          unitPrice: unitPrice || 0,
          totalPrice: (unitPrice || 0) * qty,
          marketValue: (unitPrice || 0) * qty,
          unitCost: assignedValues.finalUnit,
          totalCost: assignedValues.finalTotal,
          image: item.image || item.imageUrl || "",
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || "",
          grade: item.grade || ""
        };
      });

      const itemsOut = selectedInventoryItems.map(item => {
        const qty = item.quantity || 1;
        let vendorPrice;
        if (item.overridePrice != null) {
          vendorPrice = item.overridePriceCurrency && item.overridePriceCurrency !== currency
            ? convertCurrency(Number(item.overridePrice), currency, item.overridePriceCurrency)
            : Number(item.overridePrice);
        } else {
          const metrics = computeItemMetrics(item, currency);
          vendorPrice = metrics.suggested;
        }

        const metrics = computeItemMetrics(item, currency);
        const marketValue = metrics.suggested;
        const rawCostBasis = item.buyPrice ?? item.costBasis;
        const costCurrency = item.buyPrice != null
          ? item.buyPriceCurrency || currency
          : item.costBasisCurrency || currency;
        const costBasis = rawCostBasis != null && !Number.isNaN(Number(rawCostBasis))
          ? costCurrency === currency
            ? Number(rawCostBasis)
            : convertCurrency(Number(rawCostBasis), currency, costCurrency)
          : null;

        return {
          inventoryEntryId: item.entryId || null,
          name: item.name || "",
          set: item.set || "",
          number: item.number || "",
          condition: item.condition || "NM",
          quantity: qty,
          unitPrice: vendorPrice || 0,
          totalPrice: (vendorPrice || 0) * qty,
          marketValue: (marketValue || 0) * qty,
          costBasis,
          buyPrice: costBasis,
          image: item.image || item.imageUrl || "",
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || "",
          grade: item.grade || ""
        };
      });

      const totalValueIn = itemsIn.reduce((sum, item) => sum + (item.marketValue || 0), 0);
      const totalValueOut = itemsOut.reduce((sum, item) => sum + (item.marketValue || 0), 0);

      const cashValue = parseFloat(cashAmount) || 0;
      let cashInPrimaryCurrency = 0;
      if (cashValue > 0) {
        cashInPrimaryCurrency = cashCurrency !== currency
          ? convertCurrency(cashValue, currency, cashCurrency)
          : cashValue;
      }

      let valueGained = totalValueIn - totalValueOut;
      if (cashValue > 0) {
        valueGained += cashDirection === "in" ? cashInPrimaryCurrency : -cashInPrimaryCurrency;
      }

      const totalValue = selectedTotals.finalValue;
      const inputCurrency = buyCurrency;
      const originalTotal = inputCurrency !== currency
        ? convertCurrency(totalValue, inputCurrency, currency)
        : totalValue;

      const transactionData = {
        ...transactionDetails,
        type: "trade",
        totalValue,
        originalTotal,
        originalCurrency: inputCurrency,
        itemsIn,
        itemsOut,
        valueGained,
        notes: `Trade completed from deal calculator: ${itemsOut.length} card(s) out, ${itemsIn.reduce((sum, it) => sum + (it.quantity || 1), 0)} card(s) in${cashValue > 0 ? `, ${cashDirection === 'in' ? 'received' : 'paid'} ${formatCurrency(cashValue, cashCurrency)} cash` : ''}`,
        currency,
        source: "buy_calculator_trade",
      };

      if (cashValue > 0) {
        transactionData.cashAmount = cashInPrimaryCurrency;
        transactionData.cashDirection = cashDirection;
        transactionData.cashCurrency = currency;
        transactionData.cashOriginalAmount = cashValue;
        transactionData.cashOriginalCurrency = cashCurrency;
        transactionData.cashFxRateToPrimary = cashInPrimaryCurrency / cashValue;
        transactionData.cashFxPrimaryCurrency = currency;
        transactionData.cashFxCapturedAt = Date.now();
      }

      if (inputCurrency && inputCurrency !== currency) {
        transactionData.inputCurrency = inputCurrency;
      }

      const savedTransaction = prepareTransactionRecord(db, user.uid, transactionData, {
        id: `deal-trade-${pendingTradeConfirmation.operationId}`,
      });

      const inventoryItems = [];
      selectedItems.forEach((item, itemIndex) => {
        const qty = item.quantity || 1;
        const values = calculateItemValue(item);
        const persistedLine = savedTransaction?.payload?.itemsIn?.[itemIndex];
        const perUnitBuyPrice = persistedLine?.unitCost ?? values.finalUnit ?? persistedLine?.marketUnitPrice ?? persistedLine?.unitPrice ?? 0;
        for (let i = 0; i < qty; i++) {
          const inventoryItem = {
            entryId: `${savedTransaction.id}-in-${itemIndex}-${i}`,
            id: item.id || item.baseId || "",
            name: item.name || "",
            set: item.set || "",
            number: item.number || "",
            rarity: item.rarity || "",
            image: item.image || item.imageUrl || "",
            condition: item.condition || "NM",
            quantity: 1,
            prices: item.prices || {},
            addedAt: savedTransaction.payload.ts,
            buyPrice: perUnitBuyPrice,
            buyPriceCurrency: currency,
            acquiredVia: "trade",
            acquisitionTransactionId: savedTransaction?.id || null,
            taxAcquisition: {
              marginSchemeEligibility: transactionDetails.marginSchemeEligibility || "unreviewed",
              counterpartyType: transactionDetails.counterpartyType || "unknown",
              documentNumber: transactionDetails.documentNumber || "",
              valuation: perUnitBuyPrice,
              valuationMethod: "assigned_deal_value",
              currency,
            },
          };

          if (item.isManualEntry) {
            inventoryItem.isManualEntry = true;
            inventoryItem.manualPrice = item.manualPrice;
            inventoryItem.manualPriceCurrency = item.manualPriceCurrency;
            inventoryItem.notes = item.notes || "";
          }

          if (item.isGraded) {
            inventoryItem.isGraded = true;
            inventoryItem.gradingCompany = item.gradingCompany || "";
            inventoryItem.grade = item.grade || "";
            inventoryItem.gradedPrice = item.gradedPrice || 0;
            inventoryItem.gradedPriceCurrency = item.gradedPriceCurrency || "USD";
          }

          inventoryItems.push(cloneForFirestore(inventoryItem));
        }
      });

      const updatedInventory = [
        ...collectionItems.filter(it => !selectedInventoryIds.has(it.entryId)),
        ...inventoryItems
      ];

      const inventoryRef = doc(db, "collections", user.uid);
      const batch = writeBatch(db);
      batch.set(savedTransaction.ref, savedTransaction.payload);
      batch.set(inventoryRef, { items: cloneForFirestore(updatedInventory) }, { merge: true });

      let remainingPendingDeals = pendingDeals;
      if (loadedFromPendingDealId != null) {
        remainingPendingDeals = pendingDeals.filter((deal) => deal.id !== loadedFromPendingDealId);
        batch.set(doc(db, "pendingDeals", user.uid), {
          buyDeals: cloneForFirestore(remainingPendingDeals),
          pendingDealsUpdatedAt: Date.now(),
        }, { merge: true });
      }

      await batch.commit();
      setCollectionItems(updatedInventory);
      if (loadedFromPendingDealId != null) {
        setPendingDeals(remainingPendingDeals);
        setLoadedFromPendingDealId(null);
      }

      setBuyItems(prev => prev.filter(it => !pendingTradeConfirmation.selectedIds.has(it.entryId)));
      setSelectedIds(new Set());
      setShowInventoryModal(false);
      setPendingTradeConfirmation(null);
      setSelectedInventoryIds(new Set());
      setInventorySearchQuery("");
      setCashAmount("");
      setCashCurrency(secondaryCurrency || currency);
      setCashDirection("in");

      triggerQuickAddFeedback(`Trade completed! ${itemsIn.reduce((sum, it) => sum + (it.quantity || 1), 0)} card(s) added, ${itemsOut.length} removed.`);
    } catch (error) {
      console.error("Failed to complete trade from buy calculator:", error);
      toast.error("Failed to complete trade. Please try again.");
    } finally {
      setIsCompletingDeal(false);
    }
  };

  const handleSaveAsPending = async () => {
    if (savingPending) return;
    if (selectedIds.size === 0) {
      toast.info("Please select cards to save as pending.");
      return;
    }

    if (pendingDeals.length >= 5) {
      toast.info("Maximum 5 pending deals allowed. Please complete or delete existing deals first.");
      return;
    }

    const description = prompt("Enter a description for this deal (max 20 characters):");
    if (!description) {
      return; // User cancelled or entered empty string
    }

    const trimmedDescription = description.trim().slice(0, 20);

    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    const newDeal = {
      id: Date.now(),
      date: new Date().toISOString(),
      description: trimmedDescription,
      items: selectedItems,
      totalValue: selectedTotals.finalValue
    };

    const updated = [...pendingDeals, newDeal];
    setSavingPending(true);
    const result = await savePendingDealsToFirestore(updated);
    setSavingPending(false);

    if (!result.synced && !result.savedLocally) {
      toast.error("Pending deal could not be saved. Your current cards are still here.");
      return;
    }

    setPendingDeals(updated);

    // Remove saved items from current list
    setBuyItems(prev => prev.filter(it => !selectedIds.has(it.entryId)));
    setSelectedIds(new Set());

    if (result.synced) {
      triggerQuickAddFeedback(`Pending deal synced! (${selectedItems.length} cards)`);
    } else {
      toast.info("Saved on this device. It will sync when Firestore is available.");
    }
  };

  const handleLoadPending = (deal) => {
    setBuyItems((prev) => {
      const existingIds = new Set(prev.map((item) => item.entryId));
      return [...prev, ...deal.items.filter((item) => !existingIds.has(item.entryId))];
    });
    setLoadedFromPendingDealId(deal.id);
    setShowPendingModal(false);
    triggerQuickAddFeedback(`Loaded ${deal.items.length} cards from pending deal`);
  };

  const handleDeletePending = async (dealId) => {
    if (savingPending) return;
    const updated = pendingDeals.filter(d => d.id !== dealId);
    setSavingPending(true);
    const result = await savePendingDealsToFirestore(updated);
    setSavingPending(false);
    if (!result.synced && !result.savedLocally) {
      toast.error("Pending deal could not be deleted. Please try again.");
      return;
    }
    setPendingDeals(updated);
    if (loadedFromPendingDealId === dealId) setLoadedFromPendingDealId(null);
    triggerQuickAddFeedback(result.synced ? "Pending deal deleted" : "Pending deal deleted on this device");
  };

  // Handle manual card entry
  const handleManualCardAdd = useCallback((manualCard) => {
    // Add the manual card to the buy calculator
    const buyItem = {
      entryId: `${manualCard.id}-buy-${Date.now()}`,
      baseId: manualCard.id,
      name: manualCard.name,
      set: manualCard.set,
      number: manualCard.number,
      rarity: manualCard.rarity,
      image: manualCard.image,
      condition: 'NM',
      quantity: 1,
      buyPct: buyDefaultPct,
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
    
    setBuyItems(prev => [...prev, buyItem]);
    setShowManualEntry(false);
    triggerQuickAddFeedback(`"${manualCard.name}" added to buy calculator`);
  }, [buyDefaultPct, setBuyItems, triggerQuickAddFeedback]);

  const handleScannedCardsAdd = useCallback((scannedCards) => {
    const newItems = scannedCards.map((card) => ({
      entryId: `${card.id}-buy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      baseId: card.id,
      name: card.name,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      prices: card.prices || {},
      condition: card.condition || 'NM',
      quantity: 1,
      buyPct: buyDefaultPct,
      addedAt: Date.now(),
      isManualEntry: card.isManualEntry || false,
      manualPrice: card.manualPrice,
      manualPriceCurrency: card.manualPriceCurrency,
      isGraded: card.isGraded || false,
      gradingCompany: card.gradingCompany,
      grade: card.grade,
      gradedPrice: card.gradedPrice,
      gradedPriceCurrency: card.gradedPriceCurrency,
      notes: card.notes || "",
    }));
    setBuyItems(prev => [...prev, ...newItems]);
    triggerQuickAddFeedback(`${newItems.length} card${newItems.length !== 1 ? 's' : ''} added from scan`);
  }, [buyDefaultPct, setBuyItems, triggerQuickAddFeedback]);

  const formatPrice = (amount) => formatCurrency(amount, currency);

  // Dual-currency formatter: primary + secondary in parentheses
  const formatDual = (amount) => {
    const primary = formatCurrency(amount, currency);
    if (!secondaryCurrency || secondaryCurrency === currency) return primary;
    const converted = convertCurrency(amount, secondaryCurrency, currency);
    return `${primary} (${formatCurrency(converted, secondaryCurrency)})`;
  };

  // Generate text summary for sharing
  const generateTextSummary = useCallback(() => {
    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    if (selectedItems.length === 0) return "";
    
    const vendorName = userProfile?.username || userProfile?.displayName || "Buyer";
    let summary = `💰 Cash Offer from ${vendorName}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📦 Cards I want to buy (${selectedItems.length}):\n\n`;
    
    const fmtDualText = (amount) => {
      const primary = formatCurrency(amount, currency);
      if (!secondaryCurrency || secondaryCurrency === currency) return primary;
      const converted = convertCurrency(amount, secondaryCurrency, currency);
      return `${primary} (${formatCurrency(converted, secondaryCurrency)})`;
    };
    
    selectedItems.forEach((item, index) => {
      const values = calculateItemValue(item);
      const conditionLabel = getConditionDisplayLabel(item.condition || "NM");
      const qty = item.quantity || 1;
      
      if (item.isGraded) {
        summary += `${index + 1}. ${item.name}${qty > 1 ? ` (x${qty})` : ''}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   [${item.gradingCompany} ${item.grade}]\n`;
        summary += `   💵 Cash Offer: ${fmtDualText(values.finalTotal)}\n\n`;
      } else {
        summary += `${index + 1}. ${item.name}${qty > 1 ? ` (x${qty})` : ''}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   📋 Condition: ${conditionLabel}\n`;
        summary += `   💵 Cash Offer: ${fmtDualText(values.finalTotal)}\n\n`;
      }
    });
    
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `💵 Total Cash Offer: ${fmtDualText(selectedTotals.finalValue)}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `Interested in selling? Contact ${vendorName}!`;
    
    return summary;
  }, [buyItems, selectedIds, selectedTotals, userProfile, currency, secondaryCurrency]);

  // Copy text summary to clipboard
  const handleCopyTextSummary = async () => {
    const summary = generateTextSummary();
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("Failed to copy to clipboard");
    }
  };

  // Generate shareable link by saving to Firestore
  const handleGenerateShareLink = async () => {
    if (!user || !db) {
      toast.error("Please sign in to generate a share link.");
      return;
    }
    
    setShareLoading(true);
    try {
      const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
      
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
          cashOffer: values.finalTotal,
          buyPct: item.buyPct ?? buyDefaultPct,
          quantity: item.quantity || 1,
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || null,
          grade: item.grade || null,
        };
      });
      
      // Save to Firestore
      const buyOffer = {
        type: "buy", // Distinguish from trade offers
        vendorId: user.uid,
        vendorName: userProfile?.username || userProfile?.displayName || "Buyer",
        vendorAvatar: userProfile?.photoURL || null,
        items: shareItems,
        totalValue: selectedTotals.finalValue,
        currency: currency,
        secondaryCurrency: secondaryCurrency || null,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours expiry
      };
      
      const docRef = await addDoc(collection(db, "tradeOffers"), buyOffer);
      const link = `${window.location.origin}/trade-offer?id=${docRef.id}`;
      setShareLink(link);
      
    } catch (err) {
      console.error("Failed to generate share link:", err);
      toast.error("Failed to generate share link. Please try again.");
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
      toast.error("Failed to copy to clipboard");
    }
  };

  // Open share modal
  const handleOpenShareModal = () => {
    if (selectedIds.size === 0) {
      toast.info("Please select cards to share.");
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
    const vendorName = userProfile?.username || userProfile?.displayName || "Buyer";
    let summary = `💰 Cash Offer from ${vendorName}\n`;
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
      const qty = item.quantity || 1;
      const itemTotal = values.finalTotal ?? values.finalValue ?? 0;
      totalValue += itemTotal;
      if (item.isGraded) {
        summary += `${index + 1}. ${item.name}${qty > 1 ? ` (x${qty})` : ''}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   [${item.gradingCompany} ${item.grade}]\n`;
        summary += `   💵 Cash Offer: ${fmtDualText(itemTotal)}\n\n`;
      } else {
        summary += `${index + 1}. ${item.name}${qty > 1 ? ` (x${qty})` : ''}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   📋 Condition: ${conditionLabel}\n`;
        summary += `   💵 Cash Offer: ${fmtDualText(itemTotal)}\n\n`;
      }
    });
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `💵 Total Cash Offer: ${fmtDualText(totalValue)}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `Interested in selling? Contact ${vendorName}!`;
    return summary;
  }, [userProfile, currency, secondaryCurrency, buyDefaultPct]);

  const handleCopySplitText = async (pct, items) => {
    const text = generateTextSummaryForItems(items);
    try {
      await navigator.clipboard.writeText(text);
      setSplitCopied(prev => ({ ...prev, [pct]: 'text' }));
      setTimeout(() => setSplitCopied(prev => ({ ...prev, [pct]: null })), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
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
          cashOffer: values.finalTotal ?? values.finalValue ?? 0,
          buyPct: item.buyPct ?? buyDefaultPct, quantity: item.quantity || 1,
          isGraded: item.isGraded || false, gradingCompany: item.gradingCompany || null, grade: item.grade || null,
        };
      });
      const buyOffer = {
        type: "buy", vendorId: user.uid,
        vendorName: userProfile?.username || userProfile?.displayName || "Buyer",
        vendorAvatar: userProfile?.photoURL || null,
        items: shareItems, totalValue, currency,
        secondaryCurrency: secondaryCurrency || null,
        createdAt: Date.now(), expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      };
      const docRef = await addDoc(collection(db, "tradeOffers"), buyOffer);
      const link = `${window.location.origin}/trade-offer?id=${docRef.id}`;
      setSplitShareLinks(prev => ({ ...prev, [pct]: link }));
    } catch {
      toast.error("Failed to generate share link.");
    } finally {
      setSplitShareLoading(prev => ({ ...prev, [pct]: false }));
    }
  };

  const handleCopySplitLink = async (pct) => {
    try {
      await navigator.clipboard.writeText(splitShareLinks[pct]);
      setSplitCopied(prev => ({ ...prev, [pct]: 'link' }));
      setTimeout(() => setSplitCopied(prev => ({ ...prev, [pct]: null })), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleSaveSplitTierAsPending = async (tierItems, pct, totalValue) => {
    if (savingPending) return;
    if (pendingDeals.length >= 5) {
      toast.info("Maximum 5 pending deals allowed. Delete existing deals first.");
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
    setSavingPending(true);
    const result = await savePendingDealsToFirestore(updated);
    setSavingPending(false);
    if (!result.synced && !result.savedLocally) {
      toast.error("Pending deal could not be saved. Please try again.");
      return;
    }
    setPendingDeals(updated);
    triggerQuickAddFeedback(result.synced
      ? `Synced ${pct}% tier (${tierItems.length} cards) to pending`
      : `Saved ${pct}% tier on this device`);
  };

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
    const filteredIds = new Set(filteredInventoryItems.map(it => it.entryId));
    const allFilteredSelected = filteredInventoryItems.every(it => selectedInventoryIds.has(it.entryId));

    if (allFilteredSelected) {
      setSelectedInventoryIds(prev => {
        const newSet = new Set(prev);
        filteredIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      setSelectedInventoryIds(prev => new Set([...prev, ...filteredIds]));
    }
  };

  const handleCancelInventorySelection = () => {
    if (isCompletingDeal) return;
    setShowInventoryModal(false);
    setPendingTradeConfirmation(null);
    setSelectedInventoryIds(new Set());
    setInventorySearchQuery("");
    setCashAmount("");
    setCashCurrency(secondaryCurrency || currency);
    setCashDirection("in");
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please sign in to use the Deal Calculator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">Deal Calculator</h1>
            <p className="text-muted-foreground">Vendor Toolkit · Finish as buy, trade, or mixed deal</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowCardScanner(true)}
          >
            <Camera className="h-4 w-4 mr-2" />
            Scan Cards
          </Button>
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
              <label className="text-sm font-semibold">Default Cash Offer %</label>
              <PercentSelect
                value={buyDefaultPct}
                onChange={handleBuyDefaultChange}
              />
              <div className="flex items-center gap-2">
                <label className="text-sm">Sort by</label>
                <select
                  className="rounded-md border px-2 py-1 text-sm"
                  value={buySortBy}
                  onChange={(e) => setBuySortBy(e.target.value)}
                >
                  <option value="addedAt">Date Added</option>
                  <option value="price_suggested">Suggested Price</option>
                  <option value="price_tcg">Price (TCG)</option>
                  <option value="price_cm">Price (Market Avg)</option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBuySortDir(prev => prev === "desc" ? "asc" : "desc")}
                >
                  {buySortDir === "desc" ? "↓" : "↑"}
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
                disabled={buyItems.length === 0}
                className="h-7 text-xs"
              >
                Apply
              </Button>
            </div>
            <div className="text-sm">
              <div className="font-semibold mb-1">Total Deal Value:</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>TCG: {formatPrice(buyTotals.tcgMarket)}</span>
                <span>CM Avg: {formatPrice(buyTotals.cmAvg)}</span>
                <span>CM Low: {formatPrice(buyTotals.cmLowest)}</span>
                <span className="font-semibold text-blue-600">Final: {formatDual(buyTotals.finalValue)}</span>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className="text-sm border-t pt-2">
                <div className="font-semibold mb-1">Selected ({selectedIds.size}) Value:</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>TCG: {formatPrice(selectedTotals.tcgMarket)}</span>
                  <span>CM Avg: {formatPrice(selectedTotals.cmAvg)}</span>
                  <span>CM Low: {formatPrice(selectedTotals.cmLowest)}</span>
                  <span className="font-semibold text-blue-600">Final: {formatDual(selectedTotals.finalValue)}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {buyItems.length > 0 && (
        <Card className="rounded-2xl p-4 shadow mb-4">
          <CardContent className="p-0">
            {/* Currency Selector - only show if secondary currency is enabled */}
            {secondaryCurrency && selectedIds.size > 0 && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <label className="block text-sm font-semibold mb-2">
                  Enter deal amount in:
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="buyCurrency"
                      checked={buyCurrency === currency}
                      onChange={() => setBuyCurrency(currency)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">{currency} (Primary)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="buyCurrency"
                      checked={buyCurrency === secondaryCurrency}
                      onChange={() => setBuyCurrency(secondaryCurrency)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">{secondaryCurrency} (Secondary)</span>
                  </label>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  Deal amount will be converted to {currency} for storage
                </p>
              </div>
            )}
            
            {selectedIds.size > 0 && (
              <TransactionDetailsFields
                value={transactionDetails}
                onChange={setTransactionDetails}
                type="buy"
              />
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
              >
                {selectedIds.size === buyItems.length ? (
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
                onClick={handleConfirmBuy}
                disabled={selectedIds.size === 0 || isCompletingDeal}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Finish as Buy ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleConfirmTradeFromBuy}
                disabled={selectedIds.size === 0 || isCompletingDeal}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Finish as Trade ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveAsPending}
                disabled={selectedIds.size === 0 || pendingDeals.length >= 5 || savingPending}
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
                onClick={clearBuyList}
              >
                Clear All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {buyItems.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No deal items yet. Add cards from Card Search (Vendor Toolkit → Search).
            </CardContent>
          </Card>
        )}
        {groupedBuyItems.map((group) => (
          <div key={group.pct}>
            {hasMultipleTiers && (
              <div className="flex items-center gap-2 mb-2 mt-3 px-1">
                <div className="h-px flex-1 bg-blue-200" />
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                  {group.pct}% tier — {group.items.length} card{group.items.length !== 1 ? 's' : ''} — Total: {formatDual(group.total)}
                </span>
                <div className="h-px flex-1 bg-blue-200" />
              </div>
            )}
            {group.items.map((it) => {
              const values = calculateItemValue(it);
              const isSelected = selectedIds.has(it.entryId);
              
              return (
                <Card key={it.entryId} className={`rounded-2xl p-3 mb-3 ${isSelected ? 'ring-2 ring-blue-600' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 cursor-pointer mt-1"
                      onClick={() => toggleSelection(it.entryId)}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-blue-600" />
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
                            Graded Value ({it.buyPct ?? buyDefaultPct}%): {formatDual(values.isGraded ? values.graded : values.suggested)}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div>TCG ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.tcg)}</div>
                          <div>CM Avg ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.cmAvg)}</div>
                          <div>CM Low ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.cmLowest)}</div>
                          <div className="font-semibold">Suggested: {formatDual(values.suggested)}</div>
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs font-semibold">Final Unit:</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={it.overrideValue ?? (values.isGraded ? values.graded.toFixed(2) : values.suggested.toFixed(2))}
                          onChange={(e) => updateOverrideValue(it.entryId, e.target.value)}
                          className="h-7 w-24 text-xs"
                        />
                        {it.overrideValue && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateOverrideValue(it.entryId, "")}
                            className="h-7 text-xs"
                          >
                            Reset
                          </Button>
                        )}
                        {values.qty > 1 && (
                          <span className="text-xs text-muted-foreground">
                            × {values.qty} = {formatDual(values.finalTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {!it.isGraded && (
                        <ConditionSelect
                          value={it.condition}
                          onChange={(v) => updateBuyCondition(it.entryId, v)}
                        />
                      )}
                      <Input
                        type="number"
                        min="1"
                        value={it.quantity || 1}
                        onChange={(e) => updateBuyQuantity(it.entryId, e.target.value)}
                        className="h-8 w-16 text-xs"
                        placeholder="Qty"
                      />
                      <PercentSelect
                        value={it.buyPct ?? buyDefaultPct}
                        onChange={(val) => updateBuyPct(it.entryId, val)}
                        className="text-xs"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeFromBuy(it.entryId)}
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

      {/* Card Photo Scanner Modal */}
      {showCardScanner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-auto">
            <CardContent className="p-6">
              <CardPhotoScanner
                onAddCards={handleScannedCardsAdd}
                onClose={() => setShowCardScanner(false)}
              />
            </CardContent>
          </Card>
        </div>
      )}

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
                <h2 className="text-xl font-bold">Pending Deals</h2>
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
                          <div className="text-sm font-semibold text-blue-600">
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
                            disabled={savingPending}
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
                  {filteredInventoryItems.length > 0 && filteredInventoryItems.every(it => selectedInventoryIds.has(it.entryId)) ? "Deselect All" : "Select All"}
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
                    const metrics = computeItemMetrics(item, currency);
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

              {secondaryCurrency && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold mb-2">
                    Enter deal value in:
                  </label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="buyTradeCurrency"
                        checked={buyCurrency === currency}
                        onChange={() => setBuyCurrency(currency)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{currency} (Primary)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="buyTradeCurrency"
                        checked={buyCurrency === secondaryCurrency}
                        onChange={() => setBuyCurrency(secondaryCurrency)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">{secondaryCurrency} (Secondary)</span>
                    </label>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    Deal values will be converted to {currency} for storage.
                  </p>
                </div>
              )}

              <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <label className="block text-sm font-semibold mb-2">
                  Include Cash in Trade (Optional)
                </label>
                <div className="flex flex-wrap gap-3 items-center mb-3">
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="buyTradeCashDirection"
                        checked={cashDirection === "in"}
                        onChange={() => setCashDirection("in")}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">Receiving Cash</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="buyTradeCashDirection"
                        checked={cashDirection === "out"}
                        onChange={() => setCashDirection("out")}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">Paying Cash</span>
                    </label>
                  </div>
                  {secondaryCurrency && (
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dealCashCurrency"
                          checked={cashCurrency === currency}
                          onChange={() => setCashCurrency(currency)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">{currency}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="dealCashCurrency"
                          checked={cashCurrency === secondaryCurrency}
                          onChange={() => setCashCurrency(secondaryCurrency)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">{secondaryCurrency}</span>
                      </label>
                    </div>
                  )}
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Cash amount (${cashCurrency})`}
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full"
                />
                <p className="text-xs text-purple-600 mt-2">
                  Cash is saved as entered in {cashCurrency}, with the converted {currency} amount and FX rate on the transaction.
                </p>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancelInventorySelection}
                  disabled={isCompletingDeal}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCompleteTradeWithInventory}
                  disabled={selectedInventoryIds.size === 0 || isCompletingDeal}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isCompletingDeal ? "Completing…" : "Complete Trade"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Share Buy Offer Modal */}
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
                  <h2 className="text-xl font-bold">Share Cash Offer</h2>
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
                  {buyItems.filter(it => selectedIds.has(it.entryId)).map(item => {
                    const values = calculateItemValue(item);
                    const qty = item.quantity || 1;
                    return (
                      <div key={item.entryId} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-12 w-9 rounded object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {item.name}{qty > 1 && ` (x${qty})`}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {item.set} #{item.number}
                            {item.isGraded && ` • ${item.gradingCompany} ${item.grade}`}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-blue-600">
                          {formatDual(values.finalTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-lg font-bold text-blue-700">
                    Total Cash Offer: {formatDual(selectedTotals.finalValue)}
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
                    Create a link that shows your cash offer with card images. Link expires in 24 hours.
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
                {groupedBuyItems.map(({ pct, items, total }) => (
                  <Card key={pct} className="p-4 border-2 border-purple-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-lg font-bold text-purple-700">{pct}% Tier</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          {items.length} card{items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="text-lg font-bold text-blue-600">
                        {formatDual(total)}
                      </div>
                    </div>

                    {/* Card preview */}
                    <div className="space-y-1 max-h-32 overflow-y-auto mb-3 border rounded-lg p-2 bg-gray-50">
                      {items.map(item => {
                        const values = calculateItemValue(item);
                        const qty = item.quantity || 1;
                        return (
                          <div key={item.entryId} className="flex items-center gap-2 text-xs">
                            {item.image && (
                              <img src={item.image} alt={item.name} className="h-8 w-6 rounded object-cover" />
                            )}
                            <span className="flex-1 truncate">{item.name}{qty > 1 && ` (x${qty})`}</span>
                            <span className="font-semibold">{formatPrice(values.finalTotal ?? values.finalValue ?? 0)}</span>
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
                        disabled={pendingDeals.length >= 5 || savingPending}
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

      {/* Condition Pricing Note */}
      {buyItems.some(it => it.condition !== "NM") && (
        <Card className="mt-4 border-yellow-200 bg-yellow-50">
          <CardContent className="p-3">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Prices for non-NM condition cards are estimated based on TCGPlayer condition pricing ratios, as CardMarket API only provides actual data for Near Mint (NM) cards.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export const DealCalculator = BuyCalculator;
