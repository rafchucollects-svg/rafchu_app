import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, Trash, CheckSquare, Square, Save, FolderOpen } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { ConditionSelect } from "@/components/CardComponents";
import { computeTcgPrice, getCardmarketAvg, getCardmarketLowest, formatCurrency, recordTransaction, convertCurrency } from "@/utils/cardHelpers";
import { collection, addDoc, doc, setDoc } from "firebase/firestore";

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

  // Load default percentage from user profile
  useEffect(() => {
    if (userProfile?.defaultBuyPct != null) {
      setBuyDefaultPct(userProfile.defaultBuyPct);
    }
  }, [userProfile?.defaultBuyPct]);

  // Load pending deals from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`buy_pending_${user?.uid}`);
      if (saved) {
        setPendingDeals(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Failed to load pending deals:", error);
    }
  }, [user]);

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
    
    // For graded cards, use graded price (stored in USD, need to convert)
    if (item.isGraded && item.gradedPrice) {
      const gradedPriceInCurrency = convertCurrency(parseFloat(item.gradedPrice), currency);
      const gradedValue = gradedPriceInCurrency * pct;
      const finalUnit = item.overrideValue ?? gradedValue;
      const finalTotal = finalUnit * qty;
      return { graded: gradedValue, finalUnit, finalTotal, qty, isGraded: true };
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
    localStorage.setItem(`buy_pending_${user.uid}`, JSON.stringify(updated));

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
    localStorage.setItem(`buy_pending_${user.uid}`, JSON.stringify(updated));
    triggerQuickAddFeedback("Pending deal deleted");
  };

  const formatPrice = (amount) => formatCurrency(amount, currency);

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
        <Button
          variant="outline"
          onClick={() => setShowPendingModal(true)}
          disabled={pendingDeals.length === 0}
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          Pending Deals ({pendingDeals.length})
        </Button>
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
