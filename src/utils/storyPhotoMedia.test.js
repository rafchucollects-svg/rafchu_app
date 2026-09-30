import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportStoryPhoto,
  getPhotoConditionGeometry,
  getPhotoLabelGeometry,
  getPhotoLayout,
  positionPhotoLabels,
  prepareStoryPhoto,
} from "./storyPhotoMedia";
import {
  STORY_CONDITION_COLORS,
  STORY_CONDITION_OPTIONS,
} from "./storyPhotoCondition";

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

  it("reserves badge space only for known raw conditions when enabled", () => {
    const photo = { width: 1600, height: 900 };
    const label = { x: 0.5, y: 0.5, width: 0.2, condition: "LP" };
    const raw = getPhotoLabelGeometry(label, photo);
    const plain = getPhotoLabelGeometry({ ...label, condition: "" }, photo);
    expect(raw.height).toBeCloseTo(plain.height + raw.width * 0.18);
    expect(getPhotoConditionGeometry(label, photo)).toMatchObject({
      code: "EX",
      ...STORY_CONDITION_COLORS.EX,
    });
    for (const [item, settings] of [
      [{ ...label, isGraded: true }, {}],
      [{ ...label, condition: "Unknown" }, {}],
      [{ ...label, condition: undefined }, {}],
      [label, { showCondition: false }],
    ]) {
      expect(getPhotoConditionGeometry(item, photo, settings)).toBeNull();
      expect(getPhotoLabelGeometry(item, photo, settings)).toEqual(plain);
    }
  });

  it("keeps badges and both prices inside the complete drag target at every photo edge", () => {
    for (const photo of [
      { width: 1600, height: 900 },
      { width: 900, height: 2000 },
      { width: 2800, height: 200 },
    ]) {
      for (const format of ["original", "story"]) {
        const settings = { format, labelScale: 3 };
        const layout = getPhotoLayout(photo.width, photo.height, format);
        for (const secondaryText of ["", "$110"]) {
          for (const [x, y] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ]) {
            const label = { x, y, width: 0.8, condition: "NM", secondaryText };
            const box = getPhotoLabelGeometry(label, photo, settings);
            const badge = getPhotoConditionGeometry(label, photo, settings);
            expect(box.x).toBeGreaterThanOrEqual(layout.imageX - 0.00001);
            expect(box.y).toBeGreaterThanOrEqual(layout.imageY - 0.00001);
            expect(box.x + box.width).toBeLessThanOrEqual(
              layout.imageX + layout.imageWidth + 0.00001,
            );
            expect(box.y + box.height).toBeLessThanOrEqual(
              layout.imageY + layout.imageHeight + 0.00001,
            );
            expect(badge.x).toBeGreaterThan(box.x);
            expect(badge.y).toBeGreaterThan(box.y);
            expect(badge.x + badge.width).toBeLessThan(box.x + box.width);
            expect(badge.y + badge.height).toBeLessThan(box.y + box.height);
            const reservedRow = box.width * 0.18;
            const priceHeight = box.height - reservedRow;
            const primaryY =
              box.y + reservedRow + priceHeight * (secondaryText ? 0.38 : 0.5);
            expect(badge.y + badge.height).toBeLessThan(
              primaryY - box.width * 0.09,
            );
            if (secondaryText) {
              const secondaryY = box.y + reservedRow + priceHeight * 0.75;
              expect(primaryY + box.width * 0.09).toBeLessThan(
                secondaryY - box.width * 0.0525,
              );
              expect(secondaryY + box.width * 0.0525).toBeLessThan(
                box.y + box.height,
              );
            }
          }
        }
      }
    }
  });
});

function mockCanvasAndDecoder(width = 4000, height = 3000) {
  const contexts = [];
  const canvases = [];
  const encodedDimensions = [];
  const filledColors = [];
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
      fill: vi.fn(function () {
        filledColors.push(this.fillStyle);
      }),
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
  return {
    bitmap,
    contexts,
    canvases,
    encoded,
    encodedDimensions,
    filledColors,
  };
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

  it("renders all raw condition colors with white outlines and reserves a separate price area", async () => {
    const { contexts, filledColors } = mockCanvasAndDecoder(1600, 900);
    const labels = STORY_CONDITION_OPTIONS.map(({ value }) => ({
      x: 0.3,
      y: 0.7,
      width: 0.2,
      priceText: "€100",
      secondaryText: "$110",
      condition: value,
    }));
    const photo = {
      blob: new Blob(["photo"]),
      width: 1600,
      height: 900,
      labels,
    };
    const settings = { format: "story" };
    await exportStoryPhoto(photo, settings, { maxDimension: 1000 });
    const textCalls = contexts[0].fillText.mock.calls;
    expect(
      textCalls
        .filter(([text]) => text !== "€100" && text !== "$110")
        .map(([text]) => text),
    ).toEqual(["M", "NM", "EX", "GD", "LP", "PL", "PO"]);
    for (const { background } of Object.values(STORY_CONDITION_COLORS))
      expect(filledColors).toContain(background);
    expect(filledColors.filter((color) => color === "#ffffff")).toHaveLength(7);
    const box = getPhotoLabelGeometry(labels[0], photo, settings);
    const row = box.width * 0.18;
    expect(contexts[0].fillText).toHaveBeenCalledWith(
      "€100",
      box.x + box.width / 2,
      box.y + row + (box.height - row) * 0.38,
      box.width * 0.88,
    );
    expect(contexts[0].fillText).toHaveBeenCalledWith(
      "$110",
      box.x + box.width / 2,
      box.y + row + (box.height - row) * 0.75,
      box.width * 0.88,
    );
  });

  it("omits condition badges for slabs, unknown conditions, and the off setting", async () => {
    const { contexts } = mockCanvasAndDecoder(1600, 900);
    const label = { x: 0.5, y: 0.7, priceText: "€100", condition: "NM" };
    const photo = {
      blob: new Blob(["photo"]),
      width: 1600,
      height: 900,
      labels: [
        label,
        { ...label, isGraded: true },
        { ...label, condition: "unknown" },
        { ...label, condition: undefined },
      ],
    };
    await exportStoryPhoto(photo);
    expect(contexts[0].fillText.mock.calls.map(([text]) => text)).toEqual([
      "NM",
      "€100",
      "€100",
      "€100",
      "€100",
    ]);
    await exportStoryPhoto(photo, { showCondition: false });
    expect(contexts[1].fillText.mock.calls.map(([text]) => text)).toEqual([
      "€100",
      "€100",
      "€100",
      "€100",
    ]);
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
