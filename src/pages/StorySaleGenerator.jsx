import { useState, useCallback, useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Upload, X, Check, AlertTriangle, Loader2,
  Search, RotateCcw, Download, Image, Pencil, Plus, Share2,
} from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useApp } from "@/contexts/AppContext";
import { computeItemMetrics, convertCurrency, formatCurrency } from "@/utils/cardHelpers";

function getDisplayPriceForItem(item, currency, roundUp) {
  let price;
  if (item.overridePrice != null && !isNaN(Number(item.overridePrice))) {
    const overrideCurrency = item.overridePriceCurrency || currency;
    price = overrideCurrency !== currency
      ? convertCurrency(item.overridePrice, currency, overrideCurrency)
      : Number(item.overridePrice);
  } else if (item.isGraded && item.gradedPrice) {
    const storedCurrency = item.gradedPriceCurrency || "USD";
    price = storedCurrency !== currency
      ? convertCurrency(item.gradedPrice, currency, storedCurrency)
      : Number(item.gradedPrice);
  } else {
    const metrics = computeItemMetrics(item, currency);
    price = metrics.suggested;
  }
  if (roundUp) price = Math.ceil(price);
  return price;
}

function matchDetectedToInventory(detected, inventoryItems) {
  const detectedName = (detected.name || "").toLowerCase().trim();
  const detectedNum = (detected.collectorNumber || "").replace(/^#/, "").trim();
  const detectedSet = (detected.setName || "").toLowerCase().trim();
  const detectedGrade = detected.grade ? String(detected.grade).trim() : null;
  const detectedCompany = (detected.gradingCompany || "").toLowerCase().trim();

  const scored = inventoryItems.map((item) => {
    let score = 0;
    const itemName = (item.name || "").toLowerCase();
    const itemNum = String(item.number || "").trim();
    const itemSet = (item.set || "").toLowerCase();

    if (detectedName && itemName) {
      if (itemName === detectedName) score += 30;
      else if (itemName.includes(detectedName) || detectedName.includes(itemName)) score += 10;
    }
    if (detectedNum && itemNum) {
      const normDetected = detectedNum.split("/")[0];
      const normItem = itemNum.split("/")[0];
      if (normDetected === normItem) score += 25;
    }
    if (detectedSet && itemSet) {
      if (itemSet === detectedSet) score += 15;
      else if (itemSet.includes(detectedSet) || detectedSet.includes(itemSet)) score += 5;
    }
    if (detected.isGraded && item.isGraded) {
      score += 10;
      if (detectedGrade && item.grade && String(item.grade).trim() === detectedGrade) score += 15;
      if (detectedCompany && item.gradingCompany && item.gradingCompany.toLowerCase().includes(detectedCompany)) score += 5;
    }
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= 20).slice(0, 5);
}

function autoDetectGrid(cardCount) {
  if (cardCount <= 1) return { cols: 1, rows: 1 };
  if (cardCount === 2) return { cols: 2, rows: 1 };
  if (cardCount === 3) return { cols: 3, rows: 1 };
  return { cols: 2, rows: 2 };
}

function roundToNearest10(n) {
  return Math.ceil(n / 10) * 10;
}

const FONT_STACK = '"Inter", "SF Pro Display", "Segoe UI", system-ui, sans-serif';

function formatWholePrice(amount, curr) {
  const rounded = Math.round(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `${curr} ${rounded}`;
  }
}

function fitText(ctx, text, weight, maxW, startSize) {
  let size = startSize;
  while (size > 8) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxW) return size;
    size -= 1;
  }
  return size;
}

function drawPriceOverlays(canvas, img, slots, gridConfig, currency, secondaryCurrency, storyMode) {
  const ctx = canvas.getContext("2d");

  let canvasW = img.naturalWidth;
  let canvasH = img.naturalHeight;

  if (storyMode) {
    const targetRatio = 9 / 16;
    const currentRatio = canvasW / canvasH;
    if (currentRatio > targetRatio) canvasH = canvasW / targetRatio;
    else canvasW = canvasH * targetRatio;
  }

  canvas.width = canvasW;
  canvas.height = canvasH;

  if (storyMode) {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const imgX = (canvasW - img.naturalWidth) / 2;
  const imgY = (canvasH - img.naturalHeight) / 2;
  ctx.drawImage(img, imgX, imgY, img.naturalWidth, img.naturalHeight);

  const { cols, rows } = gridConfig;
  const cellW = img.naturalWidth / cols;
  const cellH = img.naturalHeight / rows;

  const boxW = cellW * 0.80;
  const boxH = cellH * 0.20;
  const hPad = boxW * 0.06;
  const maxTextW = boxW - hPad * 2;

  slots.forEach((slot) => {
    const col = slot.index % cols;
    const row = Math.floor(slot.index / cols);
    const cellX = imgX + col * cellW;
    const cellY = imgY + row * cellH;

    const price = slot.manualPrice ? parseFloat(slot.manualPrice) : slot.price;
    if (!price || price <= 0) return;

    const primaryText = formatWholePrice(price, currency);
    let secondaryText = null;
    if (secondaryCurrency) {
      const converted = convertCurrency(price, secondaryCurrency, currency);
      secondaryText = formatWholePrice(roundToNearest10(converted), secondaryCurrency);
    }

    const boxX = cellX + (cellW - boxW) / 2;
    const boxY = cellY + cellH - boxH;

    const radius = boxH * 0.18;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, [radius, radius, 0, 0]);
    ctx.fillStyle = "rgba(22, 163, 74, 0.93)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (secondaryText) {
      const gap = boxH * 0.04;
      const primarySize = fitText(ctx, primaryText, 800, maxTextW, boxH * 0.50);
      const secondarySize = fitText(ctx, secondaryText, 600, maxTextW, primarySize * 0.65);
      const totalH = primarySize + secondarySize + gap;
      const topY = boxY + (boxH - totalH) / 2;

      ctx.font = `800 ${primarySize}px ${FONT_STACK}`;
      ctx.fillText(primaryText, boxX + boxW / 2, topY + primarySize / 2);

      ctx.font = `600 ${secondarySize}px ${FONT_STACK}`;
      ctx.globalAlpha = 0.88;
      ctx.fillText(secondaryText, boxX + boxW / 2, topY + primarySize + gap + secondarySize / 2);
      ctx.globalAlpha = 1;
    } else {
      const fontSize = fitText(ctx, primaryText, 800, maxTextW, boxH * 0.60);
      ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
      ctx.fillText(primaryText, boxX + boxW / 2, boxY + boxH / 2);
    }
  });

  return canvas.toDataURL("image/png");
}

// ── Per-image state structure ───────────────────────────────────
function createImageEntry(file) {
  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    file,
    preview: URL.createObjectURL(file),
    phase: "pending",       // pending | scanning | confirm | done
    cardSlots: [],
    gridConfig: null,
    generatedImage: null,
    storyMode: false,
    error: null,
    statusText: "",
  };
}

export function StorySaleGenerator() {
  const { user, collectionItems, currency, secondaryCurrency } = useApp();

  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);

  const roundUp = false;

  const inventoryItems = useMemo(() => {
    return (collectionItems || []).filter((i) => !i.excludeFromSale);
  }, [collectionItems]);

  const activeImage = images.find((img) => img.id === activeId) || null;

  // ── Image management ──────────────────────────────────────────

  const addFiles = useCallback((fileList) => {
    const newEntries = [];
    for (const file of fileList) {
      if (file.type.startsWith("image/")) {
        newEntries.push(createImageEntry(file));
      }
    }
    if (newEntries.length === 0) return;
    setImages((prev) => [...prev, ...newEntries]);
    if (!activeId || newEntries.length > 0) {
      setActiveId((prev) => prev || newEntries[0].id);
    }
  }, [activeId]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeImage = useCallback((id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const remaining = images.filter((img) => img.id !== id);
      return remaining.length > 0 ? remaining[0].id : null;
    });
  }, [images]);

  const updateImage = useCallback((id, updates) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...updates } : img))
    );
  }, []);

  const resetAll = useCallback(() => {
    setImages([]);
    setActiveId(null);
    setGlobalError(null);
  }, []);

  // ── Scan a single image ───────────────────────────────────────

  const handleScan = useCallback(async (imageEntry) => {
    if (!imageEntry.file || !user) return;
    const id = imageEntry.id;
    updateImage(id, { phase: "scanning", error: null, statusText: "Analyzing photo with AI..." });

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageEntry.file);
      });

      const functions = getFunctions();
      const parseCardPhotoFn = httpsCallable(functions, "parseCardPhoto");
      const result = await parseCardPhotoFn({
        imageBase64: base64,
        mimeType: imageEntry.file.type || "image/jpeg",
      });

      const { cards } = result.data;
      if (!cards || cards.length === 0) {
        updateImage(id, {
          phase: "pending",
          error: "No cards detected. Try a clearer photo.",
        });
        return;
      }

      const gridConfig = autoDetectGrid(cards.length);

      const slots = cards.slice(0, gridConfig.cols * gridConfig.rows).map((detected, i) => {
        const matches = matchDetectedToInventory(detected, inventoryItems);
        const bestMatch = matches.length > 0 ? matches[0].item : null;
        const bestPrice = bestMatch ? getDisplayPriceForItem(bestMatch, currency, roundUp) : 0;
        return {
          index: i,
          detected,
          matchedItem: bestMatch,
          candidates: matches.map((m) => m.item),
          price: bestPrice,
          manualPrice: "",
          confirmed: false,
          showSearch: false,
          searchQuery: "",
        };
      });

      updateImage(id, { phase: "confirm", cardSlots: slots, gridConfig });
    } catch (err) {
      console.error("Scan failed:", err);
      updateImage(id, {
        phase: "pending",
        error: err.message || "Scan failed. Please try again.",
      });
    }
  }, [user, inventoryItems, currency, roundUp, updateImage]);

  // ── Slot helpers (scoped to active image) ─────────────────────

  const updateSlot = useCallback((slotIndex, updates) => {
    if (!activeId) return;
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== activeId) return img;
        return {
          ...img,
          cardSlots: img.cardSlots.map((s) =>
            s.index === slotIndex ? { ...s, ...updates } : s
          ),
        };
      })
    );
  }, [activeId]);

  const selectInventoryItem = useCallback((slotIndex, item) => {
    const price = getDisplayPriceForItem(item, currency, roundUp);
    updateSlot(slotIndex, {
      matchedItem: item,
      price,
      manualPrice: "",
      showSearch: false,
      searchQuery: "",
    });
  }, [currency, roundUp, updateSlot]);

  const filteredSearchResults = useCallback((query) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return inventoryItems
      .filter(
        (item) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.set || "").toLowerCase().includes(q) ||
          String(item.number || "").includes(q)
      )
      .slice(0, 10);
  }, [inventoryItems]);

  // ── Generate image for active entry ───────────────────────────

  const generateImage = useCallback(async (imageEntry) => {
    if (!imageEntry) return;
    const id = imageEntry.id;
    updateImage(id, { phase: "generating", statusText: "Generating sale image..." });

    try {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageEntry.preview;
      });

      const canvas = canvasRef.current || document.createElement("canvas");
      const dataUrl = drawPriceOverlays(
        canvas, img, imageEntry.cardSlots, imageEntry.gridConfig,
        currency, secondaryCurrency, imageEntry.storyMode
      );
      updateImage(id, { phase: "done", generatedImage: dataUrl });
    } catch (err) {
      console.error("Image generation failed:", err);
      updateImage(id, { phase: "confirm", error: "Failed to generate image." });
    }
  }, [currency, secondaryCurrency, updateImage]);

  const dataUrlToBlob = useCallback((dataUrl) => {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }, []);

  const canNativeShare = useMemo(() => {
    if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
    try {
      const testFile = new File([new Uint8Array(1)], "test.png", { type: "image/png" });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  }, []);

  const handleShare = useCallback(async (imageEntry) => {
    if (!imageEntry?.generatedImage) return;
    const blob = dataUrlToBlob(imageEntry.generatedImage);
    const file = new File([blob], `story-sale-${Date.now()}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== "AbortError") console.error("Share failed:", err);
    }
  }, [dataUrlToBlob]);

  const handleDownload = useCallback((imageEntry) => {
    if (!imageEntry?.generatedImage) return;
    const link = document.createElement("a");
    link.download = `story-sale-${Date.now()}.png`;
    link.href = imageEntry.generatedImage;
    link.click();
  }, []);

  const handleDownloadAll = useCallback(() => {
    const doneImages = images.filter((img) => img.phase === "done" && img.generatedImage);
    doneImages.forEach((img, i) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.download = `story-sale-${i + 1}-${Date.now()}.png`;
        link.href = img.generatedImage;
        link.click();
      }, i * 300);
    });
  }, [images]);

  // ── Scan all pending at once ──────────────────────────────────

  const scanAllPending = useCallback(async () => {
    const pending = images.filter((img) => img.phase === "pending");
    for (const img of pending) {
      await handleScan(img);
    }
  }, [images, handleScan]);

  const generateAllConfirmed = useCallback(async () => {
    const confirmed = images.filter(
      (img) => img.phase === "confirm" && img.cardSlots.every((s) => s.confirmed)
    );
    for (const img of confirmed) {
      await generateImage(img);
    }
  }, [images, generateImage]);

  const allSlots = activeImage?.cardSlots || [];
  const allConfirmed = allSlots.length > 0 && allSlots.every((s) => s.confirmed);
  const doneCount = images.filter((img) => img.phase === "done").length;
  const hasImages = images.length > 0;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Story Sale Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload photos of graded cards and generate sale images with prices
          </p>
        </div>
        {hasImages && (
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="h-4 w-4 mr-1" /> Start Over
          </Button>
        )}
      </div>

      {globalError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {globalError}
          <button onClick={() => setGlobalError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Upload area (always visible) ──────────────────────── */}
      <Card className="mb-5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">
              {hasImages ? `Photos (${images.length})` : "Upload Photos"}
            </h3>
            {hasImages && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add More
                </Button>
              </div>
            )}
          </div>

          {!hasImages ? (
            <div
              className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-10 transition-colors ${
                isDragging
                  ? "border-green-500 bg-green-50"
                  : "border-muted-foreground/25 hover:border-green-400"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Image className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">
                Drag & drop photos of your graded cards, or use the buttons below.
                You can upload multiple photos at once.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" /> Take Photo
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Upload
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setActiveId(img.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                    img.id === activeId
                      ? "border-green-500 ring-2 ring-green-300"
                      : "border-transparent hover:border-green-300"
                  }`}
                >
                  <img
                    src={img.preview}
                    alt="Card photo"
                    className="w-full h-full object-cover"
                  />
                  {img.phase === "done" && (
                    <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                      <Check className="h-5 w-5 text-white drop-shadow-md" />
                    </div>
                  )}
                  {img.phase === "scanning" && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    </div>
                  )}
                  {img.error && (
                    <div className="absolute top-1 right-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500 drop-shadow" />
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                    className="absolute top-1 left-1 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          )}

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) addFiles([e.target.files[0]]);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />

          {/* Batch actions */}
          {hasImages && (
            <div className="flex gap-2 mt-3">
              {images.some((img) => img.phase === "pending") && (
                <Button size="sm" onClick={scanAllPending} className="flex-1">
                  <Search className="h-3.5 w-3.5 mr-1" />
                  Scan All ({images.filter((i) => i.phase === "pending").length})
                </Button>
              )}
              {images.some((img) => img.phase === "confirm" && img.cardSlots.every((s) => s.confirmed)) && (
                <Button size="sm" onClick={generateAllConfirmed} className="flex-1 bg-green-600 hover:bg-green-700">
                  <Image className="h-3.5 w-3.5 mr-1" />
                  Generate All Ready
                </Button>
              )}
              {doneCount > 1 && (
                <Button size="sm" variant="outline" onClick={handleDownloadAll} className="flex-1">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download All ({doneCount})
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Active image detail ──────────────────────────────────── */}
      {activeImage && (
        <>
          {/* Pending: show scan button */}
          {activeImage.phase === "pending" && (
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="relative overflow-hidden rounded-xl border mb-3">
                  <img
                    src={activeImage.preview}
                    alt="Card photo"
                    className="max-h-72 w-full object-contain bg-muted/30"
                  />
                </div>
                {activeImage.error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-3">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {activeImage.error}
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeImage.storyMode}
                      onChange={(e) => updateImage(activeImage.id, { storyMode: e.target.checked })}
                      className="rounded"
                    />
                    Crop to 9:16 story format
                  </label>
                </div>
                <Button className="w-full" size="lg" onClick={() => handleScan(activeImage)}>
                  <Search className="h-4 w-4 mr-2" />
                  Identify Cards & Match Prices
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Scanning */}
          {activeImage.phase === "scanning" && (
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 className="h-10 w-10 animate-spin text-green-600" />
                  <p className="text-sm font-medium">{activeImage.statusText}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Confirm prices */}
          {activeImage.phase === "confirm" && (
            <div className="space-y-4 mb-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">
                      Confirm Prices ({allSlots.filter((s) => s.confirmed).length}/{allSlots.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {currency}{secondaryCurrency ? ` + ${secondaryCurrency}` : ""}
                    </p>
                  </div>

                  {activeImage.error && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-3">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      {activeImage.error}
                    </div>
                  )}

                  <div className="space-y-3">
                    {allSlots.map((slot) => (
                      <div
                        key={slot.index}
                        className={`rounded-lg border p-3 transition-colors ${
                          slot.confirmed ? "border-green-300 bg-green-50/50" : "border-muted"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                            {slot.index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs text-muted-foreground font-medium">Detected:</p>
                              <p className="text-xs truncate">
                                {slot.detected.name || "Unknown"}
                                {slot.detected.isGraded &&
                                  ` • ${slot.detected.gradingCompany || "Graded"} ${slot.detected.grade || ""}`}
                              </p>
                            </div>

                            {slot.matchedItem ? (
                              <div className="flex items-center gap-3">
                                {slot.matchedItem.image && (
                                  <img
                                    src={slot.matchedItem.image}
                                    alt={slot.matchedItem.name}
                                    className="h-16 w-12 rounded object-cover border flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm truncate">{slot.matchedItem.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {slot.matchedItem.set}
                                    {slot.matchedItem.number && ` #${slot.matchedItem.number}`}
                                    {slot.matchedItem.isGraded &&
                                      ` • ${slot.matchedItem.gradingCompany || "Graded"} ${slot.matchedItem.grade || ""}`}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-base font-bold text-green-600">
                                      {formatCurrency(
                                        slot.manualPrice ? parseFloat(slot.manualPrice) : slot.price,
                                        currency
                                      )}
                                    </span>
                                    {secondaryCurrency && (
                                      <span className="text-xs text-muted-foreground">
                                        ({formatCurrency(
                                          roundToNearest10(convertCurrency(
                                            slot.manualPrice ? parseFloat(slot.manualPrice) : slot.price,
                                            secondaryCurrency,
                                            currency
                                          )),
                                          secondaryCurrency
                                        )})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-amber-600 font-medium">No inventory match found</p>
                            )}

                            <div className="flex items-center gap-2 mt-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder={`Manual price (${currency})`}
                                value={slot.manualPrice}
                                onChange={(e) => updateSlot(slot.index, { manualPrice: e.target.value, confirmed: false })}
                                className="h-8 text-xs flex-1 max-w-[180px]"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => updateSlot(slot.index, { showSearch: !slot.showSearch })}
                              >
                                <Search className="h-3 w-3 mr-1" />
                                {slot.showSearch ? "Hide" : "Search"}
                              </Button>
                            </div>

                            {slot.showSearch && (
                              <div className="mt-2 space-y-2">
                                <Input
                                  placeholder="Search your inventory..."
                                  value={slot.searchQuery}
                                  onChange={(e) => updateSlot(slot.index, { searchQuery: e.target.value })}
                                  className="h-8 text-xs"
                                />
                                <div className="max-h-40 overflow-y-auto space-y-1 rounded border bg-muted/20 p-1.5">
                                  {(slot.searchQuery
                                    ? filteredSearchResults(slot.searchQuery)
                                    : slot.candidates
                                  ).map((item) => (
                                    <button
                                      key={item.entryId || item.cardId}
                                      className="flex w-full items-center gap-2 rounded p-1.5 text-left hover:bg-muted/50 transition-colors"
                                      onClick={() => selectInventoryItem(slot.index, item)}
                                    >
                                      {item.image && (
                                        <img src={item.image} alt={item.name} className="h-10 w-7 rounded object-cover" />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium truncate">{item.name}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                          {item.set}{item.number && ` #${item.number}`}
                                          {item.isGraded && ` • ${item.gradingCompany || ""} ${item.grade || ""}`}
                                        </p>
                                      </div>
                                      <span className="text-xs font-semibold text-green-600 flex-shrink-0">
                                        {formatCurrency(getDisplayPriceForItem(item, currency, roundUp), currency)}
                                      </span>
                                    </button>
                                  ))}
                                  {slot.searchQuery && filteredSearchResults(slot.searchQuery).length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">No matches in inventory</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          <Button
                            variant={slot.confirmed ? "default" : "outline"}
                            size="sm"
                            className={`flex-shrink-0 ${slot.confirmed ? "bg-green-600 hover:bg-green-700" : ""}`}
                            disabled={!slot.matchedItem && (!slot.manualPrice || parseFloat(slot.manualPrice) <= 0)}
                            onClick={() => updateSlot(slot.index, { confirmed: !slot.confirmed })}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeImage.storyMode}
                    onChange={(e) => updateImage(activeImage.id, { storyMode: e.target.checked })}
                    className="rounded"
                  />
                  Crop to 9:16 story format
                </label>
              </div>

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
                disabled={!allConfirmed}
                onClick={() => generateImage(activeImage)}
              >
                <Image className="h-4 w-4 mr-2" />
                Generate Sale Image
              </Button>
            </div>
          )}

          {/* Generating */}
          {activeImage.phase === "generating" && (
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4 py-10">
                  <Loader2 className="h-10 w-10 animate-spin text-green-600" />
                  <p className="text-sm font-medium">{activeImage.statusText}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Done: preview */}
          {activeImage.phase === "done" && activeImage.generatedImage && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-3">Preview</h3>
                  <div className="rounded-xl overflow-hidden border bg-muted/30">
                    <img
                      src={activeImage.generatedImage}
                      alt="Generated sale image"
                      className="w-full object-contain max-h-[70vh]"
                    />
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-3">
                {canNativeShare ? (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    size="lg"
                    onClick={() => handleShare(activeImage)}
                  >
                    <Share2 className="h-4 w-4 mr-2" /> Save / Share
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    size="lg"
                    onClick={() => handleDownload(activeImage)}
                  >
                    <Download className="h-4 w-4 mr-2" /> Download Image
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => updateImage(activeImage.id, { phase: "confirm", generatedImage: null })}
                >
                  <Pencil className="h-4 w-4 mr-2" /> Edit Prices
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
