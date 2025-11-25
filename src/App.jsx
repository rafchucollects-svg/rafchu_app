import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection as fsCollection,
  addDoc,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, LogIn, LogOut, Trash, ExternalLink, Upload, Menu } from "lucide-react";

/**
 * PokéValue – Single-file React starter implementing:
 * - Card Pricer (TCGdex + CardMarket integration)
 * - My Inventory (Firestore sync per-user)
 * - Trade Binder (local, with % slider)
 *
 * Fill in your keys below, then render <PokeValueApp />.
 */

// ========================
// 🔐 Configuration Section
// ========================

const DEFAULT_CURRENCY = "EUR";

// Firebase Configuration - loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase singletons safely
let auth;
let db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  // In dev hot-reload, Firebase may already be initialized. Swallow duplicate init errors.
  try {
    auth = getAuth();
    db = getFirestore();
  } catch {
    auth = undefined;
    db = undefined;
  }
}

// ==============
// 🔧 Utilities
// ==============

function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return v;
}

function getCurrencySymbol(currency) {
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

function euro(n, currency = DEFAULT_CURRENCY) {
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

// ============================
// 📦 Types & Mapping Helpers
// ============================

/** Normalized card shape used in UI */
function normalizeApiCard(raw) {
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

function tokenize(q) {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function extractNumberPieces(q) {
  const m =
    q.match(/([a-z]{1,3}\d+|\d{1,3}\/\d{1,3}|\d{1,3})/gi) || [];
  return m.map((x) => x.toLowerCase());
}
function splitQuery(q) {
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
function rankByRelevance(items, q) {
  const tokens = tokenize(q);
  const nums = extractNumberPieces(q);
  const score = (card) => {
    const name = (card.name || "").toLowerCase();
    const set = (card.set || "").toLowerCase();
    const nameNumbered = (card.nameNumbered || "").toLowerCase();
    const tcgid = (card.tcgid || "").toLowerCase();
    const num = ((card.number || "") + "").toLowerCase();
    let s = 0;
    tokens.forEach((t) => {
      if (name.includes(t)) s += 3;
      if (set.includes(t)) s += 2;
      if (nameNumbered.includes(t)) s += 2;
      if (tcgid.includes(t)) s += 2;
    });
    nums.forEach((n) => {
      if (num === n) s += 6;
      else if (num.includes(n)) s += 4;
      else if (nameNumbered.includes(n)) s += 3;
      else if (tcgid.includes(n)) s += 2;
      else if (name.includes(n)) s += 2;
    });
    if (tokens.some((t) => name.includes(t)) && tokens.some((t) => set.includes(t))) s += 2;
    if (/(booster|box|case|bundle|elite trainer|etb)/i.test(name)) s -= 3;
    return s;
  };
  return [...items].sort((a, b) => score(b) - score(a));
}

function numericOrNull(value) {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    if (typeof value === "string") {
      const cleaned = Number(value.replace(/[^0-9.-]+/g, ""));
      return Number.isNaN(cleaned) ? null : cleaned;
    }
    return null;
  }
  return num;
}

function uniqueId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const SEARCH_CACHE_STORAGE_KEY = "pokevalue.searchCache.v1";
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SEARCH_CACHE_LIMIT = 60;
const SEARCH_CACHE_RESULT_LIMIT = 48;
const SEARCH_DEBOUNCE_MS = 550;
const DEFAULT_SUGGESTION_LIMIT = 5;
const MAX_SUGGESTION_LIMIT = 25;

const searchCacheMemory = new Map();
let searchCacheHydrated = false;
const cardDetailCache = new Map();

function canonicalizeQuery(query) {
  return (query || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hydrateSearchCache() {
  if (searchCacheHydrated) return;
  searchCacheHydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(SEARCH_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    parsed.forEach((entry) => {
      if (!entry || typeof entry.k !== "string") return;
      const ts = Number(entry.t) || 0;
      const results = Array.isArray(entry.v) ? entry.v : [];
      searchCacheMemory.set(entry.k, { ts, results });
    });
  } catch (error) {
    console.warn("Failed to hydrate search cache", error);
    searchCacheMemory.clear();
  }
}

function persistSearchCache() {
  if (typeof window === "undefined") return;
  try {
    const entries = Array.from(searchCacheMemory.entries())
      .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))
      .slice(0, SEARCH_CACHE_LIMIT)
      .map(([k, entry]) => ({
        k,
        t: entry.ts,
        v: Array.isArray(entry.results)
          ? entry.results.slice(0, SEARCH_CACHE_RESULT_LIMIT)
          : [],
      }));
    window.localStorage.setItem(
      SEARCH_CACHE_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch (error) {
    console.warn("Failed to persist search cache", error);
  }
}

function setSearchCacheEntry(key, results) {
  if (!key || !Array.isArray(results) || results.length === 0) return;
  hydrateSearchCache();
  searchCacheMemory.set(key, { ts: Date.now(), results });
  if (searchCacheMemory.size > SEARCH_CACHE_LIMIT) {
    const sorted = Array.from(searchCacheMemory.entries()).sort(
      (a, b) => (b[1].ts || 0) - (a[1].ts || 0),
    );
    sorted.slice(SEARCH_CACHE_LIMIT).forEach(([k]) => {
      searchCacheMemory.delete(k);
    });
  }
  persistSearchCache();
}

function getSearchCacheEntry(key) {
  if (!key) return null;
  hydrateSearchCache();
  const entry = searchCacheMemory.get(key);
  if (!entry) return null;
  const expired = Date.now() - (entry.ts || 0) > SEARCH_CACHE_TTL_MS;
  return {
    results: Array.isArray(entry.results) ? entry.results : [],
    expired,
  };
}

const CONDITION_MULTIPLIER = {
  NM: 1,
  LP: 0.9,
  MP: 0.8,
  HP: 0.6,
  DMG: 0.4,
};

const CONDITION_LABEL_TO_CODE = {
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
  POOR: "DMG",
  "HEAVILY DAMAGED": "DMG",
  "PL": "LP",
};

const CONDITION_DISPLAY_ORDER = ["NM", "LP", "MP", "HP", "DMG"];

const PERCENT_OPTIONS = Array.from({ length: 9 }, (_, i) => 60 + i * 5);

function getConditionMultiplier(condition = "NM") {
  return CONDITION_MULTIPLIER[condition] ?? 1;
}

function conditionLabelToCode(label) {
  if (!label) return null;
  const key = String(label).trim().toUpperCase();
  return CONDITION_LABEL_TO_CODE[key] ?? null;
}

function conditionCodeToLabel(code) {
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
      return code || "";
  }
}

function normalizeHistoryPoints(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => {
      const ts = Date.parse(
        entry?.date ?? entry?.timestamp ?? entry?.ts ?? entry?.time ?? "",
      );
      const price =
        numericOrNull(entry?.market ?? entry?.price ?? entry?.value) ?? null;
      if (!Number.isFinite(ts) || ts <= 0 || price == null) return null;
      return {
        ts,
        price,
        volume: entry?.volume ?? entry?.count ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

function computeAverageWithinDays(historyPoints, days) {
  if (!Array.isArray(historyPoints) || historyPoints.length === 0) return null;
  if (!days) {
    const valid = historyPoints.filter((point) => point.price != null);
    if (!valid.length) return null;
    const sum = valid.reduce((acc, point) => acc + point.price, 0);
    return sum / valid.length;
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const windowPoints = historyPoints.filter(
    (point) => point.price != null && point.ts >= cutoff,
  );
  if (!windowPoints.length) return null;
  const sum = windowPoints.reduce((acc, point) => acc + point.price, 0);
  return sum / windowPoints.length;
}

function computeMinWithinDays(historyPoints, days) {
  if (!Array.isArray(historyPoints) || historyPoints.length === 0) return null;
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  let min = null;
  historyPoints.forEach((point) => {
    if (point.price == null) return;
    if (cutoff && point.ts < cutoff) return;
    if (min == null || point.price < min) {
      min = point.price;
    }
  });
  return min;
}

function computeTcgPrice(source, condition = "NM") {
  const base =
    Number(
      source?.prices?.tcgplayer?.market_price ??
        source?.prices?.tcgplayer?.mid_price,
    ) || 0;
  return base * getConditionMultiplier(condition);
}

function getCardmarketLowest(source) {
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
    if (!Number.isNaN(num) && num > 0) return num;
  }
  const fallback =
    numericOrNull(
      source?.prices?.tcgplayer?.conditions?.NM?.price ??
        source?.prices?.tcgplayer?.market_price ??
        source?.prices?.tcgplayer?.mid_price,
    ) ?? null;
  return typeof fallback === "number" ? fallback : null;
}

function getCardmarketAvg(source) {
  const cm = source?.prices?.cardmarket || {};
  const candidates = [
    cm["7d_average"],
    cm.avg7,
    cm["7d_avg"],
    cm["7dAverage"],
    cm["avg_7"],
    cm["seven_day_avg"],
    cm["7d"],
    cm["average7"],
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (!Number.isNaN(num) && num > 0) return num;
  }
  if (Array.isArray(cm?.history?.nearMint) && cm.history.nearMint.length) {
    const avg = computeAverageWithinDays(cm.history.nearMint, 7);
    if (avg != null) return avg;
  }
  const fallback =
    numericOrNull(
      source?.prices?.tcgplayer?.conditions?.NM?.price ??
        source?.prices?.tcgplayer?.market_price ??
        source?.prices?.tcgplayer?.mid_price,
    ) ?? null;
  return typeof fallback === "number" ? fallback : null;
}

function computeSuggestedPrice({
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
  const tcgPremium = safeTcg > cmBase * 1.1;
  if (tcgPremium) {
    const midpoint = (safeTcg + cmBase) / 2;
    return midpoint;
  }
  return cmBase;
}

function getSuggestedCollectionValue(item) {
  const condition = item.condition || "NM";
  return computeSuggestedPrice({
    tcg: computeTcgPrice(item, condition),
    cmAvg: getCardmarketAvg(item) || 0,
    cmLowest: getCardmarketLowest(item) || 0,
    condition,
    overridePrice: item.overridePrice,
  });
}

function computeItemMetrics(item) {
  const condition = item.condition || "NM";
  const tcg = computeTcgPrice(item, condition);
  const cmAvg = getCardmarketAvg(item) || 0;
  const cmLowest = getCardmarketLowest(item) || 0;
  const suggested = computeSuggestedPrice({
    tcg,
    cmAvg,
    cmLowest,
    condition,
    overridePrice: item.overridePrice,
  });
  return {
    tcg,
    cmAvg,
    cmLowest,
    suggested,
  };
}

function computeInventoryTotals(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const stats = computeItemMetrics(item);
      acc.tcg += stats.tcg;
      acc.cmAvg += stats.cmAvg;
      acc.cmLowest += stats.cmLowest;
      acc.suggested += stats.suggested;
      return acc;
    },
    { tcg: 0, cmAvg: 0, cmLowest: 0, suggested: 0 },
  );
}

function buildHistoryEntry(items) {
  const totals = computeInventoryTotals(items);
  return {
    ts: Date.now(),
    tcg: totals.tcg,
    cmAvg: totals.cmAvg,
    cmLowest: totals.cmLowest,
    suggested: totals.suggested,
  };
}

function clampPercent(value, min = 10, max = 150) {
  const num = Number(value);
  if (Number.isNaN(num)) return min;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function PercentSelect({ value, onChange, className, min = 10, max = 150 }) {
  const normalized = clampPercent(value, min, max);
  const isCustom = !PERCENT_OPTIONS.includes(normalized);
  const handleSelectChange = (val) => {
    if (val === "custom") return;
    onChange(clampPercent(val, min, max));
  };
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <select
        className="rounded-md border px-2 py-1 text-sm"
        value={isCustom ? "custom" : normalized}
        onChange={(e) => handleSelectChange(e.target.value)}
      >
        {PERCENT_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}%
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      <input
        type="number"
        min={min}
        max={max}
        className="w-16 rounded-md border px-2 py-1 text-sm"
        value={normalized}
        onChange={(e) => onChange(clampPercent(e.target.value, min, max))}
      />
    </div>
  );
}

function cloneForFirestore(value) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch (error) {
    console.warn("structuredClone failed, falling back to JSON clone", error);
  }
  return JSON.parse(JSON.stringify(value));
}

// =====================================
// 🌐 API: Search & Fetch Card Details
// =====================================

// Toggle to see exactly what we’re calling (optional)
// const DEBUG_SEARCH = true;

async function apiSearchCards(
  query,
  {
    useCache = true,
    allowExpired = false,
    maxResults = SEARCH_CACHE_RESULT_LIMIT,
  } = {},
) {
  if (!query?.trim()) return [];

  const canonical = canonicalizeQuery(query);
  if (useCache) {
    const cached = getSearchCacheEntry(canonical);
    if (cached && cached.results.length) {
      if (!cached.expired || allowExpired) {
        return cached.results.slice(0, maxResults);
      }
    }
  }

  const { nameQuery, numberPieces, tokens } = splitQuery(query);
  const firstTok = tokens[0] || "";
  const lastTok = tokens[tokens.length - 1] || "";

  const headers = {
    Accept: "application/json",
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };

  const searchSeeds = [
    nameQuery,
    query,
    firstTok,
    lastTok,
    ...tokens,
    ...numberPieces,
    ...numberPieces.map((p) => p.toUpperCase()),
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean);

  const qs = Array.from(new Set(searchSeeds));

  const collectedMap = new Map();
  const pushCard = (raw) => {
    const normalized = normalizeApiCard(raw);
    if (!normalized?.name) return;
    const key =
      (normalized.id && `id:${normalized.id}`) ||
      (normalized.tcgid && `tcgid:${normalized.tcgid}`) ||
      (normalized.slug && `slug:${normalized.slug}`) ||
      `${normalized.name}-${normalized.number}`;
    if (!collectedMap.has(key)) {
      collectedMap.set(key, normalized);
    }
  };

  for (const q of qs) {
    const url = `${API_BASE}/pokemon/cards/search?search=${encodeURIComponent(q)}&sort=episode_newest&perPage=200`;
    try {
      // if (DEBUG_SEARCH) console.log("→", url);
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      const arr =
        (Array.isArray(data?.data) && data.data) ||
        (Array.isArray(data?.results) && data.results) ||
        (Array.isArray(data) && data) ||
        [];
      for (const raw of arr) pushCard(raw);
      if (collectedMap.size > 250) break;
    } catch {
      // ignore and try other strategies
    }
  }

  const idCandidates = Array.from(
    new Set(
      numberPieces
        .filter((p) => /^\d+$/.test(p))
        .map((p) => p.replace(/^0+/, "")),
    ),
  );
  for (const id of idCandidates) {
    if (!id) continue;
    const url = `${API_BASE}/pokemon/cards/${id}`;
    try {
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      if (data) pushCard(data);
    } catch {
      // ignore
    }
  }

  if (collectedMap.size === 0) {
    try {
      const fallbackUrl = `${API_BASE}/pokemon/cards?sort=episode_newest&perPage=200`;
      const r = await fetch(fallbackUrl, { headers, cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        const arr =
          (Array.isArray(data?.data) && data.data) ||
          (Array.isArray(data?.results) && data.results) ||
          (Array.isArray(data) && data) ||
          [];
        for (const raw of arr) pushCard(raw);
      }
    } catch {
      // ignore
    }
  }

  let items = Array.from(collectedMap.values());

  if (numberPieces.length) {
    const hits = items.filter((it) => {
      const n = ((it.number || "") + "").toLowerCase();
      const nm = (it.name || "").toLowerCase();
      const nn = (it.nameNumbered || "").toLowerCase();
      const tcgid = (it.tcgid || "").toLowerCase();
      return numberPieces.some(
        (p) => n.includes(p) || nm.includes(p) || nn.includes(p) || tcgid.includes(p),
      );
    });
    if (hits.length) items = hits;
  }

  items = rankByRelevance(items, query);
  items.sort((a, b) => {
    const ak = !!a.number;
    const bk = !!b.number;
    return ak === bk ? 0 : ak ? -1 : 1;
  });
  const limited = items.slice(0, maxResults);
  if (limited.length) {
    setSearchCacheEntry(canonical, limited);
  }
  return limited;
}

async function apiFetchCardDetails(card) {
  if (!card) return null;
  const cacheKey =
    card?.id ||
    card?.slug ||
    card?.nameNumbered ||
    `${card?.name || ""}#${card?.number || ""}`;

  if (cacheKey && cardDetailCache.has(cacheKey)) {
    return cardDetailCache.get(cacheKey);
  }

  const headers = {
    Accept: "application/json",
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };

  if (card.id) {
    const detailUrl = `${API_BASE}/pokemon/cards/${card.id}`;
    try {
      const r = await fetch(detailUrl, { headers, cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        if (data) {
          const normalized = normalizeApiCard(data);
          if (cacheKey) cardDetailCache.set(cacheKey, normalized);
          return normalized;
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  const query =
    card.nameNumbered ||
    `${card.name || ""} ${card.number || ""}`.trim() ||
    card.name;
  if (query) {
    try {
      const results = await apiSearchCards(query, {
        allowExpired: true,
        maxResults: 20,
      });
      const match =
        results.find((c) => c.id && card.id && c.id === card.id) ||
        results.find(
          (c) =>
            c.slug && card.slug && c.slug === card.slug &&
            c.number === card.number,
        ) ||
        results.find(
          (c) =>
            c.tcgid && card.tcgid && c.tcgid === card.tcgid,
        ) ||
        results[0];
      if (match) {
        if (cacheKey) cardDetailCache.set(cacheKey, match);
        return match;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function formatSearchResults(results, query, limit = MAX_SUGGESTION_LIMIT) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const ranked = rankByRelevance(results, query);
  const singlesFirst = [...ranked].sort((a, b) => {
    const aSingle = !!a.number;
    const bSingle = !!b.number;
    return aSingle === bSingle ? 0 : aSingle ? -1 : 1;
  });
  return singlesFirst.slice(0, limit);
}

// ==========================
// 🔒 Firestore Persistence
// ==========================

// ==========================
// 🔒 Firestore Persistence
// ==========================

async function saveCollection(uid, items, extra = {}) {
  if (!db) return;
  const ref = doc(db, "collections", uid);
  const payload = {
    items: cloneForFirestore(Array.isArray(items) ? items : []),
  };
  const extraClone = cloneForFirestore(extra);
  Object.assign(payload, extraClone);
  await setDoc(ref, payload, { merge: true });
}

async function recordTransaction(uid, entry) {
  if (!db || !uid) return;
  const col = fsCollection(db, "transactions", uid, "entries");
  await addDoc(col, cloneForFirestore({
    ts: Date.now(),
    ...entry,
  }));
}

// ==================
// 🎛️ UI Components
// ==================

function Header({ user, onLogin, onLogout, hideAuth = false, onToggleMenu }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-muted"
          aria-label="Open menu"
          onClick={onToggleMenu}
        >
          <Menu className="h-5 w-5" />
        </button>
        <img
          src="/rafchu-logo.png"
          alt="Rafchu Collects logo"
          className="h-12 w-12 rounded-full bg-white object-contain shadow"
        />
        <div>
          <h1 className="text-xl font-bold leading-tight md:text-2xl">
            Rafchu Collects
          </h1>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pricing &amp; Trade
          </p>
        </div>
      </div>
      {!hideAuth && (
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="text-sm opacity-80">
                {user.displayName || user.email}
              </div>
              <Button variant="secondary" onClick={onLogout}>
                <LogOut className="mr-1 h-4 w-4" /> Sign out
              </Button>
            </>
          ) : (
            <Button onClick={onLogin}>
              <LogIn className="mr-1 h-4 w-4" /> Sign in with Google
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PriceRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {label}
      </div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

function MyUserPanel({
  user,
  shareEnabled,
  shareUsernameInput,
  setShareUsernameInput,
  handleShareNameSave,
  handleShareNameKeyDown,
  handleShareToggle,
  exportCollectionToCSV,
  copyFullInventoryShare,
}) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="space-y-3 p-0">
          <div className="text-lg font-bold">My User</div>
          {!user ? (
            <div className="text-sm text-muted-foreground">
              Sign in to manage your profile and sharing.
            </div>
          ) : (
            <>
              <div className="text-sm">
                <div className="font-semibold">Name</div>
                <div className="text-muted-foreground">
                  {user.displayName || "—"}
                </div>
              </div>
              <div className="text-sm">
                <div className="font-semibold">Email</div>
                <div className="text-muted-foreground">{user.email}</div>
              </div>
              <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                <div className="text-sm font-semibold">
                  Sharing is {shareEnabled ? "enabled" : "disabled"}
                </div>
                <Button
                  size="sm"
                  variant={shareEnabled ? "secondary" : "outline"}
                  onClick={() => handleShareToggle(!shareEnabled)}
                >
                  {shareEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                Shareable name
                <Input
                  value={shareUsernameInput}
                  onChange={(e) => setShareUsernameInput(e.target.value)}
                  onBlur={handleShareNameSave}
                  onKeyDown={handleShareNameKeyDown}
                  placeholder="e.g., Rafchu"
                  className="h-8 w-48"
                />
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={copyFullInventoryShare}>
                  Copy Share Link
                </Button>
                <Button size="sm" variant="outline" onClick={exportCollectionToCSV}>
                  <Upload className="mr-1 h-3 w-3" /> Export CSV
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="space-y-3 p-0">
          <div className="text-lg font-bold">Tips</div>
          <div className="text-sm text-muted-foreground">
            Use Collector or Vendor Toolkit from the menu to access card search and tools.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CardPrices({ card, condition = "NM", formatPrice }) {
  const cm = card?.prices?.cardmarket;
  const tcgPrice = computeTcgPrice(card, condition);
  const baseTcg =
    Number(card?.prices?.tcgplayer?.market_price ?? card?.prices?.tcgplayer?.mid_price) ||
    0;
  const cmAvg = getCardmarketAvg(card) || 0;
  const cmLowest = getCardmarketLowest(card) || 0;
  const diff = tcgPrice - (cmAvg || cmLowest || 0);
  const fmt = formatPrice || ((value) => euro(value ?? 0));
  const conditionBadgeEl = (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses(condition, "badge")}`}
    >
      {condition}
    </span>
  );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="space-y-2 p-0">
          <div className="mb-2 font-semibold">TCGplayer (EUR)</div>
          <PriceRow
            label={
              <>
                <span>Market</span>
                {conditionBadgeEl}
              </>
            }
            value={fmt(tcgPrice)}
          />
          <PriceRow
            label={
              <>
                <span>Market</span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses("NM", "badge")}`}
                >
                  NM
                </span>
              </>
            }
            value={fmt(baseTcg)}
          />
          <PriceRow
            label="Mid"
            value={fmt(card?.prices?.tcgplayer?.mid_price || 0)}
          />
        </CardContent>
      </Card>
      <Card className="rounded-2xl p-4 shadow">
        <CardContent className="space-y-2 p-0">
          <div className="mb-2 font-semibold">CardMarket (EUR)</div>
          <PriceRow label="Lowest Listing" value={fmt(cmLowest)} />
          <PriceRow
            label={
              <>
                <span>Lowest</span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses("NM", "badge")}`}
                >
                  NM
                </span>
              </>
            }
            value={fmt(cm?.lowest_near_mint || 0)}
          />
          <PriceRow label="7d Avg" value={fmt(cmAvg)} />
          <PriceRow label="30d Avg" value={fmt(cm?.avg30 || 0)} />
        </CardContent>
      </Card>
      <Card className="rounded-2xl p-4 shadow md:col-span-2">
        <CardContent className="space-y-2 p-0">
          <div className="mb-2 font-semibold">Price Comparison</div>
          <PriceRow
            label={
              <>
                <span>TCGplayer</span>
                {conditionBadgeEl}
                <span className="hidden sm:inline">vs. CM Avg</span>
                <span className="sm:hidden">vs CM Avg</span>
              </>
            }
            value={
              tcgPrice && (cmAvg || cmLowest)
                ? `${fmt(tcgPrice)} vs ${fmt(
                    cmAvg || cmLowest,
                  )} (${diff > 0 ? "+" : ""}${fmt(diff)})`
                : "–"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SuggestionItem({
  item,
  onPick,
  onQuickAddCollection,
  onQuickAddTrade,
  onQuickAddBuy = () => {},
}) {
  const thumb = item.image;
  return (
    <div className="flex items-center justify-between rounded-lg p-2 hover:bg-muted">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onPick(item)}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={item.name}
            className="h-14 w-10 rounded-md border object-cover"
          />
        ) : (
          <div className="h-14 w-10 rounded-md border bg-slate-100" />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium">{item.name}</div>
          <div className="truncate text-xs opacity-70">
            {(item.set || "—")} • {(item.rarity || "—")} • #
            {item.number || "—"}
          </div>
        </div>
      </button>
      <div className="ml-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onQuickAddCollection(item)}
        >
          + Inventory
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onQuickAddTrade(item)}
        >
          + Trade
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onQuickAddBuy(item)}
        >
          + Buy
        </Button>
      </div>
    </div>
  );
}

const CONDITION_STYLES = {
  NM: {
    badge:
      "border border-emerald-300 bg-emerald-100 text-emerald-700 shadow-sm",
    select:
      "border border-emerald-300 bg-emerald-50 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/40",
  },
  LP: {
    badge: "border border-lime-300 bg-lime-100 text-lime-700 shadow-sm",
    select:
      "border border-lime-300 bg-lime-50 text-lime-700 focus:border-lime-500 focus:ring-lime-500/40",
  },
  MP: {
    badge:
      "border border-amber-300 bg-amber-100 text-amber-700 shadow-sm",
    select:
      "border border-amber-300 bg-amber-50 text-amber-700 focus:border-amber-500 focus:ring-amber-500/40",
  },
  HP: {
    badge:
      "border border-orange-300 bg-orange-100 text-orange-700 shadow-sm",
    select:
      "border border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-500 focus:ring-orange-500/40",
  },
  DMG: {
    badge: "border border-rose-300 bg-rose-100 text-rose-700 shadow-sm",
    select:
      "border border-rose-300 bg-rose-50 text-rose-700 focus:border-rose-500 focus:ring-rose-500/40",
  },
  default: {
    badge:
      "border border-slate-300 bg-slate-100 text-slate-700 shadow-sm",
    select:
      "border border-slate-300 bg-slate-50 text-slate-700 focus:border-slate-500 focus:ring-slate-500/40",
  },
};

function conditionClasses(condition, variant = "badge") {
  const theme =
    CONDITION_STYLES[condition] ?? CONDITION_STYLES.default;
  return theme[variant] ?? CONDITION_STYLES.default[variant];
}

const INVENTORY_SORT_OPTIONS = [
  { value: "addedAt", label: "Date Added" },
  { value: "price_tcg", label: "Price (TCG)" },
  { value: "price_cm", label: "Price (Market Avg)" },
  { value: "price_diff", label: "TCG vs Market" },
];

const SHARE_SORT_OPTIONS = [
  { value: "addedAt", label: "Date Added" },
  { value: "price_sales", label: "Sales Price" },
];

const HISTORY_METRIC_OPTIONS = [
  { value: "suggested", label: "Sales Price" },
  { value: "tcg", label: "TCG Market" },
  { value: "cmAvg", label: "Market Avg (7d)" },
  { value: "cmLowest", label: "Market Low" },
];

const HISTORY_RANGE_OPTIONS = [
  { value: "all", label: "All", ms: null },
  { value: "1w", label: "1 Week", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "1m", label: "1 Month", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "3m", label: "3 Months", ms: 90 * 24 * 60 * 60 * 1000 },
];

function ConditionSelect({ value, onChange, className = "", ...props }) {
  const opts = ["NM", "LP", "MP", "HP", "DMG"];
  const themed = conditionClasses(value, "select");
  return (
    <select
      className={`rounded-lg px-2 py-1 text-sm font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 ${themed} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ExternalLinks({ links }) {
  if (!links) return null;
  const entries = [
    links.tcgdex && {
      key: "tcgdex",
      label: "TCGdex",
      href: links.tcgdex,
    },
    links.cardmarket && {
      key: "cardmarket",
      label: "CardMarket",
      href: links.cardmarket,
    },
    links.tcgplayer && {
      key: "tcgplayer",
      label: "TCGplayer",
      href: links.tcgplayer,
    },
  ].filter(Boolean);
  if (!entries.length) return null;
  return (
    <div className="flex items-center gap-2">
      {entries.map((entry) => (
        <a
          key={entry.key}
          className="inline-flex items-center gap-1 text-sm underline"
          href={entry.href}
          target="_blank"
          rel="noreferrer"
        >
          {entry.label} <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function InventoryHistoryChart({
  data,
  metric,
  metricLabel,
  rangeLabel,
  formatPrice,
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Not enough history yet. Keep adding cards to see trends over time.
      </div>
    );
  }

  const values = data.map((entry) => Number(entry?.[metric]) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const padding = 8;
  const span = 100 - padding * 2;
  const pointsArr = data.map((entry, idx) => {
    const value = Number(entry?.[metric]) || 0;
    const normalized = (value - min) / range;
    const y = 100 - (normalized * span + padding);
    const x =
      data.length === 1 ? 50 : (idx / (data.length - 1)) * 100;
    return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 50];
  });
  const linePoints = (() => {
    if (pointsArr.length === 1) {
      const [[, y]] = pointsArr;
      return `0,${y} 100,${y}`;
    }
    return pointsArr.map(([x, y]) => `${x},${y}`).join(" ");
  })();
  const areaPoints = (() => {
    if (pointsArr.length === 1) {
      const [[, y]] = pointsArr;
      return `0,100 0,${y} 100,${y} 100,100`;
    }
    return [
      "0,100",
      ...pointsArr.map(([x, y]) => `${x},${y}`),
      "100,100",
    ].join(" ");
  })();
  const lastEntry = data[data.length - 1];
  const firstEntry = data[0];
  const lastValue = Number(lastEntry?.[metric]) || 0;
  const formatter = (ts) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {metricLabel} • {rangeLabel}
          </div>
          <div className="text-2xl font-semibold">
            {formatPrice(lastValue)}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Latest update</div>
          <div>
            {lastEntry?.ts ? formatter(lastEntry.ts) : "—"}
          </div>
        </div>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-40 w-full text-primary"
      >
        <defs>
          <linearGradient id="historyFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={areaPoints}
          fill="url(#historyFill)"
          stroke="none"
          opacity="0.8"
        />
        <polyline
          points={linePoints}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pointsArr.map(([x, y], idx) => (
          <circle
            key={`${x}-${y}-${idx}`}
            cx={x}
            cy={y}
            r={1.6}
            fill="currentColor"
            opacity={idx === pointsArr.length - 1 ? 1 : 0.7}
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {firstEntry?.ts ? formatter(firstEntry.ts) : "—"}
        </span>
        <span>
          {lastEntry?.ts && firstEntry?.ts !== lastEntry?.ts
            ? formatter(lastEntry.ts)
            : ""}
        </span>
      </div>
    </div>
  );
}

// =====================
// 🧠 Main App Component
// =====================

export default function PokeValueApp() {
  // Auth state
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const handleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };
  const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  const [activeTab, setActiveTab] = useState("pricer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [workspace, setWorkspace] = useState("vendor"); // 'user' | 'collector' | 'vendor'

  // Search state
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [suggestions, setSuggestions] = useState([]);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeCard, setActiveCard] = useState(null);
  const [defaultCondition, setDefaultCondition] = useState("NM");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionSortBy, setCollectionSortBy] = useState("addedAt");
  const [collectionSortDir, setCollectionSortDir] = useState("desc");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);
  const [quickAddFeedback, setQuickAddFeedback] = useState(null);
  const quickAddTimeoutRef = useRef(null);
  const priceRefreshRef = useRef({ running: false, timestamps: {} });
  const lastFetchedCanonicalRef = useRef("");
  const activeSearchTokenRef = useRef(null);
  const [shareTargetUid, setShareTargetUid] = useState(null);
  const [isShareView, setIsShareView] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareAccessDenied, setShareAccessDenied] = useState(false);
  const [shareUsernameInput, setShareUsernameInput] = useState("");
  const [shareUsernameStored, setShareUsernameStored] = useState("");
  const [shareOwnerTitle, setShareOwnerTitle] = useState("");
  const [shareSelectedIds, setShareSelectedIds] = useState([]);
  const [shareSelectedMissingCount, setShareSelectedMissingCount] = useState(0);
  const [roundUpPrices, setRoundUpPrices] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyMetric, setHistoryMetric] = useState("suggested");
  const [historyRange, setHistoryRange] = useState("all");
  const [editingOverrideId, setEditingOverrideId] = useState(null);
  const [editingOverrideValue, setEditingOverrideValue] = useState("");
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [selectedTradeOutIds, setSelectedTradeOutIds] = useState([]);
  const viewingUid = shareTargetUid || user?.uid || null;
  const inventoryReadOnly = !user || (shareTargetUid && shareTargetUid !== user.uid);
  const ownerHeading = useMemo(
    () => (shareOwnerTitle && shareOwnerTitle.trim()) || "Collector",
    [shareOwnerTitle],
  );
  const ownerHeadingPossessive = useMemo(() => {
    if (!ownerHeading) return "Collector's";
    return /s$/i.test(ownerHeading) ? `${ownerHeading}'` : `${ownerHeading}'s`;
  }, [ownerHeading]);
  const shareFilterActive = useMemo(
    () => isShareView && shareSelectedIds.length > 0,
    [isShareView, shareSelectedIds],
  );
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

  const formatPrice = useCallback(
    (value) => euro(roundUpPrices ? Math.ceil(Number(value ?? 0)) : Number(value ?? 0)),
    [roundUpPrices],
  );


  const persistInventory = useCallback(
    async (items, { updateHistory = true, extra = {} } = {}) => {
      if (!user || !db) return;
      const metadata = { ...extra };
      if (metadata.shareEnabled === undefined) metadata.shareEnabled = shareEnabled;
      if (metadata.roundUp === undefined) metadata.roundUp = roundUpPrices;
      let updatedHistory = historyData;
      if (updateHistory) {
        const entry = buildHistoryEntry(items);
        updatedHistory = [...historyData.slice(-49), entry];
        metadata.history = updatedHistory;
      }
      await saveCollection(user.uid, items, metadata);
      if (updateHistory) {
        setHistoryData(updatedHistory);
      }
    },
    [user, shareEnabled, roundUpPrices, historyData],
  );

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
        const results = await apiSearchCards(debounced, {
          useCache: false,
          maxResults: MAX_SUGGESTION_LIMIT,
        });
        if (cancelled || activeSearchTokenRef.current !== token) return;
        const prepared = formatSearchResults(
          results,
          debounced,
          MAX_SUGGESTION_LIMIT,
        );
        setSuggestions(prepared);
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
  }, [debounced]);

  const triggerQuickAddFeedback = (message) => {
    if (!message) return;
    if (quickAddTimeoutRef.current) {
      clearTimeout(quickAddTimeoutRef.current);
    }
    setQuickAddFeedback({ id: uniqueId(), message });
    quickAddTimeoutRef.current = setTimeout(() => {
      setQuickAddFeedback(null);
    }, 1400);
  };

  useEffect(() => {
    return () => {
      if (quickAddTimeoutRef.current) {
        clearTimeout(quickAddTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("inventory");
    if (shared) {
      setShareTargetUid(shared);
      setIsShareView(true);
      setActiveTab("collection");
    }
    const selectedParam = params.get("selected");
    if (selectedParam) {
      const ids = selectedParam
        .split(",")
        .map((part) => decodeURIComponent(part.trim()))
        .filter(Boolean);
      setShareSelectedIds(ids);
    } else {
      setShareSelectedIds([]);
    }
  }, []);

  const showCardDetails = (item) => {
    if (!item) return;
    setActiveTab("pricer");
    setActiveCard(item);
    apiFetchCardDetails(item)
      .then((full) => {
        if (!full) return;
        setActiveCard((current) => {
          if (!current) return full;
          const currentKey =
            current.entryId || current.id || current.slug || current.name;
          const incomingKey =
            item.entryId || item.id || item.slug || item.name;
          if (currentKey && incomingKey && currentKey !== incomingKey) {
            return current;
          }
          return { ...current, ...full };
        });
      })
      .catch(() => {});
  };

  const pickCard = async (item) => {
    showCardDetails(item);
  };

  // Collections (Firestore)
  const [collectionItems, setCollectionItems] = useState([]);
  useEffect(() => {
    if (!db || !viewingUid) {
      setCollectionItems([]);
      return undefined;
    }
    const ref = doc(db, "collections", viewingUid);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() || {};
          const rawItems = Array.isArray(data.items) ? data.items : [];
          let needsSync = false;
          const items = rawItems.map((item) => {
            const entryId = item.entryId || uniqueId();
            if (!item.entryId) needsSync = true;
            return {
              ...item,
              entryId,
            };
          });
          let nextItems = items;
          if (isShareView && shareSelectedIds.length > 0) {
            const existingIds = new Set(items.map((item) => item.entryId));
            const missingSelected = shareSelectedIds.filter(
              (id) => !existingIds.has(id),
            ).length;
            setShareSelectedMissingCount(missingSelected);
            const selectedSet = new Set(shareSelectedIds);
            nextItems = items.filter((item) => selectedSet.has(item.entryId));
          } else {
            setShareSelectedMissingCount(0);
          }
          setCollectionItems(nextItems);
          setHistoryData(Array.isArray(data.history) ? data.history : []);
          if (typeof data.roundUp === "boolean") {
            setRoundUpPrices(data.roundUp);
          }
          const storedShareUsername =
            typeof data.shareUsername === "string" ? data.shareUsername : "";
          const storedOwnerDisplay =
            typeof data.ownerDisplayName === "string"
              ? data.ownerDisplayName
              : "";
          const fallbackOwner =
            storedOwnerDisplay ||
            (typeof data.ownerName === "string" ? data.ownerName : "") ||
            (typeof data.ownerEmail === "string" ? data.ownerEmail : "") ||
            "";
          const resolvedOwnerTitle =
            storedShareUsername.trim() ||
            fallbackOwner.trim() ||
            (viewingUid ? "Collector" : "");
          setShareOwnerTitle(resolvedOwnerTitle || "Collector");
          if (user && viewingUid === user.uid) {
            setShareUsernameInput(storedShareUsername);
            setShareUsernameStored(storedShareUsername);
            if (!storedOwnerDisplay) {
              const ownerLabel =
                (user.displayName || user.email || fallbackOwner || "").trim();
              if (ownerLabel) {
                saveCollection(user.uid, items, {
                  ownerDisplayName: ownerLabel,
                }).catch(() => {});
              }
            }
          }
          setShareAccessDenied(false);
          setShareEnabled(!!data.shareEnabled);
          if (shareTargetUid && !data.shareEnabled) {
            setShareAccessDenied(true);
            setShareSelectedMissingCount(0);
            setCollectionItems([]);
          }
          if (needsSync && user && viewingUid === user.uid) {
            saveCollection(user.uid, items).catch(() => {});
          }
        } else {
          if (shareTargetUid) {
            setShareAccessDenied(true);
          }
          setShareSelectedMissingCount(0);
          setCollectionItems([]);
          setHistoryData([]);
        }
      },
      () => {
        if (shareTargetUid) setShareAccessDenied(true);
      },
    );
  }, [db, viewingUid, shareTargetUid, user, isShareView, shareSelectedIds]);

  const addToCollection = async (card, condition = defaultCondition) => {
    if (inventoryReadOnly) {
      alert("Inventory is read-only in this view.");
      return;
    }
    if (!user) {
      alert("Sign in to save your collection.");
      return;
    }
    if (!db) {
      alert("Firebase is not configured.");
      return;
    }
    const item = {
      entryId: uniqueId(),
      id: card.id,
      name: card.name,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      links: card.links,
      condition,
      prices: card.prices,
      addedAt: Date.now(),
    };
    const next = [item, ...collectionItems];
    setCollectionItems(next);
    try {
      await saveCollection(user.uid, next);
      triggerQuickAddFeedback(`${card.name} added to My Inventory`);
    } catch (err) {
      console.error("Failed to save collection", err);
      alert(`Failed to save collection: ${err?.message ?? "Please try again."}`);
    }
  };

  const handleCollectionCardClick = (item) => {
    showCardDetails(item);
  };

  const removeFromCollection = async (entryId) => {
    if (inventoryReadOnly || isShareView) return;
    if (!user || !db) return;
    const next = collectionItems.filter((i) => i.entryId !== entryId);
    setCollectionItems(next);
    try {
      await saveCollection(user.uid, next);
    } catch (err) {
      console.error("Failed to update collection", err);
      alert(`Failed to update collection: ${err?.message ?? "Please try again."}`);
    }
  };

  const updateCollectionCondition = async (entryId, condition) => {
    if (inventoryReadOnly) return;
    if (!user || !db) return;
    const next = collectionItems.map((i) =>
      i.entryId === entryId ? { ...i, condition } : i,
    );
    setCollectionItems(next);
    try {
      await saveCollection(user.uid, next);
    } catch (err) {
      console.error("Failed to update collection", err);
      alert(`Failed to update collection: ${err?.message ?? "Please try again."}`);
    }
  };

  const handleRoundUpToggle = async (checked) => {
    if (inventoryReadOnly || isShareView) return;
    const nextValue = !!checked;
    const previous = roundUpPrices;
    if (!user || !db) {
      setRoundUpPrices(previous);
      if (!user) {
        alert("Sign in to save your rounding preference.");
      }
      return;
    }
    setRoundUpPrices(nextValue);
    try {
      await saveCollection(user.uid, collectionItems, { roundUp: nextValue });
    } catch (err) {
      console.error("Failed to update rounding preference", err);
      setRoundUpPrices(previous);
      alert(
        `Failed to update rounding preference: ${
          err?.message ?? "Please try again."
        }`,
      );
    }
  };

  const beginOverrideEdit = (item, event) => {
    if (inventoryReadOnly || isShareView) return;
    if (event) event.stopPropagation();
    const baseValue =
      item.overridePrice != null && !Number.isNaN(Number(item.overridePrice))
        ? Number(item.overridePrice)
        : getSuggestedCollectionValue(item);
    const formatted =
      baseValue != null && !Number.isNaN(Number(baseValue))
        ? Number(baseValue).toFixed(2)
        : "";
    setEditingOverrideId(item.entryId);
    setEditingOverrideValue(formatted);
  };

  const cancelOverrideEdit = () => {
    setEditingOverrideId(null);
    setEditingOverrideValue("");
  };

  const commitOverrideEdit = async (entryId, rawValue) => {
    if (inventoryReadOnly || isShareView) {
      cancelOverrideEdit();
      return;
    }
    if (!user || !db) {
      alert("Sign in to save manual prices.");
      cancelOverrideEdit();
      return;
    }
    const value = rawValue.trim();
    let nextOverride = null;
    if (value !== "") {
      const numeric = Number(value.replace(",", "."));
      if (Number.isNaN(numeric)) {
        alert("Enter a valid price before saving.");
        return;
      }
      nextOverride = numeric;
    }
    const previousItems = collectionItems;
    const nextItems = collectionItems.map((item) =>
      item.entryId === entryId ? { ...item, overridePrice: nextOverride } : item,
    );
    setCollectionItems(nextItems);
    cancelOverrideEdit();
    try {
      await saveCollection(user.uid, nextItems);
    } catch (err) {
      console.error("Failed to save manual price override", err);
      setCollectionItems(previousItems);
      alert(
        `Failed to save manual price: ${err?.message ?? "Please try again."}`,
      );
    }
  };

  const clearOverridePrice = async (entryId) => {
    if (inventoryReadOnly || isShareView) return;
    if (!user || !db) {
      alert("Sign in to manage manual prices.");
      return;
    }
    const previousItems = collectionItems;
    const nextItems = collectionItems.map((item) =>
      item.entryId === entryId ? { ...item, overridePrice: null } : item,
    );
    setCollectionItems(nextItems);
    if (editingOverrideId === entryId) {
      cancelOverrideEdit();
    }
    try {
      await saveCollection(user.uid, nextItems);
    } catch (err) {
      console.error("Failed to clear manual price override", err);
      setCollectionItems(previousItems);
      alert(
        `Failed to revert manual price: ${
          err?.message ?? "Please try again."
        }`,
      );
    }
  };

  const toggleCollectionSelection = (entryId, checked) => {
    if (inventoryReadOnly || isShareView) return;
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return Array.from(next);
    });
  };

  const deleteSelectedCollection = async () => {
    if (inventoryReadOnly || isShareView) return;
    if (!user || !db || selectedCollectionIds.length === 0) return;
    const next = collectionItems.filter(
      (item) => !selectedCollectionIds.includes(item.entryId),
    );
    setCollectionItems(next);
    setSelectedCollectionIds([]);
    try {
      await saveCollection(user.uid, next);
    } catch (err) {
      console.error("Failed to update collection", err);
      alert(`Failed to update collection: ${err?.message ?? "Please try again."}`);
    }
  };

  const calculateSelectedCollectionTotals = () => {
    if (selectedCollectionIds.length === 0) return;
    const diff = selectedCollectionTotals.tcg - selectedCollectionTotals.cmAvg;
    const diffDisplay = `${diff >= 0 ? "+" : "-"}${formatPrice(Math.abs(diff))}`;
    alert(
      `Selected inventory totals.\nTCG: ${formatPrice(selectedCollectionTotals.tcg)}\nMarket Avg: ${formatPrice(selectedCollectionTotals.cmAvg)}\nMarket Low: ${formatPrice(selectedCollectionTotals.cmLowest)}\nSuggested: ${formatPrice(selectedCollectionTotals.suggested)}\nDifference (TCG vs Market Avg): ${diffDisplay}`,
    );
  };

  const toggleSelectAllCollection = () => {
    if (inventoryReadOnly || isShareView) return;
    if (allCollectionSelected) {
      setSelectedCollectionIds([]);
    } else {
      setSelectedCollectionIds([...allSelectableCollectionIds]);
    }
  };

  const clearCollection = async () => {
    if (inventoryReadOnly) return;
    if (!user || !db) return;
    if (!window.confirm("Clear your entire inventory?")) return;
    setCollectionItems([]);
    setSelectedCollectionIds([]);
    try {
      await saveCollection(user.uid, []);
    } catch (err) {
      console.error("Failed to clear collection", err);
      alert(`Failed to clear collection: ${err?.message ?? "Please try again."}`);
    }
  };

  const handleShareToggle = async (enabled) => {
    if (!user || !db) return;
    setShareEnabled(enabled);
    try {
      const ref = doc(db, "collections", user.uid);
      await setDoc(ref, { shareEnabled: enabled }, { merge: true });
      if (enabled) {
        triggerQuickAddFeedback("Inventory sharing enabled");
      } else {
        triggerQuickAddFeedback("Inventory sharing disabled");
      }
    } catch (err) {
      console.error("Failed to update sharing", err);
      alert(`Failed to update sharing preference: ${err?.message ?? "Please try again."}`);
      setShareEnabled(!enabled);
    }
  };

  const handleShareNameSave = async () => {
    if (!user || !db) return;
    const trimmed = shareUsernameInput.trim();
    if (trimmed === shareUsernameStored.trim()) return;
    const fallbackOwner =
      (user.displayName || user.email || "").trim() || "Collector";
    try {
      await saveCollection(user.uid, collectionItems, {
        shareUsername: trimmed,
        ownerDisplayName: fallbackOwner,
      });
      setShareUsernameStored(trimmed);
      setShareOwnerTitle(trimmed || fallbackOwner);
      triggerQuickAddFeedback("Shareable name updated");
    } catch (err) {
      console.error("Failed to update shareable name", err);
      alert(
        `Failed to update shareable name: ${
          err?.message ?? "Please try again."
        }`,
      );
      setShareUsernameInput(shareUsernameStored);
    }
  };

  const handleShareNameKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleShareNameSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setShareUsernameInput(shareUsernameStored);
    }
  };

  const copyShareLink = async (url, { skipFeedback = false } = {}) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      if (!skipFeedback) {
        triggerQuickAddFeedback("Share link copied to clipboard");
      }
    } catch (err) {
      console.error("Failed to copy link", err);
      alert("Unable to copy share link. Please copy manually: " + url);
    }
  };
  const copyFullInventoryShare = () => {
    if (!user) return;
    const shareUrl = `${window.location.origin}?inventory=${user.uid}`;
    copyShareLink(shareUrl);
  };

  const shareSelectedInventory = () => {
    if (!selectedCollectionIds.length) {
      alert("Select some cards first, then try sharing again.");
      return;
    }
    const uniqueIds = Array.from(new Set(selectedCollectionIds));
    const param = uniqueIds.map(encodeURIComponent).join(",");
    const shareUrl = `${window.location.origin}?inventory=${viewingUid || user?.uid || ""}&selected=${param}`;
    copyShareLink(shareUrl);
    triggerQuickAddFeedback("Share link for selected cards copied");
  };

  // Totals for Collection
  const collectionTotals = useMemo(
    () => computeInventoryTotals(collectionItems),
    [collectionItems],
  );

  const filteredCollectionItems = useMemo(() => {
    const term = collectionSearch.trim().toLowerCase();
    let list = collectionItems;
    if (term) {
      list = list.filter((item) => {
        const fields = [
          item.name,
          item.set,
          item.rarity,
          item.number,
          item.condition,
        ]
          .join(" ")
          .toLowerCase();
        return fields.includes(term);
      });
    }
    const sorted = [...list].sort((a, b) => {
      const dir = collectionSortDir === "desc" ? -1 : 1;
      const getValue = (item) => {
        switch (collectionSortBy) {
          case "price_tcg":
            return computeTcgPrice(item, item.condition);
          case "price_cm":
            return getCardmarketAvg(item) || getCardmarketLowest(item) || 0;
          case "price_sales":
            return getSuggestedCollectionValue(item);
          case "price_diff":
            return (
              computeTcgPrice(item, item.condition) -
              (getCardmarketAvg(item) || getCardmarketLowest(item) || 0)
            );
          case "addedAt":
          default:
            return item.addedAt || 0;
        }
      };
      const av = getValue(a);
      const bv = getValue(b);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return sorted;
  }, [collectionItems, collectionSearch, collectionSortBy, collectionSortDir]);

  const selectedCollectionTotals = useMemo(() => {
    const selected = collectionItems.filter((item) =>
      selectedCollectionIds.includes(item.entryId),
    );
    return computeInventoryTotals(selected);
  }, [collectionItems, selectedCollectionIds]);

  const allSelectableCollectionIds = useMemo(
    () => collectionItems.map((item) => item.entryId),
    [collectionItems],
  );

  const allCollectionSelected =
    !inventoryReadOnly &&
    !isShareView &&
    allSelectableCollectionIds.length > 0 &&
    allSelectableCollectionIds.every((id) =>
      selectedCollectionIds.includes(id),
    );

  useEffect(() => {
    setSelectedCollectionIds((prev) =>
      prev.filter((id) => collectionItems.some((item) => item.entryId === id)),
    );
  }, [collectionItems]);

  useEffect(() => {
    if (inventoryReadOnly && selectedCollectionIds.length) {
      setSelectedCollectionIds([]);
    }
  }, [inventoryReadOnly, selectedCollectionIds.length]);

  useEffect(() => {
    if (isShareView) {
      const allowed = SHARE_SORT_OPTIONS.map((opt) => opt.value);
      if (!allowed.includes(collectionSortBy)) {
        setCollectionSortBy("price_sales");
      }
    } else {
      const allowed = INVENTORY_SORT_OPTIONS.map((opt) => opt.value);
      if (!allowed.includes(collectionSortBy)) {
        setCollectionSortBy("addedAt");
      }
    }
  }, [isShareView, collectionSortBy]);

  useEffect(() => {
    if (isShareView && historyMetric !== "suggested") {
      setHistoryMetric("suggested");
    }
  }, [isShareView, historyMetric]);

  const historySeries = useMemo(() => {
    if (!Array.isArray(historyData)) return [];
    const sorted = [...historyData]
      .filter((entry) => entry && typeof entry.ts === "number")
      .sort((a, b) => a.ts - b.ts);
    const range = HISTORY_RANGE_OPTIONS.find(
      (option) => option.value === historyRange,
    );
    if (range?.ms) {
      const cutoff = Date.now() - range.ms;
      return sorted.filter((entry) => entry.ts >= cutoff);
    }
    return sorted;
  }, [historyData, historyRange]);

  const historyMetricLabel = useMemo(
    () =>
      HISTORY_METRIC_OPTIONS.find((opt) => opt.value === historyMetric)?.label ??
      "Sales Price",
    [historyMetric],
  );

  const historyRangeLabel = useMemo(
    () =>
      HISTORY_RANGE_OPTIONS.find((opt) => opt.value === historyRange)?.label ??
      "All",
    [historyRange],
  );

  useEffect(() => {
    const tracker = priceRefreshRef.current;
    const key = viewingUid || "local";
    
    console.log('🔍 Price refresh check:', {
      itemCount: collectionItems.length,
      isRunning: tracker.running,
      lastRun: tracker.timestamps[key] || 0,
      viewingUid,
      inventoryReadOnly,
      isShareView
    });
    
    if (!collectionItems.length) {
      console.log('⏸️ No items to refresh');
      return;
    }
    if (tracker.running) {
      console.log('⏸️ Refresh already running');
      return;
    }
    const lastRun = tracker.timestamps[key] || 0;
    const ONE_DAY = 24 * 60 * 60 * 1000; // 24 hours
    
    // If never run before (lastRun === 0), run immediately
    // Otherwise, only run if 24 hours have passed
    if (lastRun !== 0 && Date.now() - lastRun < ONE_DAY) {
      const nextRun = new Date(lastRun + ONE_DAY);
      console.log('⏸️ Refresh not needed yet. Next run:', nextRun.toLocaleString());
      return;
    }

    console.log('🚀 Starting price refresh for', collectionItems.length, 'items...');
    tracker.running = true;
    (async () => {
      try {
        const updates = new Map();
        let changed = false;
        for (const item of collectionItems) {
          try {
            const fresh = await apiFetchCardDetails(item);
            if (fresh?.prices) {
              const merged = { ...item, prices: fresh.prices };
              
              // ALWAYS update market prices (even for manual overrides)
              // This ensures "% vs market" calculations stay accurate
              // Vendor inventory uses "overridePrice", collector uses "manualPrice"
              const hasManualOverride = item.overridePrice != null || item.manualPrice != null;
              
              if (!hasManualOverride) {
                // For items WITHOUT manual overrides, also recalculate suggested price
                let newSuggestedPrice;
                
                if (item.isGraded && item.gradedPrice) {
                  // Graded cards: use graded price as-is (already in USD)
                  newSuggestedPrice = parseFloat(item.gradedPrice);
                } else {
                  // Ungraded cards: compute from market prices
                  const metrics = computeItemMetrics(merged);
                  newSuggestedPrice = metrics.suggested;
                }
                
                merged.calculatedSuggestedPrice = newSuggestedPrice;
              }
              // Note: For items WITH manual overrides, we still update prices field
              // but keep their overridePrice/manualPrice intact
              
              updates.set(item.entryId, merged);
              if (
                !changed &&
                JSON.stringify(item.prices ?? null) !==
                  JSON.stringify(merged.prices ?? null)
              ) {
                changed = true;
              }
            }
          } catch (err) {
            console.warn("Failed to refresh price for", item?.name ?? item?.id, err);
          }
        }
        if (changed && updates.size) {
          let mergedItems = null;
          setCollectionItems((prev) => {
            const next = prev.map(
              (existing) => updates.get(existing.entryId) ?? existing,
            );
            mergedItems = next;
            return next;
          });
          if (
            mergedItems &&
            !inventoryReadOnly &&
            !isShareView &&
            user &&
            db
          ) {
            try {
              await saveCollection(user.uid, mergedItems);
              console.log("✅ Daily price refresh complete:", updates.size, "cards updated");
            } catch (err) {
              console.error("Failed to persist refreshed prices", err);
            }
          }
        }
      } catch (err) {
        console.error("Failed to refresh card prices", err);
      } finally {
        tracker.running = false;
        tracker.timestamps[key] = Date.now();
      }
    })();
  }, [
    collectionItems,
    viewingUid,
    inventoryReadOnly,
    isShareView,
    user,
    db,
  ]);

  // Trade Binder (local only)
  const [tradeItems, setTradeItems] = useState([]);
  const [tradeDefaultPct, setTradeDefaultPct] = useState(90);
  const addToTrade = (card, condition = defaultCondition) => {
    const item = {
      id: `${card.id}-trade`,
      baseId: card.id,
      name: card.name,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      links: card.links,
      condition,
      prices: card.prices,
      tradePct: tradeDefaultPct,
      addedAt: Date.now(),
    };
    setTradeItems((prev) => [
      item,
      ...prev.filter((i) => i.baseId !== card.id),
    ]);
    triggerQuickAddFeedback(`${card.name} added to Trade Binder`);
  };
  const removeFromTrade = (id) =>
    setTradeItems((prev) => prev.filter((i) => i.id !== id));
  const updateTradeCondition = (id, condition) =>
    setTradeItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, condition } : i)),
    );

  const updateTradePct = (id, pct) =>
    setTradeItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, tradePct: clampPercent(pct, 40, 120) } : i,
      ),
    );

  const clearTradeBinder = () => setTradeItems([]);

  const handleTradeDefaultChange = (pct) => {
    const next = clampPercent(pct, 40, 120);
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

  const tradeTotals = useMemo(() => {
    return tradeItems.reduce(
      (acc, item) => {
        const pct = (item.tradePct ?? tradeDefaultPct) / 100;
        const tcg = computeTcgPrice(item, item.condition) * pct;
        const cmAvg = (getCardmarketAvg(item) || 0) * pct;
        const cmLowest = (getCardmarketLowest(item) || 0) * pct;
        acc.tcgMarket += tcg;
        acc.cmAvg += cmAvg;
        acc.cmLowest += cmLowest;
        return acc;
      },
      { tcgMarket: 0, cmAvg: 0, cmLowest: 0 },
    );
  }, [tradeItems, tradeDefaultPct]);

  const [tradeSortBy, setTradeSortBy] = useState("addedAt");
  const [tradeSortDir, setTradeSortDir] = useState("desc");

  const sortedTradeItems = useMemo(() => {
    const direction = tradeSortDir === "desc" ? -1 : 1;
    const getValue = (item) => {
      const tradeTcg =
        (item.tradePct ?? tradeDefaultPct) /
        100 *
        computeTcgPrice(item, item.condition);
      const tradeCm =
        (item.tradePct ?? tradeDefaultPct) /
        100 *
        (getCardmarketAvg(item) || getCardmarketLowest(item) || 0);
      switch (tradeSortBy) {
        case "price_tcg":
          return tradeTcg;
        case "price_cm":
          return tradeCm;
        case "price_diff":
          return tradeTcg - tradeCm;
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

  const [buyItems, setBuyItems] = useState([]);
  const [buyDefaultPct, setBuyDefaultPct] = useState(70);
  const [selectedBuyIds, setSelectedBuyIds] = useState([]);
  
  // Wishlist state (stored in Firestore)
  const [wishlistItems, setWishlistItems] = useState([]);

  const addToBuy = (card, condition = defaultCondition) => {
    const item = {
      entryId: uniqueId(),
      id: card.id,
      name: card.name,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      links: card.links,
      condition,
      prices: card.prices,
      quantity: 1,
      buyPct: buyDefaultPct,
      addedAt: Date.now(),
    };
    setBuyItems((prev) => [item, ...prev]);
    triggerQuickAddFeedback(`${card.name} added to Buy List`);
  };

  const removeFromBuy = (entryId) =>
    setBuyItems((prev) => prev.filter((item) => item.entryId !== entryId));

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
    const next = clampPercent(pct, 40, 120);
    setBuyItems((prev) =>
      prev.map((item) =>
        item.entryId === entryId ? { ...item, buyPct: next } : item,
      ),
    );
  };

  const clearBuyList = () => {
    setBuyItems([]);
    setSelectedBuyIds([]);
  };

  const buyTotals = useMemo(() => {
    const totals = buyItems.reduce(
      (acc, item) => {
        const qty = item.quantity || 1;
        const pct = (item.buyPct ?? buyDefaultPct) / 100;
        const tcgBase = computeTcgPrice(item, item.condition);
        const cmAvg = getCardmarketAvg(item) || 0;
        const cmLowest = getCardmarketLowest(item) || 0;
        const plannedTcg = tcgBase * pct * qty;
        acc.tcg += plannedTcg;
        acc.cmAvg += cmAvg * qty;
        acc.cmLowest += cmLowest * qty;
        acc.suggested += plannedTcg;
        return acc;
      },
      { tcg: 0, cmLowest: 0, cmAvg: 0, suggested: 0 },
    );
    return totals;
  }, [buyItems, buyDefaultPct]);

  const selectedBuyTotals = useMemo(() => {
    const selected = buyItems.filter((item) => selectedBuyIds.includes(item.entryId));
    return selected.reduce(
      (acc, item) => {
        const qty = item.quantity || 1;
        const pct = (item.buyPct ?? buyDefaultPct) / 100;
        const tcgBase = computeTcgPrice(item, item.condition);
        const cmAvg = getCardmarketAvg(item) || 0;
        const cmLowest = getCardmarketLowest(item) || 0;
        const plannedTcg = tcgBase * pct * qty;
        acc.tcg += plannedTcg;
        acc.cmAvg += cmAvg * qty;
        acc.cmLowest += cmLowest * qty;
        acc.suggested += plannedTcg;
        return acc;
      },
      { tcg: 0, cmAvg: 0, cmLowest: 0, suggested: 0 },
    );
  }, [buyItems, selectedBuyIds, buyDefaultPct]);

  useEffect(() => {
    setSelectedBuyIds((prev) =>
      prev.filter((id) => buyItems.some((item) => item.entryId === id)),
    );
  }, [buyItems]);

  const handleBuyDefaultChange = (pct) => {
    const next = clampPercent(pct, 40, 120);
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

  const toggleBuySelection = (entryId, checked) => {
    setSelectedBuyIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return Array.from(next);
    });
  };

  const deleteSelectedBuy = () => {
    if (selectedBuyIds.length === 0) return;
    setBuyItems((prev) => prev.filter((item) => !selectedBuyIds.includes(item.entryId)));
    setSelectedBuyIds([]);
  };

  // ========================
  // Wishlist Management
  // ========================
  
  const addToWishlist = async (card) => {
    if (!user) {
      alert("Sign in to save your wishlist.");
      return;
    }
    if (!db) {
      alert("Firebase is not configured.");
      return;
    }
    const item = {
      entryId: uniqueId(),
      id: card.id,
      name: card.name,
      set: card.set,
      rarity: card.rarity,
      number: card.number,
      image: card.image,
      addedAt: Date.now(),
      prices: card.prices || {},
      tcgplayer: card.tcgplayer || {},
      cardmarket: card.cardmarket || {},
    };
    const nextWishlist = [...wishlistItems, item];
    setWishlistItems(nextWishlist);
    await persistWishlist(nextWishlist);
    triggerQuickAddFeedback(`Added ${card.name} to wishlist!`);
  };

  const removeFromWishlist = async (entryId) => {
    const nextWishlist = wishlistItems.filter((item) => item.entryId !== entryId);
    setWishlistItems(nextWishlist);
    await persistWishlist(nextWishlist);
  };

  const clearWishlist = async () => {
    setWishlistItems([]);
    await persistWishlist([]);
  };

  const persistWishlist = async (items) => {
    if (!user || !db) return;
    const ref = doc(db, "wishlists", user.uid);
    await setDoc(ref, { items: cloneForFirestore(items) }, { merge: true });
  };

  const wishlistTotals = useMemo(() => {
    return wishlistItems.reduce(
      (acc, item) => {
        const tcg = computeTcgPrice(item, "NM");
        const cmAvg = getCardmarketAvg(item) || 0;
        const cmLowest = getCardmarketLowest(item) || 0;
        acc.count += 1;
        acc.tcg += tcg;
        acc.cmAvg += cmAvg;
        acc.cmLowest += cmLowest;
        return acc;
      },
      { count: 0, tcg: 0, cmAvg: 0, cmLowest: 0 },
    );
  }, [wishlistItems]);

  // Load wishlist from Firestore
  useEffect(() => {
    if (!db || !user) {
      setWishlistItems([]);
      return undefined;
    }
    const ref = doc(db, "wishlists", user.uid);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        const items = Array.isArray(data.items) ? data.items : [];
        setWishlistItems(items);
      } else {
        setWishlistItems([]);
      }
    });
  }, [db, user]);

  // ========================
  // CSV Import/Export
  // ========================
  
  const exportCollectionToCSV = () => {
    if (collectionItems.length === 0) {
      alert("No items in collection to export.");
      return;
    }
    
    const headers = ["Name", "Set", "Number", "Rarity", "Condition", "TCG Price", "Market Avg", "Market Low", "Suggested Price"];
    const rows = collectionItems.map(item => {
      const metrics = computeItemMetrics(item);
      return [
        item.name || "",
        item.set || "",
        item.number || "",
        item.rarity || "",
        item.condition || "NM",
        metrics.tcgMarket.toFixed(2),
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
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `pokemon-collection-${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importCollectionFromCSV = (file) => {
    if (!user) {
      alert("Sign in to import collection.");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split("\n").filter(line => line.trim());
        
        if (lines.length < 2) {
          alert("CSV file is empty or invalid.");
          return;
        }
        
        // Skip header row
        const dataLines = lines.slice(1);
        let importedCount = 0;
        const localSearchCache = new Map();
        
        for (const line of dataLines) {
          const cells = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
          const values = cells.map(cell => cell.replace(/^"|"$/g, "").replace(/""/g, '"'));
          
          if (values.length < 5) continue;
          
          const [name, set, number, rarity, condition] = values;
          
          // Search for the card to get full details
          try {
            const searchTerm = `${name} ${set}`.trim();
            let results = localSearchCache.get(searchTerm);
            if (!results) {
              results = await apiSearchCards(searchTerm, {
                allowExpired: true,
                maxResults: 20,
              });
              localSearchCache.set(searchTerm, results);
            }
            const match = results.find(card => 
              card.name === name && 
              (card.set === set || !set) &&
              (card.number === number || !number)
            );
            
            if (match) {
              await addToCollection(match, condition || "NM");
              importedCount++;
            }
          } catch (err) {
            console.error(`Failed to import ${name}:`, err);
          }
        }
        
        alert(`Successfully imported ${importedCount} cards from CSV.`);
      } catch (err) {
        alert(`Failed to import CSV: ${err.message}`);
      }
    };
    
    reader.readAsText(file);
  };

  const calculateSelectedBuyTotals = () => {
    if (selectedBuyIds.length === 0) return;
    const { tcg, cmAvg, cmLowest, suggested } = selectedBuyTotals;
    alert(
      `Selected buy totals.\nPlanned TCG: ${formatPrice(tcg)}\nMarket Avg (reference): ${formatPrice(cmAvg)}\nMarket Low (reference): ${formatPrice(cmLowest)}\nSuggested Buy: ${formatPrice(suggested)}`,
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <AnimatePresence>
          {quickAddFeedback && (
            <motion.div
              key={quickAddFeedback.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="fixed right-4 top-4 z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-lg"
            >
              {quickAddFeedback.message}
            </motion.div>
          )}
        </AnimatePresence>
        <Header
          user={user}
          onLogin={handleLogin}
          onLogout={handleLogout}
          hideAuth={isShareView}
          onToggleMenu={() => setDrawerOpen((d) => !d)}
        />

        {drawerOpen && (
          <div className="fixed inset-0 z-40 flex">
            <div
              className="w-72 bg-background border-r shadow-xl p-4 flex flex-col gap-2"
              role="dialog"
              aria-label="Main menu"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Navigation
              </div>
              <Button
                variant={workspace === "user" ? "secondary" : "outline"}
                onClick={() => {
                  setWorkspace("user");
                  setDrawerOpen(false);
                }}
              >
                My User
              </Button>
              <Button
                variant={workspace === "collector" ? "secondary" : "outline"}
                onClick={() => {
                  setWorkspace("collector");
                  setActiveTab("pricer");
                  setDrawerOpen(false);
                }}
              >
                Collector Toolkit
              </Button>
              <Button
                variant={workspace === "vendor" ? "secondary" : "outline"}
                onClick={() => {
                  setWorkspace("vendor");
                  setActiveTab("pricer");
                  setDrawerOpen(false);
                }}
              >
                Vendor Toolkit
              </Button>
            </div>
            <div
              className="flex-1 bg-black/30"
              onClick={() => setDrawerOpen(false)}
            />
          </div>
        )}

        {workspace === "user" && (
          <MyUserPanel
            user={user}
            shareEnabled={shareEnabled}
            shareUsernameInput={shareUsernameInput}
            setShareUsernameInput={setShareUsernameInput}
            handleShareNameSave={handleShareNameSave}
            handleShareNameKeyDown={handleShareNameKeyDown}
            handleShareToggle={handleShareToggle}
            exportCollectionToCSV={exportCollectionToCSV}
            copyFullInventoryShare={copyFullInventoryShare}
          />
        )}
        {workspace !== "user" && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList
            className={`grid rounded-2xl ${
              isShareView ? "grid-cols-1" : "grid-cols-6"
            }`}
          >
            {!isShareView && (
              <TabsTrigger value="pricer">Card Pricer</TabsTrigger>
            )}
            <TabsTrigger value="collection">
              {isShareView ? "Inventory" : "My Inventory"}
            </TabsTrigger>
            {!isShareView && (
              <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
            )}
            {!isShareView && (
              <TabsTrigger value="insights">Insights</TabsTrigger>
            )}
            {!isShareView && (
              <TabsTrigger value="trade">Trade Binder</TabsTrigger>
            )}
            {!isShareView && <TabsTrigger value="buy">Buy List</TabsTrigger>}
          </TabsList>

          {/* Card Pricer */}
          {!isShareView && (
            <TabsContent value="pricer" className="mt-4">
            <Card className="rounded-2xl p-4 shadow">
              <CardContent className="space-y-4 p-0">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <Input
                    placeholder="Search by name, set (e.g., Crown Zenith), or number (e.g., GG69)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm opacity-70">
                      Default condition
                    </span>
                    <ConditionSelect
                      value={defaultCondition}
                      onChange={setDefaultCondition}
                    />
                  </div>
                </div>
                {loading && <div className="text-sm opacity-70">Searching…</div>}
                {error && (
                  <div className="text-sm text-red-500">{error}</div>
                )}
                {visibleSuggestions.length > 0 && (
                  <div className="divide-y rounded-xl border">
                    {visibleSuggestions.map((s) => (
                      <SuggestionItem
                        key={`${s.id}-${s.slug}`}
                        item={s}
                        onPick={pickCard}
                        onQuickAddCollection={(c) => addToCollection(c)}
                        onQuickAddTrade={(c) => addToTrade(c)}
                        onQuickAddBuy={(c) => addToBuy(c)}
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
                        {activeCard.image ? (
                          <img
                            src={activeCard.image}
                            alt={activeCard.name}
                            className="w-full rounded-xl"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted">
                            No image
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
                        <CardPrices
                          card={activeCard}
                          condition={defaultCondition}
                          formatPrice={formatPrice}
                        />
                        <div className="flex flex-wrap gap-3 pt-2">
                          <Button onClick={() => addToCollection(activeCard)}>
                            <Plus className="mr-1 h-4 w-4" /> Add to Inventory
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => addToWishlist(activeCard)}
                          >
                            <Plus className="mr-1 h-4 w-4" /> Add to Wishlist
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => addToTrade(activeCard)}
                          >
                            <Plus className="mr-1 h-4 w-4" /> Add to Trade
                            Binder
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => addToBuy(activeCard)}
                          >
                            <Plus className="mr-1 h-4 w-4" /> Add to Buy List
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            </TabsContent>
          )}

          {/* My Inventory */}
          <TabsContent value="collection" className="mt-4 space-y-4">
            {shareAccessDenied ? (
              <Card className="p-6 text-sm text-muted-foreground">
                This inventory is not shared or the share link has been disabled.
              </Card>
            ) : (
              <>
                {isShareView && (
                  <div className="rounded-2xl bg-emerald-100/70 px-4 py-3 text-lg font-bold text-emerald-700 shadow-sm">
                    {ownerHeadingPossessive} Collection
                  </div>
                )}
                    {!inventoryReadOnly && !isShareView && (
                  <div className="flex flex-col gap-3 rounded-2xl border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-semibold">
                        Sharing is {shareEnabled ? "enabled" : "disabled"}.
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        Shareable name
                        <Input
                          value={shareUsernameInput}
                          onChange={(e) => setShareUsernameInput(e.target.value)}
                          onBlur={handleShareNameSave}
                          onKeyDown={handleShareNameKeyDown}
                          placeholder="e.g., Rafchu"
                          className="h-8 w-48"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Button
                        size="sm"
                        variant={shareEnabled ? "secondary" : "outline"}
                        onClick={() => handleShareToggle(!shareEnabled)}
                      >
                        {shareEnabled ? "Disable Sharing" : "Enable Sharing"}
                      </Button>
                      {shareEnabled && (
                        <>
                          <Button size="sm" onClick={copyFullInventoryShare}>
                            Share Entire Inventory
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={selectedCollectionIds.length === 0}
                            onClick={shareSelectedInventory}
                          >
                            Share Selected Inventory
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportCollectionToCSV}
                        disabled={collectionItems.length === 0}
                      >
                        <Upload className="mr-1 h-3 w-3" /> Export CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".csv";
                          input.onchange = (e) => {
                            const file = e.target.files?.[0];
                            if (file) importCollectionFromCSV(file);
                          };
                          input.click();
                        }}
                      >
                        <Upload className="mr-1 h-3 w-3" /> Import CSV
                      </Button>
                    </div>
                  </div>
                )}
                {inventoryReadOnly && (
                  <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                    Viewing read-only inventory.
                  </div>
                )}
                {shareFilterActive && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    Showing {collectionItems.length} card
                    {collectionItems.length === 1 ? "" : "s"} selected by the owner
                    {shareSelectedMissingCount > 0 &&
                      ` • ${shareSelectedMissingCount} no longer available`}
                  </div>
                )}
                <Card className="rounded-2xl border shadow-sm">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          Inventory value over time
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {historyMetricLabel} • {historyRangeLabel}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                        {!isShareView && (
                          <select
                            className="rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                            value={historyMetric}
                            onChange={(e) => setHistoryMetric(e.target.value)}
                          >
                            {HISTORY_METRIC_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="flex overflow-hidden rounded-lg border">
                          {HISTORY_RANGE_OPTIONS.map((opt) => {
                            const active = historyRange === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={`px-2 py-1 text-xs font-semibold transition ${
                                  active
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background text-muted-foreground hover:bg-muted/60"
                                }`}
                                onClick={() => setHistoryRange(opt.value)}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <InventoryHistoryChart
                      data={historySeries}
                      metric={historyMetric}
                      metricLabel={historyMetricLabel}
                      rangeLabel={historyRangeLabel}
                      formatPrice={formatPrice}
                    />
                  </CardContent>
                </Card>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      placeholder="Search inventory..."
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      className="w-56"
                    />
                    {!isShareView && (
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={roundUpPrices}
                          onChange={(e) => handleRoundUpToggle(e.target.checked)}
                          disabled={inventoryReadOnly}
                        />
                        Round to next €
                      </label>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <label className="opacity-70">Sort by</label>
                      <select
                        className="rounded-md border px-2 py-1"
                        value={collectionSortBy}
                        onChange={(e) => setCollectionSortBy(e.target.value)}
                      >
                        {(isShareView ? SHARE_SORT_OPTIONS : INVENTORY_SORT_OPTIONS).map(
                          (opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ),
                        )}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setCollectionSortDir((prev) =>
                            prev === "desc" ? "asc" : "desc",
                          )
                        }
                      >
                        {collectionSortDir === "desc" ? "↓" : "↑"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {isShareView ? (
                      <div>
                        Total Sales Price:{" "}
                        {formatPrice(collectionTotals.suggested)}
                      </div>
                    ) : (
                      <div>
                        Total: TCG {formatPrice(collectionTotals.tcg)} • Market Avg{" "}
                        {formatPrice(collectionTotals.cmAvg)} • Market Low{" "}
                        {formatPrice(collectionTotals.cmLowest)} • Suggested{" "}
                        {formatPrice(collectionTotals.suggested)}
                      </div>
                    )}
                    {!inventoryReadOnly && !isShareView && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={collectionItems.length === 0}
                        onClick={clearCollection}
                      >
                        Clear Inventory
                      </Button>
                    )}
                  </div>
                </div>
                {!inventoryReadOnly && !isShareView && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={collectionItems.length === 0}
                      onClick={toggleSelectAllCollection}
                    >
                      {allCollectionSelected ? "Clear Selection" : "Select All"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={selectedCollectionIds.length === 0}
                      onClick={calculateSelectedCollectionTotals}
                    >
                      Calculate Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={selectedCollectionIds.length === 0}
                      onClick={deleteSelectedCollection}
                    >
                      Delete Selected
                    </Button>
                    {selectedCollectionIds.length > 0 && (
                      <div className="text-xs font-medium text-muted-foreground">
                        Selected {selectedCollectionIds.length}: TCG{" "}
                        {formatPrice(selectedCollectionTotals.tcg)} • Market Avg{" "}
                        {formatPrice(selectedCollectionTotals.cmAvg)} • Suggested{" "}
                        {formatPrice(selectedCollectionTotals.suggested)}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid gap-3">
                  {collectionItems.length === 0 && (
                    <div className="text-sm opacity-70">
                      {shareFilterActive
                        ? "No cards available in this shared selection."
                        : "No cards yet. Add from Card Pricer."}
                    </div>
                  )}
                  {collectionItems.length > 0 && filteredCollectionItems.length === 0 && (
                    <div className="text-sm opacity-70">
                      No cards match your search.
                    </div>
                  )}
                  {filteredCollectionItems.map((it) => {
                    const entryId = it.entryId || it.id;
                    const hasOverride =
                      it.overridePrice != null &&
                      !Number.isNaN(Number(it.overridePrice));
                    const canEditSuggested = !inventoryReadOnly && !isShareView;
                    const canSelect = !inventoryReadOnly && !isShareView;
                    const cardClickable = !isShareView;
                    const isEditing =
                      canEditSuggested && editingOverrideId === entryId;
                    const suggestedValue = getSuggestedCollectionValue(it);
                    const displayPrice = hasOverride
                      ? euro(Number(it.overridePrice))
                      : formatPrice(suggestedValue);
                    const priceLabel = isShareView
                      ? "Sales Price"
                      : hasOverride
                        ? "Manual"
                        : "Suggested";
                    const priceClasses = isShareView
                      ? "rounded-full bg-emerald-500 px-4 py-2 text-base font-bold text-white shadow-lg ring-4 ring-emerald-300/40 animate-pulse"
                      : hasOverride
                        ? "rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-600"
                        : "rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary";
                    const conditionBadgeClass =
                      `inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${conditionClasses(it.condition, "badge")}`;
                    return (
                      <Card
                        key={entryId}
                        className={`rounded-2xl p-3 transition ${
                          cardClickable ? "cursor-pointer hover:bg-accent/40" : ""
                        }`}
                        onClick={
                          cardClickable ? () => handleCollectionCardClick(it) : undefined
                        }
                      >
                        <div className="flex items-center gap-3">
                          {it.image && (
                            <img
                              src={it.image}
                              alt={it.name}
                              className="h-20 w-16 rounded-lg object-cover"
                            />
                          )}
                          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                {isShareView ? (
                                  <div className={conditionBadgeClass}>
                                    {(it.condition || "NM").toUpperCase()}
                                  </div>
                                ) : (
                                  <ConditionSelect
                                    value={it.condition}
                                    onChange={(v) =>
                                      updateCollectionCondition(entryId, v)
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={inventoryReadOnly}
                                  />
                                )}
                                <div className="truncate font-medium">
                                  {it.name}
                                </div>
                              </div>
                              <div className="truncate text-xs opacity-70">
                                {it.set} • {it.rarity} • #{it.number}
                              </div>
                              {!inventoryReadOnly && !isShareView && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="flex items-center gap-1">
                                      <span>TCG</span>
                                      <span className={conditionBadgeClass}>
                                        {(it.condition || "NM").toUpperCase()}
                                      </span>
                                      <span>
                                        {formatPrice(
                                          computeTcgPrice(it, it.condition),
                                        )}
                                      </span>
                                    </span>
                                    <span>
                                      • Market Avg {formatPrice(getCardmarketAvg(it))}
                                    </span>
                                    <span>
                                      • Market Low{" "}
                                      {formatPrice(getCardmarketLowest(it))}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-none items-center gap-3">
                              {isEditing ? (
                                <input
                                  autoFocus
                                  type="text"
                                  inputMode="decimal"
                                  className="rounded-full border border-primary/40 px-3 py-1 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
                                  value={editingOverrideValue}
                                  onChange={(e) =>
                                    setEditingOverrideValue(e.target.value)
                                  }
                                  onBlur={() =>
                                    commitOverrideEdit(entryId, editingOverrideValue)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitOverrideEdit(
                                        entryId,
                                        editingOverrideValue,
                                      );
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelOverrideEdit();
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : canEditSuggested ? (
                                <button
                                  type="button"
                                  className={`${priceClasses} cursor-pointer hover:shadow-sm`}
                                  title="Click to override the suggested price"
                                  onClick={(e) => beginOverrideEdit(it, e)}
                                >
                                  {priceLabel} {displayPrice}
                                </button>
                              ) : (
                                <div
                                  className={`${priceClasses} ${
                                    isShareView ? "shadow-lg" : "opacity-90"
                                  }`}
                                  title={`${priceLabel} ${displayPrice}`}
                                >
                                  {priceLabel} {displayPrice}
                                </div>
                              )}
                              {canEditSuggested && hasOverride && !isEditing && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    clearOverridePrice(entryId);
                                  }}
                                >
                                  Revert
                                </Button>
                              )}
                              {canSelect && (
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={selectedCollectionIds.includes(entryId)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleCollectionSelection(
                                      entryId,
                                      e.target.checked,
                                    );
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              {canSelect && (
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromCollection(entryId);
                                  }}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {!isShareView && (
            <>
          {/* Trade Binder */}
          <TabsContent value="trade" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2 text-sm opacity-80">
                <span>Local only (not saved to Firebase)</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm opacity-80">Default Trade %</label>
                  <PercentSelect
                    value={tradeDefaultPct}
                    onChange={handleTradeDefaultChange}
                  />
                  <div className="flex items-center gap-2 text-sm">
                    <label className="opacity-70">Sort by</label>
                    <select
                      className="rounded-md border px-2 py-1"
                      value={tradeSortBy}
                      onChange={(e) => setTradeSortBy(e.target.value)}
                    >
                      <option value="addedAt">Date Added</option>
                      <option value="price_tcg">Price (TCG)</option>
                      <option value="price_cm">Price (Market Avg)</option>
                      <option value="price_diff">Price Difference</option>
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setTradeSortDir((prev) =>
                          prev === "desc" ? "asc" : "desc",
                        )
                      }
                    >
                      {tradeSortDir === "desc" ? "↓" : "↑"}
                    </Button>
                  </div>
                </div>
              </div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <div>
              Trade Value: TCG {euro(tradeTotals.tcgMarket)} • Market Avg {" "}
              {euro(tradeTotals.cmAvg)} • Market Low {" "}
              {euro(tradeTotals.cmLowest)}
            </div>
            <Button variant="secondary" onClick={clearTradeBinder}>
              Clear Trade Binder
            </Button>
            <Button
              variant="outline"
              disabled={tradeItems.length === 0 || !user}
              onClick={() => setShowTradeModal(true)}
            >
              Complete Trade
            </Button>
          </div>
        </div>

            <div className="grid gap-3">
              {tradeItems.length === 0 && (
                <div className="text-sm opacity-70">
                  No trade items yet. Add from Card Pricer.
                </div>
              )}
              {sortedTradeItems.map((it) => (
                <Card key={it.id} className="rounded-2xl p-3">
                  <div className="flex items-center gap-3">
                    {it.image && (
                      <img
                        src={it.image}
                        alt={it.name}
                        className="h-20 w-16 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{it.name}</div>
                      <div className="truncate text-xs opacity-70">
                        {it.set} • {it.rarity} • #{it.number}
                      </div>
                      <div className="mt-1 text-xs">
                        {(() => {
                          const pct = (it.tradePct ?? tradeDefaultPct) / 100;
                          const baseTcg = computeTcgPrice(it, it.condition);
                          const tcg = baseTcg * pct;
                          const cmAvg =
                            (getCardmarketAvg(it) || 0) * pct;
                          const cmLowest = (getCardmarketLowest(it) || 0) * pct;
                          return `TCG (${it.tradePct ?? tradeDefaultPct}%): ${euro(
                            tcg,
                          )} • Market Avg ${euro(cmAvg)} • Market Low ${euro(cmLowest)}`;
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ConditionSelect
                        value={it.condition}
                        onChange={(v) => updateTradeCondition(it.id, v)}
                      />
                      <PercentSelect
                        value={it.tradePct ?? tradeDefaultPct}
                        onChange={(val) => updateTradePct(it.id, val)}
                        className="text-xs"
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => removeFromTrade(it.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Buy List */}
          <TabsContent value="buy" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm opacity-80">
                <span>Planning purchases? Track them here locally.</span>
                <label className="text-sm opacity-80">Default Buy %</label>
                <PercentSelect
                  value={buyDefaultPct}
                  onChange={handleBuyDefaultChange}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                <div>
                  Total Spend: TCG {euro(buyTotals.tcg)} • Market Avg Ref {" "}
                  {euro(buyTotals.cmAvg)} • Market Low Ref {euro(buyTotals.cmLowest)} • Suggested {" "}
                  {euro(buyTotals.suggested)}
                </div>
              <Button
                size="sm"
                variant="outline"
                disabled={buyItems.length === 0}
                onClick={clearBuyList}
              >
                Clear Buy List
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={buyItems.length === 0 || !user}
                onClick={() => setShowBuyModal(true)}
              >
                Complete Purchase
              </Button>
            </div>
          </div>

            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <Button
                size="sm"
                variant="secondary"
                disabled={selectedBuyIds.length === 0}
                onClick={calculateSelectedBuyTotals}
              >
                Calculate Selected Spend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={selectedBuyIds.length === 0}
                onClick={deleteSelectedBuy}
              >
                Delete Selected
              </Button>
              {selectedBuyIds.length > 0 && (
                <div className="text-xs font-medium text-muted-foreground">
                  Selected {selectedBuyIds.length}: TCG {" "}
                  {euro(selectedBuyTotals.tcg)} • Market Avg Ref {" "}
                  {euro(selectedBuyTotals.cmAvg)} • Suggested {" "}
                  {euro(selectedBuyTotals.suggested)}
                </div>
              )}
            </div>

            <div className="grid gap-3">
              {buyItems.length === 0 && (
                <div className="text-sm opacity-70">
                  No cards yet. Use quick add from Card Pricer to plan purchases.
                </div>
              )}
              {buyItems.map((item) => {
                const qty = item.quantity || 1;
                const pct = (item.buyPct ?? buyDefaultPct) / 100;
                const tcgBase = computeTcgPrice(item, item.condition);
                const cmAvgBase = getCardmarketAvg(item) || 0;
                const cmLowestBase = getCardmarketLowest(item) || 0;
                const plannedTcg = tcgBase * pct;
                const suggestedPrice = plannedTcg * qty;
                return (
                  <Card key={item.entryId} className="rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-20 w-16 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="truncate text-xs opacity-70">
                          {item.set} • {item.rarity} • #{item.number}
                        </div>
                        <div className="mt-1 text-xs">
                          Qty {item.quantity || 1} • TCG ({item.buyPct ?? buyDefaultPct}%) {euro(
                            plannedTcg,
                          )} • Market Avg {euro(cmAvgBase)} • Market Low {euro(cmLowestBase)} • Suggested Buy {euro(
                            suggestedPrice,
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedBuyIds.includes(item.entryId)}
                          onChange={(e) => toggleBuySelection(item.entryId, e.target.checked)}
                        />
                        <input
                          type="number"
                          min={1}
                          className="w-16 rounded-md border px-2 py-1 text-sm"
                          value={item.quantity || 1}
                          onChange={(e) => updateBuyQuantity(item.entryId, e.target.value)}
                        />
                        <ConditionSelect
                          value={item.condition}
                          onChange={(v) => updateBuyCondition(item.entryId, v)}
                        />
                        <PercentSelect
                          value={item.buyPct ?? buyDefaultPct}
                          onChange={(val) => updateBuyPct(item.entryId, val)}
                          className="text-xs"
                        />
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => removeFromBuy(item.entryId)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Trade Modal */}
          {showTradeModal && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-background p-4 shadow-xl">
                <div className="mb-2 text-lg font-bold">Complete Trade</div>
                <div className="mb-3 text-sm text-muted-foreground">
                  Select inventory items you are trading out. Incoming cards are those currently in the Trade Binder.
                </div>
                <div className="max-h-64 overflow-auto rounded border">
                  {collectionItems.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No inventory items.</div>
                  ) : (
                    collectionItems.map((it) => (
                      <label key={it.entryId} className="flex items-center gap-3 border-b p-2 text-sm last:border-b-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedTradeOutIds.includes(it.entryId)}
                          onChange={(e) => {
                            setSelectedTradeOutIds((prev) =>
                              e.target.checked
                                ? [...prev, it.entryId]
                                : prev.filter((id) => id !== it.entryId),
                            );
                          }}
                        />
                        <span className="truncate">{it.name} • {it.set} • #{it.number}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setShowTradeModal(false); setSelectedTradeOutIds([]); }}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!user) return;
                      try {
                        // Build inbound from tradeItems
                        const inbound = tradeItems.map((c) => ({
                          id: c.id,
                          name: c.name,
                          set: c.set,
                          number: c.number,
                          rarity: c.rarity,
                          image: c.image,
                          condition: c.condition || "NM",
                        }));
                        // Outbound from selected ids
                        const outbound = collectionItems.filter((it) => selectedTradeOutIds.includes(it.entryId));
                        // New inventory: remove outbound, add inbound
                        const remaining = collectionItems.filter((it) => !selectedTradeOutIds.includes(it.entryId));
                        const added = inbound.map((card) => ({
                          entryId: uniqueId(),
                          ...card,
                          links: {},
                          prices: {},
                          addedAt: Date.now(),
                        }));
                        const next = [...added, ...remaining];
                        setCollectionItems(next);
                        await saveCollection(user.uid, next);
                        await recordTransaction(user.uid, {
                          type: "trade",
                          itemsIn: inbound,
                          itemsOut: outbound.map((o) => ({ id: o.id, name: o.name, set: o.set, number: o.number, condition: o.condition })),
                        });
                        setTradeItems([]);
                        setSelectedTradeOutIds([]);
                        setShowTradeModal(false);
                        triggerQuickAddFeedback("Trade recorded and inventory updated");
                      } catch (err) {
                        console.error("Trade completion failed", err);
                        alert(`Failed to complete trade: ${err?.message ?? "Please try again."}`);
                      }
                    }}
                  >
                    Complete Trade
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Buy Modal */}
          {showBuyModal && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-xl rounded-2xl bg-background p-4 shadow-xl">
                <div className="mb-2 text-lg font-bold">Complete Purchase</div>
                <div className="mb-3 text-sm text-muted-foreground">
                  Confirm to add the selected Buy List cards to your inventory.
                </div>
                <div className="max-h-64 overflow-auto rounded border">
                  {buyItems.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No items selected.</div>
                  ) : (
                    buyItems.map((it) => (
                      <div key={it.entryId} className="border-b p-2 text-sm last:border-b-0">
                        {it.name} • {it.set} • #{it.number}
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowBuyModal(false)}>Cancel</Button>
                  <Button
                    onClick={async () => {
                      if (!user) return;
                      try {
                        const inbound = buyItems.map((c) => ({
                          id: c.id,
                          name: c.name,
                          set: c.set,
                          number: c.number,
                          rarity: c.rarity,
                          image: c.image,
                          condition: c.condition || "NM",
                        }));
                        const added = inbound.map((card) => ({
                          entryId: uniqueId(),
                          ...card,
                          links: {},
                          prices: {},
                          addedAt: Date.now(),
                        }));
                        const next = [...added, ...collectionItems];
                        setCollectionItems(next);
                        await saveCollection(user.uid, next);
                        await recordTransaction(user.uid, {
                          type: "buy",
                          itemsIn: inbound,
                          itemsOut: [],
                        });
                        setBuyItems([]);
                        setShowBuyModal(false);
                        triggerQuickAddFeedback("Purchase recorded and inventory updated");
                      } catch (err) {
                        console.error("Purchase completion failed", err);
                        alert(`Failed to complete purchase: ${err?.message ?? "Please try again."}`);
                      }
                    }}
                  >
                    Complete Purchase
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Wishlist */}
          <TabsContent value="wishlist" className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm opacity-80">
                Track cards you want to collect. Total wishlist value: TCG {euro(wishlistTotals.tcg)} • Market Avg {euro(wishlistTotals.cmAvg)} • Market Low {euro(wishlistTotals.cmLowest)}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={wishlistItems.length === 0}
                onClick={clearWishlist}
              >
                Clear Wishlist
              </Button>
            </div>

            <div className="grid gap-3">
              {wishlistItems.length === 0 && (
                <div className="text-sm opacity-70">
                  No wishlist items yet. Add cards from Card Pricer.
                </div>
              )}
              {wishlistItems.map((item) => {
                const tcgPrice = computeTcgPrice(item, "NM");
                const cmAvg = getCardmarketAvg(item) || 0;
                const cmLowest = getCardmarketLowest(item) || 0;
                const inCollection = collectionItems.some(c => c.id === item.id);
                
                return (
                  <Card key={item.entryId} className="rounded-2xl p-3">
                    <div className="flex items-center gap-3">
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-20 w-16 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">{item.name}</div>
                          {inCollection && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              ✓ Owned
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs opacity-70">
                          {item.set} • {item.rarity} • #{item.number}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          TCG {euro(tcgPrice)} • Market Avg {euro(cmAvg)} • Market Low {euro(cmLowest)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => showCardDetails(item)}
                        >
                          View
                        </Button>
                        {!inCollection && (
                          <Button
                            size="sm"
                            onClick={() => addToCollection(item)}
                          >
                            Add to Collection
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => removeFromWishlist(item.entryId)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Insights */}
          <TabsContent value="insights" className="mt-4 space-y-4">
            <Card className="rounded-2xl p-4 shadow">
              <CardContent className="space-y-6 p-0">
                <div>
                  <h3 className="mb-4 text-lg font-bold">Collection Insights</h3>
                  
                  {/* Summary Cards */}
                  <div className="mb-6 grid gap-4 md:grid-cols-3">
                    <Card className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
                      <div className="text-sm font-medium text-muted-foreground">Total Cards</div>
                      <div className="mt-1 text-3xl font-bold">{collectionItems.length}</div>
                    </Card>
                    <Card className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                      <div className="text-sm font-medium text-emerald-700">Collection Value</div>
                      <div className="mt-1 text-3xl font-bold text-emerald-700">
                        {euro(collectionTotals.suggested)}
                      </div>
                    </Card>
                    <Card className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                      <div className="text-sm font-medium text-blue-700">Wishlist Items</div>
                      <div className="mt-1 text-3xl font-bold text-blue-700">
                        {wishlistTotals.count}
                      </div>
                    </Card>
                  </div>

                  {/* Rarity Breakdown */}
                  <div className="mb-6">
                    <h4 className="mb-3 font-semibold">Cards by Rarity</h4>
                    <div className="space-y-2">
                      {(() => {
                        const rarityCount = collectionItems.reduce((acc, item) => {
                          const rarity = item.rarity || "Unknown";
                          acc[rarity] = (acc[rarity] || 0) + 1;
                          return acc;
                        }, {});
                        const sortedRarities = Object.entries(rarityCount)
                          .sort((a, b) => b[1] - a[1]);
                        
                        return sortedRarities.map(([rarity, count]) => {
                          const percentage = ((count / collectionItems.length) * 100).toFixed(1);
                          return (
                            <div key={rarity} className="flex items-center gap-3">
                              <div className="w-32 text-sm font-medium">{rarity}</div>
                              <div className="flex-1">
                                <div className="h-6 overflow-hidden rounded-full bg-gray-200">
                                  <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <div className="w-20 text-right text-sm">
                                {count} ({percentage}%)
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Set Breakdown */}
                  <div className="mb-6">
                    <h4 className="mb-3 font-semibold">Cards by Set</h4>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {(() => {
                        const setCount = collectionItems.reduce((acc, item) => {
                          const set = item.set || "Unknown";
                          acc[set] = (acc[set] || 0) + 1;
                          return acc;
                        }, {});
                        const sortedSets = Object.entries(setCount)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 15);
                        
                        return sortedSets.map(([set, count]) => (
                          <div key={set} className="flex items-center justify-between rounded-lg border px-3 py-2">
                            <div className="truncate text-sm font-medium">{set}</div>
                            <div className="ml-4 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                              {count}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Value Distribution */}
                  <div>
                    <h4 className="mb-3 font-semibold">Value Distribution</h4>
                    <div className="space-y-2">
                      {(() => {
                        const ranges = [
                          { label: "Under €1", min: 0, max: 1 },
                          { label: "€1 - €5", min: 1, max: 5 },
                          { label: "€5 - €20", min: 5, max: 20 },
                          { label: "€20 - €50", min: 20, max: 50 },
                          { label: "€50+", min: 50, max: Infinity }
                        ];
                        
                        return ranges.map(({ label, min, max }) => {
                          const count = collectionItems.filter(item => {
                            const value = getSuggestedCollectionValue(item);
                            return value >= min && value < max;
                          }).length;
                          const percentage = collectionItems.length > 0
                            ? ((count / collectionItems.length) * 100).toFixed(1)
                            : 0;
                          
                          return (
                            <div key={label} className="flex items-center gap-3">
                              <div className="w-24 text-sm font-medium">{label}</div>
                              <div className="flex-1">
                                <div className="h-6 overflow-hidden rounded-full bg-gray-200">
                                  <div
                                    className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                              <div className="w-20 text-right text-sm">
                                {count} ({percentage}%)
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
            </>
          )}
        </Tabs>
        )}

      </div>
    </div>
  );
}
