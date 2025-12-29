import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Search, Plus, X, Check, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { findFuzzyMatches } from "@/utils/searchHelpers";
import { apiSearchCardsHybrid } from "@/utils/apiHelpers";

/**
 * Debounce hook for search suggestions
 */
function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * ManualCardEntry Component
 * Allows users to manually add cards not found in the database
 * Features "Did you mean?" suggestions to prevent duplicate entries
 */
export function ManualCardEntry({ 
  onAddCard, 
  onCancel, 
  initialQuery = "",
  mode = "collector" 
}) {
  const isVendor = mode === "vendor";
  
  // Form state
  const [cardName, setCardName] = useState(initialQuery);
  const [cardSet, setCardSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardRarity, setCardRarity] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [notes, setNotes] = useState("");
  
  // Suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [confirmedNoMatch, setConfirmedNoMatch] = useState(false);
  
  // Debounced search query
  const searchQuery = useMemo(() => {
    const parts = [cardName, cardSet, cardNumber].filter(Boolean);
    return parts.join(" ");
  }, [cardName, cardSet, cardNumber]);
  
  const debouncedQuery = useDebounce(searchQuery, 600);
  
  // Fetch suggestions when query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) {
      setSuggestions([]);
      return;
    }
    
    let cancelled = false;
    
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        // Search the API for potential matches
        const results = await apiSearchCardsHybrid(debouncedQuery, {
          useCache: true,
          maxResults: 50,
        });
        
        if (cancelled) return;
        
        // Find fuzzy matches from results
        const fuzzyMatches = findFuzzyMatches(debouncedQuery, results, {
          maxResults: 5,
          minSimilarity: 0.3,
        });
        
        setSuggestions(fuzzyMatches);
        setShowSuggestions(true);
        
        // Reset confirmed flag if user changes input
        if (confirmedNoMatch) {
          setConfirmedNoMatch(false);
        }
      } catch (error) {
        console.error("Error fetching suggestions:", error);
      } finally {
        if (!cancelled) {
          setLoadingSuggestions(false);
        }
      }
    };
    
    fetchSuggestions();
    
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);
  
  // Handle selecting a suggestion
  const handleSelectSuggestion = useCallback((card) => {
    if (onAddCard) {
      onAddCard(card, { fromSuggestion: true });
    }
  }, [onAddCard]);
  
  // Handle confirming manual entry
  const handleConfirmManualEntry = useCallback(() => {
    setConfirmedNoMatch(true);
    setShowSuggestions(false);
  }, []);
  
  // Handle adding the manual card
  const handleAddManualCard = useCallback(() => {
    if (!cardName.trim()) {
      alert("Please enter a card name");
      return;
    }
    
    const manualCard = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: cardName.trim(),
      set: cardSet.trim() || "Unknown Set",
      number: cardNumber.trim() || "N/A",
      rarity: cardRarity.trim() || "Unknown",
      isManualEntry: true,
      manualPrice: manualPrice ? parseFloat(manualPrice) : null,
      notes: notes.trim() || null,
      image: null, // No image for manual entries
      createdAt: Date.now(),
    };
    
    if (onAddCard) {
      onAddCard(manualCard, { fromSuggestion: false, isManual: true });
    }
  }, [cardName, cardSet, cardNumber, cardRarity, manualPrice, notes, onAddCard]);
  
  // Check if form is valid
  const isFormValid = cardName.trim().length > 0;
  
  // Should show the add button (either no suggestions or confirmed no match)
  const canAddManually = isFormValid && (suggestions.length === 0 || confirmedNoMatch);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold">Add Card Manually</h3>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      <p className="text-sm text-muted-foreground">
        Can't find your card? Enter the details below. We'll check if it might already exist in our database.
      </p>
      
      {/* Form Fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">
            Card Name <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="e.g., Team Rocket's Mewtwo ex"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="w-full"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Set Name</label>
          <Input
            placeholder="e.g., Prismatic Evolutions"
            value={cardSet}
            onChange={(e) => setCardSet(e.target.value)}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Card Number</label>
          <Input
            placeholder="e.g., 231"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Rarity</label>
          <select
            value={cardRarity}
            onChange={(e) => setCardRarity(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            <option value="">Select Rarity...</option>
            <option value="Common">Common</option>
            <option value="Uncommon">Uncommon</option>
            <option value="Rare">Rare</option>
            <option value="Rare Holo">Rare Holo</option>
            <option value="Ultra Rare">Ultra Rare</option>
            <option value="Secret Rare">Secret Rare</option>
            <option value="Special Art Rare">Special Art Rare</option>
            <option value="Illustration Rare">Illustration Rare</option>
            <option value="Hyper Rare">Hyper Rare</option>
            <option value="Promo">Promo</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Manual Price (USD)</label>
          <Input
            type="number"
            step="0.01"
            placeholder="e.g., 25.00"
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Optional: Set a custom price for this card
          </p>
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Notes</label>
          <Input
            placeholder="Any additional notes about this card..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      
      {/* Did You Mean? Suggestions */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && !confirmedNoMatch && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-3">
                  <HelpCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">Did you mean one of these cards?</h4>
                    <p className="text-sm text-amber-700">
                      We found similar cards in our database. Click one to add it instead, or confirm this is a different card.
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {suggestions.map((card, index) => (
                    <motion.div
                      key={card.id || index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-2 bg-white rounded-lg border border-amber-200 hover:border-amber-400 cursor-pointer transition-colors"
                      onClick={() => handleSelectSuggestion(card)}
                    >
                      {card.image ? (
                        <img 
                          src={card.image} 
                          alt={card.name}
                          className="w-12 h-16 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center">
                          <Search className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{card.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {card.set} {card.number && `#${card.number}`}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="flex-shrink-0">
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </motion.div>
                  ))}
                </div>
                
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleConfirmManualEntry}
                    className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    None of these - Continue with manual entry
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Loading State */}
      {loadingSuggestions && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
          Checking for similar cards...
        </div>
      )}
      
      {/* No Matches Found */}
      {!loadingSuggestions && suggestions.length === 0 && searchQuery.length >= 3 && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-sm text-green-700">
            No similar cards found in our database. You can safely add this as a new card.
          </span>
        </div>
      )}
      
      {/* Confirmed Manual Entry */}
      {confirmedNoMatch && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-blue-600" />
          <span className="text-sm text-blue-700">
            You've confirmed this is a unique card not in our database. Click below to add it.
          </span>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleAddManualCard}
          disabled={!canAddManually}
          className={isVendor ? "bg-green-600 hover:bg-green-700" : "bg-purple-600 hover:bg-purple-700"}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add to {isVendor ? "Inventory" : "Collection"}
        </Button>
      </div>
      
      {/* Help Text */}
      {!canAddManually && suggestions.length > 0 && !confirmedNoMatch && (
        <p className="text-xs text-center text-muted-foreground">
          Please select a suggested card above or confirm it's a unique card to enable manual entry.
        </p>
      )}
    </div>
  );
}

/**
 * ManualCardModal - Modal wrapper for ManualCardEntry
 */
export function ManualCardModal({ 
  isOpen, 
  onClose, 
  onAddCard, 
  initialQuery = "",
  mode = "collector" 
}) {
  if (!isOpen) return null;
  
  const handleAddCard = (card, options) => {
    onAddCard?.(card, options);
    onClose?.();
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background rounded-2xl shadow-xl p-6 mx-4"
      >
        <ManualCardEntry
          onAddCard={handleAddCard}
          onCancel={onClose}
          initialQuery={initialQuery}
          mode={mode}
        />
      </motion.div>
    </div>
  );
}

export default ManualCardEntry;

