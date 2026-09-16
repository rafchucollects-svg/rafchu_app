import { expect, it } from 'vitest';
import { computeItemMetrics, convertCurrency, formatCurrency, SUPPORTED_CURRENCIES } from './cardHelpers';
import { CARD_LADDER_CURRENCIES } from './cardLadderCurrency';
import { convertSyncAmount, formatSyncMoney, formatSyncStickerPrice } from './syncCurrency';

it('converts captured EUR prices into current primary and secondary display currencies', () => {
  const amount = 150;
  const preferences = { currency: 'GBP', secondaryCurrency: 'USD' };
  expect(formatSyncMoney(amount, 'EUR', preferences)).toBe(`${formatCurrency(convertCurrency(amount, 'GBP', 'EUR'), 'GBP')} (${formatCurrency(convertCurrency(amount, 'USD', 'EUR'), 'USD')})`);
});

it('updates presentation when vendor preferences change without changing captured evidence', () => {
  const captured = Object.freeze({ price: 120, currency: 'USD' });
  expect(formatSyncMoney(captured.price, captured.currency, { currency: 'EUR' })).toBe(formatCurrency(convertCurrency(120, 'EUR', 'USD'), 'EUR'));
  expect(formatSyncMoney(captured.price, captured.currency, { currency: 'GBP', secondaryCurrency: 'EUR' })).toBe(`${formatCurrency(convertCurrency(120, 'GBP', 'USD'), 'GBP')} (${formatCurrency(convertCurrency(120, 'EUR', 'USD'), 'EUR')})`);
  expect(captured).toEqual({ price: 120, currency: 'USD' });
});

it('omits duplicate, absent, and unsupported secondary currencies', () => {
  for (const secondaryCurrency of [undefined, null, '', 'EUR', 'XYZ']) {
    expect(formatSyncMoney(100, 'EUR', { currency: 'EUR', secondaryCurrency })).toBe(formatCurrency(100, 'EUR'));
  }
});

it.each([null, undefined, NaN, Infinity, -Infinity, '', ' ', true, {}])('keeps missing or invalid money distinct from zero: %s', value => {
  expect(convertSyncAmount(value, 'EUR', 'USD')).toBeNull();
  expect(formatSyncMoney(value, 'EUR', { currency: 'USD', secondaryCurrency: 'GBP' })).toBe('—');
});

it('supports zero, negative changes, numeric persisted values, and rejects unknown conversion currencies', () => {
  expect(convertSyncAmount(0, 'EUR', 'USD')).toBe(0);
  expect(formatSyncMoney(-12, 'EUR', { currency: 'EUR' })).toBe(formatCurrency(-12, 'EUR'));
  expect(convertSyncAmount('12.50', 'EUR', 'EUR')).toBe(12.5);
  expect(convertSyncAmount(100, 'XYZ', 'EUR')).toBeNull();
  expect(convertSyncAmount(100, 'EUR', 'XYZ')).toBeNull();
});

it('uses the app’s existing rates for every supported capture and vendor currency', () => {
  for (const source of Object.keys(CARD_LADDER_CURRENCIES)) for (const { code: target } of SUPPORTED_CURRENCIES) {
    expect(convertSyncAmount(100, source, target)).toBe(convertCurrency(100, target, source));
  }
});

it('shows the actual overridden sticker instead of the graded market estimate', () => {
  const item = Object.freeze({ isGraded: true, gradedPrice: 120, gradedPriceCurrency: 'USD', overridePrice: 180, overridePriceCurrency: 'EUR' });
  expect(formatSyncStickerPrice(item, { currency: 'GBP', secondaryCurrency: 'EUR' })).toBe(`${formatCurrency(convertCurrency(180, 'GBP', 'EUR'), 'GBP')} (${formatCurrency(180, 'EUR')})`);
  expect(item.gradedPrice).toBe(120);
  expect(item.overridePrice).toBe(180);
});

it('matches the inventory’s primary-only rounding and keeps secondary values unrounded', () => {
  const item = { overridePrice: 10.01, overridePriceCurrency: 'EUR' };
  const preferences = { currency: 'EUR', secondaryCurrency: 'USD', roundUpPrices: true };
  expect(formatSyncStickerPrice(item, preferences)).toBe(`${formatCurrency(11, 'EUR')} (${formatCurrency(convertCurrency(10.01, 'USD', 'EUR'), 'USD')})`);
  expect(formatSyncMoney(10.01, 'EUR', preferences)).toBe(`${formatCurrency(10.01, 'EUR')} (${formatCurrency(convertCurrency(10.01, 'USD', 'EUR'), 'USD')})`);
});

it.each([
  { isGraded: true, gradedPrice: 100 },
  { isGraded: true, gradedPrice: 100, gradedPriceCurrency: 'GBP' },
  { manualPrice: 50, manualPriceCurrency: 'EUR' },
  { manualPrice: 50 },
  { overridePrice: 0 },
  { overridePrice: 17.5 },
  {},
])('uses the existing inventory valuation and currency defaults for %j', item => {
  const expected = computeItemMetrics(item, 'SEK').suggested;
  expect(formatSyncStickerPrice(item, { currency: 'SEK' })).toBe(formatCurrency(expected, 'SEK'));
});

it('does not present an unlinked item or an invalid sticker as zero', () => {
  expect(formatSyncStickerPrice(null, { currency: 'EUR' })).toBe('—');
  expect(formatSyncStickerPrice({ isGraded: true, gradedPrice: Infinity }, { currency: 'EUR' })).toBe('—');
});
