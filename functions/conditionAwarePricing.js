const JUSTTCG_API_URL = 'https://api.justtcg.com/v1';

const CONDITION_DEFINITIONS = {
  NM: { label: 'Near Mint', multiplier: 1 },
  LP: { label: 'Lightly Played', multiplier: 0.9 },
  MP: { label: 'Moderately Played', multiplier: 0.8 },
  HP: { label: 'Heavily Played', multiplier: 0.6 },
  DMG: { label: 'Damaged', multiplier: 0.4 },
};

const CONDITION_ALIASES = new Map([
  ['nm', 'NM'],
  ['near mint', 'NM'],
  ['lp', 'LP'],
  ['lightly played', 'LP'],
  ['mp', 'MP'],
  ['moderately played', 'MP'],
  ['hp', 'HP'],
  ['heavily played', 'HP'],
  ['dmg', 'DMG'],
  ['damaged', 'DMG'],
]);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCardNumber(value) {
  const front = String(value || '').replace(/^#/, '').split('/')[0].trim();
  return front.replace(/^0+(?=\d)/, '');
}

function normalizeCondition(value) {
  const key = CONDITION_ALIASES.get(normalizeText(value)) || 'NM';
  return {
    code: key,
    ...CONDITION_DEFINITIONS[key],
  };
}

function printingCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes('reverse') && (normalized.includes('holo') || normalized.includes('foil'))) {
    return 'reverse-holo';
  }
  if (normalized.includes('1st edition') || normalized.includes('first edition')) {
    return '1st-edition';
  }
  if (normalized.includes('shadowless')) return 'shadowless';
  if (normalized.includes('unlimited')) return 'unlimited';
  if (normalized === 'normal' || normalized.includes('non holo')) return 'normal';
  if (normalized.includes('holo') || normalized.includes('foil')) return 'regular-holo';
  return normalized;
}

function uniquePrintings(variants) {
  const seen = new Set();
  return (variants || [])
    .map((variant) => String(variant?.printing || '').trim())
    .filter((printing) => {
      const key = normalizeText(printing);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function choosePrinting(variants, requestedPrinting) {
  const printings = uniquePrintings(variants);
  const requestedCategory = printingCategory(requestedPrinting);
  const exactRequested = normalizeText(requestedPrinting);

  if (exactRequested) {
    const exact = printings.find((printing) => normalizeText(printing) === exactRequested);
    if (exact) return { printing: exact, printings, reason: 'requested' };

    const aliasMatch = printings.find((printing) => printingCategory(printing) === requestedCategory);
    if (aliasMatch) return { printing: aliasMatch, printings, reason: 'requested' };
  }

  if (printings.length === 1) {
    return { printing: printings[0], printings, reason: 'only-option' };
  }

  return { printing: null, printings, reason: 'confirmation-required' };
}

function buildPrintingOptions(variants, targetCondition) {
  return uniquePrintings(variants).map((printing) => {
    const printingVariants = variants.filter(
      (variant) => normalizeText(variant?.printing) === normalizeText(printing),
    );
    const target = printingVariants.find(
      (variant) => normalizeCondition(variant?.condition).code === targetCondition.code,
    );
    return {
      value: printing,
      label: printing,
      targetConditionPrice: Number(target?.price) > 0 ? Number(target.price) : null,
      availableConditionCount: printingVariants.filter((variant) => Number(variant?.price) > 0).length,
    };
  });
}

function resolveConditionAwarePrice(card, options = {}) {
  const variants = Array.isArray(card?.variants)
    ? card.variants.filter((variant) => normalizeText(variant?.language || 'English') === 'english')
    : [];
  const condition = normalizeCondition(options.condition);
  const selected = choosePrinting(variants, options.printing);
  const printingOptions = buildPrintingOptions(variants, condition);

  const identity = {
    id: card?.id || null,
    name: card?.name || null,
    set: card?.set_name || card?.set || null,
    number: card?.number || null,
    rarity: card?.rarity || null,
    tcgplayerId: card?.tcgplayerId ? String(card.tcgplayerId) : null,
  };

  if (!selected.printing) {
    return {
      status: variants.length > 0 ? 'printing-confirmation-required' : 'unavailable',
      identity,
      condition,
      selectedPrinting: null,
      printingOptions,
      price: null,
    };
  }

  const matchingVariants = variants.filter(
    (variant) => normalizeText(variant?.printing) === normalizeText(selected.printing),
  );
  const exactVariant = matchingVariants.find(
    (variant) => normalizeCondition(variant?.condition).code === condition.code,
  );

  if (Number(exactVariant?.price) > 0) {
    return {
      status: 'exact',
      identity,
      condition,
      selectedPrinting: selected.printing,
      printingSelectionReason: selected.reason,
      printingOptions,
      price: {
        amount: Number(exactVariant.price),
        currency: 'USD',
        method: 'exact-variant',
        confidence: 'high',
        source: 'JustTCG / TCGplayer',
        observedCondition: exactVariant.condition,
        observedPrinting: exactVariant.printing,
        variantId: exactVariant.id || null,
        tcgplayerSkuId: exactVariant.tcgplayerSkuId ? String(exactVariant.tcgplayerSkuId) : null,
        lastUpdated: exactVariant.lastUpdated || null,
        estimateRange: null,
      },
    };
  }

  const pricedFallbacks = matchingVariants.filter((variant) => Number(variant?.price) > 0);
  const preferredFallback =
    pricedFallbacks.find((variant) => normalizeCondition(variant?.condition).code === 'NM') ||
    pricedFallbacks.sort((left, right) => {
      const leftDistance = Math.abs(
        CONDITION_DEFINITIONS[normalizeCondition(left.condition).code].multiplier - condition.multiplier,
      );
      const rightDistance = Math.abs(
        CONDITION_DEFINITIONS[normalizeCondition(right.condition).code].multiplier - condition.multiplier,
      );
      return leftDistance - rightDistance;
    })[0];

  if (!preferredFallback) {
    return {
      status: 'unavailable',
      identity,
      condition,
      selectedPrinting: selected.printing,
      printingSelectionReason: selected.reason,
      printingOptions,
      price: null,
    };
  }

  const observedCondition = normalizeCondition(preferredFallback.condition);
  const estimate = Number(preferredFallback.price) * (condition.multiplier / observedCondition.multiplier);
  const roundedEstimate = Math.round(estimate * 100) / 100;

  return {
    status: 'estimated',
    identity,
    condition,
    selectedPrinting: selected.printing,
    printingSelectionReason: selected.reason,
    printingOptions,
    price: {
      amount: roundedEstimate,
      currency: 'USD',
      method: 'condition-adjusted-variant',
      confidence: 'low',
      source: 'JustTCG / TCGplayer',
      observedCondition: preferredFallback.condition,
      observedPrinting: preferredFallback.printing,
      variantId: preferredFallback.id || null,
      tcgplayerSkuId: preferredFallback.tcgplayerSkuId
        ? String(preferredFallback.tcgplayerSkuId)
        : null,
      lastUpdated: preferredFallback.lastUpdated || null,
      estimateRange: {
        low: Math.round(roundedEstimate * 0.8 * 100) / 100,
        high: Math.round(roundedEstimate * 1.2 * 100) / 100,
      },
    },
  };
}

function scoreCardIdentity(card, requested = {}) {
  const requestedTcgplayerId = String(requested.tcgplayerId || '');
  if (requestedTcgplayerId && String(card?.tcgplayerId || '') === requestedTcgplayerId) return 1000;

  let score = 0;
  const requestedName = normalizeText(requested.name);
  const cardName = normalizeText(card?.name);
  if (requestedName && cardName) {
    if (requestedName === cardName) score += 140;
    else if (requestedName.includes(cardName) || cardName.includes(requestedName)) score += 100;
  }

  const requestedNumber = normalizeCardNumber(requested.number);
  const cardNumber = normalizeCardNumber(card?.number);
  if (requestedNumber && cardNumber && requestedNumber === cardNumber) score += 100;

  const requestedSet = normalizeText(requested.set);
  const cardSet = normalizeText(card?.set_name || card?.set);
  if (requestedSet && cardSet) {
    if (requestedSet === cardSet) score += 80;
    else if (requestedSet.includes(cardSet) || cardSet.includes(requestedSet)) score += 60;
    else {
      const requestedTokens = new Set(requestedSet.split(' ').filter((token) => token.length > 2));
      const overlap = cardSet.split(' ').filter((token) => requestedTokens.has(token)).length;
      score += Math.min(overlap * 15, 45);
    }
  }

  if (normalizeText(requested.rarity) === normalizeText(card?.rarity)) score += 20;
  return score;
}

function selectBestCard(cards, requested = {}) {
  const ranked = (cards || [])
    .map((card) => ({ card, score: scoreCardIdentity(card, requested) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 180) return null;
  return { ...best, confidence: best.score >= 1000 ? 'exact-provider-id' : 'matched-identity' };
}

async function fetchConditionAwarePrice(requested, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error('JustTCG API key is not configured.');
  const params = new URLSearchParams({ game: 'pokemon', limit: '20' });
  if (requested.tcgplayerId) params.set('tcgplayerId', String(requested.tcgplayerId));
  else params.set('q', [requested.name, requested.number].filter(Boolean).join(' '));

  const response = await fetchImpl(`${JUSTTCG_API_URL}/cards?${params.toString()}`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!response.ok) throw new Error(`JustTCG returned HTTP ${response.status}.`);

  const payload = await response.json();
  const selected = selectBestCard(payload?.data, requested);
  if (!selected) {
    return {
      status: 'identity-not-found',
      identity: null,
      identityConfidence: 'none',
      condition: normalizeCondition(requested.condition),
      selectedPrinting: null,
      printingOptions: [],
      price: null,
    };
  }

  return {
    ...resolveConditionAwarePrice(selected.card, requested),
    identityConfidence: selected.confidence,
  };
}

module.exports = {
  CONDITION_DEFINITIONS,
  fetchConditionAwarePrice,
  normalizeCardNumber,
  normalizeCondition,
  printingCategory,
  resolveConditionAwarePrice,
  scoreCardIdentity,
  selectBestCard,
};
