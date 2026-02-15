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

async function searchCardMarket(query) {
  try {
    const res = await fetch(
      `${CLOUD_FUNCTIONS_BASE}/searchCardMarket?q=${encodeURIComponent(query)}&maxResults=10`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !data?.results) return [];
    return data.results
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
  } catch (err) {
    console.warn("Image search failed for:", query, err);
    return [];
  }
}

function normalizeNumber(num) {
  return String(num || "")
    .toLowerCase()
    .replace(/^#/, "")
    .trim();
}

/**
 * Check if a card name from the API matches the CardLadder name.
 * Compares the first significant word (the Pokemon name) and any
 * card-type suffix (GX, VMAX, V, VSTAR, EX, etc.)
 */
function namesMatch(cardLadderName, apiName) {
  const clName = (cardLadderName || "").toLowerCase().trim();
  const aName = (apiName || "").toLowerCase().trim();
  if (!clName || !aName) return false;

  // Extract first word (Pokemon name) from both
  const clWords = clName.split(/[\s&-]+/).filter(Boolean);
  const aWords = aName.split(/[\s&-]+/).filter(Boolean);

  if (!clWords.length || !aWords.length) return false;

  // First word must match (the Pokemon name like "charizard", "pikachu", etc.)
  if (clWords[0] !== aWords[0]) return false;

  // For multi-word names, also check if any type suffix matches
  // (GX, VMAX, VSTAR, V, EX, etc.) to disambiguate e.g. "Pikachu V" from "Pikachu VMAX"
  const TYPE_SUFFIXES = ["gx", "vmax", "vstar", "v", "ex", "tag"];
  const clTypes = clWords.filter((w) => TYPE_SUFFIXES.includes(w));
  const aTypes = aWords.filter((w) => TYPE_SUFFIXES.includes(w));

  // Both have type suffixes — at least one must match
  if (clTypes.length > 0 && aTypes.length > 0) {
    return clTypes.some((t) => aTypes.includes(t));
  }

  // CardLadder has type but API doesn't → NOT a match (e.g., "Pikachu V" vs "Pikachu")
  if (clTypes.length > 0 && aTypes.length === 0) {
    return false;
  }

  // API has type but CardLadder doesn't → NOT a match (e.g., "Flareon" vs "Flareon GX")
  if (clTypes.length === 0 && aTypes.length > 0) {
    return false;
  }

  // Neither has types → first word match is sufficient (e.g., "Alakazam", "Flareon")
  return true;
}

function findBestMatch(card, results) {
  const cardNum = normalizeNumber(card.number);

  // Tier 1: Exact number + name match (best possible match)
  for (const r of results) {
    if (normalizeNumber(r.number) === cardNum && namesMatch(card.name, r.name)) {
      return r;
    }
  }

  // Tier 2: Number contained (e.g., "SM166" vs "166") + name match
  for (const r of results) {
    const rNum = normalizeNumber(r.number);
    if (rNum && cardNum && (rNum.includes(cardNum) || cardNum.includes(rNum))) {
      if (namesMatch(card.name, r.name)) {
        return r;
      }
    }
  }

  // Tier 3: Name match only (no number check - for cases where number format differs)
  for (const r of results) {
    if (namesMatch(card.name, r.name)) {
      return r;
    }
  }

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
    const number = card.number?.trim();
    const name = card.name?.trim();
    // Strip "&" for search (API doesn't handle it well in some cases)
    const searchName = name?.replace(/&/g, " ").replace(/\s+/g, " ").trim();

    let match = null;

    // Attempt 1: Search by "name number" (most specific — avoids wrong cards with same number)
    if (!match && searchName && number) {
      const res = await searchCardMarket(`${searchName} ${number}`);
      match = findBestMatch(card, res);
    }

    // Attempt 2: Search by "name + set keywords" (helps when number format differs)
    if (!match && searchName && card.set) {
      // Take first 2-3 meaningful words from set name
      const setWords = card.set
        .replace(/^(SWSH|SM|XY|BW|EX|SVP)\s+/i, "")
        .split(/\s+/)
        .slice(0, 2)
        .join(" ");
      if (setWords) {
        const res = await searchCardMarket(`${searchName} ${setWords}`);
        match = findBestMatch(card, res);
      }
    }

    // Attempt 3: Search by name only
    if (!match && searchName) {
      const res = await searchCardMarket(searchName);
      match = findBestMatch(card, res);
    }

    // Attempt 4: Search by number only — but ONLY for prefixed numbers (SM166, SV60, TG17)
    // Plain numbers (100, 262) are too ambiguous
    if (!match && number && /[a-zA-Z]/.test(number)) {
      const res = await searchCardMarket(number);
      match = findBestMatch(card, res);
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

      // Step 3: Save to Firestore (wipe previous + add new)
      const docRef = doc(db, collectionName, user.uid);
      const snapshot = await getDoc(docRef);
      const currentData = snapshot.exists() ? snapshot.data() : {};
      const currentItems = currentData.items || [];

      const nonCardLadder = currentItems.filter(
        (it) => it.source !== "cardladder"
      );
      const updatedItems = [...nonCardLadder, ...enrichedCards];

      await setDoc(docRef, { ...currentData, items: updatedItems });
      setCollectionItems(updatedItems);

      const imagesFound = imageResults.filter(Boolean).length;

      setImportResult({
        success: true,
        imported: enrichedCards.length,
        removed: currentItems.length - nonCardLadder.length,
        total: updatedItems.length,
        imagesFound,
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
                  Each import <strong>replaces</strong> all previously imported
                  CardLadder cards. Cards you added manually are never affected.
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
                        (replaced {importResult.removed} previous CardLadder
                        import{importResult.removed !== 1 ? "s" : ""})
                      </>
                    )}
                  </p>
                  <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {importResult.imagesFound} / {importResult.imported} card
                    images found
                  </p>
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
