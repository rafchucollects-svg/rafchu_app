import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Upload, X, Check, AlertTriangle, Loader2,
  Search, RotateCcw, Download, Image, Pencil, Plus, Share2,
  LayoutGrid, Package,
} from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useApp } from "@/contexts/AppContext";
import { computeItemMetrics, convertCurrency, formatCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";

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
const BATCH_SCAN_CONCURRENCY = 1;
const STORY_CANVAS_WIDTH = 1080;
const STORY_CANVAS_HEIGHT = 1920;
const BASE_LABEL_WIDTH = 430;
const BASE_LABEL_HEIGHT = 112;

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

function autoDetectGrid(cardCount) {
  if (cardCount <= 1) return { cols: 1, rows: 1 };
  if (cardCount === 2) return { cols: 2, rows: 1 };
  if (cardCount === 3) return { cols: 3, rows: 1 };
  return { cols: 2, rows: 2 };
}

function createFreeformGrid() {
  return { cols: 1, rows: 1, freeform: true };
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
  const { storyMode, labelColor, includeSecondaryCurrency } = options;

  let canvasW = img.naturalWidth;
  let canvasH = img.naturalHeight;
  let drawW = img.naturalWidth;
  let drawH = img.naturalHeight;

  if (storyMode) {
    canvasW = STORY_CANVAS_WIDTH;
    canvasH = STORY_CANVAS_HEIGHT;
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

  const isFreeform = !!gridConfig?.freeform;
  const { cols, rows } = gridConfig;
  const cellW = drawW / cols;
  const cellH = drawH / rows;

  const baseCellW = isFreeform ? drawW : cellW;
  const baseCellH = isFreeform ? drawH : cellH;
  const { boxW, boxH } = getLabelBoxSize(baseCellW, baseCellH, canvasW, canvasH, storyMode);
  const hPad = boxW * 0.06;
  const maxTextW = boxW - hPad * 2;

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

    const labelPosition = slot.labelPosition || DEFAULT_LABEL_POSITION;
    const desiredX = cellX + labelPosition.x * slotCellW - boxW / 2;
    const desiredY = cellY + labelPosition.y * slotCellH - boxH / 2;
    const boxX = clampStart(desiredX, cellX, cellX + slotCellW - boxW);
    const boxY = clampStart(desiredY, cellY, cellY + slotCellH - boxH);

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

// ── Inventory-mode helpers ──────────────────────────────────────
// These power the "Build from Inventory" flow where we synthesize the
// story image from scratch using each card's stored picture rather than
// overlaying labels on a user-uploaded photo.

const STORY_FOOTER_NOTE = "Certs and images for reference, DM for pics";
const STORY_BG_COLOR = "#1a1a2e";
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

// Tight-fit grid math: smallest grid that holds `count` cards while
// respecting the per-mode maximum. Bias toward portrait-friendly shapes
// for the 1080x1920 story canvas (extra columns over extra rows).
function computeInventoryGridLayout(count, isGraded) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  // From here only ungraded (graded chunks cap at 4).
  if (!isGraded) {
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  }
  return { cols: 2, rows: 2 };
}

// Image loader that NEVER rejects. We can't let a single bad image taint
// the canvas (toBlob would throw and the whole batch would fail), so any
// failure is reported back to the caller via {img: null, error}. The
// compositor then draws a styled placeholder for that slot and the rest
// of the grid generates normally.
function loadCardImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve({ img: null, error: "No image on this card" });
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    // Helps some CDNs avoid blocking on Referer-based checks (common with
    // Firebase Storage when CORS isn't configured for the web origin).
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve({ img, error: null });
    img.onerror = () => resolve({ img: null, error: "Image blocked by CORS or unreachable" });
    img.src = src;
  });
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
}) {
  const W = STORY_CANVAS_WIDTH;
  const H = STORY_CANVAS_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = STORY_BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  // Layout regions
  const sidePad = 48;
  const topPad = 60;
  const bottomPad = 150;
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

  // Footer note centered at the bottom of the canvas.
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = `600 28px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(STORY_FOOTER_NOTE, W / 2, H - bottomPad / 2);

  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, failedItems };
}

function drawCardPriceLabel(ctx, opts) {
  const {
    cardX, cardY, cardW, cardH,
    price, currency, secondaryCurrency,
    labelColor, conditionText,
  } = opts;

  // Label sized relative to card width so it scales correctly across
  // 1x1 (large), 2x2, and 3x3 grids without needing per-grid tuning.
  const boxW = Math.min(cardW * 0.82, 380);
  const boxH = Math.max(cardH * 0.14, 56);
  const boxX = cardX + (cardW - boxW) / 2;
  const boxY = cardY + cardH - boxH - cardH * 0.04;
  const radius = boxH * 0.22;

  // Soft shadow under the label so it pops off the card.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fillStyle = labelColor;
  ctx.fill();
  ctx.restore();

  const primaryText = formatWholePrice(price, currency);
  const secondaryText = secondaryCurrency
    ? formatWholePrice(roundToNearest10(convertCurrency(price, secondaryCurrency, currency)), secondaryCurrency)
    : null;

  const hPad = boxW * 0.06;
  const maxTextW = boxW - hPad * 2;

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Condition chip pinned to top-right of the label (ungraded only).
  if (conditionText) {
    const chipPadX = boxH * 0.18;
    const chipH = boxH * 0.42;
    ctx.font = `800 ${chipH * 0.62}px ${FONT_STACK}`;
    const chipTextW = ctx.measureText(conditionText).width;
    const chipW = chipTextW + chipPadX * 2;
    const chipX = boxX + boxW - chipW - boxH * 0.14;
    const chipY = boxY - chipH * 0.45;

    ctx.save();
    drawRoundedRect(ctx, chipX, chipY, chipW, chipH, chipH * 0.32);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.fillStyle = labelColor;
    ctx.font = `800 ${chipH * 0.62}px ${FONT_STACK}`;
    ctx.fillText(conditionText, chipX + chipW / 2, chipY + chipH / 2 + 1);
    ctx.restore();
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

function createInventoryImageEntry({ blob, items, gridConfig, currency, isGraded }) {
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
  const [manualStickerQuery, setManualStickerQuery] = useState("");
  const [globalError, setGlobalError] = useState(null);

  // Inventory-mode picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState("graded"); // 'graded' | 'ungraded'
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState(() => new Set());
  const [pickerGenerating, setPickerGenerating] = useState(false);
  const [pickerError, setPickerError] = useState(null);

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
      for (const chunk of chunks) {
        const gridConfig = computeInventoryGridLayout(chunk.length, isGraded);
        const { blob, failedItems } = await composeInventoryGridImage({
          items: chunk,
          isGraded,
          currency,
          secondaryCurrency,
          includeSecondaryCurrency: true,
          labelColor: DEFAULT_LABEL_COLOR,
          showCondition: !isGraded,
        });
        newEntries.push(createInventoryImageEntry({
          blob,
          items: chunk,
          gridConfig,
          currency,
          isGraded,
        }));
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
  }, [pickerMode, pickerSelected, inventoryByMode, currency, secondaryCurrency, roundUp]);

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
  const isManualMode = !!activeImage?.gridConfig?.freeform;
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
    <div className="max-w-2xl mx-auto pb-8">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Story Sale Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a photo of cards or build a story directly from inventory
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
                Drag &amp; drop a photo of cards, scan with your camera, or build a
                story directly from your inventory.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" /> Take Photo
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Upload
                </Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={openPicker}>
                  <LayoutGrid className="h-4 w-4 mr-2" /> From Inventory
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
                  Pick cards and we'll lay them out automatically.
                  Graded uses 2x2 grids; ungraded uses 3x3. Selections over the
                  grid max split into multiple images.
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
                  `Pick at least 1 card (max ${pickerMode === "graded" ? "4 per image, 2x2" : "9 per image, 3x3"})`
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
