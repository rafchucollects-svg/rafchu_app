import { describe, expect, it } from "vitest";
import {
  autoDetectGrid,
  computeInventoryGridLayout,
  sanitizeDetectedPosition,
} from "./storySaleHelpers";

describe("story sale layout helpers", () => {
  it("keeps every detected card in layouts up to the 12-card scan limit", () => {
    expect(autoDetectGrid(5)).toEqual({ cols: 3, rows: 2 });
    expect(autoDetectGrid(9)).toEqual({ cols: 3, rows: 3 });
    expect(autoDetectGrid(12)).toEqual({ cols: 4, rows: 3 });
  });

  it("uses portrait-friendly inventory grids that make cards larger", () => {
    expect(computeInventoryGridLayout(2, true)).toEqual({ cols: 1, rows: 2 });
    expect(computeInventoryGridLayout(3, true)).toEqual({ cols: 2, rows: 2 });
    expect(computeInventoryGridLayout(6, false)).toEqual({ cols: 2, rows: 3 });
    expect(computeInventoryGridLayout(9, false)).toEqual({ cols: 3, rows: 3 });
  });

  it("accepts safe normalized AI bounds and rejects malformed ones", () => {
    expect(sanitizeDetectedPosition({ x: 0.08, y: 0.1, width: 0.4, height: 0.42 })).toEqual({
      x: 0.08,
      y: 0.1,
      width: 0.4,
      height: 0.42,
    });
    const edgePosition = sanitizeDetectedPosition({ x: 0.9, y: 0.9, width: 0.4, height: 0.4 });
    expect(edgePosition.x).toBe(0.9);
    expect(edgePosition.y).toBe(0.9);
    expect(edgePosition.width).toBeCloseTo(0.1);
    expect(edgePosition.height).toBeCloseTo(0.1);
    expect(sanitizeDetectedPosition({ x: "nope", y: 0, width: 0.4, height: 0.4 })).toBeNull();
    expect(sanitizeDetectedPosition({ x: 0, y: 0, width: 0, height: 0.4 })).toBeNull();
  });
});
