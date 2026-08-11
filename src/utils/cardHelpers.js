/**
 * Card pricing and condition helpers
 * Extracted from App.jsx for reusability
 */

import { doc, setDoc, collection as fsCollection } from "firebase/firestore";
import { buildTaxReadyTransaction } from "./transactionHelpers";

// =============================
// Constants
// =============================

export const DEFAULT_CURRENCY = "EUR";

export const SUPPORTED_CURRENCIES = [
  { code: "EUR", name: "Euro (€)", symbol: "€" },
  { code: "USD", name: "US Dollar ($)", symbol: "$" },
  { code: "GBP", name: "British Pound (£)", symbol: "£" },
  { code: "SEK", name: "Swedish Krona (kr)", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone (kr)", symbol: "kr" },
  { code: "DKK", name: "Danish Krone (kr)", symbol: "kr" },
  { code: "ISK", name: "Icelandic Króna (kr)", symbol: "kr" },
];
export const SEARCH_DEBOUNCE_MS = 500;
export const DEFAULT_SUGGESTION_LIMIT = 5;
export const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

export const CONDITION_MULTIPLIER = {
  NM: 1,
  LP: 0.9,
  MP: 0.8,
  HP: 0.6,
  DMG: 0.4,
};

export const CONDITION_LABEL_TO_CODE = {
  "NEAR MINT": "NM",
  "NEAR-MINT": "NM",
  NM: "NM",
  "LIGHTLY PLAYED": "LP",
  "LIGHT PLAY": "LP",
  LP: "LP",
  "MODERATELY PLAYED": "MP",
  "MOD PLAYED": "MP",
  MP: "MP",
  "HEAVILY PLAYED": "HP",
  "HEAVY PLAY": "HP",
  HP: "HP",
  DAMAGED: "DMG",
  DMG: "DMG",
};

export const CONDITION_DISPLAY_ORDER = ["NM", "LP", "MP", "HP", "DMG"];

// TCGPlayer to Cardmarket condition mapping
// Used for displaying conditions to European viewers
export const TCG_TO_CARDMARKET_CONDITION = {
  "Mint": "Mint",
  "Near Mint": "Near Mint",
  "NM": "Near Mint",
  "Lightly Played": "Excellent",
  "LP": "Excellent",
  "Moderately Played": "Good",
  "MP": "Good",
  "Heavily Played": "Played",
  "HP": "Played",
  "Damaged": "Poor",
  "DMG": "Poor",
};

// Cardmarket to TCGPlayer condition mapping (reverse)
export const CARDMARKET_TO_TCG_CONDITION = {
  "Mint": "Mint",
  "Near Mint": "Near Mint",
  "Excellent": "Lightly Played",
  "Good": "Moderately Played",
  "Played": "Heavily Played",
  "Poor": "Damaged",
};

// European country codes (for IP-based detection fallback)
export const EUROPEAN_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', // EU
  'NO', 'IS', 'CH', 'LI', 'GB', 'UK', // Non-EU European
];

// European timezones for detection
export const EUROPEAN_TIMEZONES = [
  'Europe/', 'Atlantic/Reykjavik', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Madeira',
];

/**
 * Detect if viewer is likely in Europe based on timezone
 * This is a client-side heuristic - more reliable than IP for browser detection
 */
export function isViewerInEurope() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return EUROPEAN_TIMEZONES.some(tz => timezone.startsWith(tz));
  } catch {
    // Fallback: check locale
    try {
      const locale = navigator.language || navigator.userLanguage || '';
      const countryCode = locale.split('-')[1]?.toUpperCase();
      return countryCode && EUROPEAN_COUNTRIES.includes(countryCode);
    } catch {
      return false;
    }
  }
}

/**
 * Get the display label for a condition based on viewer's region
 * @param {string} condition - The condition code or TCG label (e.g., "NM", "LP", "Near Mint")
 * @param {boolean} forEurope - Whether to use Cardmarket labels (default: auto-detect)
 * @returns {string} The display label appropriate for the viewer's region
 */
export function getConditionDisplayLabel(condition, forEurope = null) {
  // Auto-detect if not specified
  const useEuropeanLabels = forEurope !== null ? forEurope : isViewerInEurope();
  
  if (!condition) return useEuropeanLabels ? "Near Mint" : "Near Mint";
  
  // Normalize the condition input
  const normalizedCondition = condition.trim();
  
  // If using European labels, convert TCG -> Cardmarket
  if (useEuropeanLabels) {
    // Check if it's already a Cardmarket label
    if (CARDMARKET_TO_TCG_CONDITION[normalizedCondition]) {
      return normalizedCondition; // Already in Cardmarket format
    }
    // Convert from TCG to Cardmarket
    return TCG_TO_CARDMARKET_CONDITION[normalizedCondition] || 
           TCG_TO_CARDMARKET_CONDITION[normalizedCondition.toUpperCase()] ||
           normalizedCondition;
  }
  
  // Using TCG labels (non-European)
  // Check if it's a Cardmarket label that needs conversion
  if (CARDMARKET_TO_TCG_CONDITION[normalizedCondition] && !TCG_TO_CARDMARKET_CONDITION[normalizedCondition]) {
    return CARDMARKET_TO_TCG_CONDITION[normalizedCondition];
  }
  
  // Expand short codes to full TCG names for display
  const codeToFullTCG = {
    "NM": "Near Mint",
    "LP": "Lightly Played",
    "MP": "Moderately Played", 
    "HP": "Heavily Played",
    "DMG": "Damaged",
  };
  
  return codeToFullTCG[normalizedCondition.toUpperCase()] || normalizedCondition;
}

export const CONDITION_STYLES = {
  NM: {
    badge: "border border-emerald-300 bg-emerald-100 text-emerald-700 shadow-sm",
    select: "border border-emerald-300 bg-emerald-50 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/40",
  },
  LP: {
    badge: "border border-lime-300 bg-lime-100 text-lime-700 shadow-sm",
    select: "border border-lime-300 bg-lime-50 text-lime-700 focus:border-lime-500 focus:ring-lime-500/40",
  },
  MP: {
    badge: "border border-amber-300 bg-amber-100 text-amber-700 shadow-sm",
    select: "border border-amber-300 bg-amber-50 text-amber-700 focus:border-amber-500 focus:ring-amber-500/40",
  },
  HP: {
    badge: "border border-orange-300 bg-orange-100 text-orange-700 shadow-sm",
    select: "border border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-500 focus:ring-orange-500/40",
  },
  DMG: {
    badge: "border border-red-300 bg-red-100 text-red-700 shadow-sm",
    select: "border border-red-300 bg-red-50 text-red-700 focus:border-red-500 focus:ring-red-500/40",
  },
};

// =============================
// Condition Helpers
// =============================

export function getConditionMultiplier(condition = "NM") {
  return CONDITION_MULTIPLIER[condition] ?? 1;
}

export function conditionLabelToCode(label) {
  if (!label) return null;
  const key = String(label).trim().toUpperCase();
  return CONDITION_LABEL_TO_CODE[key] ?? null;
}

export function conditionCodeToLabel(code) {
  switch ((code || "").toUpperCase()) {
    case "NM":
      return "Near Mint";
    case "LP":
      return "Lightly Played";
    case "MP":
      return "Moderately Played";
    case "HP":
      return "Heavily Played";
    case "DMG":
      return "Damaged";
    default:
      return "Unknown";
  }
}

export function getConditionColorClass(condition) {
  const cond = (condition || "NM").toUpperCase();
  if (cond === "NM") return "text-green-600 bg-green-50 border-green-200";
  if (cond === "LP") return "text-lime-600 bg-lime-50 border-lime-200";
  if (cond === "MP") return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (cond === "HP") return "text-orange-600 bg-orange-50 border-orange-200";
  if (cond === "DMG") return "text-red-600 bg-red-50 border-red-200";
  return "text-gray-600 bg-gray-50 border-gray-200";
}

// =============================
// Currency Helpers
// =============================

export function getCurrencySymbol(currency) {
  switch ((currency || "").toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "AUD":
      return "A$";
    case "CAD":
      return "C$";
    case "JPY":
      return "¥";
    default:
      return currency ? `${currency} ` : "";
  }
}

export function formatCurrency(n, currency = DEFAULT_CURRENCY) {
  if (n == null || Number.isNaN(Number(n))) return "–";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
    }).format(Number(n));
  } catch {
    const symbol = getCurrencySymbol(currency || DEFAULT_CURRENCY);
    return `${symbol}${Number(n).toFixed(2)}`;
  }
}

// Dynamic FX rates (cached, refreshed every 24 hours)
let FX_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  SEK: 10.5,
  NOK: 10.8,
  DKK: 6.9,
  ISK: 138.0,
};
let FX_LAST_FETCH = 0;
const FX_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Fetch live FX rates from free API
async function fetchFXRates() {
  try {
    const now = Date.now();
    if (now - FX_LAST_FETCH < FX_CACHE_DURATION) {
      return FX_RATES; // Use cached rates
    }

    if (import.meta.env.DEV) console.log('🌐 Fetching live FX rates...');
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    if (data && data.rates) {
      FX_RATES = {
        USD: 1.0,
        EUR: data.rates.EUR || 0.92,
        GBP: data.rates.GBP || 0.79,
        SEK: data.rates.SEK || 10.5,
        NOK: data.rates.NOK || 10.8,
        DKK: data.rates.DKK || 6.9,
        ISK: data.rates.ISK || 138.0,
      };
      FX_LAST_FETCH = now;
      if (import.meta.env.DEV) console.log('✅ FX rates updated:', FX_RATES);
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch FX rates, using cached/fallback rates:', error);
  }
  return FX_RATES;
}

export function convertCurrency(amount, targetCurrency = 'USD', sourceCurrency = 'USD') {
  if (!amount || isNaN(amount)) return 0;
  if (targetCurrency === sourceCurrency) return parseFloat(amount); // No conversion needed
  
  // First convert to USD if source isn't USD
  let amountInUSD = parseFloat(amount);
  if (sourceCurrency !== 'USD') {
    const sourceRate = FX_RATES[sourceCurrency] || 1.0;
    amountInUSD = amountInUSD / sourceRate; // Convert to USD
  }
  
  // Then convert from USD to target currency
  if (targetCurrency === 'USD') {
    return amountInUSD;
  }
  
  const targetRate = FX_RATES[targetCurrency] || 1.0;
  const converted = amountInUSD * targetRate;
  
  if (import.meta.env.DEV) console.log(`💱 Converting ${amount} ${sourceCurrency} to ${targetCurrency}: ${converted} (via USD: ${amountInUSD})`);
  
  return converted;
}

// Initialize FX rates on module load
fetchFXRates();

// =============================
// Card Pricing Helpers
// =============================

export function computeTcgPrice(source, condition = "NM", targetCurrency = null) {
  const base =
    Number(
      source?.prices?.tcgplayer?.market_price ??
        source?.prices?.tcgplayer?.mid_price,
    ) || 0;
  const adjusted = base * getConditionMultiplier(condition);
  if (!targetCurrency || adjusted <= 0) return adjusted;
  const sourceCurrency = source?.prices?.tcgplayer?.currency || targetCurrency || "USD";
  return convertCurrency(adjusted, targetCurrency, sourceCurrency);
}

export function getCardmarketLowest(source, condition = "NM", targetCurrency = null) {
  const cm = source?.prices?.cardmarket || {};
  const candidates = [
    cm.lowest7,
    cm.lowest_near_mint,
    cm.lowest_listing,
    cm.lowest_list,
    cm.lowest_near_mint_DE,
    cm.lowest_near_mint_FR,
    cm.lowest ?? cm.lowest_price,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0) {
      const adjusted = num * getConditionMultiplier(condition);
      return targetCurrency
        ? convertCurrency(adjusted, targetCurrency, cm.currency || targetCurrency || "EUR")
        : adjusted;
    }
  }
  const fallback =
    Number(cm.lowest) ||
    Number(cm.lowest_near_mint) ||
    Number(cm.average) ||
    0;
  const adjusted = fallback * getConditionMultiplier(condition);
  return targetCurrency && adjusted > 0
    ? convertCurrency(adjusted, targetCurrency, cm.currency || targetCurrency || "EUR")
    : adjusted;
}

export function getCardmarketAvg(source, condition = "NM", targetCurrency = null) {
  const cm = source?.prices?.cardmarket || {};
  // Try 30d average first, then fall back to 7d
  const candidates = [
    cm["30d_average"],
    cm.avg30,
    cm["30d_avg"],
    cm["30dAverage"],
    cm["avg_30"],
    cm["7d_average"],
    cm.avg7,
    cm["7d_avg"],
    cm["7dAverage"],
    cm["avg_7"],
    cm.average,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0) {
      const adjusted = num * getConditionMultiplier(condition);
      return targetCurrency
        ? convertCurrency(adjusted, targetCurrency, cm.currency || targetCurrency || "EUR")
        : adjusted;
    }
  }
  return 0;
}

export function computeSuggestedPrice({
  tcg,
  cmAvg,
  cmLowest,
  condition,
  overridePrice,
}) {
  if (overridePrice != null && !Number.isNaN(Number(overridePrice))) {
    return Number(overridePrice);
  }
  if (condition && condition !== "NM") {
    return tcg;
  }
  const cmBase = Math.max(Number(cmAvg) || 0, Number(cmLowest) || 0);
  const safeTcg = Number(tcg) || 0;
  if (cmBase <= 0 && safeTcg <= 0) return 0;
  if (cmBase <= 0) return safeTcg;
  if (safeTcg <= 0) return cmBase;
  return Math.max(cmBase, safeTcg);
}

/**
 * Build the ungraded pricing views shown throughout the app.
 *
 * Seller Ask intentionally preserves the existing suggested-price rule.
 * Selected Market follows the user's chosen data source, while Quick Sale
 * uses the lower immediately actionable market/listing benchmark.
 */
export function computeMarketValues(
  source,
  {
    condition = "NM",
    targetCurrency = DEFAULT_CURRENCY,
    marketSource = "cardmarket",
    overridePrice,
  } = {},
) {
  const tcg = computeTcgPrice(source, condition, targetCurrency) || 0;
  const cmAvg = getCardmarketAvg(source, condition, targetCurrency) || 0;
  const cmLowest = getCardmarketLowest(source, condition, targetCurrency) || 0;
  let normalizedOverride = overridePrice;
  if (normalizedOverride == null) {
    const storedOverride = source?.overridePrice ?? source?.manualPrice ?? source?.customPrice;
    if (storedOverride != null && !Number.isNaN(Number(storedOverride))) {
      const storedCurrency = source?.overridePrice != null
        ? source?.overridePriceCurrency
        : source?.manualPriceCurrency;
      normalizedOverride = storedCurrency && storedCurrency !== targetCurrency
        ? convertCurrency(Number(storedOverride), targetCurrency, storedCurrency)
        : Number(storedOverride);
    }
  }
  const sellerAsk = computeSuggestedPrice({
    tcg,
    cmAvg,
    cmLowest,
    condition,
    overridePrice: normalizedOverride,
  });

  const prefersTcg = marketSource === "tcg" || marketSource === "tcgplayer";
  const preferredMarket = prefersTcg
    ? (tcg || cmAvg || cmLowest)
    : (cmAvg || cmLowest || tcg);

  const liquidBenchmarks = [tcg, cmLowest].filter((value) => value > 0);
  const quickSale = liquidBenchmarks.length > 0
    ? Math.min(...liquidBenchmarks)
    : preferredMarket;

  return {
    sellerAsk,
    preferredMarket,
    quickSale,
    benchmarks: { tcg, cmAvg, cmLowest },
    preferredSource: prefersTcg ? "TCGplayer" : "CardMarket",
    availableBenchmarkCount: [tcg, cmAvg, cmLowest].filter((value) => value > 0).length,
  };
}

export function computeItemMetrics(item, userCurrency = 'USD') {
  // Manual override price always wins (graded or not). This is the price the
  // user actively picked in the inventory editor and must be reflected in
  // both per-row display AND header totals. Convert from the override's
  // stored currency to the user's display currency when they differ.
  if (item.overridePrice != null && !Number.isNaN(Number(item.overridePrice))) {
    let overrideValue = Number(item.overridePrice);
    if (item.overridePriceCurrency && item.overridePriceCurrency !== userCurrency) {
      overrideValue = convertCurrency(overrideValue, userCurrency, item.overridePriceCurrency);
    }
    return {
      tcg: overrideValue,
      cmAvg: overrideValue,
      cmLowest: overrideValue,
      suggested: overrideValue,
    };
  }

  // For graded cards, use graded price as the primary value
  // API-fetched graded prices are in USD; manual entries store their own currency
  if (item.isGraded && item.gradedPrice) {
    let gradedValue = parseFloat(item.gradedPrice);
    const storedCurrency = item.gradedPriceCurrency || 'USD'; // Default to USD for API-fetched prices
    if (storedCurrency !== userCurrency) {
      gradedValue = convertCurrency(gradedValue, userCurrency, storedCurrency);
    }
    return {
      tcg: gradedValue,
      cmAvg: gradedValue,
      cmLowest: gradedValue,
      suggested: gradedValue,
    };
  }
  
  // For cards with manual price override
  if (item.manualPrice) {
    let manualValue = parseFloat(item.manualPrice);
    // Convert from stored currency to user's display currency if different
    if (item.manualPriceCurrency && item.manualPriceCurrency !== userCurrency) {
      manualValue = convertCurrency(manualValue, userCurrency, item.manualPriceCurrency);
    }
    return {
      tcg: manualValue,
      cmAvg: manualValue,
      cmLowest: manualValue,
      suggested: manualValue,
    };
  }
  
  // Standard calculation for ungraded cards
  const condition = item.condition || "NM";
  const tcg = computeTcgPrice(item, condition, userCurrency);
  const cmAvg = getCardmarketAvg(item, condition, userCurrency) || 0;
  const cmLowest = getCardmarketLowest(item, condition, userCurrency) || 0;
  const suggested = computeSuggestedPrice({
    tcg,
    cmAvg,
    cmLowest,
    condition,
    overridePrice: item.overridePrice || item.customPrice,
  });
  return {
    tcg,
    cmAvg,
    cmLowest,
    suggested,
  };
}

export function computeInventoryTotals(items, userCurrency = 'USD') {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const stats = computeItemMetrics(item, userCurrency);
      const qty = Number(item.quantity) || 1;
      acc.tcg += stats.tcg * qty;
      acc.cmAvg += stats.cmAvg * qty;
      acc.cmLowest += stats.cmLowest * qty;
      acc.suggested += stats.suggested * qty;
      acc.count += qty;
      return acc;
    },
    { tcg: 0, cmAvg: 0, cmLowest: 0, suggested: 0, count: 0 },
  );
}

// =============================
// Firestore Helpers
// =============================

export function cloneForFirestore(value) {
  const cloneValue = (current, seen) => {
    if (current === undefined) return undefined;
    if (current === null || typeof current !== "object") return current;

    if (current instanceof Date) return new Date(current.getTime());

    // Firestore SDK values (Timestamp, GeoPoint, DocumentReference, etc.) are
    // class instances. Preserve those rather than flattening their internals.
    const prototype = Object.getPrototypeOf(current);
    const isPlainObject = prototype === Object.prototype || prototype === null;
    if (!Array.isArray(current) && !isPlainObject) return current;

    if (seen.has(current)) return seen.get(current);

    if (Array.isArray(current)) {
      const clonedArray = [];
      seen.set(current, clonedArray);
      current.forEach((item) => {
        const clonedItem = cloneValue(item, seen);
        if (clonedItem !== undefined) clonedArray.push(clonedItem);
      });
      return clonedArray;
    }

    const clonedObject = {};
    seen.set(current, clonedObject);
    Object.entries(current).forEach(([key, item]) => {
      const clonedItem = cloneValue(item, seen);
      if (clonedItem !== undefined) clonedObject[key] = clonedItem;
    });
    return clonedObject;
  };

  return cloneValue(value, new WeakMap());
}

export async function saveCollection(db, uid, items, extra = {}) {
  if (!db || !uid) return;
  const ref = doc(db, "collections", uid);
  const payload = {
    items: cloneForFirestore(Array.isArray(items) ? items : []),
  };
  const extraClone = cloneForFirestore(extra);
  Object.assign(payload, extraClone);
  await setDoc(ref, payload, { merge: true });
}

export function prepareTransactionRecord(db, uid, entry, options = {}) {
  if (!db || !uid) return;
  const col = fsCollection(db, "transactions", uid, "entries");
  const ref = options.id ? doc(col, options.id) : doc(col);
  const payload = buildTaxReadyTransaction(entry, {
    uid,
    now: Date.now(),
    id: ref.id,
  });
  return { id: ref.id, ref, payload: cloneForFirestore(payload) };
}

export async function recordTransaction(db, uid, entry, options = {}) {
  const prepared = prepareTransactionRecord(db, uid, entry, options);
  if (!prepared) return;
  await setDoc(prepared.ref, prepared.payload);
  return prepared;
}

// =============================
// Card Normalization
// =============================

/**
 * Normalize API card response to consistent format
 */
export function normalizeApiCard(raw) {
  const d = raw?.data ?? raw;
  const episode = d?.episode || {};
  const episodeName = episode?.name ?? d?.episode_name ?? d?.set_name ?? d?.set;
  const seriesName = episode?.series?.name ?? d?.series_name ?? d?.series;
  const displaySet = seriesName && episodeName &&
    !String(episodeName).toLowerCase().includes(String(seriesName).toLowerCase())
    ? `${seriesName} ${episodeName}`
    : episodeName;
  const cardmarketPrices = d?.prices?.cardmarket || {};
  const tcgplayerPrices = d?.prices?.tcg_player || d?.prices?.tcgplayer || {};
  const ebayPrices = d?.prices?.ebay || {};
  const cardMarketId = d?.cardmarket_id ?? d?.cardMarketId;
  const tcgplayerId = d?.tcgplayer_id ?? d?.tcgplayerId ?? d?.tcgPlayerId;
  const fetchedAt = d?.pricesLastUpdated ?? d?.lastUpdated ?? new Date().toISOString();

  return {
    id: d?.id ?? d?.card_id,
    name: d?.name,
    nameNumbered: d?.name_numbered,
    slug: d?.slug,
    number: d?.card_number ?? d?.collector_number ?? d?.number,
    rarity: d?.rarity,
    set: displaySet,
    setName: episodeName,
    setSeries: seriesName,
    setCode: episode?.code ?? d?.set_code,
    setSlug: episode?.slug ?? d?.episode_slug,
    setLogo: episode?.logo ?? d?.set_logo,
    releaseDate: episode?.released_at ?? d?.released_at ?? d?.releaseDate,
    setCardsTotal: episode?.cards_total ?? d?.cards_total,
    setCardsPrintedTotal: episode?.cards_printed_total ?? d?.cards_printed_total,
    image: d?.image ?? d?.images?.[0],
    links: {
      ...(d?.links || {}),
      ...(d?.tcggo_url ? { tcggo: d.tcggo_url } : {}),
    },
    tcgid: d?.tcgid,
    cardMarketId,
    cardmarketId: cardMarketId,
    tcgplayerId,
    tcgPlayerId: tcgplayerId,
    providerIds: {
      tcgid: d?.tcgid,
      cardmarket: cardMarketId,
      tcgplayer: tcgplayerId,
    },
    supertype: d?.supertype,
    product_type: d?.product_type || d?.type,
    hp: d?.hp,
    artist: d?.artist?.name ?? d?.artist_name,
    language: d?.language ?? (d?.isJapanese ? "Japanese" : "English"),
    isJapanese: Boolean(d?.isJapanese || d?._isJapaneseCard),
    variants: Array.isArray(d?.variants) ? d.variants : [],
    dataSource: d?.dataSource || d?.source || "cardmarket",
    pricesLastUpdated: fetchedAt,
    prices: {
      cardmarket: {
        ...cardmarketPrices,
        currency: cardmarketPrices?.currency || "EUR",
        lowest_near_mint:
          Number(cardmarketPrices?.lowest_near_mint) || null,
        avg7:
          Number(
            cardmarketPrices?.["7d_average"] ?? cardmarketPrices?.avg7,
          ) || null,
        avg30:
          Number(
            cardmarketPrices?.["30d_average"] ?? cardmarketPrices?.avg30,
          ) || null,
        availableItems: Number(cardmarketPrices?.available_items) || null,
        graded: cardmarketPrices?.graded || {},
      },
      tcgplayer: {
        ...tcgplayerPrices,
        currency: tcgplayerPrices?.currency || "USD",
        market_price: Number(tcgplayerPrices?.market_price) || null,
        mid_price: Number(tcgplayerPrices?.mid_price) || null,
      },
      ebay: ebayPrices,
    },
  };
}

// =============================
// Search & Filtering Helpers
// =============================

/**
 * Normalize apostrophes - converts curly apostrophes to straight ones
 * and handles common variations
 */
export function normalizeApostrophes(str) {
  if (!str) return '';
  return str
    .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'") // Curly quotes and accents to straight apostrophe
    .replace(/[\u201C\u201D]/g, '"'); // Curly double quotes to straight
}

/**
 * Tokenize a search query into words
 * PRESERVES apostrophes within words (e.g., "Rocket's" stays as one token)
 * Splits on spaces, commas, and other non-word separators
 */
export function tokenize(q) {
  if (!q) return [];
  // Normalize apostrophes first
  const normalized = normalizeApostrophes(q.toLowerCase());
  // Split on spaces and punctuation BUT keep apostrophes attached to words
  // This regex splits on anything that's not: letters, numbers, or apostrophes between letters
  return normalized
    .split(/[\s,;:!?\-_()[\]{}]+/) // Split on whitespace and common separators
    .map(token => token.replace(/^[']+|[']+$/g, '')) // Trim leading/trailing apostrophes
    .filter(Boolean);
}

/**
 * Normalize a card number for comparison
 * - Strips leading zeros (001 → 1)
 * - Handles promo prefixes (SWSH001 → swsh1)
 * - Preserves slash notation (123/456)
 */
export function normalizeCardNumber(num) {
  if (!num) return '';
  let n = String(num).toLowerCase().trim();
  
  // Handle slash notation (preserve it but normalize each part)
  if (n.includes('/')) {
    const [before, after] = n.split('/');
    const normBefore = before.replace(/^0+/, '') || '0';
    const normAfter = after.replace(/^0+/, '') || '0';
    return `${normBefore}/${normAfter}`;
  }
  
  // Handle alphanumeric promo codes (SWSH001 → swsh1)
  const promoMatch = n.match(/^([a-z]+)0*(\d+)$/i);
  if (promoMatch) {
    return `${promoMatch[1].toLowerCase()}${promoMatch[2]}`;
  }
  
  // Handle pure numbers - strip leading zeros
  const pureNumber = n.replace(/^0+/, '');
  return pureNumber || '0';
}

/**
 * Extract number-like pieces from a search query
 * Enhanced to handle:
 * - Simple numbers (123, 001)
 * - Slash notation (123/456)
 * - Promo codes (SWSH001, SM123, XY045)
 * - Set-number combos (SV06-123, sv6-123)
 * - Long alphanumeric codes (up to 6 letters + numbers)
 */
export function extractNumberPieces(q) {
  if (!q) return [];
  const normalized = normalizeApostrophes(q);
  
  // Match various number patterns:
  // - Pure numbers: 123, 001
  // - Slash notation: 123/456
  // - Short prefix codes: sv123, gg69
  // - Long promo codes: SWSH001, SM123
  // - Set-number combos with hyphen: SV06-123
  const patterns = [
    /([a-z]{1,6}\d{1,4})/gi,           // Alphanumeric codes (swsh001, sv123, gg69)
    /(\d{1,4}\/\d{1,4})/gi,             // Slash notation (123/456)
    /(\d{1,4})/gi,                       // Pure numbers (123, 001)
    /([a-z]{1,4}\d{1,3}-\d{1,4})/gi,    // Set-number combos (SV06-123)
  ];
  
  const pieces = new Set();
  
  for (const pattern of patterns) {
    const matches = normalized.match(pattern) || [];
    for (const match of matches) {
      const lower = match.toLowerCase();
      pieces.add(lower);
      
      // Also add normalized version (without leading zeros)
      const norm = normalizeCardNumber(lower);
      if (norm && norm !== lower) {
        pieces.add(norm);
      }
      
      // For set-number combos like SV06-123, also extract just the number part
      if (lower.includes('-')) {
        const parts = lower.split('-');
        parts.forEach(part => {
          if (/\d/.test(part)) {
            pieces.add(part);
            const normPart = normalizeCardNumber(part);
            if (normPart && normPart !== part) {
              pieces.add(normPart);
            }
          }
        });
      }
    }
  }
  
  return Array.from(pieces);
}

export function splitQuery(q) {
  if (!q) return { nameQuery: '', numberPieces: [], tokens: [] };
  const normalized = normalizeApostrophes(q);
  const raw = tokenize(normalized);
  const numberLike = extractNumberPieces(normalized);
  const isNumLike = (t) => numberLike.includes(t);
  const nameTokens = raw.filter((t) => !isNumLike(t));
  return {
    nameQuery: nameTokens.join(" ") || normalized,
    numberPieces: numberLike,
    tokens: raw,
  };
}

// NOTE: rankByRelevance has been consolidated into searchHelpers.js
// Import from there: import { rankByRelevance } from './searchHelpers';

// =============================
// CSV Export Helper
// =============================

export function exportToCSV(items, filename = "collection.csv") {
  if (items.length === 0) {
    alert("No items to export.");
    return;
  }
  
  const headers = ["Name", "Set", "Number", "Rarity", "Condition", "Quantity", "TCG Price", "Market Avg", "Market Low", "Suggested Price"];
  const rows = items.map(item => {
    const metrics = computeItemMetrics(item);
    const qty = Number(item.quantity) || 1;
    return [
      item.name || item.card?.name || "",
      item.set || item.card?.set || "",
      item.number || item.card?.number || "",
      item.rarity || item.card?.rarity || "",
      item.condition || "NM",
      qty,
      metrics.tcg.toFixed(2),
      metrics.cmAvg.toFixed(2),
      metrics.cmLowest.toFixed(2),
      metrics.suggested.toFixed(2)
    ];
  });
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// =============================
// History Building Helper
// =============================

export function buildHistoryEntry(items) {
  const totals = computeInventoryTotals(items);
  return {
    date: Date.now(),
    count: items.length,
    ...totals,
  };
}
