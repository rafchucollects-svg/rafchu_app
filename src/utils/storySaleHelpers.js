const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function autoDetectGrid(cardCount) {
  if (cardCount <= 1) return { cols: 1, rows: 1 };
  if (cardCount === 2) return { cols: 2, rows: 1 };
  if (cardCount === 3) return { cols: 3, rows: 1 };
  if (cardCount === 4) return { cols: 2, rows: 2 };
  if (cardCount <= 6) return { cols: 3, rows: 2 };
  if (cardCount <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: 3 };
}

export function sanitizeDetectedPosition(position) {
  if (!position || typeof position !== "object") return null;
  const x = Number(position.x);
  const y = Number(position.y);
  const width = Number(position.width);
  const height = Number(position.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || width > 1 || height > 1) return null;
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return null;

  const safeX = clamp(x, 0, 1);
  const safeY = clamp(y, 0, 1);
  return {
    x: safeX,
    y: safeY,
    width: clamp(width, 0.01, 1 - safeX),
    height: clamp(height, 0.01, 1 - safeY),
  };
}

export function computeInventoryGridLayout(count, isGraded) {
  const maxItems = isGraded ? 4 : 9;
  const safeCount = clamp(Math.round(Number(count) || 1), 1, maxItems);
  const maxCols = isGraded ? 2 : 3;
  const maxRows = isGraded ? 2 : 4;
  const targetAspect = isGraded ? 0.67 : 2.5 / 3.5;
  const availableW = 984;
  const availableH = 1510;

  let best = { cols: 1, rows: safeCount, score: -Infinity };
  for (let cols = 1; cols <= Math.min(maxCols, safeCount); cols += 1) {
    const rows = Math.ceil(safeCount / cols);
    if (rows > maxRows) continue;
    const cellW = availableW / cols;
    const cellH = availableH / rows;
    const fittedW = Math.min(cellW, cellH * targetAspect);
    const fittedH = fittedW / targetAspect;
    const unusedSlots = cols * rows - safeCount;
    const score = fittedW * fittedH * (1 - unusedSlots * 0.025);
    if (score > best.score) best = { cols, rows, score };
  }

  return { cols: best.cols, rows: best.rows };
}
