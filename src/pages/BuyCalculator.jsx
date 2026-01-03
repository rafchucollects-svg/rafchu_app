import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Trash, CheckSquare, Square, Save, FolderOpen, Share2, Copy, Link, Check, X, Plus } from "lucide-react";
import { ManualCardEntry } from "@/components/ManualCardEntry";
import { useApp } from "@/contexts/AppContext";
import { ConditionSelect } from "@/components/CardComponents";
import { computeTcgPrice, getCardmarketAvg, getCardmarketLowest, formatCurrency, recordTransaction, convertCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";
import { collection, addDoc, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

/**
 * Buy Calculator Page (Vendor Toolkit)
 * Plan purchases with quantity and buy percentage tracking
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

export function BuyCalculator() {
  const { user, db, buyItems, setBuyItems, currency, secondaryCurrency, collectionItems, triggerQuickAddFeedback, userProfile } = useApp();
  const [buyDefaultPct, setBuyDefaultPct] = useState(userProfile?.defaultBuyPct || 70);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pendingDeals, setPendingDeals] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [buyCurrency, setBuyCurrency] = useState(currency); // Currency for purchase input
  
  // Share buy offer state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Manual card entry state
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Load default percentage from user profile
  useEffect(() => {
    if (userProfile?.defaultBuyPct != null) {
      setBuyDefaultPct(userProfile.defaultBuyPct);
    }
  }, [userProfile?.defaultBuyPct]);

  // Helper function to save pending deals to Firestore
  const savePendingDealsToFirestore = useCallback(async (deals) => {
    if (!user?.uid || !db) return;
    try {
      const docRef = doc(db, "pendingDeals", user.uid);
      // First get current doc to preserve tradeDeals
      const snapshot = await getDoc(docRef);
      const currentData = snapshot.exists() ? snapshot.data() : {};
      await setDoc(docRef, {
        ...currentData,
        buyDeals: deals
      });
    } catch (error) {
      console.error("Failed to save pending deals to Firestore:", error);
      // Fallback to localStorage
      localStorage.setItem(`buy_pending_${user.uid}`, JSON.stringify(deals));
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
        setPendingDeals(data.buyDeals || []);
      } else {
        setPendingDeals([]);
      }
    }, (error) => {
      console.error("Failed to load pending deals:", error);
      // Fallback to localStorage if Firestore fails
      try {
        const saved = localStorage.getItem(`buy_pending_${user.uid}`);
        if (saved) {
          setPendingDeals(JSON.parse(saved));
        }
      } catch (e) {
        console.error("localStorage fallback also failed:", e);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

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
    const prevDefault = buyDefaultPct;
    setBuyDefaultPct(next);
    setBuyItems((prev) =>
      prev.map((item) =>
        item.buyPct === prevDefault || item.buyPct === undefined
          ? { ...item, buyPct: next }
          : item,
      ),
    );
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
    const tcgBase = computeTcgPrice(item, item.condition);
    const cmAvgBase = getCardmarketAvg(item, item.condition) || 0;
    const cmLowBase = getCardmarketLowest(item, item.condition) || 0;

    const tcg = tcgBase * pct;
    const cmAvg = cmAvgBase * pct;
    const cmLowest = cmLowBase * pct;
    
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
        const { tcg, cmAvg, cmLowest, finalTotal, qty } = calculateItemValue(item);
        acc.tcgMarket += tcg * qty;
        acc.cmAvg += cmAvg * qty;
        acc.cmLowest += cmLowest * qty;
        acc.finalValue += finalTotal;
        return acc;
      },
      { tcgMarket: 0, cmAvg: 0, cmLowest: 0, finalValue: 0 },
    );
  }, [buyItems, selectedIds, buyDefaultPct]);

  const handleConfirmBuy = async () => {
    if (selectedIds.size === 0) {
      alert("Please select cards to confirm the purchase.");
      return;
    }

    if (!user || !db) {
      alert("Please sign in to confirm purchases.");
      return;
    }

    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    
    try {
      // Create transaction log entry
      const itemsIn = selectedItems.map(item => {
        const qty = item.quantity || 1;
        
        // For graded cards, use the graded price; for ungraded, use market suggested
        let unitPrice;
        if (item.isGraded && item.gradedPrice) {
          // Graded price is in USD, convert to current currency
          unitPrice = convertCurrency(item.gradedPrice, currency);
        } else {
          // Calculate market suggested price (100%, not buy percentage)
          const tcgFull = computeTcgPrice(item, item.condition) || 0;
          const cmAvgFull = getCardmarketAvg(item, item.condition) || 0;
          const cmLowFull = getCardmarketLowest(item, item.condition) || 0;
          unitPrice = Math.min(tcgFull, cmAvgFull, cmLowFull);
        }
        
        return {
          name: item.name,
          set: item.set,
          number: item.number,
          condition: item.condition,
          quantity: qty,
          unitPrice: unitPrice, // Market suggested price (inventory value)
          totalPrice: unitPrice * qty,
          image: item.image,
          // Include graded card information for transaction log display
          isGraded: item.isGraded || false,
          gradingCompany: item.gradingCompany || null,
          grade: item.grade || null
        };
      });

      // Calculate value gained (market value - cost)
      const totalMarketValue = itemsIn.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      const totalCost = selectedTotals.finalValue;
      const valueGained = totalMarketValue - totalCost;

      // Convert totalCost if needed
      let convertedTotalCost = totalCost;
      const inputCurrency = buyCurrency;
      if (inputCurrency !== currency) {
        console.log(`Converting purchase from ${inputCurrency} to ${currency}: ${convertedTotalCost}`);
        convertedTotalCost = convertCurrency(convertedTotalCost, currency, inputCurrency);
        console.log(`Converted purchase: ${convertedTotalCost}`);
      }
      
      const transactionData = {
        type: "buy",
        totalValue: convertedTotalCost,
        itemsIn,
        itemsOut: [],
        valueGained,
        notes: `Purchase of ${selectedItems.reduce((sum, it) => sum + (it.quantity || 1), 0)} card(s)`,
        currency
      };
      
      // Only add inputCurrency if it's different from primary currency
      if (inputCurrency && inputCurrency !== currency) {
        transactionData.inputCurrency = inputCurrency;
      }
      
      await recordTransaction(db, user.uid, transactionData);

      // Add cards to inventory
      const inventoryItems = [];
      selectedItems.forEach(item => {
        const qty = item.quantity || 1;
        for (let i = 0; i < qty; i++) {
          inventoryItems.push({
            entryId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            id: item.id,
            name: item.name,
            set: item.set,
            number: item.number,
            rarity: item.rarity,
            image: item.image,
            condition: item.condition,
            quantity: 1,
            prices: item.prices,
            addedAt: Date.now(),
            // Preserve graded card information
            ...(item.isGraded && {
              isGraded: true,
              gradingCompany: item.gradingCompany,
              grade: item.grade,
              gradedPrice: item.gradedPrice // Stored in USD
            })
          });
        }
      });

      const updatedInventory = [...collectionItems, ...inventoryItems];
      const inventoryRef = doc(db, "collections", user.uid);
      await setDoc(inventoryRef, { items: updatedInventory }, { merge: true });

      // Remove confirmed items from buy list
      setBuyItems(prev => prev.filter(it => !selectedIds.has(it.entryId)));
      setSelectedIds(new Set());

      const totalCards = selectedItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
      triggerQuickAddFeedback(`Purchase confirmed! ${totalCards} card(s) added to inventory.`);
    } catch (error) {
      console.error("Failed to confirm purchase:", error);
      alert("Failed to confirm purchase. Please try again.");
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

    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
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
    setBuyItems(prev => prev.filter(it => !selectedIds.has(it.entryId)));
    setSelectedIds(new Set());

    triggerQuickAddFeedback(`Pending deal saved! (${selectedItems.length} cards)`);
  };

  const handleLoadPending = (deal) => {
    setBuyItems(prev => [...prev, ...deal.items]);
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

  const formatPrice = (amount) => formatCurrency(amount, currency);

  // Generate text summary for sharing
  const generateTextSummary = useCallback(() => {
    const selectedItems = buyItems.filter(it => selectedIds.has(it.entryId));
    if (selectedItems.length === 0) return "";
    
    const vendorName = userProfile?.username || userProfile?.displayName || "Buyer";
    let summary = `💰 Cash Offer from ${vendorName}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `📦 Cards I want to buy (${selectedItems.length}):\n\n`;
    
    selectedItems.forEach((item, index) => {
      const values = calculateItemValue(item);
      const conditionLabel = getConditionDisplayLabel(item.condition || "NM");
      const qty = item.quantity || 1;
      
      if (item.isGraded) {
        summary += `${index + 1}. ${item.name}${qty > 1 ? ` (x${qty})` : ''}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   🏆 ${item.gradingCompany} ${item.grade}\n`;
        summary += `   💵 Cash Offer: ${formatPrice(values.finalTotal)}\n\n`;
      } else {
        summary += `${index + 1}. ${item.name}${qty > 1 ? ` (x${qty})` : ''}\n`;
        summary += `   ${item.set} #${item.number}\n`;
        summary += `   📋 Condition: ${conditionLabel}\n`;
        summary += `   💵 Cash Offer: ${formatPrice(values.finalTotal)}\n\n`;
      }
    });
    
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    summary += `💵 Total Cash Offer: ${formatPrice(selectedTotals.finalValue)}\n`;
    summary += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    summary += `Interested in selling? Contact ${vendorName}!`;
    
    return summary;
  }, [buyItems, selectedIds, selectedTotals, userProfile, currency]);

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
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours expiry
      };
      
      const docRef = await addDoc(collection(db, "tradeOffers"), buyOffer);
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

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Please sign in to use the Buy Calculator.</p>
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
            <h1 className="text-3xl font-bold">Buy Calculator</h1>
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
              <label className="text-sm font-semibold">Default Buy %</label>
              <PercentSelect
                value={buyDefaultPct}
                onChange={handleBuyDefaultChange}
              />
            </div>
            <div className="text-sm">
              <div className="font-semibold mb-1">Total Buy Value:</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>TCG: {formatPrice(buyTotals.tcgMarket)}</span>
                <span>CM Avg: {formatPrice(buyTotals.cmAvg)}</span>
                <span>CM Low: {formatPrice(buyTotals.cmLowest)}</span>
                <span className="font-semibold text-blue-600">Final: {formatPrice(buyTotals.finalValue)}</span>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className="text-sm border-t pt-2">
                <div className="font-semibold mb-1">Selected ({selectedIds.size}) Value:</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>TCG: {formatPrice(selectedTotals.tcgMarket)}</span>
                  <span>CM Avg: {formatPrice(selectedTotals.cmAvg)}</span>
                  <span>CM Low: {formatPrice(selectedTotals.cmLowest)}</span>
                  <span className="font-semibold text-blue-600">Final: {formatPrice(selectedTotals.finalValue)}</span>
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
                  Enter purchase amount in:
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
                  💡 Purchase amount will be converted to {currency} for storage
                </p>
              </div>
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
                disabled={selectedIds.size === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Confirm Buy ({selectedIds.size})
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
              No buy items yet. Add cards from Card Search (Vendor Toolkit → Search).
            </CardContent>
          </Card>
        )}
        {buyItems.map((it) => {
          const values = calculateItemValue(it);
          const isSelected = selectedIds.has(it.entryId);
          
          return (
            <Card key={it.entryId} className={`rounded-2xl p-3 ${isSelected ? 'ring-2 ring-blue-600' : ''}`}>
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
                  {values.isGraded ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="col-span-2 text-purple-600">
                        {it.gradingCompany} {it.grade}
                      </div>
                      <div className="font-semibold col-span-2">
                        Graded Price ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.graded)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>TCG ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.tcg)}</div>
                      <div>CM Avg ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.cmAvg)}</div>
                      <div>CM Low ({it.buyPct ?? buyDefaultPct}%): {formatPrice(values.cmLowest)}</div>
                      <div className="font-semibold">Suggested: {formatPrice(values.suggested)}</div>
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
                        × {values.qty} = {formatPrice(values.finalTotal)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {!values.isGraded && (
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
                <h2 className="text-xl font-bold">Pending Buy Deals</h2>
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
                          {formatPrice(values.finalTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-lg font-bold text-blue-700">
                    Total Cash Offer: {formatPrice(selectedTotals.finalValue)}
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
