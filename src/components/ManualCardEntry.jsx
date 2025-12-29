import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Search, Plus, X, Check, HelpCircle, Upload, Image as ImageIcon, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { findFuzzyMatches } from "@/utils/searchHelpers";
import { apiSearchCardsHybrid } from "@/utils/apiHelpers";
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useApp } from '@/contexts/AppContext';

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
  const { user } = useApp();
  const isVendor = mode === "vendor";
  
  // Form state
  const [cardName, setCardName] = useState(initialQuery);
  const [cardSet, setCardSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardRarity, setCardRarity] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [notes, setNotes] = useState("");
  
  // Graded card state
  const [isGraded, setIsGraded] = useState(false);
  const [gradingCompany, setGradingCompany] = useState("PSA");
  const [grade, setGrade] = useState("");
  const [gradedPrice, setGradedPrice] = useState("");
  
  // Grading companies list
  const GRADING_COMPANIES = [
    { value: 'PSA', label: 'PSA' },
    { value: 'CGC', label: 'CGC' },
    { value: 'BGS', label: 'BGS (Beckett)' },
    { value: 'SGC', label: 'SGC' },
    { value: 'ACE', label: 'ACE' },
    { value: 'Other', label: 'Other' },
  ];
  
  // Common grades
  const GRADE_OPTIONS = ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5', '4', '3', '2', '1'];
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
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
  
  // Image validation and selection
  const validateAndSetImage = useCallback((file) => {
    if (!file) return false;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file (JPG, PNG, WebP)');
      return false;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be less than 5MB');
      return false;
    }
    
    setImageError('');
    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    return true;
  }, []);
  
  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    validateAndSetImage(file);
  }, [validateAndSetImage]);
  
  const handleImageDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleImageDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  
  const handleImageDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  const handleImageDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetImage(files[0]);
    }
  }, [validateAndSetImage]);
  
  const clearImage = useCallback(() => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageError('');
  }, []);
  
  // Upload image to Firebase Storage
  const uploadImageToStorage = useCallback(async (file, cardId) => {
    if (!file || !user) return null;
    
    try {
      const storage = getStorage();
      const timestamp = Date.now();
      const sanitizedName = cardName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'card';
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const filename = `manual-cards/${user.uid}/${sanitizedName}-${timestamp}.${fileExtension}`;
      const storageRef = ref(storage, filename);
      
      console.log('📤 Uploading manual card image...');
      
      const metadata = {
        contentType: file.type,
        customMetadata: {
          uploadedBy: user.uid,
          cardName: cardName,
          isManualEntry: 'true',
        }
      };
      
      const snapshot = await uploadBytes(storageRef, file, metadata);
      const imageUrl = await getDownloadURL(snapshot.ref);
      
      console.log('✅ Manual card image uploaded:', imageUrl);
      return imageUrl;
    } catch (error) {
      console.error('❌ Image upload failed:', error);
      throw error;
    }
  }, [user, cardName]);
  
  // Handle adding the manual card
  const handleAddManualCard = useCallback(async () => {
    if (!cardName.trim()) {
      alert("Please enter a card name");
      return;
    }
    
    const cardId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let imageUrl = null;
    
    // Upload image if selected
    if (selectedImage) {
      setUploadingImage(true);
      try {
        imageUrl = await uploadImageToStorage(selectedImage, cardId);
      } catch (error) {
        setImageError('Failed to upload image. Card will be added without image.');
        console.error('Image upload failed:', error);
      } finally {
        setUploadingImage(false);
      }
    }
    
    const manualCard = {
      id: cardId,
      name: cardName.trim(),
      set: cardSet.trim() || "Unknown Set",
      number: cardNumber.trim() || "N/A",
      rarity: cardRarity.trim() || "Unknown",
      isManualEntry: true,
      manualPrice: manualPrice ? parseFloat(manualPrice) : null,
      notes: notes.trim() || null,
      image: imageUrl, // Include uploaded image URL
      createdAt: Date.now(),
      // Graded card fields
      isGraded: isGraded,
      gradingCompany: isGraded ? gradingCompany : null,
      grade: isGraded && grade ? parseFloat(grade) : null,
      gradedPrice: isGraded && gradedPrice ? parseFloat(gradedPrice) : null,
    };
    
    if (onAddCard) {
      onAddCard(manualCard, { fromSuggestion: false, isManual: true });
    }
  }, [cardName, cardSet, cardNumber, cardRarity, manualPrice, notes, selectedImage, uploadImageToStorage, onAddCard, isGraded, gradingCompany, grade, gradedPrice]);
  
  // Check if form is valid
  const isFormValid = cardName.trim().length > 0 && (!isGraded || grade !== "");
  
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
        
        {/* Graded Card Section */}
        <div className="md:col-span-2 border rounded-lg p-4 bg-gray-50">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isGraded}
              onChange={(e) => {
                setIsGraded(e.target.checked);
                if (!e.target.checked) {
                  setGrade("");
                  setGradedPrice("");
                }
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium">🏆 This is a graded card</span>
          </label>
          
          {isGraded && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Grading Company <span className="text-red-500">*</span>
                </label>
                <select
                  value={gradingCompany}
                  onChange={(e) => setGradingCompany(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  {GRADING_COMPANIES.map(company => (
                    <option key={company.value} value={company.value}>
                      {company.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Grade <span className="text-red-500">*</span>
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  required={isGraded}
                >
                  <option value="">Select Grade...</option>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Graded Value (USD)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 500.00"
                  value={gradedPrice}
                  onChange={(e) => setGradedPrice(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the graded card's value
                </p>
              </div>
            </div>
          )}
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
        
        {/* Image Upload Section */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">
            <div className="flex items-center gap-1">
              <ImageIcon className="h-4 w-4" />
              Card Image (Optional)
            </div>
          </label>
          
          {!imagePreview ? (
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                isDragging 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'
              }`}
              onDragEnter={handleImageDragEnter}
              onDragOver={handleImageDragOver}
              onDragLeave={handleImageDragLeave}
              onDrop={handleImageDrop}
              onClick={() => document.getElementById('manual-card-image-upload')?.click()}
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                id="manual-card-image-upload"
              />
              <Upload className={`h-8 w-8 mx-auto mb-2 ${isDragging ? 'text-purple-500' : 'text-gray-400'}`} />
              <p className="text-sm font-medium">
                {isDragging ? 'Drop image here' : 'Click or drag to upload'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG or WebP (max 5MB)
              </p>
            </div>
          ) : (
            <div className="relative border rounded-lg p-2 bg-gray-50">
              <div className="flex items-center gap-3">
                <img 
                  src={imagePreview} 
                  alt="Card preview"
                  className="w-16 h-22 object-cover rounded border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-600 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    Image selected
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedImage?.name}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearImage}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          
          {imageError && (
            <p className="text-xs text-red-500 mt-1">{imageError}</p>
          )}
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
          disabled={!canAddManually || uploadingImage}
          className={isVendor ? "bg-green-600 hover:bg-green-700" : "bg-purple-600 hover:bg-purple-700"}
        >
          {uploadingImage ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Uploading...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Add to {isVendor ? "Inventory" : "Collection"}
            </>
          )}
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

