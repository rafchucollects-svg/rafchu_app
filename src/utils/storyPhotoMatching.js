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

/** Sale labels use whole amounts; a positive sub-unit price is never shown as zero. */
export function roundStoryPrice(value, roundUp = false) {
  const price = parseStoryPrice(value);
  return price === null
    ? null
    : Math.max(1, roundUp ? Math.ceil(price) : Math.round(price));
}

export function formatStoryPrice(value, currency = "EUR") {
  const price = roundStoryPrice(value);
  if (price === null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency || "EUR"} ${price}`;
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
  } else if (isStoryGraded(item) && hasValue(item.gradedPrice)) {
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
  } else if (!isStoryGraded(item)) {
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
  return roundStoryPrice(price, roundUp);
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
  if (a.split("/").length > 2 || b.split("/").length > 2) return false;
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

function normalizedGrade(value) {
  const text = normalizeText(value);
  if (!text || ["raw", "ungraded", "not graded"].includes(text)) return "";
  const numeric = String(value).trim();
  return /^\d+(?:\.\d+)?$/.test(numeric) ? String(Number(numeric)) : text;
}

function normalizedCompany(value) {
  const company = normalizeText(value);
  if (["raw", "ungraded", "not graded"].includes(company)) return "";
  const aliases = {
    "professional sports authenticator": "psa",
    beckett: "bgs",
    "beckett grading services": "bgs",
    "certified guaranty company": "cgc",
    "sportscard guaranty": "sgc",
  };
  return aliases[company] || company;
}

/** Older inventory entries can carry slab metadata without the boolean flag. */
export function isStoryGraded(item) {
  return (
    !!item &&
    (item.isGraded === true ||
      !!normalizedGrade(item.grade) ||
      !!normalizedCompany(item.gradingCompany || item.grader))
  );
}

function getIdentity(card) {
  const language = normalizeText(
    card.language || card.cardLanguage || (card.isJapanese ? "Japanese" : ""),
  );
  const grade = normalizedGrade(card.grade);
  const company = normalizedCompany(card.gradingCompany || card.grader);
  const condition = normalizeText(card.condition);
  return {
    name: normalizeText(card.name || card.cardName),
    number: normalizeNumber(
      card.collectorNumber || card.number || card.cardNumber,
    ),
    set: normalizeText(card.setName || card.set),
    language: LANGUAGES[language] || language,
    grade,
    company,
    graded: isStoryGraded(card) ? true : card.isGraded === false ? false : null,
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

function nameSimilarity(first, second) {
  if (!first || !second) return 0;
  const generic = new Set([
    "pokemon",
    "card",
    "unknown",
    "unreadable",
    "ex",
    "v",
    "vmax",
    "vstar",
    "gx",
    "tag",
    "team",
    "holo",
  ]);
  if (
    [first, second].some((name) =>
      name.split(" ").every((token) => generic.has(token)),
    )
  )
    return 0;
  if (first === second) return 1;
  const a = first.replaceAll(" ", "");
  const b = second.replaceAll(" ", "");
  if (a === b) return 1;
  const firstTokens = first.split(" ");
  const secondTokens = second.split(" ");
  const shorter =
    firstTokens.length <= secondTokens.length ? firstTokens : secondTokens;
  const longer = shorter === firstTokens ? secondTokens : firstTokens;
  if (
    shorter.some((token) => !generic.has(token)) &&
    shorter.every((token) => longer.includes(token))
  )
    return 0.8;
  const length = Math.max(a.length, b.length);
  const minLength = Math.min(a.length, b.length);
  if (
    minLength >= 5 &&
    minLength / length >= 0.65 &&
    (a.includes(b) || b.includes(a))
  )
    return 0.75;
  // A small OCR typo is useful with a matching collector number, but a shared
  // number alone must not turn an unrelated Pokémon into a priced match.
  if (minLength < 4 || Math.abs(a.length - b.length) > 2) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length] <= (length >= 9 ? 2 : 1) ? 0.75 : 0;
}

/** Apply the best plausible inventory price first; uncertainty stays editable. */
export function matchPhotoCard(
  detected,
  items,
  { currency = "EUR", roundUp = false, marketSource = "tcgplayer" } = {},
) {
  const identity = getIdentity(detected || {});
  const scored = (Array.isArray(items) ? items : [])
    .filter(isForSale)
    .map((item, index) => {
      const entry = getIdentity(item);
      if (entry.graded === null) entry.graded = false;
      const similarity = nameSimilarity(identity.name, entry.name);
      const exactName = similarity === 1;
      const exactNumber = sameNumber(identity.number, entry.number);
      const hardConflicts = [];
      const detailsToCheck = [];
      let score = Math.round(similarity * 40) + (exactNumber ? 35 : 0);
      if (identity.number && entry.number && !exactNumber)
        hardConflicts.push("card number");
      if (identity.name && entry.name && !similarity)
        hardConflicts.push("card name");
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
          else if (field === "grade" || field === "company")
            hardConflicts.push(label);
          else {
            score -= weight;
            detailsToCheck.push(label);
          }
        } else if (identity[field] && !entry[field]) detailsToCheck.push(label);
      }
      if (identity.graded !== null && identity.graded !== entry.graded)
        hardConflicts.push("raw or graded status");
      if (identity.graded !== null && identity.graded === entry.graded)
        score += 8;
      score -= hardConflicts.length * 80;
      const setMatches = !!identity.set && identity.set === entry.set;
      // Number + recognizable name is normally sufficient to suggest a price.
      // A missing number needs an exact name and matching set instead.
      const plausible =
        similarity > 0 &&
        (exactNumber ||
          (exactName && setMatches && (!identity.number || !entry.number)));
      return {
        item,
        price: getStoryPrice(item, currency, roundUp, marketSource),
        index,
        score,
        identity: entry,
        exactName,
        exactNumber,
        setMatches,
        hardConflicts,
        detailsToCheck,
        plausible,
        relevant: similarity > 0 || exactNumber,
      };
    })
    .filter((entry) => entry.relevant)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.price !== null) - Number(a.price !== null) ||
        a.index - b.index,
    );

  const candidates = scored
    .slice(0, 8)
    .map(({ item, price, score }) => ({ item, price, score }));
  const possible = scored.filter(
    (entry) => entry.plausible && entry.hardConflicts.length === 0,
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
  if (!possible.length)
    return unmatched(
      "No compatible inventory match found. Choose a card or enter a price.",
    );
  const match = possible[0];
  const hasConfidence =
    detected && Object.prototype.hasOwnProperty.call(detected, "confidence");
  const reliableScan =
    !hasConfidence ||
    (typeof detected.confidence === "number" &&
      Number.isFinite(detected.confidence) &&
      detected.confidence >= 0.85 &&
      detected.confidence <= 1);
  const slabMatches =
    identity.graded === true &&
    match.identity.graded === true &&
    !!identity.grade &&
    identity.grade === match.identity.grade &&
    !!identity.company &&
    identity.company === match.identity.company;
  const confident =
    possible.length === 1 &&
    match.exactName &&
    match.exactNumber &&
    match.detailsToCheck.length === 0 &&
    reliableScan &&
    (slabMatches || (identity.graded === false && match.setMatches));
  let reason;
  if (match.price === null)
    reason =
      "Inventory card selected. Add a sale price or choose another match.";
  else if (confident)
    reason = "Applied this card’s inventory price. You can adjust it below.";
  else if (possible.length > 1)
    reason =
      "Applied the closest inventory price. Several entries match; you can choose another condition or variant.";
  else if (match.detailsToCheck.length)
    reason = `Applied the best inventory price. Check the ${match.detailsToCheck.join(", ")} if needed.`;
  else
    reason =
      "Applied the best inventory price from the readable details. You can correct the match or price.";
  return {
    item: match.item,
    price: match.price,
    candidates,
    confident,
    reason,
  };
}
