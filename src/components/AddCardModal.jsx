import { useState, useEffect, useMemo } from 'react';
import { X, Star, Globe, Award, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { useApp } from '@/contexts/AppContext';
import { convertCurrency, formatCurrency } from '@/utils/cardHelpers';
import { apiFetchGradedPrices, apiFetchMarketPrices, getEmbeddedGradedPrices } from '@/utils/apiHelpers';
import { ConsignmentFields } from './ConsignmentFields';
import {
  DEFAULT_CONSIGNOR_PCT,
  buildConsignmentPayload,
} from '@/utils/consignmentHelpers';

/**
 * AddCardModal - v2.1
 * Comprehensive modal for adding cards with:
 * - Variants (Holo, Reverse Holo, 1st Edition, etc.)
 * - Graded card support (PSA, BGS, CGC)
 * - Japanese card support
 */

const VARIANT_OPTIONS = [
  { value: '', label: 'Not Specified' },
  { value: 'regular-holo', label: 'Regular Holo' },
  { value: 'reverse-holo', label: 'Reverse Holo' },
  { value: '1st-edition', label: '1st Edition' },
  { value: 'shadowless', label: 'Shadowless' },
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'promo', label: 'Promo' },
  { value: 'full-art', label: 'Full Art' },
  { value: 'secret-rare', label: 'Secret Rare' },
  { value: 'alt-art', label: 'Alternate Art' },
  { value: 'other', label: 'Other' },
];

const GRADING_COMPANIES = [
  { value: '', label: 'Not Graded' },
  { value: 'PSA', label: 'PSA' },
  { value: 'BGS', label: 'BGS (Beckett)' },
  { value: 'CGC', label: 'CGC' },
  { value: 'SGC', label: 'SGC' },
  { value: 'ACE', label: 'ACE' },
  { value: 'Other', label: 'Other' },
];

const formatProviderPrice = (value, providerCurrency) =>
  Number(value) > 0 ? formatCurrency(Number(value), providerCurrency || 'USD') : '–';

const GRADES = ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6', '5', '4', '3', '2', '1'];

// Auto-detect language based on card data (Japanese cards have different set names/numbers)
// Users should search for the specific card variant rather than manually selecting language
const LANGUAGES = [
  { value: 'English', label: '🇺🇸 English', flag: '🇺🇸' },
  { value: 'Japanese', label: '🇯🇵 Japanese', flag: '🇯🇵' },
];

export function AddCardModal({ 
  isOpen, 
  onClose, 
  card, 
  defaultCondition = 'NM',
  onAdd,
  mode = 'collector' // 'collector' or 'vendor'
}) {
  const { currency, userProfile } = useApp(); // Get user's selected currency and market preference
  const [condition, setCondition] = useState(defaultCondition);
  const [quantity, setQuantity] = useState(1);
  
  // Market prices (fetched on-demand)
  const [marketPrices, setMarketPrices] = useState(null); // { us: {...}, eu: {...} }
  const [fetchingMarketPrices, setFetchingMarketPrices] = useState(false);
  
  // Variant fields (v2.1)
  const [variant] = useState('');
  const [variantOther] = useState('');
  
  // Graded fields (v2.1)
  const [isGraded, setIsGraded] = useState(false);
  const [gradingCompany, setGradingCompany] = useState('PSA'); // Default to PSA
  const [grade, setGrade] = useState('');
  const [gradedPrice, setGradedPrice] = useState(''); // Stored in USD
  const [gradedPriceUSD, setGradedPriceUSD] = useState(''); // Raw USD value for calculations
  const [fetchingGradedPrice, setFetchingGradedPrice] = useState(false);
  
  // v2.1: Dynamic grade filtering - only show grades with available prices
  const [availableGrades, setAvailableGrades] = useState(null); // null = not fetched yet, {} = fetched
  const [fetchingAvailableGrades, setFetchingAvailableGrades] = useState(false);
  
  // Auto-detect language based on card data
  const detectLanguage = (card) => {
    if (!card) return 'English';
    
    const setName = (card.set || '').toLowerCase();

    
    // Japanese set indicators
    const japaneseSetKeywords = [
      'japanese',
      'japan',
      'プロモ',
      'expansion pack',
      'gym challenge japanese',
      'gym heroes japanese',
      'neo genesis japanese',
      'neo discovery japanese',
      'neo revelation japanese',
      'neo destiny japanese'
    ];
    
    // Check if set name contains Japanese keywords
    const isJapanese = japaneseSetKeywords.some(keyword => setName.includes(keyword));
    
    return isJapanese ? 'Japanese' : 'English';
  };

  // Language fields (v2.1) - Auto-detected, user can override if needed
  const [language, setLanguage] = useState(() => detectLanguage(card));
  const [manualPrice, setManualPrice] = useState('');
  
  // Vendor-specific fields
  const [buyPrice, setBuyPrice] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  
  const [notes, setNotes] = useState('');

  // Consignment state (vendor-only)
  const [consignment, setConsignment] = useState({
    isConsigned: false,
    consignorId: null,
    consignorName: '',
    consignorContact: '',
    consignorPct: DEFAULT_CONSIGNOR_PCT,
    consignorMinimumPrice: null,
    agreementNotes: '',
  });
  
  // Update language when card changes
  useEffect(() => {
    if (card) {
      const detectedLanguage = detectLanguage(card);
      setLanguage(detectedLanguage);
    }
  }, [card]);

  // Fetch market prices on-demand when modal opens with a card
  useEffect(() => {
    if (!card || !isOpen) return;
    
    const fetchPrices = async () => {
      setFetchingMarketPrices(true);
      try {
        console.log('💰 Fetching on-demand market prices for:', card.name);
        const prices = await apiFetchMarketPrices(card);
        setMarketPrices(prices);
        console.log('✅ Market prices loaded:', prices);
      } catch (error) {
        console.error('❌ Failed to fetch market prices:', error);
        setMarketPrices(null);
      } finally {
        setFetchingMarketPrices(false);
      }
    };
    
    fetchPrices();
  }, [card, isOpen]);

  // Fetch available grades when grading company changes (v2.1)
  useEffect(() => {
    if (!isGraded || !gradingCompany || !card) return;
    
    // Reset when company changes
    setAvailableGrades(null);
    setGrade('');
    
    const fetchAvailableGrades = async () => {
      setFetchingAvailableGrades(true);
      try {
        const embedded = getEmbeddedGradedPrices(card, gradingCompany);
        const available = Object.fromEntries(
          Object.entries(embedded).map(([gradeKey, value]) => [gradeKey, value.price]),
        );
        setAvailableGrades(Object.keys(available).length > 0 ? available : null);
      } catch (error) {
        console.error('❌ Error fetching available grades:', error);
        // On error, show all grades (fallback)
        setAvailableGrades(null);
      } finally {
        setFetchingAvailableGrades(false);
      }
    };
    
    fetchAvailableGrades();
  }, [isGraded, gradingCompany, card]);

  // Filter grade options based on availability (v2.1)
  const availableGradeOptions = useMemo(() => {
    // If we haven't fetched yet or error occurred, show all grades
    if (availableGrades === null) {
      return GRADES;
    }
    
    // If we fetched but no grades available, show all with warning
    if (Object.keys(availableGrades).length === 0) {
      return GRADES;
    }
    
    // Show only available grades
    return GRADES.filter(g => Object.prototype.hasOwnProperty.call(availableGrades, g));
  }, [availableGrades]);

  // Smart variant filtering based on card set


  // Resolve graded price from verified provider data when grade is selected.
  useEffect(() => {
    if (!isGraded || !gradingCompany || !grade || !card) return;
    
    const fetchGradedPrice = async () => {
      setFetchingGradedPrice(true);
      try {
        const data = await apiFetchGradedPrices(card, gradingCompany, grade);
        
        if (!data.success || !data.graded) {
          console.warn('⚠️ No graded price data found');
          setGradedPrice('');
          setGradedPriceUSD('');
          return;
        }
        
        const priceUSD = convertCurrency(
          data.graded.price,
          'USD',
          data.graded.currency || 'USD',
        );
        
        if (priceUSD && priceUSD > 0) {
          const priceConverted = convertCurrency(priceUSD, currency || 'USD');
          console.log(`✅ Found ${gradingCompany} ${grade} price: $${priceUSD} → ${formatCurrency(priceConverted, currency)}`);
          setGradedPriceUSD(priceUSD.toFixed(2));
          setGradedPrice(priceConverted.toFixed(2));
        } else {
          console.warn(`⚠️ No ${gradingCompany} ${grade} price found (price is 0 or null)`);
          setGradedPrice('');
          setGradedPriceUSD('');
        }
      } catch (error) {
        console.error('❌ Error fetching graded price:', error);
        setGradedPrice('');
        setGradedPriceUSD('');
      } finally {
        setFetchingGradedPrice(false);
      }
    };
    
    // Debounce the fetch
    const timer = setTimeout(fetchGradedPrice, 500);
    return () => clearTimeout(timer);
  }, [isGraded, gradingCompany, grade, card, currency]);

  if (!isOpen || !card) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Build card data with v2.1 fields
    const cardData = {
      ...card,
      condition,
      quantity: parseInt(quantity) || 1,
      notes: notes.trim(),
      
      // Variant info (v2.1)
      variant: variant === 'other' ? variantOther : variant,
      variantSource: variant ? 'user-specified' : null,
      
      // Graded info (v2.1)
      isGraded,
      gradingCompany: isGraded ? gradingCompany : null,
      grade: isGraded ? parseFloat(grade) : null,
      gradedPrice: isGraded && gradedPriceUSD ? parseFloat(gradedPriceUSD) : null, // Store USD value
      
      // Language info (v2.1)
      language,
      isJapanese: language === 'Japanese',
      manualPrice: manualPrice ? parseFloat(manualPrice) : null,
    };
    
    // Add vendor-specific pricing
    if (mode === 'vendor') {
      cardData.buyPrice = buyPrice ? parseFloat(buyPrice) : null;
      cardData.tradePrice = tradePrice ? parseFloat(tradePrice) : null;
      cardData.sellPrice = sellPrice ? parseFloat(sellPrice) : null;

      if (consignment.isConsigned) {
        if (!consignment.consignorName.trim()) {
          alert('Please select or create a consignor for this consigned item.');
          return;
        }
        cardData.isConsigned = true;
        cardData.acquiredVia = 'consigned';
        cardData.consignment = buildConsignmentPayload(consignment);
      }
    }

    onAdd(cardData);
    onClose();
  };

  const isJapanese = language === 'Japanese';

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <Card 
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Add to {mode === 'vendor' ? 'Inventory' : 'Collection'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {card.name} - {card.set} #{card.number}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Condition <span className="text-red-500">*</span>
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  required
                >
                  <option value="NM">Near Mint</option>
                  <option value="LP">Lightly Played</option>
                  <option value="MP">Moderately Played</option>
                  <option value="HP">Heavily Played</option>
                  <option value="DMG">Damaged</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Language (v2.1) - Auto-detected */}
            <div>
              <label className="block text-sm font-semibold mb-2">
                <Globe className="inline h-4 w-4 mr-1" />
                Language <span className="text-green-600 text-xs">(Auto-detected)</span>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-2 border rounded-md bg-gray-50"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                ℹ️ Language is auto-detected from card data. Japanese cards have different set names and card numbers (e.g., #221 English vs #57 Japanese).
              </p>
              {isJapanese && (
                <p className="text-xs text-blue-600 mt-1">
                  💡 Japanese cards may require manual pricing
                </p>
              )}
            </div>

            {/* Market Prices (Fetched On-Demand) */}
            {!isGraded && (
              <div className="border rounded-md p-4 bg-gray-50">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  💰 Market Prices
                  {fetchingMarketPrices && <Loader2 className="h-4 w-4 animate-spin" />}
                </h3>
                
                {fetchingMarketPrices && (
                  <p className="text-sm text-muted-foreground">Fetching latest prices...</p>
                )}
                
                {!fetchingMarketPrices && marketPrices && (
                  <div className="space-y-3">
                    {/* Collector Mode: Show based on user preference */}
                    {mode === 'collector' && (
                      <div>
                        {userProfile?.market === 'cardmarket' ? (
                          // Show EU prices (CardMarket)
                          marketPrices.eu?.found ? (
                            <div className="bg-white p-3 rounded border border-blue-200">
                              <p className="text-xs font-semibold text-blue-600 mb-2">🇪🇺 European Market (CardMarket)</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Average:</span>
                                  <span className="ml-2 font-semibold">{formatProviderPrice(marketPrices.eu.avg, marketPrices.eu.currency || 'EUR')}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Low:</span>
                                  <span className="ml-2 font-semibold">{formatProviderPrice(marketPrices.eu.low, marketPrices.eu.currency || 'EUR')}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-yellow-600">⚠️ CardMarket pricing not available for this card</p>
                          )
                        ) : (
                          // Show US prices (TCGPlayer) - DEFAULT
                          marketPrices.us?.found ? (
                            <div className="bg-white p-3 rounded border border-green-200">
                              <p className="text-xs font-semibold mb-2 text-green-600">🇺🇸 US Market (TCGPlayer)</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Market:</span>
                                  <span className="ml-2 font-semibold">{formatProviderPrice(marketPrices.us.market, marketPrices.us.currency)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Low:</span>
                                  <span className="ml-2 font-semibold">{formatProviderPrice(marketPrices.us.low, marketPrices.us.currency)}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-yellow-600">⚠️ TCGPlayer pricing not available for this card</p>
                          )
                        )}
                      </div>
                    )}
                    
                    {/* Vendor Mode: Show BOTH markets */}
                    {mode === 'vendor' && (
                      <div className="space-y-2">
                        {marketPrices.us?.found && (
                          <div className="bg-white p-3 rounded border border-green-200">
                            <p className="text-xs font-semibold mb-2 text-green-600">🇺🇸 US Market (TCGPlayer)</p>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Market:</span>
                                <span className="ml-1 font-semibold">{formatProviderPrice(marketPrices.us.market, marketPrices.us.currency)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Low:</span>
                                <span className="ml-1 font-semibold">{formatProviderPrice(marketPrices.us.low, marketPrices.us.currency)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Mid:</span>
                                <span className="ml-1 font-semibold">{formatProviderPrice(marketPrices.us.mid, marketPrices.us.currency)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {marketPrices.eu?.found && (
                          <div className="bg-white p-3 rounded border border-blue-200">
                            <p className="text-xs font-semibold text-blue-600 mb-2">🇪🇺 European Market (CardMarket)</p>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Average:</span>
                                <span className="ml-1 font-semibold">{formatProviderPrice(marketPrices.eu.avg, marketPrices.eu.currency || 'EUR')}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Low:</span>
                                <span className="ml-1 font-semibold">{formatProviderPrice(marketPrices.eu.low, marketPrices.eu.currency || 'EUR')}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Trend:</span>
                                <span className="ml-1 font-semibold">{formatProviderPrice(marketPrices.eu.trend, marketPrices.eu.currency || 'EUR')}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {!marketPrices.us?.found && !marketPrices.eu?.found && (
                          <p className="text-sm text-yellow-600">⚠️ No market pricing available for this card</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {!fetchingMarketPrices && !marketPrices && (
                  <p className="text-sm text-red-600">❌ Failed to fetch market prices</p>
                )}
              </div>
            )}



            {/* Graded Card Support (v2.1) - PSA, BGS, CGC, SGC */}
            <div className="border-t pt-4">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={isGraded}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsGraded(checked);
                    if (!checked) {
                      setGradingCompany('');
                      setGradedPrice('');
                      setGradedPriceUSD('');
                    }
                  }}
                  className="w-4 h-4"
                />
                <Award className="h-4 w-4" />
                <span className="font-semibold">
                  Graded Card <span className="text-blue-600 text-xs">NEW in v2.1</span>
                </span>
              </label>

              {isGraded && (
                <div className="space-y-4 pl-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2">
                        Grading Company <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={gradingCompany}
                        onChange={(e) => setGradingCompany(e.target.value)}
                        className="w-full p-2 border rounded-md"
                        required={isGraded}
                      >
                        {GRADING_COMPANIES.map(company => (
                          <option key={company.value} value={company.value}>
                            {company.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        💡 All companies support grade 10 auto-pricing
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2">
                        Grade <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="w-full p-2 border rounded-md"
                        required={isGraded}
                        disabled={fetchingAvailableGrades}
                      >
                        <option value="">
                          {fetchingAvailableGrades ? 'Loading grades...' : 'Select grade'}
                        </option>
                        {availableGradeOptions.map(g => (
                          <option key={g} value={g}>
                            {g}
                            {availableGrades && availableGrades[g] ? ` ($${availableGrades[g].toFixed(2)})` : ''}
                          </option>
                        ))}
                      </select>
                      {availableGrades && Object.keys(availableGrades).length > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          ✅ Showing {Object.keys(availableGrades).length} grade(s) with available pricing
                        </p>
                      )}
                      {availableGrades && Object.keys(availableGrades).length === 0 && (
                        <p className="text-xs text-yellow-600 mt-1">
                          ⚠️ No {gradingCompany} pricing found for this card
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">
                      Graded Price ({currency || 'USD'}) {gradedPrice && '(Auto-fetched)'}
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Fetching price..."
                        value={gradedPrice}
                        onChange={(e) => {
                          setGradedPrice(e.target.value);
                          setGradedPriceUSD(e.target.value); // If manually entered, assume USD
                        }}
                        disabled={fetchingGradedPrice}
                        className={gradedPrice ? 'border-green-500 bg-green-50' : ''}
                      />
                      {fetchingGradedPrice && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        </div>
                      )}
                    </div>
                    {grade && gradedPrice && gradingCompany && (
                      <p className="text-xs text-green-600 mt-1">
                        ✅ {gradingCompany} {grade} price: {formatCurrency(gradedPrice, currency || 'USD')}
                      </p>
                    )}
                    {grade && gradingCompany && !gradedPrice && !fetchingGradedPrice && (
                      <p className="text-xs text-yellow-600 mt-1">
                        ⚠️ No {gradingCompany} {grade} sales data found. Price may need to be entered manually.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Manual Price Override - Only for vendors or when pricing is problematic */}
            {(mode === 'vendor' || (isJapanese || (isGraded && !gradedPrice))) && (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Manual Price Override (Optional) {mode === 'vendor' && '(Vendor)'}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={mode === 'vendor' ? 'Set custom vendor price' : 'Override API price'}
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {mode === 'vendor' 
                    ? '💡 Vendors can set custom prices for their inventory'
                    : '💡 Use this if API doesn\'t have accurate pricing for this card'
                  }
                </p>
              </div>
            )}

            {/* Vendor-specific pricing */}
            {mode === 'vendor' && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Vendor Pricing</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Buy Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="What you paid"
                      value={buyPrice}
                      onChange={(e) => setBuyPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Trade Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Trade value"
                      value={tradePrice}
                      onChange={(e) => setTradePrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Sell Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Your price"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Consignment (vendor only) */}
            {mode === 'vendor' && (
              <ConsignmentFields
                value={consignment}
                onChange={setConsignment}
                previewPrice={sellPrice || manualPrice}
                previewCurrency={currency}
              />
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes (e.g., 'Beautiful centering', 'Minor whitening')"
                className="w-full p-2 border rounded-md min-h-[80px]"
                rows="3"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Add to {mode === 'vendor' ? 'Inventory' : 'Collection'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
