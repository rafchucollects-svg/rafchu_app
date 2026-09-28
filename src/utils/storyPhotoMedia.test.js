import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportStoryPhoto,
  getPhotoLabelGeometry,
  getPhotoLayout,
  positionPhotoLabels,
  prepareStoryPhoto,
} from "./storyPhotoMedia";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("uploaded story photo layout", () => {
  it("fits landscape and portrait photos completely inside a story without cropping", () => {
    expect(getPhotoLayout(1600, 900, "original")).toEqual({
      width: 1600,
      height: 900,
      imageX: 0,
      imageY: 0,
      imageWidth: 1600,
      imageHeight: 900,
    });
    expect(getPhotoLayout(1600, 900, "story")).toEqual({
      width: 1080,
      height: 1920,
      imageX: 0,
      imageY: 656.25,
      imageWidth: 1080,
      imageHeight: 607.5,
    });
    const portrait = getPhotoLayout(900, 2000, "story");
    expect(portrait.imageHeight).toBe(1920);
    expect(portrait.imageWidth).toBe(864);
    expect(portrait.imageX).toBe(108);
    expect(() => getPhotoLayout(0, 100)).toThrow("dimensions");
  });

  it("keeps photo-relative labels at the same point in either export format", () => {
    const photo = { width: 1600, height: 900 };
    const label = { x: 0.3, y: 0.7, width: 0.2 };
    const original = getPhotoLabelGeometry(label, photo);
    const story = getPhotoLabelGeometry(label, photo, { format: "story" });
    expect(original.x + original.width / 2).toBe(480);
    expect(original.y + original.height / 2).toBe(630);
    expect(story.x + story.width / 2).toBe(324);
    expect(story.y + story.height / 2).toBe(656.25 + 425.25);
  });

  it("keeps every edge of large and secondary-currency labels inside the photo", () => {
    const photo = { width: 2800, height: 200 };
    const layout = getPhotoLayout(photo.width, photo.height, "story");
    for (const x of [0, 1]) {
      for (const y of [0, 1]) {
        const box = getPhotoLabelGeometry(
          { x, y, width: 0.8, secondaryText: "$999" },
          photo,
          { format: "story", labelScale: 3 },
        );
        expect(box.x).toBeGreaterThanOrEqual(layout.imageX);
        expect(box.y).toBeGreaterThanOrEqual(layout.imageY);
        expect(box.x + box.width).toBeLessThanOrEqual(
          layout.imageX + layout.imageWidth + 0.00001,
        );
        expect(box.y + box.height).toBeLessThanOrEqual(
          layout.imageY + layout.imageHeight + 0.00001,
        );
      }
    }
  });

  it("preserves each card's valid position even when a neighboring card has no bounds", () => {
    const cards = [
      { position: { x: 0.02, y: 0.08, width: 0.22, height: 0.37 } },
      { position: null },
      { position: { x: 0.67, y: 0.5, width: 0.3, height: 0.43 } },
    ];
    const labels = positionPhotoLabels(cards);
    expect(labels[0].x).toBeCloseTo(0.13);
    expect(labels[0].y).toBeCloseTo(0.4056);
    expect(labels[0].needsPositionReview).toBe(false);
    expect(labels[1].needsPositionReview).toBe(true);
    expect(labels[2].x).toBeCloseTo(0.82);
    expect(labels[2].y).toBeCloseTo(0.8784);
    expect(labels[2].needsPositionReview).toBe(false);
    expect(
      positionPhotoLabels([
        { position: { x: 4, y: 0, width: 0.5, height: 0.5 } },
      ])[0].needsPositionReview,
    ).toBe(true);
  });
});

function mockCanvasAndDecoder(width = 4000, height = 3000) {
  const contexts = [];
  const canvases = [];
  const encodedDimensions = [];
  const encoded = new Blob(["encoded photo"], { type: "image/png" });
  vi.spyOn(document, "createElement").mockImplementation(() => {
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn((text) => ({ width: text.length * 40 })),
      fillText: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: vi.fn((callback) => {
        encodedDimensions.push({ width: canvas.width, height: canvas.height });
        callback(encoded);
      }),
      toDataURL: () => "data:image/jpeg;base64,cGhvdG8=",
    };
    contexts.push(context);
    canvases.push(canvas);
    return canvas;
  });
  const bitmap = { width, height, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  return { bitmap, contexts, canvases, encoded, encodedDimensions };
}

describe("local photo processing", () => {
  it("uses oriented photo pixels for both a lossless working copy and a smaller scan", async () => {
    const { bitmap, contexts, canvases, encoded } = mockCanvasAndDecoder();
    const original = new File(["original"], "cards.jpg", {
      type: "image/jpeg",
    });
    const photo = await prepareStoryPhoto(original);
    expect(createImageBitmap).toHaveBeenCalledWith(original, {
      imageOrientation: "from-image",
    });
    expect(photo).toMatchObject({
      name: "cards.jpg",
      blob: encoded,
      width: 2800,
      height: 2100,
      scanBase64: "cGhvdG8=",
      scanMimeType: "image/jpeg",
    });
    expect(contexts[0].drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
      2800,
      2100,
    );
    expect(contexts[1].drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
      2048,
      1536,
    );
    expect(original.size).toBe(8);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(
      canvases.every((canvas) => canvas.width === 1 && canvas.height === 1),
    ).toBe(true);
  });

  it("rejects unsupported and oversized files before decoding them", async () => {
    mockCanvasAndDecoder();
    await expect(
      prepareStoryPhoto({ size: 20, type: "image/heic" }),
    ).rejects.toThrow("HEIC");
    await expect(
      prepareStoryPhoto({ size: 26 * 1024 * 1024, type: "image/jpeg" }),
    ).rejects.toThrow("25 MB");
    await expect(
      prepareStoryPhoto({ size: 0, type: "image/png" }),
    ).rejects.toThrow("empty");
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("exports the whole uploaded photo with labels at the preview coordinates", async () => {
    const { bitmap, contexts, encoded } = mockCanvasAndDecoder(1600, 900);
    const photo = {
      blob: new Blob(["original"]),
      width: 1600,
      height: 900,
      labels: [
        {
          x: 0.3,
          y: 0.7,
          width: 0.2,
          priceText: "€100",
          secondaryText: "$110",
        },
        { x: 0.8, y: 0.7, width: 0.2, priceText: "" },
      ],
    };
    const settings = { format: "story", labelScale: 1.2 };
    expect(await exportStoryPhoto(photo, settings)).toBe(encoded);
    expect(contexts[0].drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      656.25,
      1080,
      607.5,
    );
    expect(contexts[0].fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    const geometry = getPhotoLabelGeometry(photo.labels[0], photo, settings);
    expect(contexts[0].fillText).toHaveBeenCalledWith(
      "€100",
      geometry.x + geometry.width / 2,
      geometry.y + geometry.height * 0.38,
      geometry.width * 0.88,
    );
    expect(contexts[0].fillText).toHaveBeenCalledTimes(2);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("renders a smaller preview with the same photo and label coordinates as the export", async () => {
    const { bitmap, contexts, encodedDimensions } = mockCanvasAndDecoder(
      1600,
      900,
    );
    const photo = {
      blob: new Blob(["original"]),
      width: 1600,
      height: 900,
      labels: [{ x: 0.3, y: 0.7, width: 0.2, priceText: "€100" }],
    };
    const settings = { format: "story" };
    await exportStoryPhoto(photo, settings, { maxDimension: 1000 });
    expect(encodedDimensions).toEqual([{ width: 563, height: 1000 }]);
    expect(contexts[0].scale).toHaveBeenCalledWith(563 / 1080, 1000 / 1920);
    expect(contexts[0].drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      656.25,
      1080,
      607.5,
    );
    const geometry = getPhotoLabelGeometry(photo.labels[0], photo, settings);
    expect(contexts[0].fillText).toHaveBeenCalledWith(
      "€100",
      geometry.x + geometry.width / 2,
      geometry.y + geometry.height / 2,
      geometry.width * 0.88,
    );
  });

  it("preserves transparency for original-format PNGs and never upscales a preview", async () => {
    const { contexts, encodedDimensions } = mockCanvasAndDecoder(400, 200);
    await exportStoryPhoto(
      {
        blob: new Blob(["transparent photo"]),
        width: 400,
        height: 200,
        labels: [],
      },
      { format: "original" },
      { maxDimension: 1000 },
    );
    expect(encodedDimensions).toEqual([{ width: 400, height: 200 }]);
    expect(contexts[0].scale).toHaveBeenCalledWith(1, 1);
    expect(contexts[0].fillRect).not.toHaveBeenCalled();
  });

  it("closes the bitmap and releases the canvas when encoding fails", async () => {
    const { bitmap, canvases } = mockCanvasAndDecoder();
    const originalCreate = document.createElement.getMockImplementation();
    document.createElement.mockImplementation(() => {
      const canvas = originalCreate();
      canvas.toBlob = (callback) => callback(null);
      return canvas;
    });
    await expect(
      prepareStoryPhoto(
        new File(["photo"], "cards.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("could not be saved");
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvases[0].width).toBe(1);
  });
});
