/**
 * Card pricing and condition helpers
 * Extracted from App.jsx for reusability
 */

import { doc, setDoc, collection as fsCollection, addDoc } from "firebase/firestore";

// =============================
// Constants
// =============================

export const DEFAULT_CURRENCY = "EUR";

export const SUPPORTED_CURRENCIES = [
  { code: "EUR", name: "Euro (€)", symbol: "€" },
  { code: "USD", name: "US Dollar ($)", symbol: "$" },
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

    console.log('🌐 Fetching live FX rates...');
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    if (data && data.rates) {
      FX_RATES = {
        USD: 1.0,
        EUR: data.rates.EUR || 0.92,
        SEK: data.rates.SEK || 10.5,
        NOK: data.rates.NOK || 10.8,
        DKK: data.rates.DKK || 6.9,
        ISK: data.rates.ISK || 138.0,
      };
      FX_LAST_FETCH = now;
      console.log('✅ FX rates updated:', FX_RATES);
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
  
  console.log(`💱 Converting ${amount} ${sourceCurrency} to ${targetCurrency}: ${converted} (via USD: ${amountInUSD})`);
  
  return converted;
}

// Initialize FX rates on module load
fetchFXRates();

// =============================
// Card Pricing Helpers
// =============================

export function computeTcgPrice(source, condition = "NM") {
  const base =
    Number(
      source?.prices?.tcgplayer?.market_price ??
        source?.prices?.tcgplayer?.mid_price,
    ) || 0;
  return base * getConditionMultiplier(condition);
}

export function getCardmarketLowest(source, condition = "NM") {
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
      // Apply condition multiplier for non-NM cards
      return num * getConditionMultiplier(condition);
    }
  }
  const fallback =
    Number(cm.lowest) ||
    Number(cm.lowest_near_mint) ||
    Number(cm.average) ||
    0;
  return fallback * getConditionMultiplier(condition);
}

export function getCardmarketAvg(source, condition = "NM") {
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
      // Apply condition multiplier for non-NM cards
      return num * getConditionMultiplier(condition);
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

export function computeItemMetrics(item, userCurrency = 'USD') {
  // For graded cards, use graded price as the primary value
  // Graded prices are stored in USD, convert to user's currency
  if (item.isGraded && item.gradedPrice) {
    const gradedValueUSD = parseFloat(item.gradedPrice);
    const gradedValue = convertCurrency(gradedValueUSD, userCurrency);
    return {
      tcg: gradedValue,
      cmAvg: gradedValue,
      cmLowest: gradedValue,
      suggested: gradedValue,
    };
  }
  
  // For cards with manual price override
  if (item.manualPrice) {
    const manualValue = parseFloat(item.manualPrice);
    return {
      tcg: manualValue,
      cmAvg: manualValue,
      cmLowest: manualValue,
      suggested: manualValue,
    };
  }
  
  // Standard calculation for ungraded cards
  const condition = item.condition || "NM";
  const tcg = computeTcgPrice(item, condition);
  const cmAvg = getCardmarketAvg(item, condition) || 0;
  const cmLowest = getCardmarketLowest(item, condition) || 0;
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
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch (error) {
    console.warn("structuredClone failed, falling back to JSON clone", error);
  }
  return JSON.parse(JSON.stringify(value));
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

export async function recordTransaction(db, uid, entry) {
  if (!db || !uid) return;
  const col = fsCollection(db, "transactions", uid, "entries");
  await addDoc(col, cloneForFirestore({
    ts: Date.now(),
    ...entry,
  }));
}

// =============================
// Card Normalization
// =============================

/**
 * Normalize API card response to consistent format
 */
export function normalizeApiCard(raw) {
  const d = raw?.data ?? raw;
  return {
    id: d?.id ?? d?.card_id,
    name: d?.name,
    nameNumbered: d?.name_numbered,
    slug: d?.slug,
    number: d?.card_number ?? d?.collector_number ?? d?.number,
    rarity: d?.rarity,
    set: d?.episode?.name ?? d?.episode_name ?? d?.set_name,
    setSlug: d?.episode?.slug ?? d?.episode_slug,
    image: d?.image ?? d?.images?.[0],
    links: d?.links || {},
    tcgid: d?.tcgid,
    supertype: d?.supertype,
    product_type: d?.product_type || d?.type,
    hp: d?.hp,
    artist: d?.artist?.name ?? d?.artist_name,
    prices: {
      cardmarket: {
        currency: d?.prices?.cardmarket?.currency || "EUR",
        lowest_near_mint:
          Number(d?.prices?.cardmarket?.lowest_near_mint) || null,
        avg7:
          Number(
            d?.prices?.cardmarket?.["7d_average"] ??
              d?.prices?.cardmarket?.avg7,
          ) || null,
        avg30:
          Number(
            d?.prices?.cardmarket?.["30d_average"] ??
              d?.prices?.cardmarket?.avg30,
          ) || null,
        graded: d?.prices?.cardmarket?.graded || {},
      },
      tcgplayer: {
        currency: d?.prices?.tcg_player?.currency || "EUR",
        market_price: Number(d?.prices?.tcg_player?.market_price) || null,
        mid_price: Number(d?.prices?.tcg_player?.mid_price) || null,
      },
    },
  };
}

// =============================
// Search & Filtering Helpers
// =============================

export function tokenize(q) {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function extractNumberPieces(q) {
  const m = q.match(/([a-z]{1,3}\d+|\d{1,3}\/\d{1,3}|\d{1,3})/gi) || [];
  return m.map((x) => x.toLowerCase());
}

export function splitQuery(q) {
  const raw = tokenize(q);
  const numberLike = extractNumberPieces(q);
  const isNumLike = (t) => numberLike.includes(t);
  const nameTokens = raw.filter((t) => !isNumLike(t));
  return {
    nameQuery: nameTokens.join(" ") || q,
    numberPieces: numberLike,
    tokens: raw,
  };
}

export function rankByRelevance(items, q) {
  const tokens = tokenize(q);
  const nums = extractNumberPieces(q);
  
  return items
    .map((card) => {
      let score = 0;
      const name = (card.name || "").toLowerCase();
      const nameNumbered = (card.nameNumbered || "").toLowerCase();
      const number = ((card.number || "") + "").toLowerCase();
      
      // Exact name match
      if (name === q.toLowerCase()) score += 100;
      
      // Name token matches
      tokens.forEach((t) => {
        if (name.includes(t)) score += 5;
        if (nameNumbered.includes(t)) score += 2;
      });
      
      // Number matches
      nums.forEach((n) => {
        if (number === n) score += 10;
        else if (number.includes(n)) score += 3;
        else if (nameNumbered.includes(n)) score += 2;
      });
      
      return { card, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.card);
}

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

