// Shared existing condition mapping; no pricing or browser dependencies.
// TCGPlayer to Cardmarket condition mapping
// Used for displaying conditions to European viewers
export const TCG_TO_CARDMARKET_CONDITION = {
  "Mint": "Mint",
  "Near Mint": "Near Mint",
  "NM": "Near Mint",
  "Lightly Played": "Excellent",
  "LP": "Excellent",
  "Moderately Played": "Good",
  "MP": "Good",
  "Heavily Played": "Played",
  "HP": "Played",
  "Damaged": "Poor",
  "DMG": "Poor",
};

// Cardmarket to TCGPlayer condition mapping (reverse)
export const CARDMARKET_TO_TCG_CONDITION = {
  "Mint": "Mint",
  "Near Mint": "Near Mint",
  "Excellent": "Lightly Played",
  "Good": "Moderately Played",
  "Played": "Heavily Played",
  "Poor": "Damaged",
};

