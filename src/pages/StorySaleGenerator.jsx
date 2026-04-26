import { useState, useCallback, useRef, useMemo, useEffect } from "react";
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

const DEFAULT_LABEL_COLOR = "#16a34a";
const DEFAULT_LABEL_POSITION = { x: 0.5, y: 0.9 };
const SCAN_MAX_DIMENSION = 1600;
const SCAN_JPEG_QUALITY = 0.82;
const BATCH_SCAN_CONCURRENCY = 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeCardNumber(value) {
  return String(value || "").replace(/^#/, "").trim().toLowerCase();
}

function normalizeCardNumberBase(value) {
  return normalizeCardNumber(value).split("/")[0].replace(/^0+(\d)/, "$1");
}

function buildInventoryIndex(inventoryItems, currency, roundUp) {
  const entries = inventoryItems.map((item, index) => {
    const name = normalizeText(item.name);
    const set = normalizeText(item.set);
    const number = normalizeCardNumber(item.number);
    const numberBase = normalizeCardNumberBase(item.number);
    const grade = item.grade ? String(item.grade).trim() : "";
    const gradingCompany = normalizeText(item.gradingCompany);

    return {
      item,
      name,
      set,
      number,
      numberBase,
      grade,
      gradingCompany,
      key: item.entryId || item.cardId || item.id || `${name}|${set}|${number}|${index}`,
      price: getDisplayPriceForItem(item, currency, roundUp),
      searchText: `${name} ${set} ${number} ${grade} ${gradingCompany}`,
    };
  });

  const byNumberBase = new Map();
  const byName = new Map();
  entries.forEach((entry) => {
    if (entry.numberBase) {
      const bucket = byNumberBase.get(entry.numberBase) || [];
      bucket.push(entry);
      byNumberBase.set(entry.numberBase, bucket);
    }
    if (entry.name) {
      const bucket = byName.get(entry.name) || [];
      bucket.push(entry);
      byName.set(entry.name, bucket);
    }
  });

  return { entries, byNumberBase, byName };
}

function matchDetectedToInventory(detected, inventoryIndex) {
  const detectedName = normalizeText(detected.name);
  const detectedNum = normalizeCardNumber(detected.collectorNumber);
  const detectedNumBase = normalizeCardNumberBase(detected.collectorNumber);
  const detectedSet = normalizeText(detected.setName);
  const detectedGrade = detected.grade ? String(detected.grade).trim() : null;
  const detectedCompany = normalizeText(detected.gradingCompany);

  const candidateMap = new Map();
  const addCandidates = (entries) => {
    entries.forEach((entry) => candidateMap.set(entry.key, entry));
  };

  if (detectedNumBase && inventoryIndex.byNumberBase.has(detectedNumBase)) {
    addCandidates(inventoryIndex.byNumberBase.get(detectedNumBase));
  }
  if (detectedName && inventoryIndex.byName.has(detectedName)) {
    addCandidates(inventoryIndex.byName.get(detectedName));
  }

  const candidateEntries = candidateMap.size > 0
    ? Array.from(candidateMap.values())
    : inventoryIndex.entries;

  const scored = candidateEntries.map((entry) => {
    const { item } = entry;
    let score = 0;

    if (detectedName && entry.name) {
      if (entry.name === detectedName) score += 35;
      else if (entry.name.includes(detectedName) || detectedName.includes(entry.name)) score += 12;
    }
    if (detectedNum && entry.number) {
      if (detectedNum === entry.number) score += 30;
      else if (detectedNumBase && detectedNumBase === entry.numberBase) score += 25;
    }
    if (detectedSet && entry.set) {
      if (entry.set === detectedSet) score += 18;
      else if (entry.set.includes(detectedSet) || detectedSet.includes(entry.set)) score += 7;
    }
    if (detected.isGraded && item.isGraded) {
      score += 10;
      if (detectedGrade && entry.grade === detectedGrade) score += 15;
      if (detectedCompany && entry.gradingCompany.includes(detectedCompany)) score += 5;
    }
    return { item, score, price: entry.price };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score >= 20).slice(0, 5);
}

function shouldAutoConfirm(detected, bestMatch) {
  if (!bestMatch) return false;
  const confidence = typeof detected.confidence === "number" ? detected.confidence : 0;
  return confidence >= 0.85 && bestMatch.score >= 70;
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

async function compressImageForScan(file) {
  const img = new window.Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });

    const scale = Math.min(1, SCAN_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Failed to compress image."))),
        "image/jpeg",
        SCAN_JPEG_QUALITY
      );
    });

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return {
      base64: dataUrl.split(",")[1],
      mimeType: blob.type || "image/jpeg",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      await worker(next);
    }
  });
  await Promise.all(workers);
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to export image."))),
      type,
      quality
    );
  });
}

function revokeImageUrls(imageEntry) {
  if (imageEntry?.preview) URL.revokeObjectURL(imageEntry.preview);
  if (imageEntry?.generatedImage) URL.revokeObjectURL(imageEntry.generatedImage);
}

async function drawPriceOverlays(canvas, img, slots, gridConfig, currency, secondaryCurrency, options) {
  const ctx = canvas.getContext("2d");
  const { storyMode, labelColor, includeSecondaryCurrency } = options;

  let canvasW = img.naturalWidth;
  let canvasH = img.naturalHeight;
  let drawW = img.naturalWidth;
  let drawH = img.naturalHeight;

  if (storyMode) {
    canvasW = 1080;
    canvasH = 1920;
    const scale = Math.min(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
    drawW = img.naturalWidth * scale;
    drawH = img.naturalHeight * scale;
  }

  canvas.width = canvasW;
  canvas.height = canvasH;

  if (storyMode) {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const imgX = (canvasW - drawW) / 2;
  const imgY = (canvasH - drawH) / 2;
  ctx.drawImage(img, imgX, imgY, drawW, drawH);

  const { cols, rows } = gridConfig;
  const cellW = drawW / cols;
  const cellH = drawH / rows;

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
    if (secondaryCurrency && includeSecondaryCurrency) {
      const converted = convertCurrency(price, secondaryCurrency, currency);
      secondaryText = formatWholePrice(roundToNearest10(converted), secondaryCurrency);
    }

    const labelPosition = slot.labelPosition || DEFAULT_LABEL_POSITION;
    const boxX = cellX + labelPosition.x * cellW - boxW / 2;
    const boxY = cellY + labelPosition.y * cellH - boxH / 2;

    const radius = boxH * 0.18;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fillStyle = labelColor || DEFAULT_LABEL_COLOR;
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

  return canvasToBlob(canvas, "image/png");
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
    generatedBlob: null,
    storyMode: false,
    labelColor: DEFAULT_LABEL_COLOR,
    includeSecondaryCurrency: true,
    error: null,
    statusText: "",
  };
}

export function StorySaleGenerator() {
  const { user, collectionItems, currency, secondaryCurrency } = useApp();

  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingLabel, setDraggingLabel] = useState(null);
  const [globalError, setGlobalError] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imagesRef = useRef(images);

  const roundUp = false;

  const inventoryItems = useMemo(() => {
    return (collectionItems || []).filter((i) => !i.excludeFromSale);
  }, [collectionItems]);

  const inventoryIndex = useMemo(
    () => buildInventoryIndex(inventoryItems, currency, roundUp),
    [inventoryItems, currency, roundUp]
  );

  const activeImage = images.find((img) => img.id === activeId) || null;

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach(revokeImageUrls);
    };
  }, []);

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
    setImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      const remaining = prev.filter((img) => img.id !== id);
      if (removed) revokeImageUrls(removed);
      setActiveId((current) => (current === id ? remaining[0]?.id || null : current));
      return remaining;
    });
  }, []);

  const updateImage = useCallback((id, updates) => {
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== id) return img;
        if (
          Object.prototype.hasOwnProperty.call(updates, "generatedImage") &&
          img.generatedImage &&
          img.generatedImage !== updates.generatedImage
        ) {
          URL.revokeObjectURL(img.generatedImage);
        }
        return { ...img, ...updates };
      })
    );
  }, []);

  const resetAll = useCallback(() => {
    images.forEach(revokeImageUrls);
    setImages([]);
    setActiveId(null);
    setGlobalError(null);
  }, [images]);

  // ── Scan a single image ───────────────────────────────────────

  const handleScan = useCallback(async (imageEntry) => {
    if (!imageEntry.file || !user) return;
    const id = imageEntry.id;
    updateImage(id, { phase: "scanning", error: null, statusText: "Analyzing photo with AI..." });

    try {
      const compressed = await compressImageForScan(imageEntry.file);

      const functions = getFunctions();
      const parseCardPhotoFn = httpsCallable(functions, "parseCardPhoto");
      const result = await parseCardPhotoFn({
        imageBase64: compressed.base64,
        mimeType: compressed.mimeType,
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
        const matches = matchDetectedToInventory(detected, inventoryIndex);
        const best = matches[0] || null;
        const bestMatch = best?.item || null;
        const bestPrice = best?.price || 0;
        return {
          index: i,
          detected,
          matchedItem: bestMatch,
          candidates: matches.map((m) => m.item),
          price: bestPrice,
          manualPrice: "",
          confirmed: shouldAutoConfirm(detected, best),
          labelPosition: DEFAULT_LABEL_POSITION,
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
  }, [user, inventoryIndex, updateImage]);

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
    const q = normalizeText(query);
    const qNumber = normalizeCardNumber(query);
    return inventoryIndex.entries
      .filter((entry) => entry.searchText.includes(q) || (qNumber && entry.number.includes(qNumber)))
      .map((entry) => entry.item)
      .slice(0, 10);
  }, [inventoryIndex]);

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
      const blob = await drawPriceOverlays(
        canvas, img, imageEntry.cardSlots, imageEntry.gridConfig,
        currency, secondaryCurrency, {
          storyMode: imageEntry.storyMode,
          labelColor: imageEntry.labelColor,
          includeSecondaryCurrency: imageEntry.includeSecondaryCurrency,
        }
      );
      const objectUrl = URL.createObjectURL(blob);
      updateImage(id, { phase: "done", generatedImage: objectUrl, generatedBlob: blob });
    } catch (err) {
      console.error("Image generation failed:", err);
      updateImage(id, { phase: "confirm", error: "Failed to generate image." });
    }
  }, [currency, secondaryCurrency, updateImage]);

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
    if (!imageEntry?.generatedBlob) return;
    const file = new File([imageEntry.generatedBlob], `story-sale-${Date.now()}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name !== "AbortError") console.error("Share failed:", err);
    }
  }, []);

  const handleDownload = useCallback((imageEntry) => {
    if (!imageEntry?.generatedImage) return;
    const link = document.createElement("a");
    link.download = `story-sale-${Date.now()}.png`;
    link.href = imageEntry.generatedImage;
    link.click();
  }, []);

  const handleSaveToPhotos = useCallback(async (imageEntry) => {
    if (!imageEntry) return;
    if (canNativeShare && imageEntry.generatedBlob) {
      await handleShare(imageEntry);
      return;
    }
    handleDownload(imageEntry);
  }, [canNativeShare, handleDownload, handleShare]);

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
    await runWithConcurrency(pending, BATCH_SCAN_CONCURRENCY, handleScan);
  }, [images, handleScan]);

  const generateAllConfirmed = useCallback(async () => {
    const confirmed = images.filter(
      (img) => img.phase === "confirm" && img.cardSlots.every((s) => s.confirmed)
    );
    for (const img of confirmed) {
      await generateImage(img);
    }
  }, [images, generateImage]);

  const updateLabelPositionFromPointer = useCallback((event, slotIndex) => {
    if (!activeImage?.gridConfig) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const { cols, rows } = activeImage.gridConfig;
    const col = slotIndex % cols;
    const row = Math.floor(slotIndex / cols);
    const x = clamp(px * cols - col, 0.1, 0.9);
    const y = clamp(py * rows - row, 0.1, 0.9);
    updateSlot(slotIndex, { labelPosition: { x, y } });
  }, [activeImage?.gridConfig, updateSlot]);

  const handleLabelPointerMove = useCallback((event) => {
    if (draggingLabel == null) return;
    updateLabelPositionFromPointer(event, draggingLabel);
  }, [draggingLabel, updateLabelPositionFromPointer]);

  const allSlots = activeImage?.cardSlots || [];
  const allConfirmed = allSlots.length > 0 && allSlots.every((s) => s.confirmed);
  const previewImages = images.filter((img) =>
    ["confirm", "generating", "done"].includes(img.phase) && (img.generatedImage || img.preview)
  );
  const doneImages = images.filter((img) => img.phase === "done" && img.generatedImage);
  const doneCount = doneImages.length;
  const activePreviewIndex = activeImage
    ? previewImages.findIndex((img) => img.id === activeImage.id)
    : -1;
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
                    src={img.generatedImage || img.preview}
                    alt={img.phase === "done" ? "Generated sale preview" : "Card photo"}
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

      {previewImages.length > 1 && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold">Sale Previews</h3>
                <p className="text-xs text-muted-foreground">
                  Identified and generated images appear here as soon as each scan finishes.
                </p>
              </div>
              {doneCount > 1 && (
                <Button size="sm" variant="outline" onClick={handleDownloadAll}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {previewImages.map((img, index) => {
                const confirmedCount = img.cardSlots.filter((slot) => slot.confirmed).length;
                const status = img.phase === "done"
                  ? "Generated"
                  : img.phase === "generating"
                    ? "Generating"
                    : `${confirmedCount}/${img.cardSlots.length} confirmed`;

                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveId(img.id)}
                    className={`overflow-hidden rounded-lg border-2 bg-muted/30 text-left transition-all ${
                      img.id === activeId
                        ? "border-green-500 ring-2 ring-green-300"
                        : "border-transparent hover:border-green-300"
                    }`}
                  >
                    <img
                      src={img.generatedImage || img.preview}
                      alt={`Sale preview ${index + 1}`}
                      className="h-56 w-full object-contain"
                    />
                    <div className="flex items-center justify-between gap-2 border-t bg-background px-2 py-1.5">
                      <span className="text-xs font-medium">Preview {index + 1}</span>
                      <span className="text-[10px] text-muted-foreground">{status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                    Export as 1080x1920 story
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

                  <div className="rounded-lg border bg-muted/20 p-3 mb-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Export controls</p>
                        <p className="text-xs text-muted-foreground">
                          Drag price labels on the photo, then generate.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium">
                        Label color
                        <input
                          type="color"
                          value={activeImage.labelColor || DEFAULT_LABEL_COLOR}
                          onChange={(e) => updateImage(activeImage.id, { labelColor: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border bg-background p-1"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeImage.storyMode}
                          onChange={(e) => updateImage(activeImage.id, { storyMode: e.target.checked })}
                          className="rounded"
                        />
                        1080x1920 story export
                      </label>
                      {secondaryCurrency && (
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeImage.includeSecondaryCurrency}
                            onChange={(e) => updateImage(activeImage.id, { includeSecondaryCurrency: e.target.checked })}
                            className="rounded"
                          />
                          Include {secondaryCurrency}
                        </label>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          allSlots.forEach((slot) => updateSlot(slot.index, { labelPosition: DEFAULT_LABEL_POSITION }));
                        }}
                      >
                        Reset Labels
                      </Button>
                    </div>

                    {activeImage.gridConfig && allSlots.length > 0 && (
                      <div
                        className="relative overflow-hidden rounded-lg border bg-black/5 touch-none select-none"
                        onPointerMove={handleLabelPointerMove}
                        onPointerUp={() => setDraggingLabel(null)}
                        onPointerCancel={() => setDraggingLabel(null)}
                      >
                        <img
                          src={activeImage.preview}
                          alt="Label placement preview"
                          className="block w-full"
                          draggable={false}
                        />
                        {allSlots.map((slot) => {
                          const { cols, rows } = activeImage.gridConfig;
                          const col = slot.index % cols;
                          const row = Math.floor(slot.index / cols);
                          const position = slot.labelPosition || DEFAULT_LABEL_POSITION;
                          const left = ((col + position.x) / cols) * 100;
                          const top = ((row + position.y) / rows) * 100;
                          const price = slot.manualPrice ? parseFloat(slot.manualPrice) : slot.price;
                          const primary = price > 0 ? formatWholePrice(price, currency) : "Set price";
                          const secondary = price > 0 && secondaryCurrency && activeImage.includeSecondaryCurrency
                            ? formatWholePrice(roundToNearest10(convertCurrency(price, secondaryCurrency, currency)), secondaryCurrency)
                            : null;

                          return (
                            <button
                              key={slot.index}
                              type="button"
                              className="absolute min-w-20 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md px-2 py-1 text-center text-[11px] font-extrabold leading-tight text-white shadow-lg active:cursor-grabbing"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                backgroundColor: activeImage.labelColor || DEFAULT_LABEL_COLOR,
                              }}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.currentTarget.setPointerCapture?.(e.pointerId);
                                setDraggingLabel(slot.index);
                                updateLabelPositionFromPointer(e, slot.index);
                              }}
                            >
                              <span className="block">{primary}</span>
                              {secondary && <span className="block text-[9px] font-semibold opacity-90">{secondary}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

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
                                  ).map((item, resultIndex) => (
                                    <button
                                      key={item.entryId || item.cardId || `${item.name}-${item.number}-${resultIndex}`}
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
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="font-semibold">
                      Preview{activePreviewIndex >= 0 && previewImages.length > 1 ? ` ${activePreviewIndex + 1}/${previewImages.length}` : ""}
                    </h3>
                    {previewImages.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Choose another preview above
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl overflow-hidden border bg-muted/30">
                    <img
                      src={activeImage.generatedImage}
                      alt="Generated sale image"
                      className="w-full object-contain max-h-[70vh]"
                    />
                  </div>
                </CardContent>
              </Card>
              <div className="flex flex-col gap-3 sm:flex-row">
                {canNativeShare ? (
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    size="lg"
                    onClick={() => handleShare(activeImage)}
                  >
                    <Share2 className="h-4 w-4 mr-2" /> Share
                  </Button>
                ) : null}
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="lg"
                  onClick={() => handleSaveToPhotos(activeImage)}
                >
                  {canNativeShare ? (
                    <Share2 className="h-4 w-4 mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {canNativeShare ? "Save to Photos" : "Download Image"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => updateImage(activeImage.id, { phase: "confirm", generatedImage: null, generatedBlob: null })}
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
