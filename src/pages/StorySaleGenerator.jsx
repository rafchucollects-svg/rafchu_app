import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Upload, X, Check, AlertTriangle, Loader2,
  Search, RotateCcw, Download, Image, Pencil, Plus, Share2,
  LayoutGrid, Package, ArrowRight, Palette, Smartphone, Sparkles,
} from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useApp } from "@/contexts/AppContext";
import { computeItemMetrics, convertCurrency, formatCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";
import { autoDetectGrid, computeInventoryGridLayout, sanitizeDetectedPosition } from "@/utils/storySaleHelpers";

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
// Slab labels contain the most reliable set/number/grade data and are often a
// small fraction of the frame, so preserve more detail than a generic upload.
const SCAN_MAX_DIMENSION = 2048;
const SCAN_JPEG_QUALITY = 0.88;
const BATCH_SCAN_CONCURRENCY = 1;
const STORY_CANVAS_WIDTH = 1080;
const STORY_CANVAS_HEIGHT = 1920;
const BASE_LABEL_WIDTH = 430;
const BASE_LABEL_HEIGHT = 112;
const MAX_DETECTED_CARDS = 12;

const STORY_BACKGROUNDS = {
  midnight: {
    label: "Midnight",
    top: "#17213d",
    bottom: "#080b16",
    glow: "rgba(59, 130, 246, 0.26)",
    accent: "#facc15",
  },
  graphite: {
    label: "Graphite",
    top: "#27272a",
    bottom: "#09090b",
    glow: "rgba(255, 255, 255, 0.13)",
    accent: "#a3e635",
  },
  berry: {
    label: "Berry",
    top: "#451a3f",
    bottom: "#160b1c",
    glow: "rgba(244, 114, 182, 0.25)",
    accent: "#f9a8d4",
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampStart(value, min, max) {
  if (max < min) return min;
  return clamp(value, min, max);
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

function createFreeformGrid() {
  return { cols: 1, rows: 1, freeform: true };
}

function getDetectedLabelPosition(detected) {
  const position = sanitizeDetectedPosition(detected?.position);
  if (!position) return DEFAULT_LABEL_POSITION;
  return {
    x: clamp(position.x + position.width / 2, 0.03, 0.97),
    y: clamp(position.y + position.height * 0.84, 0.03, 0.97),
  };
}

function roundToNearest10(n) {
  return Math.ceil(n / 10) * 10;
}

const FONT_STACK = '"Manrope", "SF Pro Display", "Segoe UI", system-ui, sans-serif';

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

function getLabelBoxSize(cellW, cellH, canvasW, canvasH, storyMode) {
  const baseScale = storyMode
    ? canvasW / STORY_CANVAS_WIDTH
    : clamp(Math.min(canvasW, canvasH) / STORY_CANVAS_WIDTH, 0.75, 1.6);
  const targetW = BASE_LABEL_WIDTH * baseScale;
  const targetH = BASE_LABEL_HEIGHT * baseScale;
  const fitScale = Math.min(1, (cellW * 0.9) / targetW, (cellH * 0.3) / targetH);

  return {
    boxW: targetW * fitScale,
    boxH: targetH * fitScale,
  };
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
  const {
    storyMode,
    labelColor,
    includeSecondaryCurrency,
    backgroundPreset = "midnight",
  } = options;

  let canvasW = img.naturalWidth;
  let canvasH = img.naturalHeight;
  let drawW = img.naturalWidth;
  let drawH = img.naturalHeight;

  if (storyMode) {
    canvasW = STORY_CANVAS_WIDTH;
    canvasH = STORY_CANVAS_HEIGHT;
    const contentInset = 36;
    const scale = Math.min(
      (canvasW - contentInset * 2) / img.naturalWidth,
      (canvasH - contentInset * 2) / img.naturalHeight
    );
    drawW = img.naturalWidth * scale;
    drawH = img.naturalHeight * scale;
  } else {
    const maxExportDimension = 2800;
    const scale = Math.min(1, maxExportDimension / Math.max(canvasW, canvasH));
    canvasW = Math.round(canvasW * scale);
    canvasH = Math.round(canvasH * scale);
    drawW = canvasW;
    drawH = canvasH;
  }

  canvas.width = canvasW;
  canvas.height = canvasH;

  if (storyMode) {
    const palette = STORY_BACKGROUNDS[backgroundPreset] || STORY_BACKGROUNDS.midnight;
    const background = ctx.createLinearGradient(0, 0, 0, canvasH);
    background.addColorStop(0, palette.top);
    background.addColorStop(1, palette.bottom);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Turn otherwise-empty letterboxing into a soft continuation of the photo.
    const coverScale = Math.max(canvasW / img.naturalWidth, canvasH / img.naturalHeight);
    const coverW = img.naturalWidth * coverScale;
    const coverH = img.naturalHeight * coverScale;
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.filter = "blur(42px) saturate(1.2)";
    ctx.drawImage(img, (canvasW - coverW) / 2, (canvasH - coverH) / 2, coverW, coverH);
    ctx.restore();

    const scrim = ctx.createLinearGradient(0, 0, 0, canvasH);
    scrim.addColorStop(0, "rgba(3, 7, 18, 0.26)");
    scrim.addColorStop(0.5, "rgba(3, 7, 18, 0.08)");
    scrim.addColorStop(1, "rgba(3, 7, 18, 0.42)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const imgX = (canvasW - drawW) / 2;
  const imgY = (canvasH - drawH) / 2;
  if (storyMode) {
    const frameRadius = 24;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.48)";
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 12;
    drawRoundedRect(ctx, imgX, imgY, drawW, drawH, frameRadius);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, drawW, drawH, frameRadius);
    ctx.clip();
    ctx.drawImage(img, imgX, imgY, drawW, drawH);
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, drawW, drawH, frameRadius);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.drawImage(img, imgX, imgY, drawW, drawH);
  }

  const isFreeform = !!gridConfig?.freeform;
  const { cols, rows } = gridConfig;
  const cellW = drawW / cols;
  const cellH = drawH / rows;

  slots.forEach((slot) => {
    const col = slot.index % cols;
    const row = Math.floor(slot.index / cols);
    const cellX = isFreeform ? imgX : imgX + col * cellW;
    const cellY = isFreeform ? imgY : imgY + row * cellH;
    const slotCellW = isFreeform ? drawW : cellW;
    const slotCellH = isFreeform ? drawH : cellH;

    const price = slot.manualPrice ? parseFloat(slot.manualPrice) : slot.price;
    if (!price || price <= 0) return;

    const primaryText = formatWholePrice(price, currency);
    let secondaryText = null;
    if (secondaryCurrency && includeSecondaryCurrency) {
      const converted = convertCurrency(price, secondaryCurrency, currency);
      secondaryText = formatWholePrice(roundToNearest10(converted), secondaryCurrency);
    }

    const detectedBounds = isFreeform ? sanitizeDetectedPosition(slot.detected?.position) : null;
    const fallbackScale = Math.max(1, Math.ceil(Math.sqrt(slots.length)));
    const baseCellW = detectedBounds ? drawW * detectedBounds.width : (isFreeform ? drawW / fallbackScale : cellW);
    const baseCellH = detectedBounds ? drawH * detectedBounds.height : (isFreeform ? drawH / fallbackScale : cellH);
    const { boxW, boxH } = getLabelBoxSize(baseCellW, baseCellH, canvasW, canvasH, storyMode);
    const hPad = boxW * 0.08;
    const maxTextW = boxW - hPad * 2;

    const labelPosition = slot.labelPosition || DEFAULT_LABEL_POSITION;
    const desiredX = cellX + labelPosition.x * slotCellW - boxW / 2;
    const desiredY = cellY + labelPosition.y * slotCellH - boxH / 2;
    const boxX = clampStart(desiredX, cellX, cellX + slotCellW - boxW);
    const boxY = clampStart(desiredY, cellY, cellY + slotCellH - boxH);

    const radius = boxH * 0.18;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = Math.max(8, boxH * 0.14);
    ctx.shadowOffsetY = Math.max(3, boxH * 0.04);
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
    ctx.fillStyle = labelColor || DEFAULT_LABEL_COLOR;
    ctx.fill();
    ctx.restore();

    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = Math.max(1, boxH * 0.015);
    ctx.stroke();

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

// ── Inventory-mode helpers ──────────────────────────────────────
// These power the "Build from Inventory" flow where we synthesize the
// story image from scratch using each card's stored picture rather than
// overlaying labels on a user-uploaded photo.

const STORY_FOOTER_NOTE = "DM to claim · More photos available";
const GRADED_PER_IMAGE = 4;   // 2x2 max
const UNGRADED_PER_IMAGE = 9; // 3x3 max

function getCardImageUrl(item) {
  return item.image || item.imageUrl || null;
}

// Compact Cardmarket-style condition badge (M / NM / EX / GD / PL / PO).
// We always force the European/Cardmarket vocabulary regardless of the
// viewer's region because the user explicitly asked for the CM labels on
// the generated sale images.
function getCompactCMCondition(condition) {
  const cmLabel = getConditionDisplayLabel(condition || "NM", true);
  const map = {
    "Mint": "M",
    "Near Mint": "NM",
    "Excellent": "EX",
    "Good": "GD",
    "Light Played": "LP",
    "Played": "PL",
    "Poor": "PO",
  };
  return map[cmLabel] || cmLabel.slice(0, 2).toUpperCase();
}

function chunkBy(items, perChunk) {
  const out = [];
  for (let i = 0; i < items.length; i += perChunk) {
    out.push(items.slice(i, i + perChunk));
  }
  return out;
}

// Choose the grid that makes each card as large as possible inside a portrait
// story. This intentionally gives two cards two rows, and five/six cards a
// 2x3 grid; the old landscape-biased layouts left most of the story empty.
function drawStoryBackground(ctx, width, height, preset) {
  const palette = STORY_BACKGROUNDS[preset] || STORY_BACKGROUNDS.midnight;
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, palette.top);
  base.addColorStop(1, palette.bottom);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.84, height * 0.08, 0, width * 0.84, height * 0.08, width * 0.8);
  glow.addColorStop(0, palette.glow);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const lowerGlow = ctx.createRadialGradient(width * 0.1, height * 0.92, 0, width * 0.1, height * 0.92, width * 0.65);
  lowerGlow.addColorStop(0, "rgba(34, 197, 94, 0.1)");
  lowerGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, 0, width, height);

  // Very subtle texture keeps large flat areas from looking like a template.
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = "#ffffff";
  for (let y = 14; y < height; y += 34) {
    for (let x = (y / 34) % 2 ? 12 : 28; x < width; x += 34) {
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.restore();
}

// Cache-bust appended to bypass any stale non-CORS response the browser
// may have cached BEFORE the Storage bucket's CORS config was applied.
// Without this, the browser keeps reusing the cached failed response
// even after the bucket now serves correct CORS headers.
function addCacheBuster(src) {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  const cacheKey = "rcsv1"; // bump if we ever need to re-bust all clients
  return src.includes("?") ? `${src}&_rb=${cacheKey}` : `${src}?_rb=${cacheKey}`;
}

// Server-side image proxy. Used as a fallback when the direct load fails
// (CORS-locked host, 404, etc). The proxy fetches the image server-side
// — where CORS rules don't apply — and re-serves it with our own
// permissive CORS headers so canvas export works.
const IMAGE_PROXY_BASE = "https://us-central1-rafchu-tcg-app.cloudfunctions.net/proxyImage";

function buildProxyUrl(src) {
  return `${IMAGE_PROXY_BASE}?url=${encodeURIComponent(src)}`;
}

function tryLoadCrossOriginImage(src) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve({ img, error: null });
    img.onerror = () => resolve({ img: null, error: "load_failed" });
    img.src = src;
  });
}

// Image loader that NEVER rejects. We can't let a single bad image taint
// the canvas (toBlob would throw and the whole batch would fail), so any
// failure is reported back to the caller via {img: null, error}. The
// compositor then draws a styled placeholder for that slot and the rest
// of the grid generates normally.
//
// Loading strategy:
//   1. Try the original URL directly with crossOrigin=anonymous. Fast path
//      for hosts that already send proper CORS headers (our Firebase
//      Storage bucket, Pokemon TCG API CDN, etc).
//   2. If the direct load fails, retry via the proxyImage Cloud Function
//      which fetches server-side (no CORS) and re-serves with our headers.
//      Bypasses any browser-cached CORS failures and any host that simply
//      doesn't speak CORS.
async function loadCardImage(src) {
  if (!src) {
    return { img: null, error: "No image on this card" };
  }

  const direct = await tryLoadCrossOriginImage(addCacheBuster(src));
  if (direct.img) return direct;

  console.warn("[StorySale] Direct load failed, retrying via proxy:", src);
  const viaProxy = await tryLoadCrossOriginImage(buildProxyUrl(src));
  if (viaProxy.img) return viaProxy;

  console.warn("[StorySale] Proxy load also failed:", src);
  return { img: null, error: "Image unreachable (direct + proxy both failed)" };
}

// Draws a styled placeholder card when the real image couldn't be loaded.
// Looks like a "card outline" with the card name + grade so the user can
// still tell which slot is for which card in the generated story.
function drawPlaceholderCard(ctx, x, y, w, h, item) {
  // Aspect-correct card shape (TCG ~2.5:3.5).
  const targetRatio = 2.5 / 3.5;
  let cardW = w;
  let cardH = w / targetRatio;
  if (cardH > h) {
    cardH = h;
    cardW = h * targetRatio;
  }
  const cardX = x + (w - cardW) / 2;
  const cardY = y + (h - cardH) / 2;
  const radius = cardW * 0.06;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;

  const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  grad.addColorStop(0, "#2a2a4a");
  grad.addColorStop(1, "#1a1a2e");
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const nameSize = fitText(ctx, item.name || "Unknown card", 800, cardW * 0.84, cardW * 0.13);
  ctx.font = `800 ${nameSize}px ${FONT_STACK}`;
  ctx.fillText(item.name || "Unknown card", cardX + cardW / 2, cardY + cardH * 0.42);

  if (item.isGraded) {
    const gradeText = `${item.gradingCompany || "Graded"} ${item.grade || ""}`.trim();
    const gradeSize = fitText(ctx, gradeText, 600, cardW * 0.84, nameSize * 0.7);
    ctx.font = `600 ${gradeSize}px ${FONT_STACK}`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.fillText(gradeText, cardX + cardW / 2, cardY + cardH * 0.42 + nameSize * 0.9);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  const msgSize = nameSize * 0.5;
  ctx.font = `500 ${msgSize}px ${FONT_STACK}`;
  ctx.fillText("Image unavailable", cardX + cardW / 2, cardY + cardH * 0.78);

  return { drawX: cardX, drawY: cardY, drawW: cardW, drawH: cardH };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function composeInventoryGridImage({
  items,
  isGraded,
  currency,
  secondaryCurrency,
  includeSecondaryCurrency,
  labelColor,
  showCondition,
  saleTitle = "Fresh cards for sale",
  footerNote = STORY_FOOTER_NOTE,
  backgroundPreset = "midnight",
  pageNumber = 1,
  pageCount = 1,
}) {
  const W = STORY_CANVAS_WIDTH;
  const H = STORY_CANVAS_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const palette = STORY_BACKGROUNDS[backgroundPreset] || STORY_BACKGROUNDS.midnight;
  drawStoryBackground(ctx, W, H, backgroundPreset);

  // Header — compact enough for social safe zones, but clearly branded as a sale.
  const headerX = 48;
  const badgeY = 54;
  const badgeW = 184;
  const badgeH = 52;
  drawRoundedRect(ctx, headerX, badgeY, badgeW, badgeH, 18);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.fillStyle = "#111827";
  ctx.font = `900 24px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FOR SALE", headerX + badgeW / 2, badgeY + badgeH / 2 + 1);

  const cleanTitle = String(saleTitle || "Fresh cards for sale").trim().slice(0, 48);
  const titleSize = fitText(ctx, cleanTitle, 800, W - headerX * 2, 58);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.fillText(cleanTitle, headerX, 158);

  ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
  ctx.font = `600 25px ${FONT_STACK}`;
  const itemLabel = `${items.length} card${items.length === 1 ? "" : "s"} · DM to claim`;
  ctx.fillText(itemLabel, headerX, 205);

  // Layout regions
  const sidePad = 48;
  const topPad = 250;
  const bottomPad = 160;
  const gridW = W - sidePad * 2;
  const gridH = H - topPad - bottomPad;

  const { cols, rows } = computeInventoryGridLayout(items.length, isGraded);
  const cellW = gridW / cols;
  const cellH = gridH / rows;
  const cellPad = 18;

  // Preload all card images in parallel. `loadCardImage` never rejects,
  // so a single CORS-blocked or 404 image won't crater the whole batch —
  // it just resolves with {img: null, error} and we render a placeholder.
  const loadedImages = await Promise.all(
    items.map((item) => loadCardImage(getCardImageUrl(item)))
  );

  const failedItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { img, error: loadError } = loadedImages[i];

    const col = i % cols;
    const row = Math.floor(i / cols);

    // Center the last row when it isn't full so partial grids stay
    // visually balanced instead of dangling against one edge.
    const rowItemCount = Math.min(cols, items.length - row * cols);
    const rowOffset = ((cols - rowItemCount) * cellW) / 2;

    const cellX = sidePad + rowOffset + col * cellW;
    const cellY = topPad + row * cellH;

    const innerX = cellX + cellPad;
    const innerY = cellY + cellPad;
    const innerW = cellW - cellPad * 2;
    const innerH = cellH - cellPad * 2;

    let drawX;
    let drawY;
    let drawW;
    let drawH;

    if (img) {
      const scale = Math.min(innerW / img.naturalWidth, innerH / img.naturalHeight);
      drawW = img.naturalWidth * scale;
      drawH = img.naturalHeight * scale;
      drawX = innerX + (innerW - drawW) / 2;
      drawY = innerY + (innerH - drawH) / 2;

      // Drop shadow under each card so they feel like physical cards on
      // a backdrop rather than flat cutouts.
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      const placeholder = drawPlaceholderCard(ctx, innerX, innerY, innerW, innerH, item);
      drawX = placeholder.drawX;
      drawY = placeholder.drawY;
      drawW = placeholder.drawW;
      drawH = placeholder.drawH;
      failedItems.push({ item, error: loadError });
    }

    // Price label overlay: sticker-on-card style at the bottom of each card.
    const price = getDisplayPriceForItem(item, currency, false);
    if (price > 0) {
      drawCardPriceLabel(ctx, {
        cardX: drawX,
        cardY: drawY,
        cardW: drawW,
        cardH: drawH,
        price,
        currency,
        secondaryCurrency: includeSecondaryCurrency ? secondaryCurrency : null,
        labelColor: labelColor || DEFAULT_LABEL_COLOR,
        conditionText: showCondition && !item.isGraded
          ? getCompactCMCondition(item.condition)
          : null,
      });
    }
  }

  // Footer note and page marker stay inside Instagram's bottom safe area.
  const cleanFooter = String(footerNote || STORY_FOOTER_NOTE).trim().slice(0, 72);
  ctx.fillStyle = "rgba(255, 255, 255, 0.76)";
  ctx.font = `600 ${fitText(ctx, cleanFooter, 600, W - sidePad * 2 - 100, 27)}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(cleanFooter, sidePad, H - bottomPad / 2);

  if (pageCount > 1) {
    const pageText = `${pageNumber}/${pageCount}`;
    ctx.font = `800 25px ${FONT_STACK}`;
    const pageWidth = ctx.measureText(pageText).width + 34;
    drawRoundedRect(ctx, W - sidePad - pageWidth, H - bottomPad / 2 - 22, pageWidth, 44, 15);
    ctx.fillStyle = "rgba(255, 255, 255, 0.13)";
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.textAlign = "center";
    ctx.fillText(pageText, W - sidePad - pageWidth / 2, H - bottomPad / 2 + 1);
  }

  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, failedItems };
}

// Color palette for the condition chip, mirroring the Tailwind colors used
// in the inventory list. Each tier gets a distinct hue so a quick glance at
// the story image tells you which cards are NM vs played without reading
// the chip text.
const CONDITION_CHIP_COLORS = {
  M:  { bg: "#059669", text: "#ffffff" }, // emerald-600
  NM: { bg: "#16a34a", text: "#ffffff" }, // green-600
  EX: { bg: "#65a30d", text: "#ffffff" }, // lime-600
  GD: { bg: "#d97706", text: "#ffffff" }, // amber-600
  PL: { bg: "#ea580c", text: "#ffffff" }, // orange-600
  PO: { bg: "#dc2626", text: "#ffffff" }, // red-600
};

function drawCardPriceLabel(ctx, opts) {
  const {
    cardX, cardY, cardW, cardH,
    price, currency, secondaryCurrency,
    labelColor, conditionText,
  } = opts;

  // Narrower label so the card's bottom-corner info (set number, rarity,
  // artist signature) stays visible. The label sizes itself to the actual
  // text length within a tight max-width.
  const primaryText = formatWholePrice(price, currency);
  const secondaryText = secondaryCurrency
    ? formatWholePrice(roundToNearest10(convertCurrency(price, secondaryCurrency, currency)), secondaryCurrency)
    : null;

  const boxH = Math.max(cardH * 0.13, 52);

  // Measure the widest text we'll actually render at our target font size,
  // then add a small horizontal pad. This collapses empty space on either
  // side of the price for short values like "€140" while still expanding
  // gracefully for "€12,950" + secondary line.
  const measureFontPx = boxH * 0.6;
  ctx.save();
  ctx.font = `800 ${measureFontPx}px ${FONT_STACK}`;
  const primaryW = ctx.measureText(primaryText).width;
  let measuredW = primaryW;
  if (secondaryText) {
    ctx.font = `600 ${measureFontPx * 0.62}px ${FONT_STACK}`;
    const secondaryW = ctx.measureText(secondaryText).width;
    measuredW = Math.max(measuredW, secondaryW);
  }
  ctx.restore();

  const horizontalPad = boxH * 0.55;
  const boxW = Math.min(
    Math.max(measuredW + horizontalPad * 2, cardW * 0.32),
    cardW * 0.7
  );
  const boxX = cardX + (cardW - boxW) / 2;
  const boxY = cardY + cardH - boxH - cardH * 0.04;
  const radius = boxH * 0.24;

  // Soft shadow under the label so it pops off the card.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fillStyle = labelColor;
  ctx.fill();
  ctx.restore();

  const maxTextW = boxW - horizontalPad * 2;

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Condition chip pinned to top-right of the label, color-coded by tier.
  if (conditionText) {
    const palette = CONDITION_CHIP_COLORS[conditionText] || CONDITION_CHIP_COLORS.NM;
    const chipPadX = boxH * 0.22;
    const chipH = boxH * 0.46;
    ctx.font = `900 ${chipH * 0.64}px ${FONT_STACK}`;
    const chipTextW = ctx.measureText(conditionText).width;
    const chipW = chipTextW + chipPadX * 2;
    const chipX = boxX + boxW - chipW * 0.6;
    const chipY = boxY - chipH * 0.5;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH * 0.35);
    ctx.fillStyle = palette.bg;
    ctx.fill();
    ctx.restore();

    // Thin white outline so the chip reads on top of any backdrop hue.
    ctx.save();
    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH * 0.35);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = palette.text;
    ctx.font = `900 ${chipH * 0.64}px ${FONT_STACK}`;
    ctx.fillText(conditionText, chipX + chipW / 2, chipY + chipH / 2 + 1);
  }

  if (secondaryText) {
    const gap = boxH * 0.04;
    const primarySize = fitText(ctx, primaryText, 800, maxTextW, boxH * 0.52);
    const secondarySize = fitText(ctx, secondaryText, 600, maxTextW, primarySize * 0.62);
    const totalH = primarySize + secondarySize + gap;
    const topY = boxY + (boxH - totalH) / 2;

    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${primarySize}px ${FONT_STACK}`;
    ctx.fillText(primaryText, boxX + boxW / 2, topY + primarySize / 2);

    ctx.font = `600 ${secondarySize}px ${FONT_STACK}`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(secondaryText, boxX + boxW / 2, topY + primarySize + gap + secondarySize / 2);
    ctx.globalAlpha = 1;
  } else {
    const fontSize = fitText(ctx, primaryText, 800, maxTextW, boxH * 0.62);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
    ctx.fillText(primaryText, boxX + boxW / 2, boxY + boxH / 2);
  }
}

function createInventoryImageEntry({ blob, items, gridConfig, currency, isGraded, saleSettings }) {
  const url = URL.createObjectURL(blob);
  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    file: null,
    preview: url,
    phase: "done",
    cardSlots: items.map((item, i) => ({
      index: i,
      detected: { name: item.name, isManual: true, isGraded: item.isGraded, gradingCompany: item.gradingCompany, grade: item.grade },
      matchedItem: item,
      candidates: [item],
      price: getDisplayPriceForItem(item, currency, false),
      manualPrice: "",
      confirmed: true,
      labelPosition: DEFAULT_LABEL_POSITION,
      showSearch: false,
      searchQuery: "",
    })),
    gridConfig,
    generatedImage: url,
    generatedBlob: blob,
    storyMode: true,
    labelColor: DEFAULT_LABEL_COLOR,
    includeSecondaryCurrency: true,
    error: null,
    statusText: "",
    sourceMode: "inventory",
    isGradedSet: isGraded,
    showCondition: saleSettings.showCondition,
    saleTitle: saleSettings.saleTitle,
    footerNote: saleSettings.footerNote,
    backgroundPreset: saleSettings.backgroundPreset,
    pageNumber: saleSettings.pageNumber,
    pageCount: saleSettings.pageCount,
  };
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
    storyMode: true,
    labelColor: DEFAULT_LABEL_COLOR,
    backgroundPreset: "midnight",
    includeSecondaryCurrency: true,
    error: null,
    statusText: "",
    sourceMode: "photo",
  };
}

export function StorySaleGenerator() {
  const { user, collectionItems, currency, secondaryCurrency } = useApp();

  const [images, setImages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingLabel, setDraggingLabel] = useState(null);
  const [manualStickerQuery, setManualStickerQuery] = useState("");
  const [globalError, setGlobalError] = useState(null);

  // Inventory-mode picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState("graded"); // 'graded' | 'ungraded'
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState(() => new Set());
  const [pickerGenerating, setPickerGenerating] = useState(false);
  const [pickerError, setPickerError] = useState(null);
  const [pickerSaleTitle, setPickerSaleTitle] = useState("Fresh cards for sale");
  const [pickerFooterNote, setPickerFooterNote] = useState(STORY_FOOTER_NOTE);
  const [pickerBackground, setPickerBackground] = useState("midnight");
  const [pickerLabelColor, setPickerLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [pickerIncludeSecondary, setPickerIncludeSecondary] = useState(true);
  const [pickerShowCondition, setPickerShowCondition] = useState(true);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const labelPreviewRef = useRef(null);
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
          img.generatedImage !== updates.generatedImage &&
          img.generatedImage !== img.preview
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

      const detectedCards = cards.slice(0, MAX_DETECTED_CARDS);
      const hasMeasuredPositions = detectedCards.length > 0
        && detectedCards.every((card) => sanitizeDetectedPosition(card.position));
      const gridConfig = hasMeasuredPositions
        ? createFreeformGrid()
        : autoDetectGrid(detectedCards.length);

      const slots = detectedCards.map((detected, i) => {
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
          labelPosition: hasMeasuredPositions
            ? getDetectedLabelPosition(detected)
            : DEFAULT_LABEL_POSITION,
          showSearch: false,
          searchQuery: "",
        };
      });

      updateImage(id, {
        phase: "confirm",
        cardSlots: slots,
        gridConfig,
        sourceMode: "photo",
        error: cards.length > MAX_DETECTED_CARDS
          ? `The first ${MAX_DETECTED_CARDS} cards were added. Split larger groups across two photos for reliable labels.`
          : null,
      });
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

  const removeSlot = useCallback((slotIndex) => {
    if (!activeId) return;
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== activeId) return img;
        return {
          ...img,
          cardSlots: img.cardSlots.filter((slot) => slot.index !== slotIndex),
        };
      })
    );
  }, [activeId]);

  const startManualMode = useCallback((id) => {
    updateImage(id, {
      phase: "confirm",
      gridConfig: createFreeformGrid(),
      cardSlots: [],
      error: null,
      statusText: "Manual sticker mode",
      sourceMode: "manual",
    });
    setManualStickerQuery("");
  }, [updateImage]);

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

  const addManualStickerFromItem = useCallback((item) => {
    if (!activeId) return;
    const price = getDisplayPriceForItem(item, currency, roundUp);
    setImages((prev) =>
      prev.map((img) => {
        if (img.id !== activeId) return img;
        const nextIndex = img.cardSlots.reduce((max, slot) => Math.max(max, slot.index), -1) + 1;
        return {
          ...img,
          gridConfig: img.gridConfig?.freeform ? img.gridConfig : createFreeformGrid(),
          cardSlots: [
            ...img.cardSlots,
            {
              index: nextIndex,
              detected: { name: item.name, isManual: true },
              matchedItem: item,
              candidates: [item],
              price,
              manualPrice: "",
              confirmed: true,
              labelPosition: DEFAULT_LABEL_POSITION,
              showSearch: false,
              searchQuery: "",
            },
          ],
        };
      })
    );
    setManualStickerQuery("");
  }, [activeId, currency, roundUp]);

  // ── Inventory picker (Build from Inventory) ───────────────────

  const inventoryByMode = useMemo(() => {
    const graded = [];
    const ungraded = [];
    inventoryItems.forEach((item) => {
      if (item.isGraded) graded.push(item);
      else ungraded.push(item);
    });
    return { graded, ungraded };
  }, [inventoryItems]);

  const pickerCandidates = useMemo(() => {
    const list = pickerMode === "graded" ? inventoryByMode.graded : inventoryByMode.ungraded;
    if (!pickerSearch.trim()) return list;
    const q = normalizeText(pickerSearch);
    const qNumber = normalizeCardNumber(pickerSearch);
    return list.filter((item) => {
      const haystack = `${normalizeText(item.name)} ${normalizeText(item.set)} ${normalizeCardNumber(item.number)} ${normalizeText(item.gradingCompany)} ${item.grade || ""}`;
      return haystack.includes(q) || (qNumber && normalizeCardNumber(item.number).includes(qNumber));
    });
  }, [pickerMode, pickerSearch, inventoryByMode]);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    setPickerError(null);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerSelected(new Set());
    setPickerSearch("");
    setPickerError(null);
  }, []);

  const switchPickerMode = useCallback((mode) => {
    setPickerMode((prev) => {
      if (prev === mode) return prev;
      // Clear selection when switching modes since graded/ungraded mixing is
      // disabled per UX decision (one mode per generated session).
      setPickerSelected(new Set());
      return mode;
    });
  }, []);

  const togglePickerSelection = useCallback((entryKey) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  }, []);

  const generateFromInventory = useCallback(async () => {
    setPickerError(null);
    setGlobalError(null);
    const isGraded = pickerMode === "graded";
    const perImage = isGraded ? GRADED_PER_IMAGE : UNGRADED_PER_IMAGE;

    const selectedItems = (isGraded ? inventoryByMode.graded : inventoryByMode.ungraded)
      .filter((item) => pickerSelected.has(item.entryId || item.cardId || item.id))
      .map((item) => ({
        ...item,
        _price: getDisplayPriceForItem(item, currency, roundUp),
      }))
      .sort((a, b) => (b._price || 0) - (a._price || 0));

    if (selectedItems.length === 0) {
      setPickerError("Select at least one card to build the story.");
      return;
    }

    const chunks = chunkBy(selectedItems, perImage);
    setPickerGenerating(true);

    try {
      const newEntries = [];
      const allFailed = [];
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        const gridConfig = computeInventoryGridLayout(chunk.length, isGraded);
        const saleSettings = {
          saleTitle: pickerSaleTitle,
          footerNote: pickerFooterNote,
          backgroundPreset: pickerBackground,
          showCondition: !isGraded && pickerShowCondition,
          pageNumber: chunkIndex + 1,
          pageCount: chunks.length,
        };
        const { blob, failedItems } = await composeInventoryGridImage({
          items: chunk,
          isGraded,
          currency,
          secondaryCurrency,
          includeSecondaryCurrency: pickerIncludeSecondary,
          labelColor: pickerLabelColor,
          showCondition: saleSettings.showCondition,
          saleTitle: saleSettings.saleTitle,
          footerNote: saleSettings.footerNote,
          backgroundPreset: saleSettings.backgroundPreset,
          pageNumber: saleSettings.pageNumber,
          pageCount: saleSettings.pageCount,
        });
        newEntries.push(createInventoryImageEntry({
          blob,
          items: chunk,
          gridConfig,
          currency,
          isGraded,
          saleSettings,
        }));
        newEntries[newEntries.length - 1].labelColor = pickerLabelColor;
        newEntries[newEntries.length - 1].includeSecondaryCurrency = pickerIncludeSecondary;
        allFailed.push(...failedItems);
      }

      setImages((prev) => [...prev, ...newEntries]);
      setActiveId(newEntries[newEntries.length - 1]?.id || null);
      setPickerOpen(false);
      setPickerSelected(new Set());
      setPickerSearch("");

      if (allFailed.length > 0) {
        const names = allFailed.map(({ item }) => item.name).filter(Boolean);
        const uniqueNames = Array.from(new Set(names));
        const preview = uniqueNames.slice(0, 4).join(", ");
        const suffix = uniqueNames.length > 4 ? `, +${uniqueNames.length - 4} more` : "";
        setGlobalError(
          `Generated, but ${allFailed.length} card image${allFailed.length !== 1 ? "s" : ""} couldn't be loaded (CORS/network). Placeholders were drawn for: ${preview}${suffix}. Re-upload those photos in inventory for cleaner results.`
        );
      }
    } catch (err) {
      console.error("Inventory story generation failed:", err);
      setPickerError("Failed to generate story images. Please try again.");
    } finally {
      setPickerGenerating(false);
    }
  }, [
    pickerMode,
    pickerSelected,
    inventoryByMode,
    currency,
    secondaryCurrency,
    roundUp,
    pickerSaleTitle,
    pickerFooterNote,
    pickerBackground,
    pickerLabelColor,
    pickerIncludeSecondary,
    pickerShowCondition,
  ]);

  // ── Generate image for active entry ───────────────────────────

  const generateImage = useCallback(async (imageEntry) => {
    if (!imageEntry) return;
    const id = imageEntry.id;
    updateImage(id, { phase: "generating", statusText: "Generating sale image..." });

    try {
      if (imageEntry.sourceMode === "inventory") {
        const items = imageEntry.cardSlots.map((slot) => {
          const baseItem = slot.matchedItem || { name: slot.detected?.name || "Card" };
          const price = slot.manualPrice ? Number(slot.manualPrice) : Number(slot.price);
          return {
            ...baseItem,
            overridePrice: Number.isFinite(price) ? price : baseItem.overridePrice,
            overridePriceCurrency: currency,
          };
        });
        const { blob, failedItems } = await composeInventoryGridImage({
          items,
          isGraded: imageEntry.isGradedSet,
          currency,
          secondaryCurrency,
          includeSecondaryCurrency: imageEntry.includeSecondaryCurrency,
          labelColor: imageEntry.labelColor,
          showCondition: imageEntry.showCondition,
          saleTitle: imageEntry.saleTitle,
          footerNote: imageEntry.footerNote,
          backgroundPreset: imageEntry.backgroundPreset,
          pageNumber: imageEntry.pageNumber,
          pageCount: imageEntry.pageCount,
        });
        const objectUrl = URL.createObjectURL(blob);
        updateImage(id, {
          phase: "done",
          generatedImage: objectUrl,
          generatedBlob: blob,
          error: failedItems.length > 0
            ? `${failedItems.length} card image${failedItems.length === 1 ? "" : "s"} could not be loaded; a placeholder was used.`
            : null,
        });
        return;
      }

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
          backgroundPreset: imageEntry.backgroundPreset,
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
    if (!activeImage?.gridConfig || !labelPreviewRef.current) return;
    const rect = labelPreviewRef.current.getBoundingClientRect();
    const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (activeImage.gridConfig.freeform) {
      updateSlot(slotIndex, { labelPosition: { x: clamp(px, 0.02, 0.98), y: clamp(py, 0.02, 0.98) } });
      return;
    }

    const { cols, rows } = activeImage.gridConfig;
    const col = slotIndex % cols;
    const row = Math.floor(slotIndex / cols);
    const x = clamp(px * cols - col, 0.02, 0.98);
    const y = clamp(py * rows - row, 0.02, 0.98);
    updateSlot(slotIndex, { labelPosition: { x, y } });
  }, [activeImage?.gridConfig, updateSlot]);

  const handleLabelPointerMove = useCallback((event) => {
    if (draggingLabel == null) return;
    updateLabelPositionFromPointer(event, draggingLabel);
  }, [draggingLabel, updateLabelPositionFromPointer]);

  const allSlots = activeImage?.cardSlots || [];
  const allConfirmed = allSlots.length > 0 && allSlots.every((s) => s.confirmed);
  const isInventorySource = activeImage?.sourceMode === "inventory";
  const isManualMode = activeImage?.sourceMode === "manual";
  const manualStickerResults = isManualMode ? filteredSearchResults(manualStickerQuery) : [];
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
    <div className="max-w-5xl mx-auto pb-8">
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative mb-6 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-8 sm:py-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-200">
              <Sparkles className="h-3.5 w-3.5" /> Sale studio
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Turn card photos into stories that sell.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Identify cards, match your inventory prices, place each sticker, and export a polished 1080×1920 story.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Up to 12 cards</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> AI sticker placement</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-400" /> Story-ready PNG</span>
            </div>
          </div>
          <div className="hidden h-32 w-20 shrink-0 rotate-3 items-center justify-center rounded-[1.35rem] border-4 border-slate-700 bg-gradient-to-b from-emerald-400 to-emerald-700 shadow-2xl sm:flex">
            <Smartphone className="h-9 w-9 text-white/90" />
          </div>
        </div>
        {hasImages && (
          <Button
            variant="outline"
            size="sm"
            onClick={resetAll}
            className="relative mt-5 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Start over
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
      <Card className="mb-5 overflow-hidden border-border/80 shadow-sm">
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold">
              {hasImages ? `Sale assets (${images.length})` : "Choose a starting point"}
            </h3>
            {hasImages && (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openPicker}
                >
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" /> From Inventory
                </Button>
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
              className={`relative rounded-2xl border-2 border-dashed p-4 transition-colors sm:p-6 ${
                isDragging
                  ? "border-green-500 bg-green-50"
                  : "border-muted-foreground/20 bg-muted/15"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold">Price a card photo</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Best for tabletop photos like the examples: AI finds each slab and matches inventory pricing.</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={openPicker}
                  className="group rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-extrabold">Build from inventory</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Pick cards and create branded, portrait-optimized story pages automatically.</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
                  </div>
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>Drop photos anywhere in this box</span>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="font-bold text-emerald-700 hover:underline">Use camera</button>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="font-bold text-emerald-700 hover:underline">Browse files</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                    img.id === activeId
                      ? "border-green-500 ring-2 ring-green-300"
                      : "border-transparent hover:border-green-300"
                  }`}
                >
                  <button type="button" onClick={() => setActiveId(img.id)} className="absolute inset-0 h-full w-full">
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
                  </button>
                  <button
                    type="button"
                    aria-label="Remove sale asset"
                    onClick={() => removeImage(img.id)}
                    className="absolute left-1 top-1 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
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

      {/* ── Build from Inventory picker ────────────────────────── */}
      {pickerOpen && (
        <Card className="mb-5 border-green-300">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-green-600" />
                  Build from Inventory
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick cards and we&apos;ll size the grid for the largest possible cards.
                  Larger selections automatically split into numbered story pages.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={closePicker}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 mb-3">
              <button
                type="button"
                onClick={() => switchPickerMode("graded")}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  pickerMode === "graded"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Graded
                <span className="text-[10px] text-muted-foreground">
                  ({inventoryByMode.graded.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => switchPickerMode("ungraded")}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  pickerMode === "ungraded"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Ungraded
                <span className="text-[10px] text-muted-foreground">
                  ({inventoryByMode.ungraded.length})
                </span>
              </button>
            </div>

            <div className="mb-4 rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Palette className="h-4 w-4 text-emerald-700" />
                <div>
                  <p className="text-sm font-bold">Story style</p>
                  <p className="text-[11px] text-muted-foreground">Applied to every page in this batch.</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] font-bold text-muted-foreground">
                  Headline
                  <Input
                    value={pickerSaleTitle}
                    maxLength={48}
                    onChange={(event) => setPickerSaleTitle(event.target.value)}
                    className="mt-1 h-9 bg-background text-sm text-foreground"
                    placeholder="Fresh cards for sale"
                  />
                </label>
                <label className="text-[11px] font-bold text-muted-foreground">
                  Footer note
                  <Input
                    value={pickerFooterNote}
                    maxLength={72}
                    onChange={(event) => setPickerFooterNote(event.target.value)}
                    className="mt-1 h-9 bg-background text-sm text-foreground"
                    placeholder="DM to claim"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[11px] font-bold text-muted-foreground">Background</span>
                {Object.entries(STORY_BACKGROUNDS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPickerBackground(key)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                      pickerBackground === key ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "bg-background hover:border-emerald-300"
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full border border-white/40" style={{ background: preset.top }} />
                    {preset.label}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                  Sticker
                  <input
                    type="color"
                    value={pickerLabelColor}
                    onChange={(event) => setPickerLabelColor(event.target.value)}
                    className="h-8 w-10 cursor-pointer rounded-lg border bg-background p-1"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-xs font-medium">
                {secondaryCurrency && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pickerIncludeSecondary}
                      onChange={(event) => setPickerIncludeSecondary(event.target.checked)}
                      className="rounded"
                    />
                    Include {secondaryCurrency}
                  </label>
                )}
                {pickerMode === "ungraded" && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pickerShowCondition}
                      onChange={(event) => setPickerShowCondition(event.target.checked)}
                      className="rounded"
                    />
                    Show condition badges
                  </label>
                )}
              </div>
            </div>

            {/* Search */}
            <Input
              placeholder={`Search ${pickerMode} inventory...`}
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="h-9 text-sm mb-2"
            />

            {/* Selection summary */}
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground">
                {pickerSelected.size > 0 ? (
                  <>
                    <span className="font-semibold text-foreground">{pickerSelected.size}</span>
                    {" selected · "}
                    {(() => {
                      const perImage = pickerMode === "graded" ? GRADED_PER_IMAGE : UNGRADED_PER_IMAGE;
                      const imageCount = Math.ceil(pickerSelected.size / perImage);
                      return `${imageCount} image${imageCount !== 1 ? "s" : ""} will be generated`;
                    })()}
                  </>
                ) : (
                  `Pick at least 1 card (up to ${pickerMode === "graded" ? "4" : "9"} per story page)`
                )}
              </span>
              <div className="flex items-center gap-3">
                {(() => {
                  // Select All toggles every card in the currently-visible
                  // (search-filtered) list within the active mode. Toggling
                  // back to "Deselect" only deselects those visible cards,
                  // so selections from a previous search are preserved.
                  const visibleKeys = pickerCandidates.map((item) => item.entryId || item.cardId || item.id);
                  const visibleSelectedCount = visibleKeys.filter((k) => pickerSelected.has(k)).length;
                  const allVisibleSelected = visibleKeys.length > 0 && visibleSelectedCount === visibleKeys.length;
                  const label = allVisibleSelected
                    ? `Deselect all${pickerSearch ? " visible" : ""}`
                    : `Select all${pickerSearch ? " visible" : ""} (${visibleKeys.length})`;
                  return (
                    <button
                      type="button"
                      className="text-green-700 hover:text-green-800 font-semibold disabled:opacity-40 disabled:hover:text-green-700"
                      disabled={visibleKeys.length === 0}
                      onClick={() => {
                        setPickerSelected((prev) => {
                          const next = new Set(prev);
                          if (allVisibleSelected) {
                            visibleKeys.forEach((k) => next.delete(k));
                          } else {
                            visibleKeys.forEach((k) => next.add(k));
                          }
                          return next;
                        });
                      }}
                    >
                      {label}
                    </button>
                  );
                })()}
                {pickerSelected.size > 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground underline"
                    onClick={() => setPickerSelected(new Set())}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Inventory list */}
            <div className="max-h-80 overflow-y-auto rounded-lg border bg-muted/20 divide-y">
              {pickerCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {pickerSearch
                    ? "No matches in inventory."
                    : `No ${pickerMode} cards in your inventory yet.`}
                </p>
              ) : (
                pickerCandidates.map((item) => {
                  const key = item.entryId || item.cardId || item.id;
                  const selected = pickerSelected.has(key);
                  const price = getDisplayPriceForItem(item, currency, roundUp);
                  const imageUrl = getCardImageUrl(item);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePickerSelection(key)}
                      className={`flex w-full items-center gap-3 p-2 text-left transition-colors ${
                        selected ? "bg-green-50 hover:bg-green-100" : "hover:bg-muted/40"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                          selected
                            ? "bg-green-600 border-green-600 text-white"
                            : "border-muted-foreground/40 bg-background"
                        }`}
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.name}
                          className="h-12 w-9 rounded object-cover border flex-shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-9 rounded border bg-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {item.set}{item.number && ` #${item.number}`}
                          {item.isGraded
                            ? ` • ${item.gradingCompany || "Graded"} ${item.grade || ""}`
                            : ` • ${getCompactCMCondition(item.condition)}`}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-green-600 flex-shrink-0">
                        {formatCurrency(price, currency)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {pickerError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mt-3">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {pickerError}
              </div>
            )}

            <Button
              className="w-full mt-4 bg-green-600 hover:bg-green-700"
              size="lg"
              disabled={pickerSelected.size === 0 || pickerGenerating}
              onClick={generateFromInventory}
            >
              {pickerGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Image className="h-4 w-4 mr-2" />
                  Generate {pickerSelected.size > 0 ? `(${pickerSelected.size} card${pickerSelected.size !== 1 ? "s" : ""})` : ""}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

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
                <Button
                  className="w-full mt-2"
                  variant="outline"
                  size="lg"
                  onClick={() => startManualMode(activeImage.id)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Use Manual Stickers
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
                      {isInventorySource ? "Customize Story" : "Confirm Prices"} ({allSlots.filter((s) => s.confirmed).length}/{allSlots.length})
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
                        <p className="text-sm font-semibold">{isInventorySource ? "Story style" : "Export controls"}</p>
                        <p className="text-xs text-muted-foreground">
                          {isInventorySource
                            ? "Update the look or prices, then regenerate a clean story."
                            : "Drag price labels onto the right cards, then generate."}
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

                    {isInventorySource && (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[11px] font-bold text-muted-foreground">
                            Headline
                            <Input
                              value={activeImage.saleTitle || ""}
                              maxLength={48}
                              onChange={(event) => updateImage(activeImage.id, { saleTitle: event.target.value })}
                              className="mt-1 h-9 bg-background text-sm text-foreground"
                            />
                          </label>
                          <label className="text-[11px] font-bold text-muted-foreground">
                            Footer note
                            <Input
                              value={activeImage.footerNote || ""}
                              maxLength={72}
                              onChange={(event) => updateImage(activeImage.id, { footerNote: event.target.value })}
                              className="mt-1 h-9 bg-background text-sm text-foreground"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                          <span className="mr-1 text-[11px] font-bold text-muted-foreground">Background</span>
                          {Object.entries(STORY_BACKGROUNDS).map(([key, preset]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => updateImage(activeImage.id, { backgroundPreset: key })}
                              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                                activeImage.backgroundPreset === key ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "bg-background"
                              }`}
                            >
                              <span className="h-3 w-3 rounded-full border border-white/40" style={{ background: preset.top }} />
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="flex flex-wrap gap-3">
                      {!isInventorySource && (
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeImage.storyMode}
                            onChange={(e) => updateImage(activeImage.id, { storyMode: e.target.checked })}
                            className="rounded"
                          />
                          1080x1920 story export
                        </label>
                      )}
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
                      {isInventorySource && !activeImage.isGradedSet && (
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeImage.showCondition}
                            onChange={(e) => updateImage(activeImage.id, { showCondition: e.target.checked })}
                            className="rounded"
                          />
                          Show condition badges
                        </label>
                      )}
                      {!isInventorySource && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            allSlots.forEach((slot) => updateSlot(slot.index, { labelPosition: DEFAULT_LABEL_POSITION }));
                          }}
                        >
                          Reset labels
                        </Button>
                      )}
                    </div>

                    {!isInventorySource && activeImage.gridConfig && allSlots.length > 0 && (
                      <div
                        ref={labelPreviewRef}
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
                          const { cols, rows, freeform } = activeImage.gridConfig;
                          const col = slot.index % cols;
                          const row = Math.floor(slot.index / cols);
                          const position = slot.labelPosition || DEFAULT_LABEL_POSITION;
                          const left = freeform ? position.x * 100 : ((col + position.x) / cols) * 100;
                          const top = freeform ? position.y * 100 : ((row + position.y) / rows) * 100;
                          const price = slot.manualPrice ? parseFloat(slot.manualPrice) : slot.price;
                          const primary = price > 0 ? formatWholePrice(price, currency) : "Set price";
                          const secondary = price > 0 && secondaryCurrency && activeImage.includeSecondaryCurrency
                            ? formatWholePrice(roundToNearest10(convertCurrency(price, secondaryCurrency, currency)), secondaryCurrency)
                            : null;

                          return (
                            <button
                              key={slot.index}
                              type="button"
                              className="absolute w-28 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md px-2 py-1 text-center text-[11px] font-extrabold leading-tight text-white shadow-lg active:cursor-grabbing"
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

                  {isManualMode && (
                    <div className="rounded-lg border border-green-200 bg-green-50/60 p-3 mb-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Manual stickers</p>
                        <p className="text-xs text-muted-foreground">
                          Search inventory, add a price sticker, then drag it onto the right card.
                        </p>
                      </div>
                      <Input
                        placeholder="Search inventory to add a sticker..."
                        value={manualStickerQuery}
                        onChange={(e) => setManualStickerQuery(e.target.value)}
                        className="h-9 text-sm bg-background"
                      />
                      <div className="max-h-52 overflow-y-auto space-y-1 rounded border bg-background p-1.5">
                        {manualStickerQuery.length < 2 ? (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            Type at least 2 characters to search your inventory.
                          </p>
                        ) : manualStickerResults.length > 0 ? (
                          manualStickerResults.map((item, resultIndex) => (
                            <button
                              key={item.entryId || item.cardId || `${item.name}-${item.number}-${resultIndex}`}
                              className="flex w-full items-center gap-2 rounded p-1.5 text-left hover:bg-muted/50 transition-colors"
                              onClick={() => addManualStickerFromItem(item)}
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
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-3">
                            No inventory matches found.
                          </p>
                        )}
                      </div>
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
                              <p className="text-xs text-muted-foreground font-medium">
                                {slot.detected.isManual ? "Sticker:" : "Detected:"}
                              </p>
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
                          {isManualMode && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-shrink-0"
                              onClick={() => removeSlot(slot.index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {isManualMode && allSlots.length === 0 && (
                      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                        Add at least one inventory sticker above to generate the sale image.
                      </div>
                    )}
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
                {isInventorySource ? "Regenerate Story" : "Generate Sale Image"}
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
                    <Share2 className="h-4 w-4 mr-2" /> Share or save
                  </Button>
                ) : null}
                <Button
                  className={`flex-1 ${canNativeShare ? "" : "bg-green-600 hover:bg-green-700"}`}
                  variant={canNativeShare ? "outline" : "default"}
                  size="lg"
                  onClick={() => handleDownload(activeImage)}
                >
                  <Download className="h-4 w-4 mr-2" /> Download PNG
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => updateImage(activeImage.id, { phase: "confirm", generatedImage: null, generatedBlob: null })}
                >
                  <Pencil className="h-4 w-4 mr-2" /> {isInventorySource ? "Customize" : "Edit prices"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
