import { computeItemMetrics, convertCurrency, DEFAULT_CURRENCY, formatCurrency, SUPPORTED_CURRENCIES } from './cardHelpers';
import { CARD_LADDER_CURRENCIES } from './cardLadderCurrency';

const knownCurrencies = new Set([...SUPPORTED_CURRENCIES.map(({ code }) => code), ...Object.keys(CARD_LADDER_CURRENCIES)]);
const amount = value => (typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null;
const displayCurrency = preferences => preferences?.currency || DEFAULT_CURRENCY;

// Display conversion only: captured amounts and their source currencies remain
// untouched when the vendor changes either current display preference.
export function convertSyncAmount(value, sourceCurrency, targetCurrency = DEFAULT_CURRENCY) {
  const numeric = amount(value);
  if (numeric == null || !knownCurrencies.has(sourceCurrency) || !knownCurrencies.has(targetCurrency)) return null;
  const converted = convertCurrency(numeric, targetCurrency, sourceCurrency);
  return Number.isFinite(converted) ? converted : null;
}

function formatted(primary, secondary, currency, secondaryCurrency) {
  if (primary == null) return '—';
  const first = formatCurrency(primary, currency);
  return secondary == null || !secondaryCurrency || secondaryCurrency === currency
    ? first : `${first} (${formatCurrency(secondary, secondaryCurrency)})`;
}

export function formatSyncMoney(value, sourceCurrency, preferences = {}) {
  const currency = displayCurrency(preferences);
  const secondaryCurrency = preferences?.secondaryCurrency;
  return formatted(convertSyncAmount(value, sourceCurrency, currency),
    secondaryCurrency && secondaryCurrency !== currency ? convertSyncAmount(value, sourceCurrency, secondaryCurrency) : null,
    currency, secondaryCurrency);
}

// This follows the actual inventory sticker, including its manual override
// priority and legacy currency defaults. Only the primary sticker is rounded
// up; the secondary amount keeps the unrounded inventory value.
export function formatSyncStickerPrice(item, preferences = {}) {
  if (!item || typeof item !== 'object') return '—';
  const currency = displayCurrency(preferences);
  if (!knownCurrencies.has(currency)) return '—';
  const value = amount(computeItemMetrics(item, currency).suggested);
  if (value == null) return '—';
  const secondaryCurrency = preferences?.secondaryCurrency;
  const override = amount(item.overridePrice);
  const secondary = secondaryCurrency && secondaryCurrency !== currency
    ? override != null
      ? convertSyncAmount(override, item.overridePriceCurrency || currency, secondaryCurrency)
      : convertSyncAmount(value, currency, secondaryCurrency)
    : null;
  return formatted(preferences?.roundUpPrices ? Math.ceil(value) : value, secondary, currency, secondaryCurrency);
}
