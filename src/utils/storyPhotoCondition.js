import { TCG_TO_CARDMARKET_CONDITION } from "./conditionMappings";

const CARDMARKET_BADGES = {
  Mint: "M",
  "Near Mint": "NM",
  Excellent: "EX",
  Good: "GD",
  "Light Played": "LP",
  Played: "PL",
  Poor: "PO",
};

// Inventory stores TCG condition codes. Keep LP -> Excellent, while preserving
// Cardmarket's separate Light Played tier with its unambiguous full name.
export const STORY_CONDITION_OPTIONS = [
  { value: "M", label: "Mint (M)" },
  { value: "NM", label: "Near Mint (NM)" },
  { value: "LP", label: "Excellent (EX)" },
  { value: "MP", label: "Good (GD)" },
  { value: "Light Played", label: "Light Played (LP)" },
  { value: "HP", label: "Played (PL)" },
  { value: "DMG", label: "Poor (PO)" },
];

const normalize = (value) =>
  value.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").toUpperCase();
const cardmarketNames = Object.fromEntries(
  Object.entries(CARDMARKET_BADGES).map(([name, code]) => [
    normalize(name),
    code,
  ]),
);
const inventoryNames = Object.fromEntries(
  Object.entries(TCG_TO_CARDMARKET_CONDITION).map(([name, label]) => [
    normalize(name),
    CARDMARKET_BADGES[label],
  ]),
);
const compactNames = {
  M: "M",
  MT: "M",
  NM: "NM",
  EX: "EX",
  GD: "GD",
  PL: "PL",
  PO: "PO",
};

export function getStoryConditionBadge(condition) {
  if (typeof condition !== "string" || !condition.trim()) return "";
  const normalized = normalize(condition);
  return (
    cardmarketNames[normalized] ||
    inventoryNames[normalized] ||
    compactNames[normalized] ||
    ""
  );
}

export const STORY_CONDITION_COLORS = {
  M: { background: "#059669", color: "#ffffff" },
  NM: { background: "#16a34a", color: "#ffffff" },
  EX: { background: "#65a30d", color: "#ffffff" },
  GD: { background: "#d97706", color: "#ffffff" },
  LP: { background: "#b45309", color: "#ffffff" },
  PL: { background: "#ea580c", color: "#ffffff" },
  PO: { background: "#dc2626", color: "#ffffff" },
};
