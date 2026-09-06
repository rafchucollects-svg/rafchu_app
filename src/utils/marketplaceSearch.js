export const DEFAULT_MARKETPLACE_RESULT_LIMIT = 24;

export function normalizeMarketplaceText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getMarketplaceCardKey(card) {
  if (card?.cardId) return String(card.cardId);
  return [card?.name, card?.set, card?.number]
    .map(normalizeMarketplaceText)
    .join("|");
}

function containsAllTokens(searchText, tokens) {
  return tokens.every((token) => searchText.includes(token));
}

function scoreCard(entry, normalizedQuery, tokens) {
  if (!containsAllTokens(entry.searchText, tokens)) return -1;

  let score = tokens.length * 5;
  if (entry.name === normalizedQuery) score += 120;
  else if (entry.name.startsWith(normalizedQuery)) score += 80;
  else if (entry.name.includes(normalizedQuery)) score += 55;

  if (entry.number === normalizedQuery) score += 45;
  if (entry.set === normalizedQuery) score += 35;
  if (entry.set.startsWith(normalizedQuery)) score += 20;
  return score;
}

function scoreVendor(entry, normalizedQuery, tokens) {
  if (!containsAllTokens(entry.searchText, tokens)) return -1;

  let score = tokens.length * 5;
  if (entry.name === normalizedQuery) score += 120;
  else if (entry.name.startsWith(normalizedQuery)) score += 80;
  else if (entry.name.includes(normalizedQuery)) score += 55;
  return score;
}

export function buildMarketplaceSearchIndex(vendors = []) {
  const cardEntries = new Map();
  const vendorEntries = [];

  vendors.forEach((vendor) => {
    const vendorName = normalizeMarketplaceText(vendor.profile?.username);
    const country = normalizeMarketplaceText(vendor.profile?.country);
    vendorEntries.push({
      vendor,
      name: vendorName,
      country,
      searchText: [vendorName, country, normalizeMarketplaceText(vendor.profile?.businessName)]
        .filter(Boolean)
        .join(" "),
    });

    vendor.inventory.forEach((card) => {
      const key = getMarketplaceCardKey(card);
      let entry = cardEntries.get(key);
      if (!entry) {
        const name = normalizeMarketplaceText(card.name);
        const set = normalizeMarketplaceText(card.set);
        const number = normalizeMarketplaceText(card.number);
        entry = {
          key,
          card,
          name,
          set,
          number,
          searchText: [
            name,
            set,
            number,
            normalizeMarketplaceText(card.rarity),
            normalizeMarketplaceText(card.type),
          ].filter(Boolean).join(" "),
          vendors: [],
        };
        cardEntries.set(key, entry);
      }

      entry.vendors.push({
        ...vendor,
        cardInstance: card,
      });
    });
  });

  return {
    cards: Array.from(cardEntries.values()),
    vendors: vendorEntries,
  };
}

export function searchMarketplace(
  index,
  {
    query = "",
    mode = "all",
    country = "",
    limit = DEFAULT_MARKETPLACE_RESULT_LIMIT,
  } = {},
) {
  const normalizedQuery = normalizeMarketplaceText(query);
  if (!normalizedQuery) {
    return {
      cards: [],
      vendors: [],
      totalCards: 0,
      totalVendors: 0,
    };
  }

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const normalizedCountry = normalizeMarketplaceText(country);
  const includeCards = mode === "all" || mode === "cards";
  const includeVendors = mode === "all" || mode === "vendors";

  const cardMatches = includeCards
    ? index.cards.flatMap((entry) => {
        const score = scoreCard(entry, normalizedQuery, tokens);
        if (score < 0) return [];

        const matchingVendors = normalizedCountry
          ? entry.vendors.filter(
              (vendor) => normalizeMarketplaceText(vendor.profile?.country) === normalizedCountry,
            )
          : entry.vendors;

        if (matchingVendors.length === 0) return [];
        return [{
          key: entry.key,
          card: entry.card,
          vendors: matchingVendors,
          score,
        }];
      }).sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
    : [];

  const vendorMatches = includeVendors
    ? index.vendors.flatMap((entry) => {
        if (normalizedCountry && entry.country !== normalizedCountry) return [];
        const score = scoreVendor(entry, normalizedQuery, tokens);
        return score < 0 ? [] : [{ vendor: entry.vendor, score }];
      }).sort((a, b) => b.score - a.score || b.vendor.totalCards - a.vendor.totalCards)
    : [];

  return {
    cards: cardMatches.slice(0, limit).map(result => ({
      key: result.key,
      card: result.card,
      vendors: result.vendors,
    })),
    vendors: vendorMatches.slice(0, limit).map(({ vendor }) => vendor),
    totalCards: cardMatches.length,
    totalVendors: vendorMatches.length,
  };
}
