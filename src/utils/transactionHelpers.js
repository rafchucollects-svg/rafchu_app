const FINLAND_STANDARD_VAT_RATE = 0.255;

export function createEmptyTransactionDetails(type = "transaction") {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return {
    transactionDate: now.toISOString().slice(0, 16),
    counterpartyName: "",
    counterpartyType: "unknown",
    counterpartyBusinessId: "",
    counterpartyVatId: "",
    counterpartyAddress: "",
    counterpartyCountry: "FI",
    paymentMethod: type === "trade" ? "trade" : "",
    paymentReference: "",
    documentNumber: "",
    documentUrl: "",
    channel: "",
    location: "",
    marginSchemeEligibility: "unreviewed",
    taxTreatment: "review_required",
    marginSchemeApplied: null,
  };
}

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const positiveQuantity = (value) => Math.max(1, asNumber(value) || 1);

const asTimestamp = (value) => {
  const numeric = asNumber(value);
  if (numeric > 0) return numeric;
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round((asNumber(value) + Number.EPSILON) * 1000000) / 1000000;

const hasDocumentReference = (entry) => Boolean(
  entry.documentNumber ||
  entry.receiptNumber ||
  entry.invoiceNumber ||
  entry.documentUrl ||
  entry.receiptUrl ||
  entry.documents?.number ||
  entry.documents?.urls?.length ||
  entry.receiptUrls?.length
);

/**
 * Allocate the actual consideration paid across purchase lines, while leaving
 * each line's market estimate intact. The last line absorbs rounding drift so
 * the allocated costs always reconcile to the transaction total.
 */
export function allocatePurchaseCosts(items, transactionTotal) {
  const lines = (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
  const total = Math.max(0, asNumber(transactionTotal));
  if (lines.length === 0) return lines;

  const weights = lines.map((item) => {
    const quantity = positiveQuantity(item.quantity);
    return Math.max(
      0,
      asNumber(item.marketTotal) ||
        asNumber(item.totalPrice) ||
        asNumber(item.marketValue) * quantity ||
        asNumber(item.unitPrice) * quantity,
    );
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const quantityTotal = lines.reduce((sum, item) => sum + positiveQuantity(item.quantity), 0);
  let allocated = 0;

  return lines.map((item, index) => {
    const quantity = positiveQuantity(item.quantity);
    const marketUnitPrice = asNumber(item.marketUnitPrice) || asNumber(item.unitPrice) || asNumber(item.marketValue);
    const marketTotal = asNumber(item.marketTotal) || asNumber(item.totalPrice) || marketUnitPrice * quantity;
    const lineCost = index === lines.length - 1
      ? roundMoney(total - allocated)
      : roundMoney(total * (weightTotal > 0 ? weights[index] / weightTotal : quantity / quantityTotal));
    allocated = roundMoney(allocated + lineCost);

    return {
      ...item,
      quantity,
      marketUnitPrice: roundMoney(marketUnitPrice),
      marketTotal: roundMoney(marketTotal),
      unitCost: roundMoney(lineCost / quantity),
      totalCost: lineCost,
      costAllocationMethod: weightTotal > 0 ? "pro_rata_market_value" : "pro_rata_quantity",
    };
  });
}

function normalizeLine(item, index, direction, currency) {
  const quantity = positiveQuantity(item.quantity);
  const unitPrice = asNumber(item.unitPrice);
  const totalPrice = asNumber(item.totalPrice) || unitPrice * quantity;
  return {
    ...item,
    lineId: item.lineId || `${direction}-${String(index + 1).padStart(3, "0")}`,
    quantity,
    unitPrice: roundMoney(unitPrice),
    totalPrice: roundMoney(totalPrice),
    currency: item.currency || currency,
    inventoryEntryId: item.inventoryEntryId || item.entryId || null,
  };
}

export function assessTaxRecordCompleteness(transaction) {
  const missing = [];
  const type = transaction.type;
  const incoming = transaction.itemsIn || [];
  const outgoing = transaction.itemsOut || [];

  if (!transaction.ts) missing.push("transactionDate");
  if (!transaction.currency) missing.push("currency");
  if (!transaction.counterparty?.name) missing.push("counterparty.name");
  if (!transaction.payment?.method && type !== "trade") missing.push("payment.method");
  if (!hasDocumentReference(transaction)) missing.push("sourceDocument");
  if ((type === "buy" || type === "trade") && (
    !transaction.tax?.marginSchemeEligibility || transaction.tax.marginSchemeEligibility === "unreviewed"
  )) {
    missing.push("tax.marginSchemeEligibility");
  }
  if ((type === "sale" || type === "sell") && transaction.tax?.treatment === "review_required") {
    missing.push("tax.treatment");
  }
  if ((type === "buy" || type === "trade") && incoming.length === 0) missing.push("itemsIn");
  if ((type === "sale" || type === "sell" || type === "trade") && outgoing.length === 0) missing.push("itemsOut");
  if (type === "buy" && incoming.some((item) => asNumber(item.totalCost) <= 0)) {
    missing.push("itemsIn.totalCost");
  }
  if ((type === "sale" || type === "sell") && outgoing.some((item) => asNumber(item.totalPrice) <= 0)) {
    missing.push("itemsOut.totalPrice");
  }
  if ((type === "sale" || type === "sell") && outgoing.some(
    (item) => item.consignment?.isConsigned !== true && item.costBasis == null && item.buyPrice == null,
  )) {
    missing.push("itemsOut.costBasis");
  }

  return {
    status: missing.length === 0 ? "complete" : "needs_review",
    missingFields: [...new Set(missing)],
    assessedAt: transaction.updatedAt || transaction.ts,
  };
}

/**
 * Normalize every app transaction into a backwards-compatible v2 record.
 * The legacy top-level fields remain available to existing screens, while the
 * nested sections retain the evidence needed for bookkeeping and tax review.
 */
export function buildTaxReadyTransaction(entry = {}, { uid = null, now = Date.now(), id = "" } = {}) {
  const type = entry.type || "unknown";
  const ts = asTimestamp(entry.ts) || asTimestamp(entry.occurredAt) || asTimestamp(entry.transactionDate) || now;
  const currency = entry.currency || "EUR";
  const gross = asNumber(entry.totalValue ?? entry.totalAmount);
  const originalCurrency = entry.originalCurrency || entry.inputCurrency || currency;
  const originalGross = entry.originalTotal != null
    ? asNumber(entry.originalTotal)
    : originalCurrency === currency
      ? gross
      : null;
  const rawIncoming = (entry.itemsIn || []).map((item, index) => normalizeLine(item, index, "in", currency));
  let itemsIn = type === "buy" ? allocatePurchaseCosts(rawIncoming, gross) : rawIncoming;
  if (type === "buy" && originalGross != null) {
    const originalAllocations = allocatePurchaseCosts(rawIncoming, originalGross);
    itemsIn = itemsIn.map((item, index) => ({
      ...item,
      originalUnitCost: originalAllocations[index]?.unitCost ?? null,
      originalTotalCost: originalAllocations[index]?.totalCost ?? null,
      originalCostCurrency: originalCurrency,
    }));
  }
  const itemsOut = (entry.itemsOut || entry.cards || []).map((item, index) => normalizeLine(item, index, "out", currency));
  const fxRate = entry.fxRateToPrimary || (
    originalGross != null && originalGross !== 0 ? gross / originalGross : 1
  );
  const counterparty = {
    name: entry.counterparty?.name || entry.counterpartyName || entry.sellerName || entry.buyerName || "",
    type: entry.counterparty?.type || entry.counterpartyType || "unknown",
    businessId: entry.counterparty?.businessId || entry.counterpartyBusinessId || "",
    vatId: entry.counterparty?.vatId || entry.counterpartyVatId || "",
    address: entry.counterparty?.address || entry.counterpartyAddress || "",
    country: entry.counterparty?.country || entry.counterpartyCountry || "",
  };
  const payment = {
    method: entry.payment?.method || entry.paymentMethod || (type === "trade" ? "trade" : ""),
    reference: entry.payment?.reference || entry.paymentReference || "",
    status: entry.payment?.status || entry.paymentStatus || "completed",
    paidAt: entry.payment?.paidAt || entry.paidAt || ts,
  };
  const documentUrls = [
    ...(entry.documents?.urls || []),
    ...(entry.receiptUrls || []),
    entry.documentUrl,
    entry.receiptUrl,
  ].filter(Boolean);
  const documents = {
    number: entry.documents?.number || entry.documentNumber || entry.receiptNumber || entry.invoiceNumber || "",
    invoiceNumber: entry.documents?.invoiceNumber || entry.invoiceNumber || "",
    receiptNumber: entry.documents?.receiptNumber || entry.receiptNumber || "",
    urls: [...new Set(documentUrls)],
  };
  const marginSchemeEligibility = entry.tax?.marginSchemeEligibility || entry.marginSchemeEligibility || "unreviewed";
  const taxTreatment = entry.tax?.treatment || entry.taxTreatment || "review_required";
  const marginSchemeApplied = entry.tax?.marginSchemeApplied ?? entry.marginSchemeApplied ?? (
    taxTreatment === "margin_scheme_second_hand" ? true : null
  );
  const tax = {
    jurisdiction: "FI",
    accountingCurrency: "EUR",
    standardVatRate: FINLAND_STANDARD_VAT_RATE,
    treatment: taxTreatment,
    marginSchemeEligibility,
    marginSchemeApplied,
    invoicePhrase: marginSchemeApplied === true ? "Margin scheme – Second-hand goods" : "",
  };
  const internalVoucherId = entry.internalVoucherId || `TX-${new Date(ts).getUTCFullYear()}-${String(id || ts).slice(-10).toUpperCase()}`;
  const totals = {
    gross: roundMoney(gross),
    fees: roundMoney(entry.fees?.total ?? entry.feesTotal),
    shipping: roundMoney(entry.fees?.shipping ?? entry.shippingAmount),
    net: roundMoney(entry.netValue ?? gross - asNumber(entry.fees?.total ?? entry.feesTotal)),
    currency,
    originalGross: originalGross == null ? null : roundMoney(originalGross),
    originalCurrency,
    fxRateToTransactionCurrency: roundMoney(fxRate),
    fxCapturedAt: entry.fxCapturedAt || ts,
    fxSource: entry.fxSource || (originalCurrency === currency ? "same_currency" : "app_rate_at_transaction"),
  };
  const cash = asNumber(entry.cashOriginalAmount ?? entry.cashAmount) > 0
    ? {
        amount: roundMoney(entry.cashAmount),
        currency: entry.cashCurrency || currency,
        originalAmount: roundMoney(entry.cashOriginalAmount ?? entry.cashAmount),
        originalCurrency: entry.cashOriginalCurrency || entry.cashCurrency || currency,
        direction: entry.cashDirection || "",
        fxRateToTransactionCurrency: roundMoney(entry.cashFxRateToPrimary || 1),
        fxCapturedAt: entry.cashFxCapturedAt || ts,
      }
    : null;

  const transaction = {
    ...entry,
    schemaVersion: 2,
    internalVoucherId,
    ts,
    occurredAt: ts,
    createdAt: entry.createdAt || now,
    updatedAt: now,
    currency,
    itemsIn,
    itemsOut,
    counterparty,
    payment,
    documents,
    channel: entry.channel || "",
    location: entry.location || "",
    totals,
    cash,
    tax,
    audit: {
      source: entry.audit?.source || entry.source || "rafchu_app",
      createdBy: entry.audit?.createdBy || uid,
      schema: "rafchu.transaction.v2",
    },
  };
  transaction.taxRecord = assessTaxRecordCompleteness(transaction);
  return transaction;
}
