import { computeItemMetrics, convertCurrency } from "./cardHelpers";

const MAX_PRICE = 1_000_000_000;
const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "";

/** Prices entered in the editor accept a decimal point or comma, never grouping. */
export function parseStoryPrice(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    return null;
  const price =
    typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  return Number.isFinite(price) && price > 0 && price <= MAX_PRICE
    ? price
    : null;
}

/** Keep cents visible even for currencies whose usual display rounds to units. */
export function formatStoryPrice(value, currency = "EUR") {
  const price = parseStoryPrice(value);
  if (price === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency || "EUR"} ${price.toFixed(2)}`;
  }
}

function convertedPrice(value, sourceCurrency, currency) {
  const price = parseStoryPrice(value);
  if (price === null) return null;
  return parseStoryPrice(
    sourceCurrency && sourceCurrency !== currency
      ? convertCurrency(price, currency, sourceCurrency)
      : price,
  );
}

/** Follow the inventory's seller ask, with explicit prices taking precedence. */
export function getStoryPrice(
  item,
  currency = "EUR",
  roundUp = false,
  marketSource = "tcgplayer",
) {
  if (!item || typeof item !== "object") return null;
  let price = null;
  if (hasValue(item.overridePrice)) {
    price = convertedPrice(
      item.overridePrice,
      item.overridePriceCurrency,
      currency,
    );
  } else if (item.isGraded && hasValue(item.gradedPrice)) {
    price = convertedPrice(
      item.gradedPrice,
      item.gradedPriceCurrency || "USD",
      currency,
    );
  } else if (hasValue(item.manualPrice)) {
    price = convertedPrice(
      item.manualPrice,
      item.manualPriceCurrency,
      currency,
    );
  } else if (hasValue(item.customPrice)) {
    price = convertedPrice(
      item.customPrice,
      item.customPriceCurrency || item.overridePriceCurrency,
      currency,
    );
  } else if (!item.isGraded) {
    const metrics = computeItemMetrics(item, currency);
    price = parseStoryPrice(metrics?.suggested);
    if (price === null) {
      const fallback =
        marketSource === "cardmarket"
          ? [metrics?.cmAvg, metrics?.cmLowest, metrics?.tcg]
          : [metrics?.tcg, metrics?.cmAvg, metrics?.cmLowest];
      price =
        fallback.map(parseStoryPrice).find((value) => value !== null) ?? null;
    }
  }
  // A missing slab price must never silently become the price of the raw card.
  return price === null ? null : roundUp ? Math.ceil(price) : price;
}

function normalizeText(value) {
  if (value && typeof value === "object")
    value = value.name || value.label || "";
  const result = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return ["unknown", "unreadable", "n a", "none", "null"].includes(result)
    ? ""
    : result;
}

function normalizeNumber(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^\s*#/, "")
    .replace(/\s/g, "")
    .split("/")
    .map((part) => part.replace(/(^|\D)0+(?=\d)/g, "$1"))
    .join("/");
}

function sameNumber(a, b) {
  if (!a || !b) return false;
  const [aBase, aTotal] = a.split("/");
  const [bBase, bTotal] = b.split("/");
  return aBase === bBase && (!aTotal || !bTotal || aTotal === bTotal);
}

const LANGUAGES = {
  en: "english",
  eng: "english",
  jp: "japanese",
  ja: "japanese",
  jpn: "japanese",
  fr: "french",
  fra: "french",
  de: "german",
  deu: "german",
  es: "spanish",
  spa: "spanish",
  it: "italian",
  ita: "italian",
  ko: "korean",
  kr: "korean",
  kor: "korean",
  pt: "portuguese",
  zh: "chinese",
  cn: "chinese",
};
const CONDITIONS = {
  "near mint": "nm",
  "lightly played": "lp",
  "moderately played": "mp",
  "heavily played": "hp",
  damaged: "dmg",
};

function getIdentity(card) {
  const language = normalizeText(
    card.language || card.cardLanguage || (card.isJapanese ? "Japanese" : ""),
  );
  const grade = hasValue(card.grade)
    ? String(card.grade).trim().replace(/\.0+$/, "")
    : "";
  const company = normalizeText(card.gradingCompany || card.grader);
  const condition = normalizeText(card.condition);
  return {
    name: normalizeText(card.name || card.cardName),
    number: normalizeNumber(
      card.collectorNumber || card.number || card.cardNumber,
    ),
    set: normalizeText(card.setName || card.set),
    language: LANGUAGES[language] || language,
    grade: normalizeText(grade),
    company,
    graded:
      typeof card.isGraded === "boolean"
        ? card.isGraded
        : grade || company
          ? true
          : null,
    condition: CONDITIONS[condition] || condition,
    variant: normalizeText(card.variant || card.variantName || card.finish),
  };
}

export function getInventoryKey(item, index = 0) {
  if (hasValue(item?.entryId)) return String(item.entryId);
  const identity = getIdentity(item || {});
  // Catalog IDs identify a printing, not an inventory entry. Retain the index
  // so two copies with different conditions/grades can be selected separately.
  return `inventory:${item?.cardId || item?.id || identity.name}:${identity.number}:${identity.condition}:${identity.variant}:${identity.grade}:${identity.language}:${index}`;
}

function isForSale(item) {
  if (!item || typeof item !== "object" || item.excludeFromSale) return false;
  const quantity = item.quantity ?? item.qty;
  return (
    !hasValue(quantity) ||
    (Number.isFinite(Number(quantity)) && Number(quantity) > 0)
  );
}

/** Conservative matching: an uncertain identity yields candidates, never a price. */
export function matchPhotoCard(
  detected,
  items,
  { currency = "EUR", roundUp = false, marketSource = "tcgplayer" } = {},
) {
  const identity = getIdentity(detected || {});
  const scored = (Array.isArray(items) ? items : [])
    .filter(isForSale)
    .map((item) => {
      const entry = getIdentity(item);
      // Inventory entries without slab metadata are raw; scanner omissions are unknown.
      if (entry.graded === null) entry.graded = false;
      const exactName = !!identity.name && identity.name === entry.name;
      const exactNumber = sameNumber(identity.number, entry.number);
      const partialName =
        !!identity.name &&
        !!entry.name &&
        (identity.name.includes(entry.name) ||
          entry.name.includes(identity.name));
      const contradictions = [];
      const missing = [];
      let score =
        (exactName ? 40 : partialName ? 12 : 0) + (exactNumber ? 35 : 0);
      if (identity.number && entry.number && !exactNumber)
        contradictions.push("card number");
      if (identity.name && entry.name && !exactName)
        contradictions.push("card name");
      for (const [field, weight, label] of [
        ["set", 16, "set"],
        ["language", 8, "language"],
        ["grade", 12, "grade"],
        ["company", 8, "grading company"],
        ["condition", 6, "condition"],
        ["variant", 8, "variant"],
      ]) {
        if (identity[field] && entry[field]) {
          if (identity[field] === entry[field]) score += weight;
          else contradictions.push(label);
        } else if (identity[field] && !entry[field]) missing.push(label);
      }
      if (identity.graded !== null && identity.graded !== entry.graded)
        contradictions.push("raw or graded status");
      if (identity.graded !== null && identity.graded === entry.graded)
        score += 8;
      score -= contradictions.length * 30;
      return {
        item,
        price: getStoryPrice(item, currency, roundUp, marketSource),
        score,
        identity: entry,
        exactName,
        exactNumber,
        contradictions,
        missing,
        relevant: exactName || exactNumber || partialName,
      };
    })
    .filter((entry) => entry.relevant)
    .sort((a, b) => b.score - a.score);

  const candidates = scored
    .slice(0, 8)
    .map(({ item, price, score }) => ({ item, price, score }));
  const possible = scored.filter(
    (entry) =>
      entry.exactName && entry.exactNumber && entry.contradictions.length === 0,
  );
  const unmatched = (reason) => ({
    item: null,
    price: null,
    candidates,
    confident: false,
    reason,
  });
  if (!candidates.length)
    return unmatched(
      "No matching inventory card found. Choose a card or enter a price.",
    );
  const hasConfidence =
    detected && Object.prototype.hasOwnProperty.call(detected, "confidence");
  const validConfidence =
    typeof detected?.confidence === "number" &&
    Number.isFinite(detected.confidence) &&
    detected.confidence >= 0.85 &&
    detected.confidence <= 1;
  if (hasConfidence && !validConfidence) {
    return unmatched(
      "The photo scan is uncertain. Confirm the inventory card before using its price.",
    );
  }
  if (identity.graded === false && (identity.grade || identity.company))
    return unmatched(
      "The scan contains conflicting grading details. Confirm whether this card is raw or graded.",
    );
  if (!identity.name || !identity.number)
    return unmatched(
      "The name or card number is unclear. Confirm the inventory card.",
    );
  if (!possible.length)
    return unmatched(
      "The detected details differ from your inventory. Confirm the card and price.",
    );
  if (possible.length > 1)
    return unmatched(
      "Several inventory entries match. Choose the correct condition or variant.",
    );
  const match = possible[0];
  if (match.missing.length)
    return unmatched(
      `Confirm the ${match.missing.join(", ")} before using this inventory price.`,
    );
  if (!identity.set || !match.identity.set)
    return unmatched("Confirm the set before using this inventory price.");
  if (identity.graded === null)
    return unmatched("Confirm whether this card is raw or graded.");
  if (match.identity.graded && (!identity.grade || !identity.company))
    return unmatched(
      "Confirm the grading company and grade before using this inventory price.",
    );
  return {
    item: match.item,
    price: match.price,
    candidates,
    confident: true,
    reason:
      match.price === null
        ? "Inventory card matched. Add a sale price to continue."
        : "Matched the card and its inventory sale price.",
  };
}
