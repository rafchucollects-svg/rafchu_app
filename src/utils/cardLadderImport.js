import { convertCurrency } from "./cardHelpers";

export function parseCardLadderMoney(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const isNegative = /^\(.*\)$/.test(value);
  const normalized = value.replace(/[,$£€\s()]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return isNegative ? -parsed : parsed;
}

export function toPerUnitCardLadderAmount(total, quantity) {
  if (total == null || !Number.isFinite(Number(total))) return null;
  const qty = Number(quantity) > 0 ? Number(quantity) : 1;
  return Number(total) / qty;
}

/**
 * Promote Card Ladder's USD Investment amount into the inventory's acquisition
 * cost field. Inventory accounting stores monetary values in the user's primary
 * currency, while the original USD value remains in cardladderData for audit and
 * future re-import matching.
 */
export function applyCardLadderPurchasePrice(card, inventoryCurrency = "USD") {
  const investment = card?.cardladderData?.investment;
  if (investment == null || !Number.isFinite(Number(investment))) return card;

  const converted = convertCurrency(Number(investment), inventoryCurrency, "USD");
  const buyPrice = Math.round(converted * 100) / 100;
  return {
    ...card,
    buyPrice,
    buyPriceCurrency: inventoryCurrency,
    acquiredVia: "cardladder",
    taxAcquisition: {
      marginSchemeEligibility: "unreviewed",
      counterpartyType: "unknown",
      documentNumber: "",
      recordedCost: buyPrice,
      currency: inventoryCurrency,
      source: "cardladder",
      sourceAmount: Number(investment),
      sourceCurrency: "USD",
      purchaseDate: card.cardladderData?.datePurchased || "",
    },
  };
}

export function preserveEditedCardLadderPurchasePrice(
  importedCard,
  existingCard,
  inventoryCurrency = "USD",
) {
  const isDealBacked = Boolean(existingCard?.acquisitionTransactionId) &&
    ["buy", "trade"].includes(String(existingCard?.acquiredVia || "").toLowerCase());
  const isManuallyEdited = existingCard?.buyPriceManuallySet === true;
  if (!isManuallyEdited && !isDealBacked) return importedCard;
  const buyPriceCurrency = existingCard.buyPriceCurrency || inventoryCurrency;
  return {
    ...importedCard,
    buyPrice: existingCard.buyPrice ?? null,
    buyPriceCurrency,
    ...(isManuallyEdited ? { buyPriceManuallySet: true } : {}),
    ...(isDealBacked ? {
      acquiredVia: existingCard.acquiredVia,
      acquisitionTransactionId: existingCard.acquisitionTransactionId,
      reconciledFromManualDeal: existingCard.reconciledFromManualDeal === true,
      originalManualIdentity: existingCard.originalManualIdentity || null,
    } : {}),
    taxAcquisition: {
      ...(importedCard.taxAcquisition || {}),
      ...(existingCard.taxAcquisition || {}),
      recordedCost: existingCard.buyPrice ?? null,
      currency: buyPriceCurrency,
      sourceAmount: importedCard.taxAcquisition?.sourceAmount ??
        existingCard.taxAcquisition?.sourceAmount ?? null,
      sourceCurrency: importedCard.taxAcquisition?.sourceCurrency ||
        existingCard.taxAcquisition?.sourceCurrency || "USD",
      cardladderInvestment: importedCard.cardladderData?.investment ?? null,
      cardladderInvestmentCurrency: "USD",
      ...(isManuallyEdited ? { manuallyAdjusted: true } : {}),
      ...(isDealBacked ? { dealCostPreserved: true } : {}),
    },
  };
}

const normalizeText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const normalizeMatchName = (value) => normalizeText(value)
  .replace(/\b(reverse|rev(?:erse)?|holo(?:foil)?|foil)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const normalizeMatchNumber = (value) => {
  const normalized = normalizeText(value).trim();
  if (!normalized || normalized === "n/a" || normalized === "na") return "";
  return normalized
    .split("/")[0]
    .replace(/^#/, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^0+(?=\d)/, "");
};

const normalizeGrade = (value) => {
  if (value == null || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : normalizeText(value).trim();
};

const normalizeContextField = (value) => normalizeText(value)
  .replace(/\b(?:19|20)\d{2}\b/g, " ")
  .replace(/\bpokemon\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const getContextFields = (item, isCardLadder) => {
  const fields = [item?.set, item?.rarity];
  if (isCardLadder) {
    fields.push(item?.cardladderData?.setRaw, item?.cardladderData?.variation);
  }
  return [...new Set(fields.map(normalizeContextField).filter(Boolean))];
};

const extractYears = (item, isCardLadder) => {
  const values = [item?.set, item?.rarity, item?.name];
  if (isCardLadder) values.push(item?.cardladderData?.year, item?.cardladderData?.setRaw);
  return new Set(values.flatMap((value) => normalizeText(value).match(/\b(?:19|20)\d{2}\b/g) || []));
};

const getCertNumber = (item) => String(
  item?.cardladderData?.slabSerial ||
  item?.gradedCertNumber ||
  item?.certNumber ||
  item?.slabSerial ||
  "",
).replace(/\s+/g, "").toLowerCase();

/**
 * Score a Card Ladder row against a graded manual inventory card created by a
 * confirmed deal. Cost is deliberately not a matching signal: the app's deal
 * value is authoritative and may legitimately differ from Card Ladder later.
 */
export function manualDealCardMatchScore(cardLadderCard, inventoryCard) {
  const isDealBacked = Boolean(inventoryCard?.acquisitionTransactionId) &&
    ["buy", "trade"].includes(String(inventoryCard?.acquiredVia || "").toLowerCase());
  const hasRecordedCost = inventoryCard?.buyPrice != null &&
    Number.isFinite(Number(inventoryCard.buyPrice));
  const isManual = inventoryCard?.isManualEntry === true ||
    String(inventoryCard?.id || inventoryCard?.cardId || "").startsWith("manual-");
  if (!isDealBacked || !hasRecordedCost || !isManual) return 0;
  if (Number(cardLadderCard?.quantity || 1) !== 1 || Number(inventoryCard?.quantity || 1) !== 1) return 0;

  const incomingCert = getCertNumber(cardLadderCard);
  const existingCert = getCertNumber(inventoryCard);
  if (incomingCert && existingCert) {
    return incomingCert === existingCert ? 1000 : 0;
  }

  if (normalizeMatchName(cardLadderCard?.name) !== normalizeMatchName(inventoryCard?.name)) return 0;
  if (!normalizeMatchName(cardLadderCard?.name)) return 0;

  const incomingCompany = normalizeText(cardLadderCard?.gradingCompany).trim();
  const existingCompany = normalizeText(inventoryCard?.gradingCompany).trim();
  if (!incomingCompany || incomingCompany !== existingCompany) return 0;
  if (normalizeGrade(cardLadderCard?.grade) !== normalizeGrade(inventoryCard?.grade)) return 0;

  const incomingNumber = normalizeMatchNumber(cardLadderCard?.number);
  const existingNumber = normalizeMatchNumber(inventoryCard?.number);
  if (!incomingNumber || !existingNumber || incomingNumber !== existingNumber) return 0;

  const incomingContext = getContextFields(cardLadderCard, true);
  const existingContext = getContextFields(inventoryCard, false);
  let contextMatches = 0;
  for (const incoming of incomingContext) {
    if (existingContext.some((existing) =>
      incoming === existing ||
      (incoming.length >= 6 && existing.includes(incoming)) ||
      (existing.length >= 6 && incoming.includes(existing)))) {
      contextMatches++;
    }
  }
  if (contextMatches === 0) return 0;

  const incomingYears = extractYears(cardLadderCard, true);
  const existingYears = extractYears(inventoryCard, false);
  if (incomingYears.size > 0 && existingYears.size > 0) {
    const overlaps = [...incomingYears].some((year) => existingYears.has(year));
    if (!overlaps) return 0;
  }

  return 200 + Math.min(contextMatches, 3) * 10 +
    (incomingYears.size > 0 && existingYears.size > 0 ? 10 : 0);
}

export function findManualDealCardMatch(cardLadderCard, candidates, claimedEntryIds = new Set()) {
  const scored = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => !claimedEntryIds.has(candidate.entryId))
    .map((candidate) => ({
      candidate,
      score: manualDealCardMatchScore(cardLadderCard, candidate),
    }))
    .filter(({ score }) => score >= 210)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored[1] && scored[0].score - scored[1].score < 20) return null;
  return scored[0];
}

/** Preserve the acquisition evidence captured when the app confirmed a deal. */
export function preserveDealAcquisitionData(
  importedCard,
  dealCard,
  inventoryCurrency = "USD",
) {
  if (!dealCard?.acquisitionTransactionId || dealCard?.buyPrice == null) return importedCard;
  const buyPriceCurrency = dealCard.buyPriceCurrency || inventoryCurrency;
  return {
    ...importedCard,
    buyPrice: Number(dealCard.buyPrice),
    buyPriceCurrency,
    acquiredVia: dealCard.acquiredVia || "buy",
    acquisitionTransactionId: dealCard.acquisitionTransactionId,
    purchaseDate: dealCard.purchaseDate || importedCard.purchaseDate || null,
    ...(dealCard.buyPriceManuallySet === true ? { buyPriceManuallySet: true } : {}),
    reconciledFromManualDeal: true,
    originalManualIdentity: {
      name: dealCard.name || "",
      set: dealCard.set || "",
      number: dealCard.number || "",
      rarity: dealCard.rarity || "",
    },
    taxAcquisition: {
      ...(dealCard.taxAcquisition || {}),
      recordedCost: Number(dealCard.buyPrice),
      currency: buyPriceCurrency,
      cardladderInvestment: importedCard.cardladderData?.investment ?? null,
      cardladderInvestmentCurrency: "USD",
      reconciledFromCardLadder: true,
    },
  };
}

export function cardLadderCustomizationScore(item) {
  if (!item) return 0;
  let score = 0;
  if (item.imageManuallySet === true) score += 8;
  if (
    typeof item.image === "string" &&
    (item.image.includes("firebasestorage.googleapis.com") ||
      item.image.includes("storage.googleapis.com") ||
      item.image.startsWith("data:"))
  ) {
    score += 4;
  }
  if (item.manualPrice != null && item.manualPrice !== "") score += 2;
  if (item.overridePrice != null && !Number.isNaN(Number(item.overridePrice))) score += 2;
  if (item.excludeFromSale === true) score += 1;
  if (item.buyPriceManuallySet === true) score += 4;
  else if (item.buyPrice != null && !Number.isNaN(Number(item.buyPrice))) score += 1;
  return score;
}

/** Composite identity for a Card Ladder card row — set + name + number + grade. */
export function cardLadderCompositeKey(item) {
  return [
    (item?.name || "").toLowerCase().trim(),
    (item?.set || "").toLowerCase().trim(),
    (item?.number || "").toLowerCase().trim(),
    (item?.gradingCompany || "").toLowerCase().trim(),
    (item?.grade || "").toLowerCase().trim(),
  ].join("|");
}

const normalizeMatchValue = (value) => String(value ?? "").toLowerCase().trim();

/**
 * Tie-break otherwise-identical rows using Card Ladder acquisition data. This
 * keeps two same-card/same-grade purchases attached to the right inventory row
 * even when the export has no Ladder ID or cert number.
 */
export function cardLadderMatchScore(incoming, existing) {
  let score = cardLadderCustomizationScore(existing);
  const incomingInvestmentRaw = incoming?.cardladderData?.investment;
  const existingInvestmentRaw = existing?.cardladderData?.investment;
  const incomingInvestment = Number(incomingInvestmentRaw);
  const existingInvestment = Number(existingInvestmentRaw);
  if (
    incomingInvestmentRaw != null &&
    existingInvestmentRaw != null &&
    Number.isFinite(incomingInvestment) &&
    Number.isFinite(existingInvestment) &&
    Math.round(incomingInvestment * 100) === Math.round(existingInvestment * 100)
  ) {
    score += 100;
  }

  const incomingDate = normalizeMatchValue(incoming?.cardladderData?.datePurchased);
  const existingDate = normalizeMatchValue(existing?.cardladderData?.datePurchased);
  if (incomingDate && existingDate && incomingDate === existingDate) score += 50;

  return score;
}
