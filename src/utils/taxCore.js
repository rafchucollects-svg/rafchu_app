/**
 * Tax reporting helpers for Finnish margin tax scheme (Marginaaliverotus)
 * Handles ECB exchange rates, margin tax calculation, COGS, and report exports.
 */



// Finnish VAT rate (25.5% as of 2025)
export const FINLAND_VAT_RATE = 0.255;

// ECB reference rates. Frankfurter serves the official ECB daily reference
// rates for free, with per-date historical lookups (unlike the previous
// "latest only" exchangerate-api call). Finnish margin/VAT reporting expects
// the ECB rate on the transaction date, so pass a YYYY-MM-DD dateStr.
let ecbRateCache = {};
let ecbCacheDate = null;

const STATIC_RATE_FALLBACK = {
  EUR: 1,
  USD: 1.08,
  JPY: 162.0,
  GBP: 0.86,
  SEK: 11.2,
  NOK: 11.5,
  DKK: 7.46,
  CHF: 0.97,
};

/**
 * Fetch ECB daily reference rates for a given date (or latest). Returns rates
 * relative to EUR (1 EUR = X foreign). Falls back to cache, then a static table.
 * @param {string} [dateStr] YYYY-MM-DD. Omit for the latest rates.
 */
export async function fetchECBRates(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const requested = dateStr || today;
  // Frankfurter only serves closed (past) dates; today/future -> "latest".
  const endpointDate = requested >= today ? "latest" : requested;

  if (ecbCacheDate === endpointDate && Object.keys(ecbRateCache).length > 0) {
    return ecbRateCache;
  }

  // 1) ECB reference rates on the requested date (Frankfurter, no API key).
  try {
    const res = await fetch(`https://api.frankfurter.app/${endpointDate}?from=EUR`);
    if (res.ok) {
      const data = await res.json();
      if (data?.rates) {
        ecbRateCache = { EUR: 1, ...data.rates };
        ecbCacheDate = endpointDate;
        return ecbRateCache;
      }
    }
  } catch (err) {
    console.warn("Frankfurter ECB rates unavailable, trying fallback:", err);
  }

  // 2) Fallback: latest rates only (not date-specific).
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/EUR`);
    const data = await res.json();
    if (data?.rates) {
      ecbRateCache = { EUR: 1, ...data.rates };
      ecbCacheDate = endpointDate;
      return ecbRateCache;
    }
  } catch (err) {
    console.warn("Failed to fetch fallback FX rates, using static table:", err);
  }

  if (Object.keys(ecbRateCache).length > 0) return ecbRateCache;
  return { ...STATIC_RATE_FALLBACK };
}

/**
 * Convert an amount to EUR using ECB rates.
 * @returns {{ amountEUR: number, rate: number|null, reliable: boolean }}
 *   `reliable` is false when no rate was available for the currency — callers
 *   must not treat such an amount as a trustworthy EUR figure.
 */
export function convertToEUR(amount, fromCurrency, rates) {
  const numeric = parseFloat(amount) || 0;
  if (!amount || fromCurrency === "EUR") {
    return { amountEUR: numeric, rate: 1, reliable: true };
  }
  const rate = rates?.[fromCurrency];
  if (!rate || rate === 0) {
    // No rate available. Surface the raw amount but flag it so nothing silently
    // treats foreign money as EUR at 1:1 (the previous behaviour).
    console.warn(`No FX rate for ${fromCurrency}; EUR conversion is unreliable.`);
    return { amountEUR: numeric, rate: null, reliable: false };
  }
  return { amountEUR: numeric / rate, rate, reliable: true };
}

/**
 * Return a tax-report-only EUR view of a transaction. Raw Firestore values are
 * retained under `taxAccounting.sourceCurrency`; monetary fields on the clone
 * are converted so existing margin/COGS/P&L calculations cannot accidentally
 * label a USD/GBP amount as EUR. Missing FX fails closed to zero and is flagged.
 */
export function convertTransactionForTaxEUR(transaction, rates) {
  const sourceCurrency = transaction?.currency || "EUR";
  const conversion = convertToEUR(1, sourceCurrency, rates);
  const reliable = conversion.reliable;
  const toEur = (value) => {
    if (value == null || value === "") return value;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    if (!reliable) return 0;
    return numeric * conversion.amountEUR;
  };
  const convertConsignment = (consignment) => consignment ? {
    ...consignment,
    consignorPayoutPerUnit: toEur(consignment.consignorPayoutPerUnit),
    vendorCommissionPerUnit: toEur(consignment.vendorCommissionPerUnit),
    consignorPayoutTotal: toEur(consignment.consignorPayoutTotal),
    vendorCommissionTotal: toEur(consignment.vendorCommissionTotal),
  } : consignment;
  const convertLine = (item) => ({
    ...item,
    unitPrice: toEur(item.unitPrice),
    totalPrice: toEur(item.totalPrice),
    marketValue: toEur(item.marketValue),
    marketUnitPrice: toEur(item.marketUnitPrice),
    marketTotal: toEur(item.marketTotal),
    unitCost: toEur(item.unitCost),
    totalCost: toEur(item.totalCost),
    costBasis: toEur(item.costBasis),
    buyPrice: toEur(item.buyPrice),
    consignment: convertConsignment(item.consignment),
    currency: "EUR",
  });

  return {
    ...transaction,
    currency: "EUR",
    totalValue: toEur(transaction.totalValue),
    totalAmount: toEur(transaction.totalAmount),
    valueGained: toEur(transaction.valueGained),
    vendorTakeHome: toEur(transaction.vendorTakeHome),
    ownedRevenue: toEur(transaction.ownedRevenue),
    consignorPayoutTotal: toEur(transaction.consignorPayoutTotal),
    vendorCommissionTotal: toEur(transaction.vendorCommissionTotal),
    itemsIn: (transaction.itemsIn || []).map(convertLine),
    itemsOut: (transaction.itemsOut || transaction.cards || []).map(convertLine),
    taxAccounting: {
      currency: "EUR",
      sourceCurrency,
      rate: conversion.rate,
      reliable,
      convertedAt: Date.now(),
    },
  };
}

/**
 * Generate the next purchase diary ID.
 * Format: PUR-YYYY-NNN
 */
export function generatePurchaseId(existingEntries, year) {
  const y = year || new Date().getFullYear();
  const prefix = `PUR-${y}-`;
  let max = 0;
  (existingEntries || []).forEach((e) => {
    if (e.purchaseId?.startsWith(prefix)) {
      const num = parseInt(e.purchaseId.replace(prefix, ""), 10);
      if (num > max) max = num;
    }
  });
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}


export const FINLAND_MILEAGE_RATE = 0.55;
