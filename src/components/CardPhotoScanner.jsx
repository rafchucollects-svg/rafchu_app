import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Upload, X, Check, AlertTriangle, Loader2, Search, RotateCcw, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useApp } from "@/contexts/AppContext";
import { apiSearchCardsHybrid, apiFetchMarketPrices, enrichCardWithMarketPrices } from "@/utils/apiHelpers";
import { ConditionSelect } from "@/components/CardComponents";

const GRADING_COMPANIES = [
  { value: "PSA", label: "PSA" },
  { value: "CGC", label: "CGC" },
  { value: "BGS", label: "BGS (Beckett)" },
  { value: "SGC", label: "SGC" },
  { value: "ACE", label: "ACE" },
  { value: "Other", label: "Other" },
];

const GRADE_OPTIONS = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5", "4", "3", "2", "1"];

function confidenceColor(c) {
  if (c >= 0.85) return "text-green-600 bg-green-50 border-green-200";
  if (c >= 0.5) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function confidenceLabel(c) {
  if (c >= 0.85) return "Matched";
  if (c >= 0.5) return "Low confidence";
  return "Not found";
}

/**
 * CardPhotoScanner — shared component for Trade and Buy calculators.
 * Three phases: Capture -> Processing -> Review.
 * Supports continuous scanning (Scan More) without overwriting previous results.
 */
export function CardPhotoScanner({ onAddCards, onClose }) {
  const { user } = useApp();

  const [phase, setPhase] = useState("capture");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [statusText, setStatusText] = useState("");
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0 });

  const [reviewCards, setReviewCards] = useState([]);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // ── Phase 1: Capture ──────────────────────────────────────────────

  const handleFileSelect = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const resetCapture = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    setPhase("capture");
  }, []);

  // ── Phase 2: Processing ───────────────────────────────────────────

  const handleScan = useCallback(async () => {
    if (!imageFile || !user) return;
    setPhase("processing");
    setError(null);
    setStatusText("Analyzing photo...");

    try {
      // Convert image to base64 and send directly (skip Storage round-trip)
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const functions = getFunctions();
      const parseCardPhotoFn = httpsCallable(functions, "parseCardPhoto");
      const result = await parseCardPhotoFn({
        imageBase64: base64,
        mimeType: imageFile.type || "image/jpeg",
      });
      const { cards } = result.data;

      if (!cards || cards.length === 0) {
        setError("No cards detected in the photo. Try a clearer image with cards face-up.");
        setPhase("capture");
        return;
      }

      setStatusText(`Matching ${cards.length} card${cards.length !== 1 ? "s" : ""}...`);
      setMatchProgress({ done: 0, total: cards.length });

      let completed = 0;
      const searchPromises = cards.map(async (detected, i) => {
        const nameQuery = (detected.name || "").trim();
        const detectedNum = (detected.collectorNumber || "").replace(/^#/, "").trim();
        const detectedSet = (detected.setName || "").toLowerCase();

        let searchResults = [];
        try {
          searchResults = await apiSearchCardsHybrid(nameQuery, { maxResults: 15 });
        } catch {
          // search failed
        }

        // Score and re-rank by name closeness, collector number, and set
        const detectedNameLower = nameQuery.toLowerCase();
        if (searchResults.length > 1) {
          const scored = searchResults.map((r) => {
            let score = 0;
            const rName = (r.name || "").toLowerCase();
            const rNum = String(r.number || "").trim();
            const rSet = (r.set || "").toLowerCase();

            // Name matching (most important — "Giratina V" should not match "Giratina VSTAR")
            if (rName === detectedNameLower) score += 20;
            else if (rName.startsWith(detectedNameLower) && rName.length - detectedNameLower.length <= 2) score += 15;
            else if (rName.includes(detectedNameLower)) score += 5;
            else if (detectedNameLower.includes(rName)) score += 3;

            // Collector number match
            if (detectedNum) {
              if (rNum === detectedNum || rNum === detectedNum.split("/")[0]) score += 15;
            }

            // Set match
            if (detectedSet && rSet) {
              if (rSet === detectedSet) score += 10;
              else if (rSet.includes(detectedSet) || detectedSet.includes(rSet)) score += 4;
            }

            return { card: r, score };
          });
          scored.sort((a, b) => b.score - a.score);
          searchResults = scored.map((s) => s.card);
        }

        const bestMatch = searchResults.length > 0 ? searchResults[0] : null;

        // Fetch prices for best match (non-blocking for the UI)
        let enrichedMatch = bestMatch;
        if (bestMatch && !bestMatch.prices?.tcgplayer && !bestMatch.prices?.cardmarket) {
          try {
            const prices = await apiFetchMarketPrices(bestMatch);
            if (prices) enrichedMatch = enrichCardWithMarketPrices({ ...bestMatch }, prices);
          } catch { /* prices failed, card still usable */ }
        }

        completed++;
        setMatchProgress({ done: completed, total: cards.length });
        setStatusText(`Matching cards... (${completed}/${cards.length})`);

        const firstName = nameQuery.toLowerCase().split(" ")[0];
        const matchConfidence = enrichedMatch
          ? Math.min(detected.confidence, firstName && enrichedMatch.name?.toLowerCase().includes(firstName) ? 0.95 : 0.6)
          : Math.min(detected.confidence, 0.3);

        return {
          _scanId: `scan-${Date.now()}-${i}`,
          detected,
          match: enrichedMatch,
          confidence: matchConfidence,
          rejected: false,
          condition: "NM",
          isGraded: detected.isGraded || false,
          gradingCompany: detected.gradingCompany || "PSA",
          grade: detected.grade || "",
          manualPrice: "",
          manualPriceCurrency: "USD",
          searchResults: searchResults.slice(0, 8),
          showAlternatives: false,
        };
      });

      const matched = await Promise.all(searchPromises);
      setReviewCards(matched);
      setPhase("review");
    } catch (err) {
      console.error("Card scan failed:", err);
      setError(err.message || "Failed to scan cards. Please try again.");
      setPhase("capture");
    }
  }, [imageFile, user]);

  // ── Phase 3: Review ───────────────────────────────────────────────

  const updateCard = useCallback((scanId, updates) => {
    setReviewCards((prev) =>
      prev.map((c) => (c._scanId === scanId ? { ...c, ...updates } : c))
    );
  }, []);

  const selectAlternative = useCallback((scanId, altCard) => {
    setReviewCards((prev) =>
      prev.map((c) =>
        c._scanId === scanId
          ? { ...c, match: altCard, confidence: 0.85, showAlternatives: false }
          : c
      )
    );
  }, []);

  const confirmCards = useCallback(() => {
    const accepted = reviewCards
      .filter((c) => !c.rejected)
      .map((c) => ({
        id: c.match?.id || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: c.match?.name || c.detected.name || "Unknown Card",
        set: c.match?.set || c.detected.setName || "",
        number: c.match?.number || c.detected.collectorNumber || "",
        rarity: c.match?.rarity || c.detected.rarity || "",
        image: c.match?.image || "",
        prices: c.match?.prices || {},
        condition: c.condition,
        isGraded: c.isGraded,
        gradingCompany: c.isGraded ? c.gradingCompany : null,
        grade: c.isGraded ? c.grade : null,
        gradedPrice: c.isGraded && c.manualPrice ? c.manualPrice : null,
        gradedPriceCurrency: c.isGraded ? c.manualPriceCurrency : null,
        manualPrice: !c.isGraded && c.manualPrice ? c.manualPrice : null,
        manualPriceCurrency: c.manualPriceCurrency || "USD",
        notes: "",
        isManualEntry: !c.match || c.confidence < 0.85 || !!c.manualPrice,
        _fromScan: true,
      }));

    if (accepted.length > 0) {
      onAddCards(accepted);
    }
  }, [reviewCards, onAddCards]);

  const handleScanMore = useCallback(() => {
    confirmCards();
    resetCapture();
  }, [confirmCards, resetCapture]);

  const acceptedCount = reviewCards.filter((c) => !c.rejected).length;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {phase === "capture" && "Scan Cards"}
          {phase === "processing" && "Identifying Cards"}
          {phase === "review" && "Review Detected Cards"}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ─── Phase 1: Capture ──────────────────────────────────── */}
      {phase === "capture" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Take a photo or upload an image of Pokemon cards laid out on a table. Works best with 1-5 cards per photo, face-up and clearly visible.
          </p>

          {!imagePreview ? (
            <div
              className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Camera className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Drag & drop a photo, or use the buttons below
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" />
                  Take Photo
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border">
                <img
                  src={imagePreview}
                  alt="Card photo preview"
                  className="max-h-64 w-full object-contain bg-muted/30"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                  onClick={resetCapture}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleScan}>
                  <Search className="h-4 w-4 mr-2" />
                  Identify Cards
                </Button>
                <Button variant="outline" onClick={resetCapture}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retake
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Phase 2: Processing ───────────────────────────────── */}
      {phase === "processing" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium">{statusText}</p>
          {matchProgress.total > 0 && (
            <div className="w-full max-w-xs">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(matchProgress.done / matchProgress.total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {matchProgress.done} / {matchProgress.total}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Phase 3: Review ───────────────────────────────────── */}
      {phase === "review" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {reviewCards.length} card{reviewCards.length !== 1 ? "s" : ""} detected.
            Review and adjust before adding.
          </p>

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            <AnimatePresence>
              {reviewCards.map((card) => (
                <motion.div
                  key={card._scanId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: card.rejected ? 0.4 : 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-lg border p-3 ${card.rejected ? "bg-muted/50" : "bg-card"}`}
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="h-20 w-14 flex-shrink-0 rounded overflow-hidden bg-muted">
                      {card.match?.image ? (
                        <img
                          src={card.match.image}
                          alt={card.match.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          ?
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {card.match?.name || card.detected.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {card.match?.set || card.detected.setName || "Unknown set"}
                            {(card.match?.number || card.detected.collectorNumber) &&
                              ` #${card.match?.number || card.detected.collectorNumber}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${confidenceColor(card.confidence)}`}
                          >
                            {confidenceLabel(card.confidence)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateCard(card._scanId, { rejected: !card.rejected })}
                          >
                            {card.rejected ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {!card.rejected && (
                        <>
                          {/* Condition + Graded toggle */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {!card.isGraded && (
                              <ConditionSelect
                                value={card.condition}
                                onChange={(v) => updateCard(card._scanId, { condition: v })}
                              />
                            )}
                            <label className="flex items-center gap-1 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={card.isGraded}
                                onChange={(e) =>
                                  updateCard(card._scanId, { isGraded: e.target.checked })
                                }
                                className="rounded"
                              />
                              Graded
                            </label>
                          </div>

                          {/* Graded fields */}
                          {card.isGraded && (
                            <div className="flex items-center gap-2">
                              <select
                                value={card.gradingCompany}
                                onChange={(e) =>
                                  updateCard(card._scanId, { gradingCompany: e.target.value })
                                }
                                className="rounded border px-1.5 py-0.5 text-xs"
                              >
                                {GRADING_COMPANIES.map((gc) => (
                                  <option key={gc.value} value={gc.value}>
                                    {gc.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={card.grade}
                                onChange={(e) =>
                                  updateCard(card._scanId, { grade: e.target.value })
                                }
                                className="rounded border px-1.5 py-0.5 text-xs"
                              >
                                <option value="">Grade</option>
                                {GRADE_OPTIONS.map((g) => (
                                  <option key={g} value={g}>
                                    {g}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Manual price override */}
                          {(card.isGraded || card.confidence < 0.85) && (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Manual price"
                                value={card.manualPrice}
                                onChange={(e) =>
                                  updateCard(card._scanId, { manualPrice: e.target.value })
                                }
                                className="h-7 w-24 text-xs"
                              />
                              <select
                                value={card.manualPriceCurrency}
                                onChange={(e) =>
                                  updateCard(card._scanId, { manualPriceCurrency: e.target.value })
                                }
                                className="rounded border px-1 py-0.5 text-xs h-7"
                              >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                                <option value="JPY">JPY</option>
                              </select>
                            </div>
                          )}

                          {/* Show alternatives button */}
                          {card.searchResults.length > 1 && (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={() =>
                                updateCard(card._scanId, {
                                  showAlternatives: !card.showAlternatives,
                                })
                              }
                            >
                              {card.showAlternatives ? "Hide" : "Show"} alternatives ({card.searchResults.length - 1})
                            </button>
                          )}

                          {/* Alternative matches */}
                          {card.showAlternatives && (
                            <div className="mt-1 space-y-1 rounded border bg-muted/30 p-2">
                              {card.searchResults
                                .filter((r) => r.id !== card.match?.id)
                                .map((alt) => (
                                  <button
                                    key={alt.id}
                                    className="flex w-full items-center gap-2 rounded p-1 text-left hover:bg-muted/50 transition-colors"
                                    onClick={() => selectAlternative(card._scanId, alt)}
                                  >
                                    {alt.image && (
                                      <img
                                        src={alt.image}
                                        alt={alt.name}
                                        className="h-10 w-7 rounded object-cover"
                                      />
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium truncate">
                                        {alt.name}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground truncate">
                                        {alt.set} #{alt.number}
                                      </p>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              className="flex-1"
              onClick={() => { confirmCards(); onClose(); }}
              disabled={acceptedCount === 0}
            >
              <Check className="h-4 w-4 mr-2" />
              Add {acceptedCount} Card{acceptedCount !== 1 ? "s" : ""}
            </Button>
            <Button variant="outline" onClick={handleScanMore} disabled={acceptedCount === 0}>
              <Camera className="h-4 w-4 mr-2" />
              Add & Scan More
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
