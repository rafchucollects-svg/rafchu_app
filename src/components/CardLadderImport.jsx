import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, AlertCircle, Check, Loader2, ImageIcon } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { doc, setDoc, getDoc } from "firebase/firestore";

const CLOUD_FUNCTIONS_BASE = "https://us-central1-rafchu-tcg-app.cloudfunctions.net";

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSVText(text) {
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      current.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      current.push(field);
      field = "";
      if (current.some((f) => f.trim())) rows.push(current);
      current = [];
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += ch;
    }
  }
  current.push(field);
  if (current.some((f) => f.trim())) rows.push(current);
  return rows;
}

// ─── Name Cleanup ─────────────────────────────────────────────────────────────

const ABBREVIATION_MAP = {
  "reshrm.": "Reshiram",
  "charzrd.": "Charizard",
  "blstse.": "Blastoise",
  "vnsr.": "Venusaur",
  "pkmn": "Pokemon",
  "clbrtns.": "Celebrations",
  "twr.splh.": "Tower Splash",
  "scrt-fa": "Secret Full Art",
  "ultra-prem.coll.": "Ultra-Premium Collection",
  "splh.": "Splash",
  "prem.": "Premium",
  "coll.": "Collection",
  "g.b.": "Giant Bomb",
};

/** Apply abbreviation expansion to any text field */
function expandAbbreviations(text) {
  if (!text) return "";
  let result = text;
  for (const [abbr, full] of Object.entries(ABBREVIATION_MAP)) {
    const regex = new RegExp(abbr.replace(/\./g, "\\.").replace(/-/g, "\\-"), "gi");
    result = result.replace(regex, full);
  }
  return result.trim();
}

function cleanPlayerName(raw) {
  if (!raw) return "";
  let name = raw.trim();

  // Remove "Fa/" prefix (Full Art indicator)
  name = name.replace(/^Fa\//i, "");

  // Remove suffixes that indicate variant (store separately)
  name = name.replace(/-Holo$/i, "");
  name = name.replace(/-Rev\.Foil$/i, "");

  // Expand known abbreviations
  name = expandAbbreviations(name);

  // Insert space at lowercase→uppercase boundaries
  // Fixes "CharizardGx" → "Charizard Gx" after abbreviation expansion
  name = name.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Normalize card type suffixes
  name = name.replace(/\bGx\b/gi, "GX");
  name = name.replace(/\bVmax\b/gi, "VMAX");
  name = name.replace(/\bVstar\b/gi, "VSTAR");
  name = name.replace(/\bEx\b/g, "EX"); // generic uppercase
  name = name.replace(/\bV\b/g, "V");

  return name.trim();
}

function cleanSetName(raw) {
  if (!raw) return "";
  let set = raw.trim();

  // Remove "Pokemon " prefix
  set = set.replace(/^Pokemon\s+/i, "");

  // Remove era prefixes
  set = set.replace(/^Sword & Shield\s+/i, "");
  set = set.replace(/^Sun & Moon:\s*/i, "");
  set = set.replace(/^Sun & Moon\s+/i, "");
  set = set.replace(/^Swsh\s+/i, "SWSH ");
  set = set.replace(/^Sm\s+/i, "SM ");
  set = set.replace(/^Xy\s+/i, "XY ");
  set = set.replace(/^Bw\s+/i, "BW ");
  set = set.replace(/^Ex\s+/i, "EX ");
  set = set.replace(/^Svp\s+/i, "SVP ");

  // Clean up "Japanese" set format: "Japanese Sv-P Promo" etc.
  set = set.replace(/^Japanese\s+Sv\w*-/i, "Japanese ");

  return set.trim();
}

function parseCondition(raw) {
  if (!raw) return { company: "", grade: "" };
  const match = raw.trim().match(/^(PSA|BGS|SGC|CGC)\s+(.+)$/i);
  if (match) {
    return { company: match[1].toUpperCase(), grade: match[2].trim() };
  }
  return { company: "", grade: raw.trim() };
}

// ─── CSV Row → Card Item ──────────────────────────────────────────────────────

const REQUIRED_HEADERS = ["Player", "Set", "Condition", "Current Value"];

function validateHeaders(headers) {
  const normalized = headers.map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter(
    (req) => !normalized.some((h) => h.toLowerCase() === req.toLowerCase())
  );
  return { valid: missing.length === 0, missing, headers: normalized };
}

function rowToCard(row, headerMap) {
  const get = (col) => (row[headerMap[col]] || "").trim();

  const playerRaw = get("Player");
  const setRaw = get("Set");
  const variation = get("Variation");
  const number = get("Number");
  const condition = get("Condition");
  const investment = parseFloat(get("Investment")) || 0;
  const currentValue = parseFloat(get("Current Value")) || 0;
  const potentialProfit = parseFloat(get("Potential Profit")) || 0;
  const ladderId = get("Ladder ID");
  const slabSerial = get("Slab Serial #");
  const population = parseInt(get("Population")) || null;
  const datePurchased = get("Date Purchased");
  const quantity = parseInt(get("Quantity")) || 1;
  const fullCard = get("Card");
  const year = get("Year");
  const notes = get("Notes");

  const cleanName = cleanPlayerName(playerRaw);
  const cleanSet = cleanSetName(setRaw);
  const { company, grade } = parseCondition(condition);

  return {
    entryId: `cardladder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: cleanName,
    set: cleanSet,
    number: number,
    rarity: expandAbbreviations(variation) || "",
    image: "", // Will be populated by image fetching
    condition: "NM",
    quantity: quantity,
    addedAt: Date.now(),
    source: "cardladder",
    isGraded: true,
    gradingCompany: company,
    grade: grade,
    gradedPrice: currentValue,
    gradedPriceCurrency: "USD",
    cardladderData: {
      playerRaw,
      setRaw,
      fullCard,
      year,
      variation,
      investment,
      currentValue,
      potentialProfit,
      ladderId: ladderId || null,
      slabSerial: slabSerial || null,
      population,
      datePurchased,
      notes: notes || null,
      importedAt: Date.now(),
    },
  };
}

// ─── Image Fetching ───────────────────────────────────────────────────────────

async function searchCards(query) {
  const q = encodeURIComponent(query);
  try {
    // Search both CardMarket (English) and JustTCG (Japanese) in parallel
    const [cmRes, jpRes] = await Promise.all([
      fetch(`${CLOUD_FUNCTIONS_BASE}/searchCardMarket?q=${q}&maxResults=10`)
        .then((r) => (r.ok ? r.json() : { success: false }))
        .catch(() => ({ success: false })),
      fetch(`${CLOUD_FUNCTIONS_BASE}/searchJapaneseCards?q=${q}&limit=10`)
        .then((r) => (r.ok ? r.json() : { success: false }))
        .catch(() => ({ success: false })),
    ]);

    let results = [];

    // CardMarket (English) results
    if (cmRes?.success && cmRes?.results) {
      results = cmRes.results
        .map((raw) => {
          const d = raw?.data ?? raw;
          return {
            name: d?.name || "",
            number: String(d?.card_number ?? d?.collector_number ?? d?.number ?? ""),
            set: d?.episode?.name ?? d?.episode_name ?? d?.set_name ?? "",
            image: d?.image ?? d?.images?.[0] ?? "",
            id: d?.id ?? d?.card_id ?? "",
            prices: d?.prices || {},
          };
        })
        .filter((c) => c.name && c.image);
    }

    // Japanese card results
    if (jpRes?.success && jpRes?.cards) {
      const jpCards = jpRes.cards
        .map((card) => ({
          name: card.name || "",
          number: String(card.number || ""),
          set: card.set || "",
          image: card.image || card.imageUrl || "",
          id: card.justTcgId || card.id || "",
          prices: card.prices || {},
          isJapanese: true,
        }))
        .filter((c) => c.name && c.image);
      results = [...results, ...jpCards];
    }

    return results;
  } catch (err) {
    console.warn("Image search failed for:", query, err);
    return [];
  }
}

function normalizeNumber(num) {
  if (!num) return "";
  // Strip set suffix after "/" (e.g., "227/S-P" → "227", "100/196" → "100")
  let n = String(num).split("/")[0];
  return n.toLowerCase().replace(/^#/, "").replace(/^0+/, "").trim();
}

/**
 * Check if a card name from the API matches the CardLadder name.
 * Compares ALL base-name words (not just the first!) and any
 * card-type suffix (GX, VMAX, V, VSTAR, EX, etc.)
 *
 * "Shining Mew" must NOT match "Shining Tyranitar".
 * "Pikachu VMAX" must NOT match "Pikachu V".
 */
function namesMatch(cardLadderName, apiName) {
  const clName = (cardLadderName || "").toLowerCase().trim();
  const aName = (apiName || "").toLowerCase().trim();
  if (!clName || !aName) return false;

  const TYPE_SUFFIXES = new Set(["gx", "vmax", "vstar", "v", "ex", "tag"]);

  // Split on whitespace, &, and hyphens, then strip remaining punctuation from each token
  const toWords = (s) =>
    s
      .split(/[\s&\-]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);

  const clWords = toWords(clName);
  const aWords = toWords(aName);
  if (!clWords.length || !aWords.length) return false;

  // Separate base-name words from type suffixes
  const clBase = clWords.filter((w) => !TYPE_SUFFIXES.has(w));
  const aBase = aWords.filter((w) => !TYPE_SUFFIXES.has(w));
  const clTypes = clWords.filter((w) => TYPE_SUFFIXES.has(w));
  const aTypes = aWords.filter((w) => TYPE_SUFFIXES.has(w));

  // Base name: ALL words must match bidirectionally
  // "Shining Mew" ↔ "Shining Mew" ✓
  // "Shining Mew" ↔ "Shining Tyranitar" ✗ ("mew" not in api)
  // "Mew" ↔ "Shining Mew" ✗ ("shining" not in cl)
  if (clBase.length > 0 && aBase.length > 0) {
    const clSet = new Set(clBase);
    const aSet = new Set(aBase);
    if (!clBase.every((w) => aSet.has(w))) return false;
    if (!aBase.every((w) => clSet.has(w))) return false;
  }

  // Type suffix check
  if (clTypes.length > 0 && aTypes.length > 0) {
    return clTypes.some((t) => aTypes.includes(t));
  }
  if (clTypes.length > 0 && aTypes.length === 0) return false;
  if (clTypes.length === 0 && aTypes.length > 0) return false;

  return true;
}

/**
 * Check if the CardLadder set name matches an API result's set name.
 * Strips "Japanese" prefix, normalizes both, then checks for significant word overlap.
 */
function setsMatch(cardLadderSet, apiSet) {
  if (!cardLadderSet || !apiSet) return false;

  // Strip "Japanese" prefix from CardLadder set for comparison
  let clSet = cardLadderSet.replace(/^Japanese\s+/i, "").toLowerCase().trim();
  let aSet = (apiSet || "").toLowerCase().trim();

  if (!clSet || !aSet) return false;

  // Normalize: remove common noise words and punctuation
  const noise = /\b(pokemon|the|of|and|set|series|edition|collection)\b/gi;
  clSet = clSet.replace(noise, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  aSet = aSet.replace(noise, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // Exact match after normalization
  if (clSet === aSet) return true;

  // One contains the other
  if (clSet.includes(aSet) || aSet.includes(clSet)) return true;

  // Stem common word variants before overlap check
  // "promo" / "promos" / "promotional" → "promo", "star" / "stars" → "star"
  const stem = (w) => {
    if (w.startsWith("promo")) return "promo"; // promos, promotional, promo
    return w.replace(/s$/, ""); // simple plural stripping
  };

  // Significant word overlap (at least 1 meaningful word >= 3 chars, stemmed)
  const clWords = clSet.split(/\s+/).filter(w => w.length >= 3);
  const aWords = aSet.split(/\s+/).filter(w => w.length >= 3);
  const overlap = clWords.filter(w => {
    const ws = stem(w);
    return aWords.some(aw => {
      const as = stem(aw);
      return as.includes(ws) || ws.includes(as);
    });
  });
  return overlap.length > 0;
}

/**
 * Check if a CardLadder card appears to be Japanese, based on its set name.
 */
function isJapaneseCard(card) {
  return /^japanese\b/i.test(card.set || "");
}

function findBestMatch(card, results) {
  const cardNum = normalizeNumber(card.number);
  const cardIsJapanese = isJapaneseCard(card);

  // Helper: among a filtered list, prefer results that match set, then language
  function pickBest(candidates) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Prefer set match
    const setMatches = candidates.filter(r => setsMatch(card.set, r.set));
    if (setMatches.length > 0) return setMatches[0];

    // If card is Japanese, prefer Japanese API results; if English, prefer English
    if (cardIsJapanese) {
      const jpMatches = candidates.filter(r => r.isJapanese);
      if (jpMatches.length > 0) return jpMatches[0];
    } else {
      const enMatches = candidates.filter(r => !r.isJapanese);
      if (enMatches.length > 0) return enMatches[0];
    }

    return candidates[0];
  }

  // Tier 1: Exact number + name match (best possible match)
  const tier1 = results.filter(
    r => normalizeNumber(r.number) === cardNum && namesMatch(card.name, r.name)
  );
  if (tier1.length > 0) return pickBest(tier1);

  // Tier 2: Number contained (e.g., "SM166" vs "166") + name match
  const tier2 = results.filter(r => {
    const rNum = normalizeNumber(r.number);
    return rNum && cardNum && (rNum.includes(cardNum) || cardNum.includes(rNum))
      && namesMatch(card.name, r.name);
  });
  if (tier2.length > 0) return pickBest(tier2);

  // Tier 3: Name + set match (strong signal, even without number)
  const tier3set = results.filter(
    r => namesMatch(card.name, r.name) && setsMatch(card.set, r.set)
  );
  if (tier3set.length > 0) return pickBest(tier3set);

  // Tier 4: Name match only, with language preference
  const tier4 = results.filter(r => namesMatch(card.name, r.name));
  if (tier4.length > 0) return pickBest(tier4);

  // No match - do NOT return a result without name confirmation
  return null;
}

/**
 * Fetch images for a batch of cards using the CardMarket search API.
 * Uses a concurrency pool to avoid overwhelming the API.
 * 
 * Search strategy per card (in order):
 *   1. Search by "name number" (e.g., "Charizard VSTAR 262") — most specific
 *   2. Search by "name set" (e.g., "Charizard VSTAR SWSH Black Star Promo")
 *   3. Search by name only (e.g., "Charizard VSTAR")
 *   4. Search by number only as last resort for prefixed numbers (SM166, SV60)
 * 
 * Matching always requires NAME confirmation to avoid wrong-card-same-number errors.
 */
async function fetchImagesForCards(cards, onProgress, abortSignal) {
  const CONCURRENCY = 3;
  const DELAY_MS = 200; // small delay between batches to be polite
  let found = 0;
  let processed = 0;

  const results = new Array(cards.length).fill(null);

  // Process a single card
  async function processCard(idx) {
    if (abortSignal?.aborted) return;

    const card = cards[idx];
    const numberRaw = card.number?.trim();
    // Strip set suffix from number for searching (e.g., "227/S-P" → "227")
    const number = numberRaw?.replace(/\/.*$/, "").trim();
    const name = card.name?.trim();
    // Strip "&" for search (API doesn't handle it well in some cases)
    const searchName = name?.replace(/&/g, " ").replace(/\s+/g, " ").trim();

    const wantJapanese = isJapaneseCard(card);
    let match = null;
    let fallbackMatch = null; // English match when we wanted Japanese — keep looking

    // Helper: accept a match, or save it as fallback if it's the wrong language
    function acceptMatch(m) {
      if (!m) return false;
      if (wantJapanese && !m.isJapanese) {
        // Got an English match for a Japanese card — save as fallback, keep trying
        if (!fallbackMatch) fallbackMatch = m;
        return false;
      }
      match = m;
      return true;
    }

    // Attempt 1: Search by "name number" (most specific — avoids wrong cards with same number)
    if (!match && searchName && number) {
      const res = await searchCards(`${searchName} ${number}`);
      acceptMatch(findBestMatch(card, res));
    }

    // Attempt 2: Search by "name + set keywords" (helps when number format differs)
    if (!match && searchName && card.set) {
      // Strip "Japanese" prefix and era prefixes, then take first 2 meaningful words
      const setWords = card.set
        .replace(/^Japanese\s+/i, "")
        .replace(/^(SWSH|SM|XY|BW|EX|SVP)\s+/i, "")
        .split(/\s+/)
        .filter(w => w.length > 1) // drop single-char noise
        .slice(0, 2)
        .join(" ");
      if (setWords) {
        const res = await searchCards(`${searchName} ${setWords}`);
        acceptMatch(findBestMatch(card, res));
      }
    }

    // Attempt 3: Search by name only
    if (!match && searchName) {
      const res = await searchCards(searchName);
      acceptMatch(findBestMatch(card, res));
    }

    // Attempt 4: Search by number only — but ONLY for prefixed numbers (SM166, SV60, TG17)
    // Plain numbers (100, 262) are too ambiguous
    if (!match && number && /[a-zA-Z]/.test(number)) {
      const res = await searchCards(number);
      acceptMatch(findBestMatch(card, res));
    }

    // If we never found a Japanese match, use the English fallback
    if (!match && fallbackMatch) {
      match = fallbackMatch;
    }

    if (match) {
      results[idx] = {
        image: match.image,
        id: match.id,
        apiName: match.name,
        apiSet: match.set,
        prices: match.prices,
      };
      found++;
    }

    processed++;
    onProgress?.({ processed, found, total: cards.length });
  }

  // Process in batches with concurrency limit
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    if (abortSignal?.aborted) break;

    const batch = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, cards.length); j++) {
      batch.push(processCard(j));
    }
    await Promise.all(batch);

    // Small delay between batches
    if (i + CONCURRENCY < cards.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CardLadderImport({ onClose, collectionName }) {
  const { user, db, collectionItems, setCollectionItems } = useApp();
  const [file, setFile] = useState(null);
  const [parsedCards, setParsedCards] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [imageProgress, setImageProgress] = useState(null); // { processed, found, total }
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef(null);

  const processFile = useCallback((selected) => {
    if (!selected) return;
    setFile(selected);
    setParseError(null);
    setParsedCards([]);
    setImportResult(null);
    setImageProgress(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const rows = parseCSVText(text);
        if (rows.length < 2) {
          setParseError("CSV file appears to be empty.");
          return;
        }

        const headers = rows[0];
        const { valid, missing } = validateHeaders(headers);
        if (!valid) {
          setParseError(
            `This doesn't look like a CardLadder export. Missing columns: ${missing.join(", ")}. ` +
              `Make sure you're exporting from CardLadder Pro.`
          );
          return;
        }

        // Build header → index map
        const headerMap = {};
        headers.forEach((h, i) => {
          headerMap[h.trim()] = i;
        });

        // Parse data rows
        const cards = [];
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].length < 4) continue;
          try {
            cards.push(rowToCard(rows[i], headerMap));
          } catch (err) {
            console.warn(`Skipped row ${i + 1}:`, err);
          }
        }

        if (cards.length === 0) {
          setParseError("No cards found in the CSV. Please check the file.");
          return;
        }

        setParsedCards(cards);
      } catch (err) {
        console.error("CSV parse error:", err);
        setParseError(
          "Failed to parse CSV file. Please ensure it's a valid CardLadder export."
        );
      }
    };
    reader.readAsText(selected);
  }, []);

  const handleFileChange = useCallback((e) => {
    processFile(e.target.files?.[0]);
  }, [processFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.toLowerCase().endsWith(".csv")) {
        setParseError("Please drop a CSV file.");
        return;
      }
      processFile(droppedFile);
    }
  }, [processFile]);

  const handleImport = useCallback(async () => {
    if (!user?.uid || !db || parsedCards.length === 0) return;

    setImporting(true);
    setImageProgress({ processed: 0, found: 0, total: parsedCards.length });

    try {
      // Step 1: Fetch images from the API
      const abortController = new AbortController();
      abortRef.current = abortController;

      const imageResults = await fetchImagesForCards(
        parsedCards,
        (progress) => setImageProgress(progress),
        abortController.signal
      );

      if (abortController.signal.aborted) {
        setImporting(false);
        return;
      }

      // Step 2: Merge images into parsed cards
      const enrichedCards = parsedCards.map((card, idx) => {
        const imgData = imageResults[idx];
        if (imgData) {
          return {
            ...card,
            image: imgData.image || card.image,
            id: imgData.id || card.id || "",
            // Keep CardLadder name/set as primary, store API match for reference
            ...(imgData.prices && Object.keys(imgData.prices).length > 0
              ? { prices: imgData.prices }
              : {}),
          };
        }
        return card;
      });

      // Step 3: Save to Firestore — merge with existing CardLadder cards
      // to preserve manually-set images and manual prices
      const docRef = doc(db, collectionName, user.uid);
      const snapshot = await getDoc(docRef);
      const currentData = snapshot.exists() ? snapshot.data() : {};
      const currentItems = currentData.items || [];

      const nonCardLadder = currentItems.filter(
        (it) => it.source !== "cardladder"
      );
      const oldCardLadder = currentItems.filter(
        (it) => it.source === "cardladder"
      );

      // Build lookup of existing cards for field preservation
      const oldCardMap = new Map();
      for (const old of oldCardLadder) {
        const lid = old.cardladderData?.ladderId;
        if (lid) {
          oldCardMap.set(`lid:${lid}`, old);
        }
        // Composite fallback key: name + number + gradingCompany + grade
        const compositeKey = [
          (old.name || "").toLowerCase().trim(),
          (old.number || "").toLowerCase().trim(),
          (old.gradingCompany || "").toLowerCase().trim(),
          (old.grade || "").toLowerCase().trim(),
        ].join("|");
        if (!oldCardMap.has(`comp:${compositeKey}`)) {
          oldCardMap.set(`comp:${compositeKey}`, old);
        }
      }

      const isUserUploadedImage = (url) =>
        typeof url === "string" && url.includes("firebasestorage.googleapis.com");

      const mergedCards = enrichedCards.map((card) => {
        // Find matching old card by ladderId first, then composite key
        const lid = card.cardladderData?.ladderId;
        let oldCard = lid ? oldCardMap.get(`lid:${lid}`) : null;
        if (!oldCard) {
          const compositeKey = [
            (card.name || "").toLowerCase().trim(),
            (card.number || "").toLowerCase().trim(),
            (card.gradingCompany || "").toLowerCase().trim(),
            (card.grade || "").toLowerCase().trim(),
          ].join("|");
          oldCard = oldCardMap.get(`comp:${compositeKey}`);
        }

        if (!oldCard) return card;

        const merged = { ...card, entryId: oldCard.entryId };

        // Preserve image: always keep user-uploaded; otherwise keep as fallback
        if (isUserUploadedImage(oldCard.image)) {
          merged.image = oldCard.image;
        } else if (!card.image && oldCard.image) {
          merged.image = oldCard.image;
        }

        // Preserve manual price
        if (oldCard.manualPrice != null && oldCard.manualPrice !== "") {
          merged.manualPrice = oldCard.manualPrice;
          merged.manualPriceCurrency = oldCard.manualPriceCurrency || null;
        }

        return merged;
      });

      const updatedItems = [...nonCardLadder, ...mergedCards];

      await setDoc(docRef, { ...currentData, items: updatedItems });
      setCollectionItems(updatedItems);

      const imagesFound = imageResults.filter(Boolean).length;
      const preservedImages = mergedCards.filter((c, i) => {
        const lid = c.cardladderData?.ladderId;
        const compositeKey = [
          (c.name || "").toLowerCase().trim(),
          (c.number || "").toLowerCase().trim(),
          (c.gradingCompany || "").toLowerCase().trim(),
          (c.grade || "").toLowerCase().trim(),
        ].join("|");
        const oldCard = (lid ? oldCardMap.get(`lid:${lid}`) : null)
          || oldCardMap.get(`comp:${compositeKey}`);
        return oldCard && c.image && c.image === oldCard.image;
      }).length;
      const preservedPrices = mergedCards.filter(
        (c) => c.manualPrice != null && c.manualPrice !== ""
      ).length;

      setImportResult({
        success: true,
        imported: mergedCards.length,
        removed: oldCardLadder.length,
        total: updatedItems.length,
        imagesFound,
        preservedImages,
        preservedPrices,
      });
    } catch (err) {
      console.error("Import failed:", err);
      setImportResult({
        success: false,
        error: err.message || "Failed to save to database.",
      });
    } finally {
      setImporting(false);
      setImageProgress(null);
    }
  }, [user, db, collectionName, parsedCards, setCollectionItems]);

  // Summary stats from parsed cards
  const totalValue = parsedCards.reduce((s, c) => s + (c.gradedPrice || 0), 0);
  const totalInvestment = parsedCards.reduce(
    (s, c) => s + (c.cardladderData?.investment || 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Import from CardLadder</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload your CardLadder Pro CSV export
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Info box */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">CardLadder Pro Required</p>
                <p>
                  This feature only works with CSV exports from{" "}
                  <a
                    href="https://cardladder.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    CardLadder Pro
                  </a>
                  . Go to your CardLadder collection, export as CSV, and upload
                  it here.
                </p>
                <p className="mt-1 text-amber-700">
                  Re-importing? No worries — your custom images, manual prices,
                  and manually added cards are always preserved. Only CardLadder
                  data (values, grades) gets refreshed.
                </p>
              </div>
            </div>
          </div>

          {/* File upload with drag-and-drop */}
          {!importResult?.success && !importing && (
            <div
              className="mb-4"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label
                htmlFor="cardladder-csv"
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                  isDragging
                    ? "border-blue-400 bg-blue-50 scale-[1.02]"
                    : file
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300 bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <Upload
                  className={`h-8 w-8 mb-2 ${isDragging ? "text-blue-500" : file ? "text-green-600" : "text-gray-400"}`}
                />
                {isDragging ? (
                  <span className="text-sm font-medium text-blue-600">
                    Drop CSV file here
                  </span>
                ) : file ? (
                  <span className="text-sm font-medium text-green-700">
                    {file.name}
                  </span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-gray-600">
                      Drag & drop CSV here, or click to browse
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      CardLadder Pro export (.csv)
                    </span>
                  </>
                )}
                <input
                  id="cardladder-csv"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{parseError}</p>
              </div>
            </div>
          )}

          {/* Image fetching progress */}
          {importing && imageProgress && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    Fetching card images...
                  </p>
                  <p className="text-xs text-blue-600">
                    {imageProgress.processed} / {imageProgress.total} searched
                    {imageProgress.found > 0 && (
                      <> &middot; {imageProgress.found} images found</>
                    )}
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round((imageProgress.processed / imageProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Preview */}
          {parsedCards.length > 0 && !importResult?.success && !importing && (
            <>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-800 mb-1">
                  Found {parsedCards.length} graded card
                  {parsedCards.length !== 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-700">
                  <span>
                    Total Value: $
                    {totalValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span>
                    Total Invested: $
                    {totalInvestment.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Card preview list */}
              <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold">Card</th>
                      <th className="text-left p-2 font-semibold">Set</th>
                      <th className="text-center p-2 font-semibold">Grade</th>
                      <th className="text-right p-2 font-semibold">Value</th>
                      <th className="text-right p-2 font-semibold">Invested</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedCards.map((card, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="p-2 font-medium">{card.name}</td>
                        <td className="p-2 text-muted-foreground truncate max-w-[140px]">
                          {card.set} #{card.number}
                        </td>
                        <td className="p-2 text-center">
                          <span className="inline-flex px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold">
                            {card.gradingCompany} {card.grade}
                          </span>
                        </td>
                        <td className="p-2 text-right font-semibold text-green-700">
                          ${card.gradedPrice?.toFixed(2)}
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          ${card.cardladderData?.investment?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleImport}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import {parsedCards.length} Card
                {parsedCards.length !== 1 ? "s" : ""}
              </Button>
            </>
          )}

          {/* Import result */}
          {importResult && (
            <div
              className={`p-4 rounded-lg border ${
                importResult.success
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              {importResult.success ? (
                <div className="text-center">
                  <Check className="h-10 w-10 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-green-800 mb-1">
                    Import Complete!
                  </p>
                  <p className="text-sm text-green-700">
                    {importResult.imported} card
                    {importResult.imported !== 1 ? "s" : ""} imported
                    {importResult.removed > 0 && (
                      <>
                        {" "}
                        (updated {importResult.removed} previous CardLadder
                        card{importResult.removed !== 1 ? "s" : ""})
                      </>
                    )}
                  </p>
                  <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {importResult.imagesFound} / {importResult.imported} card
                    images found
                    {importResult.preservedImages > 0 && (
                      <> &middot; {importResult.preservedImages} custom image{importResult.preservedImages !== 1 ? "s" : ""} preserved</>
                    )}
                  </p>
                  {importResult.preservedPrices > 0 && (
                    <p className="text-xs text-green-600 mt-0.5">
                      {importResult.preservedPrices} manual price{importResult.preservedPrices !== 1 ? "s" : ""} preserved
                    </p>
                  )}
                  <Button variant="outline" className="mt-4" onClick={onClose}>
                    Done
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-red-800 mb-1">
                    Import Failed
                  </p>
                  <p className="text-sm text-red-700">{importResult.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {!importResult?.success && !importing && (
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CardLadderImport;
