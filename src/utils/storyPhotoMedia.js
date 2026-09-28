const MAX_FILE_BYTES = 25 * 1024 * 1024;
const WORKING_IMAGE_SIZE = 2800;
const SCAN_IMAGE_SIZE = 2048;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const numberOr = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Your browser could not open the photo editor. Try another browser.",
    );
  return { canvas, context };
}

function canvasBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new Error("This photo could not be saved. Try a smaller photo."),
          );
      },
      mimeType,
      quality,
    );
  });
}

async function decodePhoto(blob) {
  // The browser applies mobile-camera EXIF orientation once, before either copy is made.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (_error) {
      // Some older browsers expose ImageBitmap but do not support all three file types.
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const cleanup = () => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
    };
    const fail = () => {
      cleanup();
      reject(
        new Error(
          "This file could not be opened as a photo. Upload a JPG, PNG, or WebP image.",
        ),
      );
    };
    const timeout = setTimeout(fail, 20000);
    image.onload = () => {
      cleanup();
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {},
      });
    };
    image.onerror = fail;
    image.src = url;
  });
}

function fittedDimensions(width, height, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function rasterCopy(image, width, height, maxSize, flatten = false) {
  const size = fittedDimensions(width, height, maxSize);
  const { canvas, context } = makeCanvas(size.width, size.height);
  if (flatten) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
  }
  context.drawImage(image, 0, 0, size.width, size.height);
  return canvas;
}

export async function prepareStoryPhoto(file) {
  if (!file || !file.size)
    throw new Error("Choose a JPG, PNG, or WebP photo that is not empty.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Photos must be 25 MB or smaller.");
  const mimeType = String(file.type || "").toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) {
    throw new Error(
      "Upload JPG, PNG, or WebP photos. Convert HEIC files to JPG first.",
    );
  }

  let decoded;
  let workingCanvas;
  let scanCanvas;
  try {
    decoded = await decodePhoto(file);
    if (!decoded.width || !decoded.height)
      throw new Error("This photo has no readable image dimensions.");
    workingCanvas = rasterCopy(
      decoded.image,
      decoded.width,
      decoded.height,
      WORKING_IMAGE_SIZE,
    );
    // PNG keeps the working copy lossless (including transparency); the source file is untouched.
    const blob = await canvasBlob(workingCanvas, "image/png");
    scanCanvas = rasterCopy(
      decoded.image,
      decoded.width,
      decoded.height,
      SCAN_IMAGE_SIZE,
      true,
    );
    const scanData = scanCanvas.toDataURL("image/jpeg", 0.9);
    if (!scanData.startsWith("data:image/jpeg;base64,"))
      throw new Error("This photo could not be prepared for card detection.");
    return {
      id:
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name || "My photo",
      blob,
      width: workingCanvas.width,
      height: workingCanvas.height,
      scanBase64: scanData.slice(scanData.indexOf(",") + 1),
      scanMimeType: "image/jpeg",
    };
  } finally {
    decoded?.close();
    // Release large pixel buffers as soon as their encoded copies exist.
    if (workingCanvas) workingCanvas.width = workingCanvas.height = 1;
    if (scanCanvas) scanCanvas.width = scanCanvas.height = 1;
  }
}

export function getPhotoLayout(width, height, format = "original") {
  const photoWidth = Math.round(Number(width));
  const photoHeight = Math.round(Number(height));
  if (
    !Number.isFinite(photoWidth) ||
    !Number.isFinite(photoHeight) ||
    photoWidth <= 0 ||
    photoHeight <= 0
  ) {
    throw new Error(
      "The photo dimensions are invalid. Upload the photo again.",
    );
  }
  if (format !== "story") {
    return {
      width: photoWidth,
      height: photoHeight,
      imageX: 0,
      imageY: 0,
      imageWidth: photoWidth,
      imageHeight: photoHeight,
    };
  }
  const scale = Math.min(1080 / photoWidth, 1920 / photoHeight);
  const imageWidth = photoWidth * scale;
  const imageHeight = photoHeight * scale;
  return {
    width: 1080,
    height: 1920,
    imageX: (1080 - imageWidth) / 2,
    imageY: (1920 - imageHeight) / 2,
    imageWidth,
    imageHeight,
  };
}

export function getPhotoLabelGeometry(label, photo, settings = {}) {
  const layout = getPhotoLayout(photo.width, photo.height, settings.format);
  const ratio = label.secondaryText ? 0.44 : 0.3;
  const labelScale = clamp(numberOr(settings.labelScale, 1), 0.4, 3);
  const relativeWidth = clamp(numberOr(label.width, 0.24), 0.04, 1);
  const width = Math.min(
    relativeWidth * layout.imageWidth * labelScale,
    layout.imageWidth,
    layout.imageHeight / ratio,
  );
  const height = width * ratio;
  const centerX =
    layout.imageX + clamp(numberOr(label.x, 0.5), 0, 1) * layout.imageWidth;
  const centerY =
    layout.imageY + clamp(numberOr(label.y, 0.88), 0, 1) * layout.imageHeight;
  return {
    x: clamp(
      centerX - width / 2,
      layout.imageX,
      layout.imageX + layout.imageWidth - width,
    ),
    y: clamp(
      centerY - height / 2,
      layout.imageY,
      layout.imageY + layout.imageHeight - height,
    ),
    width,
    height,
  };
}

function safeBounds(card) {
  const bounds = card.position || card.boundingBox || card.bbox;
  if (!bounds || typeof bounds !== "object") return null;
  const { x, y, width, height } = Object.fromEntries(
    ["x", "y", "width", "height"].map((key) => [key, Number(bounds[key])]),
  );
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    x >= 1 ||
    y >= 1 ||
    width <= 0 ||
    height <= 0 ||
    width > 1 ||
    height > 1
  )
    return null;
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

export function positionPhotoLabels(detectedCards = []) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(detectedCards.length)));
  const rows = Math.max(1, Math.ceil(detectedCards.length / cols));
  return detectedCards.map((card, index) => {
    const bounds = safeBounds(card);
    if (bounds) {
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height * 0.88,
        width: clamp(bounds.width * 0.84, 0.04, 0.6),
        needsPositionReview: false,
      };
    }
    return {
      x: ((index % cols) + 0.5) / cols,
      y: (Math.floor(index / cols) + 0.82) / rows,
      width: Math.min(0.24, 0.78 / cols),
      needsPositionReview: true,
    };
  });
}

function roundedRectangle(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fill();
}

function drawFittedText(context, text, x, y, maxWidth, initialSize, weight) {
  let size = initialSize;
  context.font = `${weight} ${size}px Arial, sans-serif`;
  const measuredWidth = context.measureText(text).width;
  if (measuredWidth > maxWidth) {
    size *= maxWidth / measuredWidth;
    context.font = `${weight} ${size}px Arial, sans-serif`;
  }
  context.fillText(text, x, y, maxWidth);
}

export async function exportStoryPhoto(photo, settings = {}, options = {}) {
  if (!photo?.blob)
    throw new Error(
      "This photo is missing. Upload it again before downloading.",
    );
  const layout = getPhotoLayout(photo.width, photo.height, settings.format);
  const requestedSize = Number(options.maxDimension);
  const maxDimension =
    Number.isFinite(requestedSize) && requestedSize >= 1
      ? Math.floor(requestedSize)
      : Math.max(layout.width, layout.height);
  const output = fittedDimensions(layout.width, layout.height, maxDimension);
  const { canvas, context } = makeCanvas(output.width, output.height);
  // Keep all drawing and hit-target coordinates in the full-size layout. Separate
  // scale factors account for the final fractional pixel rounded by the canvas.
  context.scale(output.width / layout.width, output.height / layout.height);
  let decoded;
  try {
    decoded = await decodePhoto(photo.blob);
    if (settings.format === "story") {
      context.fillStyle = settings.backgroundColor || "#0f172a";
      context.fillRect(0, 0, layout.width, layout.height);
    }
    context.drawImage(
      decoded.image,
      layout.imageX,
      layout.imageY,
      layout.imageWidth,
      layout.imageHeight,
    );
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const label of photo.labels || []) {
      if (!String(label.priceText || "").trim()) continue;
      const box = getPhotoLabelGeometry(label, photo, settings);
      context.fillStyle = settings.labelBackground || "#059669";
      roundedRectangle(
        context,
        box.x,
        box.y,
        box.width,
        box.height,
        box.width * 0.055,
      );
      context.fillStyle = settings.labelColor || "#ffffff";
      drawFittedText(
        context,
        String(label.priceText),
        box.x + box.width / 2,
        box.y + box.height * (label.secondaryText ? 0.38 : 0.5),
        box.width * 0.88,
        box.width * 0.18,
        700,
      );
      if (label.secondaryText) {
        drawFittedText(
          context,
          String(label.secondaryText),
          box.x + box.width / 2,
          box.y + box.height * 0.75,
          box.width * 0.88,
          box.width * 0.105,
          600,
        );
      }
    }
    return await canvasBlob(canvas, "image/png");
  } finally {
    decoded?.close();
    canvas.width = canvas.height = 1;
  }
}
