import { describe, expect, it } from "vitest";
import { getConditionDisplayLabel } from "./cardHelpers";
import {
  getStoryConditionBadge,
  STORY_CONDITION_COLORS,
  STORY_CONDITION_OPTIONS,
} from "./storyPhotoCondition";

describe("story photo Cardmarket condition badges", () => {
  it.each([
    ["M", "M"],
    ["Mint", "M"],
    ["NM", "NM"],
    ["Near Mint", "NM"],
    ["LP", "EX"],
    ["Lightly Played", "EX"],
    ["MP", "GD"],
    ["Moderately Played", "GD"],
    ["HP", "PL"],
    ["Heavily Played", "PL"],
    ["DMG", "PO"],
    ["Damaged", "PO"],
    ["Excellent", "EX"],
    ["Good", "GD"],
    ["Light Played", "LP"],
    ["Played", "PL"],
    ["Poor", "PO"],
    ["EX", "EX"],
    ["GD", "GD"],
    ["PL", "PL"],
    ["PO", "PO"],
    [" near-mint ", "NM"],
    [" lightly   played ", "EX"],
  ])("maps %s to the Cardmarket badge %s", (condition, expected) => {
    expect(getStoryConditionBadge(condition)).toBe(expected);
  });

  it("matches the inventory's forced Cardmarket vocabulary without treating stored LP as Light Played", () => {
    for (const condition of [
      "NM",
      "LP",
      "MP",
      "HP",
      "DMG",
      "Mint",
      "Near Mint",
      "Excellent",
      "Good",
      "Played",
      "Poor",
    ]) {
      expect(getStoryConditionBadge(condition)).toBe(
        getStoryConditionBadge(getConditionDisplayLabel(condition, true)),
      );
    }
    expect(getStoryConditionBadge("LP")).toBe("EX");
    expect(getStoryConditionBadge("Light Played")).toBe("LP");
  });

  it.each([
    undefined,
    null,
    "",
    " ",
    "Unknown",
    "ungraded",
    "PSA 10",
    "NM or EX",
    5,
    {},
  ])("does not invent a condition for %s", (condition) => {
    expect(getStoryConditionBadge(condition)).toBe("");
  });

  it("offers all seven tiers with distinct colors and canonical inventory values", () => {
    expect(STORY_CONDITION_OPTIONS.map(({ value }) => value)).toEqual([
      "M",
      "NM",
      "LP",
      "MP",
      "Light Played",
      "HP",
      "DMG",
    ]);
    expect(
      STORY_CONDITION_OPTIONS.map(({ value }) => getStoryConditionBadge(value)),
    ).toEqual(["M", "NM", "EX", "GD", "LP", "PL", "PO"]);
    expect(STORY_CONDITION_OPTIONS.map(({ label }) => label)).toEqual([
      "Mint (M)",
      "Near Mint (NM)",
      "Excellent (EX)",
      "Good (GD)",
      "Light Played (LP)",
      "Played (PL)",
      "Poor (PO)",
    ]);
    expect(Object.keys(STORY_CONDITION_COLORS)).toEqual([
      "M",
      "NM",
      "EX",
      "GD",
      "LP",
      "PL",
      "PO",
    ]);
    expect(
      new Set(
        Object.values(STORY_CONDITION_COLORS).map(
          ({ background }) => background,
        ),
      ).size,
    ).toBe(7);
    for (const { background, color } of Object.values(STORY_CONDITION_COLORS)) {
      expect(background).toMatch(/^#[0-9a-f]{6}$/);
      expect(color).toBe("#ffffff");
    }
  });
});
