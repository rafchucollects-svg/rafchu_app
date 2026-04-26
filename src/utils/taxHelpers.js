/**
 * Tax reporting helpers for Finnish margin tax scheme (Marginaaliverotus)
 * Handles ECB exchange rates, margin tax calculation, COGS, and report exports.
 */

import { formatCurrency } from "./cardHelpers";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Finnish VAT rate (25.5% as of 2025)
export const FINLAND_VAT_RATE = 0.255;

// ECB exchange rate API
const ECB_API_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY+GBP+SEK+NOK+DKK+CHF.EUR.SP00.A";

let ecbRateCache = {};
let ecbCacheDate = null;

/**
 * Fetch ECB daily reference rates. Returns rates relative to EUR (1 EUR = X foreign).
 * Falls back to cached values if the API is unreachable.
 */
export async function fetchECBRates(dateStr) {
  const today = dateStr || new Date().toISOString().slice(0, 10);

  if (ecbCacheDate === today && Object.keys(ecbRateCache).length > 0) {
    return ecbRateCache;
  }

  try {
    const res = await fetch(
      `https://api.exchangerate-api.com/v4/latest/EUR`
    );
    const data = await res.json();
    if (data?.rates) {
      ecbRateCache = { EUR: 1, ...data.rates };
      ecbCacheDate = today;
      return ecbRateCache;
    }
  } catch (err) {
    console.warn("Failed to fetch ECB rates, using fallback:", err);
  }

  if (Object.keys(ecbRateCache).length > 0) return ecbRateCache;

  return {
    EUR: 1,
    USD: 1.08,
    JPY: 162.0,
    GBP: 0.86,
    SEK: 11.2,
    NOK: 11.5,
    DKK: 7.46,
    CHF: 0.97,
  };
}

/**
 * Convert an amount to EUR using ECB rates.
 * @returns {{ amountEUR: number, rate: number }}
 */
export function convertToEUR(amount, fromCurrency, rates) {
  if (!amount || fromCurrency === "EUR") {
    return { amountEUR: parseFloat(amount) || 0, rate: 1 };
  }
  const rate = rates?.[fromCurrency];
  if (!rate || rate === 0) {
    return { amountEUR: parseFloat(amount) || 0, rate: 1 };
  }
  return {
    amountEUR: parseFloat(amount) / rate,
    rate,
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

// =============================
// Margin Tax Calculation
// =============================

/**
 * Calculate margin tax for a period.
 * Margin scheme: (Total Sales - Total Purchases of sold items) = Gross Margin
 * VAT payable: Gross Margin / (1 + VAT_RATE) * VAT_RATE
 *
 * @param {Array} sales - sale transactions in the period
 * @param {Array} purchases - purchase entries linked to sold items
 * @returns {{ totalSales, totalPurchases, grossMargin, vatPayable, netMargin }}
 */
export function calculateMarginTax(totalSales, totalPurchaseCost) {
  const grossMargin = Math.max(0, totalSales - totalPurchaseCost);
  const vatPayable = (grossMargin / (1 + FINLAND_VAT_RATE)) * FINLAND_VAT_RATE;
  const netMargin = grossMargin - vatPayable;

  return {
    totalSales,
    totalPurchaseCost,
    grossMargin,
    vatPayable: Math.round(vatPayable * 100) / 100,
    netMargin: Math.round(netMargin * 100) / 100,
  };
}

/**
 * Calculate standard VAT on a sale amount (for new goods — not used in current config but kept for future).
 */
export function calculateStandardVAT(saleAmount) {
  const vatAmount = (saleAmount / (1 + FINLAND_VAT_RATE)) * FINLAND_VAT_RATE;
  return Math.round(vatAmount * 100) / 100;
}

// =============================
// Inventory Valuation Helpers
// =============================

/**
 * Evaluate inventory for year-end valuation.
 * Flags items where current market price < acquisition cost (write-down candidates).
 */
export function evaluateInventoryForTax(items, computeItemMetrics, userCurrency) {
  return (items || []).map((item) => {
    const metrics = computeItemMetrics(item, userCurrency);
    const qty = Number(item.quantity) || 1;
    const acquisitionCost = getAcquisitionCost(item);
    const currentMarketPrice = metrics.cmLowest || metrics.suggested || 0;
    const writeDown = currentMarketPrice < acquisitionCost && acquisitionCost > 0;

    return {
      ...item,
      acquisitionCost,
      currentMarketPrice,
      totalAcquisitionCost: acquisitionCost * qty,
      totalMarketValue: currentMarketPrice * qty,
      writeDown,
      writeDownAmount: writeDown ? (acquisitionCost - currentMarketPrice) * qty : 0,
    };
  });
}

/**
 * Determine the acquisition cost for an item.
 * Priority: explicit buyPrice > overridePrice > 80% of market price at time of addition.
 */
export function getAcquisitionCost(item) {
  if (item.buyPrice != null && !isNaN(parseFloat(item.buyPrice))) {
    return parseFloat(item.buyPrice);
  }
  if (item.overridePrice != null && !isNaN(parseFloat(item.overridePrice))) {
    return parseFloat(item.overridePrice);
  }
  if (item.manualPrice != null && !isNaN(parseFloat(item.manualPrice))) {
    return parseFloat(item.manualPrice) * 0.8;
  }
  const suggested = item.calculatedSuggestedPrice || 0;
  if (suggested > 0) return suggested * 0.8;
  return 0;
}

// =============================
// COGS (Cost of Goods Sold)
// =============================

/**
 * Calculate COGS for sold items in a period.
 * Uses FIFO logic: earliest purchased items are considered sold first.
 */
export function calculateCOGS(salesInPeriod) {
  let totalCOGS = 0;
  const details = [];

  (salesInPeriod || []).forEach((sale) => {
    const items = sale.itemsOut || sale.cards || [];
    items.forEach((card) => {
      const qty = Number(card.quantity) || 1;
      const costBasis = card.costBasis || card.unitPrice * 0.8 || 0;
      const salePrice = card.unitPrice || 0;
      const itemCOGS = costBasis * qty;
      totalCOGS += itemCOGS;
      details.push({
        name: card.name,
        set: card.set,
        number: card.number,
        quantity: qty,
        costBasis,
        salePrice,
        cogs: itemCOGS,
        profit: (salePrice - costBasis) * qty,
        saleDate: sale.ts,
        transactionId: sale.id,
      });
    });
  });

  return { totalCOGS, details };
}

// =============================
// Quarter/Period Helpers
// =============================

/**
 * Get quarter boundaries for a fiscal year.
 * @param {number} year
 * @param {number} quarter - 1-4
 * @param {number} fiscalYearStartMonth - 1-12 (1 = January)
 */
export function getQuarterRange(year, quarter, fiscalYearStartMonth = 1) {
  const offset = fiscalYearStartMonth - 1;
  const startMonth = offset + (quarter - 1) * 3;
  const startYear = year + Math.floor(startMonth / 12);
  const normalizedStartMonth = startMonth % 12;

  const endMonth = normalizedStartMonth + 3;
  const endYear = startYear + Math.floor(endMonth / 12);
  const normalizedEndMonth = endMonth % 12;

  const start = new Date(startYear, normalizedStartMonth, 1);
  const end = new Date(endYear, normalizedEndMonth, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Get month boundaries for a fiscal year.
 * @param {number} year
 * @param {number} month - 1-12
 * @param {number} fiscalYearStartMonth - 1-12 (1 = January)
 */
export function getMonthRange(year, month, fiscalYearStartMonth = 1) {
  const offset = fiscalYearStartMonth - 1;
  const actualMonth = offset + (month - 1);
  const actualYear = year + Math.floor(actualMonth / 12);
  const normalizedMonth = actualMonth % 12;

  const start = new Date(actualYear, normalizedMonth, 1);
  const endMonth = normalizedMonth + 1;
  const endYear = actualYear + Math.floor(endMonth / 12);
  const end = new Date(endYear, endMonth % 12, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Get annual (full fiscal year) boundaries.
 */
export function getAnnualRange(year, fiscalYearStartMonth = 1) {
  const q1 = getQuarterRange(year, 1, fiscalYearStartMonth);
  const q4 = getQuarterRange(year, 4, fiscalYearStartMonth);
  return { start: q1.start, end: q4.end };
}

/**
 * Determine which quarter a date falls in.
 */
export function getQuarterForDate(date, fiscalYearStartMonth = 1) {
  const d = new Date(date);
  const month = d.getMonth(); // 0-based
  const offset = fiscalYearStartMonth - 1;
  const adjustedMonth = (month - offset + 12) % 12;
  return Math.floor(adjustedMonth / 3) + 1;
}

/**
 * Get fiscal year for a date.
 */
export function getFiscalYear(date, fiscalYearStartMonth = 1) {
  const d = new Date(date);
  if (fiscalYearStartMonth === 1) return d.getFullYear();
  return d.getMonth() < fiscalYearStartMonth - 1
    ? d.getFullYear() - 1
    : d.getFullYear();
}

// =============================
// Export Helpers (CSV + PDF-ready)
// =============================

function escapeCsvCell(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Export Purchase Diary as CSV.
 */
export function exportPurchaseDiaryCSV(entries, filename) {
  const headers = [
    "ID",
    "Date",
    "Location/Event",
    "Seller",
    "Item Name",
    "Set",
    "Condition",
    "Quantity",
    "Purchase Price (EUR)",
    "Original Currency",
    "Original Amount",
    "Exchange Rate",
    "Payment Method",
    "Notes",
  ];

  const rows = (entries || []).map((e) => [
    e.purchaseId,
    e.date ? new Date(e.date).toLocaleDateString("fi-FI") : "",
    e.location || "",
    e.sellerName || "",
    e.itemName || "",
    e.set || "",
    e.condition || "",
    e.quantity || 1,
    e.priceEUR?.toFixed(2) || "",
    e.originalCurrency || "EUR",
    e.originalAmount?.toFixed(2) || "",
    e.exchangeRate?.toFixed(4) || "",
    e.paymentMethod || "",
    e.notes || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    filename || "purchase_diary.csv"
  );
}

/**
 * Export Margin Tax Report as CSV.
 */
export function exportMarginTaxCSV(report, period, filename) {
  const lines = [
    ["Margin Tax Report (Marginaaliverolaskelma)"],
    [`Period: ${period}`],
    [],
    ["Metric", "Amount (EUR)"],
    ["Total Sales", report.totalSales?.toFixed(2)],
    ["Total Purchase Cost", report.totalPurchaseCost?.toFixed(2)],
    ["Gross Margin", report.grossMargin?.toFixed(2)],
    [`VAT Rate`, `${(FINLAND_VAT_RATE * 100).toFixed(1)}%`],
    ["VAT Payable", report.vatPayable?.toFixed(2)],
    ["Net Margin", report.netMargin?.toFixed(2)],
  ];

  const csv = lines.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    filename || "margin_tax_report.csv"
  );
}

/**
 * Export Inventory Valuation as CSV.
 */
export function exportInventoryValuationCSV(items, filename) {
  const headers = [
    "Name",
    "Set",
    "Number",
    "Condition",
    "Quantity",
    "Acquisition Cost (EUR)",
    "Current Market Price (EUR)",
    "Total Acquisition Cost",
    "Total Market Value",
    "Write-Down",
    "Write-Down Amount",
  ];

  const rows = (items || []).map((item) => [
    item.name || "",
    item.set || "",
    item.number || "",
    item.condition || "NM",
    item.quantity || 1,
    item.acquisitionCost?.toFixed(2) || "0.00",
    item.currentMarketPrice?.toFixed(2) || "0.00",
    item.totalAcquisitionCost?.toFixed(2) || "0.00",
    item.totalMarketValue?.toFixed(2) || "0.00",
    item.writeDown ? "YES" : "no",
    item.writeDownAmount?.toFixed(2) || "0.00",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    filename || "inventory_valuation.csv"
  );
}

/**
 * Export Shareholder Loan Ledger as CSV.
 */
export function exportShareholderLedgerCSV(entries, filename) {
  const headers = [
    "Date",
    "Type",
    "Description",
    "Amount (EUR)",
    "Running Balance (EUR)",
  ];

  let balance = 0;
  const rows = (entries || [])
    .sort((a, b) => (a.date || 0) - (b.date || 0))
    .map((e) => {
      if (e.type === "credit" || e.type === "expense") {
        balance += e.amount || 0;
      } else if (e.type === "debit") {
        balance -= e.amount || 0;
      }
      return [
        e.date ? new Date(e.date).toLocaleDateString("fi-FI") : "",
        e.type || "",
        e.description || "",
        e.amount?.toFixed(2) || "0.00",
        balance.toFixed(2),
      ];
    });

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    filename || "shareholder_ledger.csv"
  );
}

// =============================
// PDF Export Helpers
// =============================

const PDF_COLORS = {
  primary: [34, 87, 122],
  headerBg: [34, 87, 122],
  headerText: [255, 255, 255],
  altRow: [245, 248, 250],
  text: [30, 30, 30],
  muted: [120, 120, 120],
  accent: [22, 163, 74],
  danger: [220, 38, 38],
};

function createPdfDoc(orientation = "portrait") {
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

function addPdfHeader(doc, title, subtitle, config) {
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text(title, 14, 20);

  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(subtitle, 14, 27);
  }

  if (config?.companyName) {
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.text);
    const rightX = pageW - 14;
    let y = 16;
    doc.text(config.companyName, rightX, y, { align: "right" });
    if (config.businessId) {
      y += 4.5;
      doc.text(`Y-tunnus: ${config.businessId}`, rightX, y, { align: "right" });
    }
    if (config.vatNumber) {
      y += 4.5;
      doc.text(`ALV: ${config.vatNumber}`, rightX, y, { align: "right" });
    }
  }

  doc.setDrawColor(...PDF_COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(14, 31, pageW - 14, 31);

  return 36;
}

function addPdfFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(
      `Generated ${new Date().toLocaleDateString("fi-FI")} ${new Date().toLocaleTimeString("fi-FI")} — Rafchu Tax Reporting`,
      14,
      pageH - 8
    );
    doc.text(`Page ${i} / ${pageCount}`, pageW - 14, pageH - 8, {
      align: "right",
    });
  }
}

/**
 * Export Purchase Diary as PDF.
 */
export function exportPurchaseDiaryPDF(entries, config, filename) {
  const doc = createPdfDoc("landscape");
  let y = addPdfHeader(doc, "Ostopäiväkirja — Purchase Diary", `${(entries || []).length} entries`, config);

  const headers = [["ID", "Date", "Location", "Seller", "Item", "Set", "Cond", "Qty", "EUR", "Orig", "Rate", "Payment"]];
  const rows = (entries || []).map((e) => [
    e.purchaseId || "",
    e.date ? new Date(e.date).toLocaleDateString("fi-FI") : "",
    e.location || "",
    e.sellerName || "",
    e.itemName || "",
    e.set || "",
    e.condition || "",
    String(e.quantity || 1),
    e.priceEUR?.toFixed(2) || "0.00",
    e.originalCurrency !== "EUR" ? `${e.originalAmount?.toFixed(2)} ${e.originalCurrency}` : "",
    e.exchangeRate && e.originalCurrency !== "EUR" ? e.exchangeRate.toFixed(4) : "",
    e.paymentMethod || "",
  ]);

  autoTable(doc, {
    startY: y,
    head: headers,
    body: rows,
    theme: "grid",
    headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontSize: 7, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: PDF_COLORS.text },
    alternateRowStyles: { fillColor: PDF_COLORS.altRow },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 1.5, overflow: "linebreak" },
  });

  const totalEUR = (entries || []).reduce((s, e) => s + (e.priceEUR || 0) * (e.quantity || 1), 0);
  const tableEnd = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(`Total Purchase Value: €${totalEUR.toFixed(2)}`, 14, tableEnd);

  addPdfFooter(doc);
  doc.save(filename || "purchase_diary.pdf");
}

/**
 * Export Margin Tax Report as PDF.
 */
export function exportMarginTaxPDF(report, period, salesList, config, filename) {
  const doc = createPdfDoc();
  let y = addPdfHeader(doc, "Marginaaliverolaskelma", `Margin Tax Report — ${period}`, config);

  // Summary box
  const boxW = 85;
  const boxH = 28;
  const pageW = doc.internal.pageSize.getWidth();

  const boxes = [
    { label: "Total Sales", value: `€${report.totalSales?.toFixed(2)}`, color: [219, 234, 254] },
    { label: "Purchase Cost", value: `€${report.totalPurchaseCost?.toFixed(2)}`, color: [254, 235, 200] },
  ];

  boxes.forEach((box, i) => {
    const x = 14 + i * (boxW + 6);
    doc.setFillColor(...box.color);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(box.label, x + 4, y + 8);
    doc.setFontSize(16);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(box.value, x + 4, y + 20);
  });

  y += boxH + 8;

  // Calculation breakdown
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("VAT Calculation", 14, y);
  y += 6;

  const calcRows = [
    ["Gross Margin (Sales − Purchases)", `€${report.grossMargin?.toFixed(2)}`],
    [`VAT Rate`, `${(FINLAND_VAT_RATE * 100).toFixed(1)}%`],
    ["Formula", `Margin ÷ ${(1 + FINLAND_VAT_RATE).toFixed(3)} × ${FINLAND_VAT_RATE}`],
    ["VAT Payable", `€${report.vatPayable?.toFixed(2)}`],
    ["Net Margin (after VAT)", `€${report.netMargin?.toFixed(2)}`],
  ];

  autoTable(doc, {
    startY: y,
    body: calcRows,
    theme: "plain",
    bodyStyles: { fontSize: 9, textColor: PDF_COLORS.text },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 100 },
      1: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 2.5 },
    didParseCell: (data) => {
      if (data.row.index === 3) {
        data.cell.styles.fillColor = [243, 232, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Sales list
  if (salesList && salesList.length > 0) {
    const salesY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLORS.primary);
    doc.text(`Sales in ${period} (${salesList.length})`, 14, salesY);

    autoTable(doc, {
      startY: salesY + 4,
      head: [["Date", "Description", "Amount (EUR)"]],
      body: salesList.map((tx) => [
        tx.ts ? new Date(tx.ts).toLocaleDateString("fi-FI") : "",
        tx.notes || "Sale",
        `€${(tx.totalValue || tx.totalAmount || 0).toFixed(2)}`,
      ]),
      theme: "grid",
      headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 8, textColor: PDF_COLORS.text },
      alternateRowStyles: { fillColor: PDF_COLORS.altRow },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 2 },
    });
  }

  addPdfFooter(doc);
  doc.save(filename || "margin_tax_report.pdf");
}

/**
 * Export Inventory Valuation as PDF.
 */
export function exportInventoryValuationPDF(items, config, filename) {
  const doc = createPdfDoc("landscape");
  const totalAcq = (items || []).reduce((s, i) => s + (i.totalAcquisitionCost || 0), 0);
  const totalMkt = (items || []).reduce((s, i) => s + (i.totalMarketValue || 0), 0);
  const totalWd = (items || []).reduce((s, i) => s + (i.writeDownAmount || 0), 0);
  const wdCount = (items || []).filter((i) => i.writeDown).length;

  let y = addPdfHeader(
    doc,
    "Varastolistaus — Inventory Valuation",
    `${(items || []).length} items · As of ${new Date().toLocaleDateString("fi-FI")}`,
    config
  );

  // Summary boxes
  const pageW = doc.internal.pageSize.getWidth();
  const bw = (pageW - 28 - 12) / 4;
  const summaryData = [
    { label: "Items", value: String((items || []).reduce((s, i) => s + (i.quantity || 1), 0)), bg: [219, 234, 254] },
    { label: "Acquisition Cost", value: `€${totalAcq.toFixed(2)}`, bg: [220, 252, 231] },
    { label: "Market Value", value: `€${totalMkt.toFixed(2)}`, bg: [243, 232, 255] },
    { label: `Write-Down (${wdCount})`, value: `€${totalWd.toFixed(2)}`, bg: [254, 226, 226] },
  ];

  summaryData.forEach((box, i) => {
    const x = 14 + i * (bw + 4);
    doc.setFillColor(...box.bg);
    doc.roundedRect(x, y, bw, 22, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(box.label, x + 3, y + 7);
    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(box.value, x + 3, y + 17);
  });
  y += 28;

  const headers = [["Name", "Set", "No.", "Cond", "Qty", "Acq. Cost", "Market", "Total Acq.", "Total Mkt", "Write-Down"]];
  const rows = (items || []).map((item) => [
    item.name || "",
    item.set || "",
    item.number || "",
    item.condition || "NM",
    String(item.quantity || 1),
    `€${(item.acquisitionCost || 0).toFixed(2)}`,
    `€${(item.currentMarketPrice || 0).toFixed(2)}`,
    `€${(item.totalAcquisitionCost || 0).toFixed(2)}`,
    `€${(item.totalMarketValue || 0).toFixed(2)}`,
    item.writeDown ? `€${(item.writeDownAmount || 0).toFixed(2)}` : "—",
  ]);

  autoTable(doc, {
    startY: y,
    head: headers,
    body: rows,
    theme: "grid",
    headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontSize: 7, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: PDF_COLORS.text },
    alternateRowStyles: { fillColor: PDF_COLORS.altRow },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 1.5, overflow: "linebreak" },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 9) {
        const val = data.cell.raw;
        if (val && val !== "—") {
          data.cell.styles.textColor = PDF_COLORS.danger;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  addPdfFooter(doc);
  doc.save(filename || "inventory_valuation.pdf");
}

/**
 * Export Shareholder Loan Ledger as PDF.
 */
export function exportShareholderLedgerPDF(entries, config, filename) {
  const doc = createPdfDoc();

  const sorted = [...(entries || [])].sort((a, b) => (a.date || 0) - (b.date || 0));
  let balance = 0;
  const totalCredits = sorted.filter((e) => e.type === "credit").reduce((s, e) => s + (e.amount || 0), 0);
  const totalDebits = sorted.filter((e) => e.type === "debit").reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenses = sorted.filter((e) => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);

  let y = addPdfHeader(doc, "Osakaslainasuhde — Shareholder Loan Ledger", `${sorted.length} entries`, config);

  // Summary
  const pageW = doc.internal.pageSize.getWidth();
  const bw = (pageW - 28 - 12) / 4;
  const finalBal = sorted.reduce((b, e) => {
    if (e.type === "credit" || e.type === "expense") return b + (e.amount || 0);
    if (e.type === "debit") return b - (e.amount || 0);
    return b;
  }, 0);

  const summaryData = [
    { label: "Credits", value: `€${totalCredits.toFixed(2)}`, bg: [220, 252, 231] },
    { label: "Debits", value: `€${totalDebits.toFixed(2)}`, bg: [254, 226, 226] },
    { label: "Expenses", value: `€${totalExpenses.toFixed(2)}`, bg: [254, 235, 200] },
    { label: "Balance", value: `€${finalBal.toFixed(2)}`, bg: finalBal >= 0 ? [219, 234, 254] : [254, 226, 226] },
  ];

  summaryData.forEach((box, i) => {
    const x = 14 + i * (bw + 4);
    doc.setFillColor(...box.bg);
    doc.roundedRect(x, y, bw, 22, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(box.label, x + 3, y + 7);
    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(box.value, x + 3, y + 17);
  });
  y += 28;

  balance = 0;
  const rows = sorted.map((e) => {
    if (e.type === "credit" || e.type === "expense") balance += e.amount || 0;
    else if (e.type === "debit") balance -= e.amount || 0;
    const sign = e.type === "debit" ? "−" : "+";
    return [
      e.date ? new Date(e.date).toLocaleDateString("fi-FI") : "",
      e.type === "credit" ? "Credit" : e.type === "debit" ? "Debit" : "Expense",
      e.category || "",
      e.description || "",
      `${sign}€${(e.amount || 0).toFixed(2)}`,
      `€${balance.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Date", "Type", "Category", "Description", "Amount", "Balance"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: PDF_COLORS.text },
    alternateRowStyles: { fillColor: PDF_COLORS.altRow },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 2, overflow: "linebreak" },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        const raw = data.cell.raw;
        const numVal = parseFloat(raw.replace("€", "").replace(",", ""));
        if (numVal < 0) {
          data.cell.styles.textColor = PDF_COLORS.danger;
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.section === "body" && data.column.index === 4) {
        const raw = data.cell.raw;
        if (raw.startsWith("−")) {
          data.cell.styles.textColor = PDF_COLORS.danger;
        } else {
          data.cell.styles.textColor = PDF_COLORS.accent;
        }
      }
    },
  });

  addPdfFooter(doc);
  doc.save(filename || "shareholder_ledger.pdf");
}

/**
 * Export COGS Report as PDF.
 */
export function exportCOGSReportPDF(details, totalRevenue, totalCOGS, year, config, filename) {
  const doc = createPdfDoc("landscape");
  const grossProfit = totalRevenue - totalCOGS;
  const profitTax = grossProfit > 0 ? grossProfit * 0.2 : 0;

  let y = addPdfHeader(doc, "Cost of Goods Sold (COGS)", `Fiscal Year ${year}`, config);

  // Summary boxes
  const pageW = doc.internal.pageSize.getWidth();
  const bw = (pageW - 28 - 12) / 4;
  const summaryData = [
    { label: "Revenue", value: `€${totalRevenue.toFixed(2)}`, bg: [219, 234, 254] },
    { label: "COGS", value: `€${totalCOGS.toFixed(2)}`, bg: [254, 235, 200] },
    { label: "Gross Profit", value: `€${grossProfit.toFixed(2)}`, bg: [220, 252, 231] },
    { label: "Est. Tax (20%)", value: `€${profitTax.toFixed(2)}`, bg: [243, 232, 255] },
  ];

  summaryData.forEach((box, i) => {
    const x = 14 + i * (bw + 4);
    doc.setFillColor(...box.bg);
    doc.roundedRect(x, y, bw, 22, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(box.label, x + 3, y + 7);
    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(box.value, x + 3, y + 17);
  });
  y += 28;

  if (details && details.length > 0) {
    const headers = [["Date", "Item", "Set", "Qty", "Cost Basis", "Sale Price", "Profit"]];
    const rows = details.map((d) => [
      d.saleDate ? new Date(d.saleDate).toLocaleDateString("fi-FI") : "",
      d.name || "",
      d.set ? `${d.set} #${d.number || ""}` : "",
      String(d.quantity || 1),
      `€${(d.costBasis || 0).toFixed(2)}`,
      `€${(d.salePrice || 0).toFixed(2)}`,
      `${d.profit >= 0 ? "+" : ""}€${(d.profit || 0).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: headers,
      body: rows,
      theme: "grid",
      headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fontSize: 7, textColor: PDF_COLORS.text },
      alternateRowStyles: { fillColor: PDF_COLORS.altRow },
      margin: { left: 14, right: 14 },
      styles: { cellPadding: 1.5, overflow: "linebreak" },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const raw = data.cell.raw;
          if (raw.startsWith("+")) data.cell.styles.textColor = PDF_COLORS.accent;
          else data.cell.styles.textColor = PDF_COLORS.danger;
        }
      },
    });
  }

  addPdfFooter(doc);
  doc.save(filename || "cogs_report.pdf");
}

// =============================
// P&L (Tuloslaskelma) Helpers
// =============================

export const FINLAND_CORPORATE_TAX_RATE = 0.20;
export const STOCK_PURCHASE_CATEGORY = "Inventory / Stock Purchase";

/**
 * Calculate a Vero-compliant P&L for a Finnish Oy.
 * "Inventory / Stock Purchase" expenses go into Materials (alongside COGS)
 * to avoid double-counting with Deal Calculator purchases.
 */
export function calculateProfitAndLoss(revenue, cogs, stockPurchaseExpenses, opexByCategory, otherRevenue = 0) {
  const totalRevenue = revenue + otherRevenue;
  const totalMaterials = cogs + stockPurchaseExpenses;
  const grossMargin = totalRevenue - totalMaterials;

  const totalOpex = Object.values(opexByCategory).reduce((s, v) => s + v, 0);
  const operatingProfit = grossMargin - totalOpex;
  const incomeTax = Math.max(0, operatingProfit) * FINLAND_CORPORATE_TAX_RATE;
  const netProfit = operatingProfit - incomeTax;

  return {
    revenue,
    otherRevenue,
    totalRevenue,
    cogs,
    stockPurchaseExpenses,
    totalMaterials,
    grossMargin,
    operatingExpensesByCategory: opexByCategory,
    totalOpex,
    operatingProfit,
    incomeTax: Math.round(incomeTax * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  };
}

/**
 * Export Tuloslaskelma as CSV.
 */
export function exportProfitLossCSV(pl, periodLabel, filename) {
  const lines = [
    ["TULOSLASKELMA — Income Statement"],
    [`Period: ${periodLabel}`],
    [],
    ["Line Item", "Amount (EUR)"],
    ["LIIKEVAIHTO (Card Sales Revenue)", pl.revenue?.toFixed(2)],
    ...(pl.otherRevenue > 0 ? [
      ["Liiketoiminnan muut tuotot (Other Operating Income)", pl.otherRevenue?.toFixed(2)],
      ["KOKONAISTUOTOT (Total Revenue)", pl.totalRevenue?.toFixed(2)],
    ] : []),
    [],
    ["Materiaalit ja palvelut (Materials & Services)", ""],
    ["  Cost of Goods Sold (COGS)", `-${pl.cogs?.toFixed(2)}`],
    ["  Inventory / Stock Purchases", `-${pl.stockPurchaseExpenses?.toFixed(2)}`],
    ["  Total Materials", `-${pl.totalMaterials?.toFixed(2)}`],
    [],
    ["BRUTTOKATE (Gross Margin)", pl.grossMargin?.toFixed(2)],
    [],
    ["Liiketoiminnan muut kulut (Operating Expenses)", ""],
  ];

  if (pl.operatingExpensesByCategory) {
    Object.entries(pl.operatingExpensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amount]) => {
        if (amount > 0) lines.push([`  ${cat}`, `-${amount.toFixed(2)}`]);
      });
  }

  lines.push(["  Total Operating Expenses", `-${pl.totalOpex?.toFixed(2)}`]);
  lines.push([]);
  lines.push(["LIIKETULOS (Operating Profit)", pl.operatingProfit?.toFixed(2)]);
  lines.push([]);
  lines.push(["TULOS ENNEN VEROJA (Profit Before Tax)", pl.operatingProfit?.toFixed(2)]);
  lines.push([`Tuloverot (Income Tax ${(FINLAND_CORPORATE_TAX_RATE * 100).toFixed(0)}%)`, `-${pl.incomeTax?.toFixed(2)}`]);
  lines.push([]);
  lines.push(["TILIKAUDEN TULOS (Net Profit)", pl.netProfit?.toFixed(2)]);

  const csv = lines.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  downloadBlob(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    filename || "tuloslaskelma.csv"
  );
}

/**
 * Export Tuloslaskelma as PDF.
 */
export function exportProfitLossPDF(pl, periodLabel, config, filename) {
  const doc = createPdfDoc();
  let y = addPdfHeader(doc, "Tuloslaskelma — Income Statement", periodLabel, config);

  const pageW = doc.internal.pageSize.getWidth();

  // Summary boxes
  const bw = (pageW - 28 - 12) / 4;
  const summaryData = [
    { label: "Revenue", value: `€${(pl.totalRevenue || pl.revenue || 0).toFixed(2)}`, bg: [219, 234, 254] },
    { label: "Gross Margin", value: `€${(pl.grossMargin || 0).toFixed(2)}`, bg: [220, 252, 231] },
    { label: "Operating Profit", value: `€${(pl.operatingProfit || 0).toFixed(2)}`, bg: pl.operatingProfit >= 0 ? [243, 232, 255] : [254, 226, 226] },
    { label: "Net Profit", value: `€${(pl.netProfit || 0).toFixed(2)}`, bg: pl.netProfit >= 0 ? [220, 252, 231] : [254, 226, 226] },
  ];

  summaryData.forEach((box, i) => {
    const x = 14 + i * (bw + 4);
    doc.setFillColor(...box.bg);
    doc.roundedRect(x, y, bw, 22, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(box.label, x + 3, y + 7);
    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(box.value, x + 3, y + 17);
  });
  y += 28;

  // Build the tuloslaskelma rows
  const rows = [];
  const addRow = (label, amount, opts = {}) => {
    rows.push({ label, amount, ...opts });
  };

  addRow("LIIKEVAIHTO (Card Sales Revenue)", pl.revenue, { bold: true, section: true });
  if (pl.otherRevenue > 0) {
    addRow("Liiketoiminnan muut tuotot (Other Operating Income)", pl.otherRevenue);
    addRow("KOKONAISTUOTOT (Total Revenue)", pl.totalRevenue, { bold: true, section: true });
  }
  addRow("");
  addRow("Materiaalit ja palvelut (Materials & Services)", null, { bold: true, section: true });
  addRow("    Myytyjen tuotteiden hankintameno (COGS)", -pl.cogs, { indent: true });
  if (pl.stockPurchaseExpenses > 0) {
    addRow("    Varaston lisäostot (Stock Purchases)", -pl.stockPurchaseExpenses, { indent: true });
  }
  addRow("    Materiaalit yhteensä (Total Materials)", -pl.totalMaterials, { bold: true, indent: true });
  addRow("");
  addRow("BRUTTOKATE (Gross Margin)", pl.grossMargin, { bold: true, section: true });
  addRow("");
  addRow("Liiketoiminnan muut kulut (Operating Expenses)", null, { bold: true, section: true });

  if (pl.operatingExpensesByCategory) {
    Object.entries(pl.operatingExpensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amount]) => {
        if (amount > 0) addRow(`    ${cat}`, -amount, { indent: true });
      });
  }
  addRow("    Kulut yhteensä (Total Opex)", -pl.totalOpex, { bold: true, indent: true });
  addRow("");
  addRow("LIIKETULOS (Operating Profit)", pl.operatingProfit, { bold: true, section: true });
  addRow("");
  addRow("TULOS ENNEN VEROJA (Profit Before Tax)", pl.operatingProfit, { bold: true });
  addRow(`Tuloverot (Income Tax ${(FINLAND_CORPORATE_TAX_RATE * 100).toFixed(0)}%)`, -pl.incomeTax);
  addRow("");
  addRow("TILIKAUDEN TULOS (Net Profit)", pl.netProfit, { bold: true, section: true });

  // Render as table
  const tableRows = rows
    .filter((r) => r.label !== undefined)
    .map((r) => {
      if (r.label === "") return ["", ""];
      const amountStr = r.amount != null ? `€${r.amount.toFixed(2)}` : "";
      return [r.label, amountStr];
    });

  autoTable(doc, {
    startY: y,
    body: tableRows,
    theme: "plain",
    bodyStyles: { fontSize: 9, textColor: PDF_COLORS.text },
    columnStyles: {
      0: { cellWidth: 140 },
      1: { halign: "right", cellWidth: 42 },
    },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 2 },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = rows.filter((r) => r.label !== undefined)[data.row.index];
      if (!row) return;
      if (row.bold || row.section) {
        data.cell.styles.fontStyle = "bold";
      }
      if (row.section) {
        data.cell.styles.fillColor = [245, 248, 250];
      }
      // Color negative amounts
      if (data.column.index === 1) {
        const raw = data.cell.raw;
        if (raw && raw.startsWith("€-")) {
          data.cell.styles.textColor = PDF_COLORS.danger;
        }
      }
    },
  });

  addPdfFooter(doc);
  doc.save(filename || "tuloslaskelma.pdf");
}

// =============================
// Bill of Sale (Kauppakirja)
// =============================

/**
 * Generate a Bill of Sale PDF for transferring personal cards to an Oy.
 * Returns the PDF as a Blob (for Firebase Storage upload) AND triggers download.
 */
// =============================
// Loss Carry-Forward
// =============================

/**
 * Calculate loss carry-forward balances across fiscal years.
 * Finnish law: losses can be carried forward for 10 years.
 */
export function calculateLossCarryForward(yearlyResults) {
  const sorted = [...yearlyResults].sort((a, b) => a.year - b.year);
  let carryForwardBalance = 0;
  const timeline = [];

  for (const yr of sorted) {
    const operatingResult = yr.operatingProfit ?? yr.netProfit ?? 0;
    const entryStart = carryForwardBalance;

    if (operatingResult < 0) {
      carryForwardBalance += Math.abs(operatingResult);
      timeline.push({
        year: yr.year,
        operatingResult,
        lossAdded: Math.abs(operatingResult),
        lossUsed: 0,
        carryForwardBefore: entryStart,
        carryForwardAfter: carryForwardBalance,
        taxSaved: 0,
      });
    } else {
      const usable = Math.min(carryForwardBalance, operatingResult);
      carryForwardBalance -= usable;
      const taxSaved = usable * FINLAND_CORPORATE_TAX_RATE;
      timeline.push({
        year: yr.year,
        operatingResult,
        lossAdded: 0,
        lossUsed: usable,
        carryForwardBefore: entryStart,
        carryForwardAfter: carryForwardBalance,
        taxSaved: Math.round(taxSaved * 100) / 100,
      });
    }
  }

  return { timeline, remainingCarryForward: carryForwardBalance };
}

// =============================
// Dividend Optimization
// =============================

/**
 * Calculate the optimal dividend split for a Finnish Oy shareholder.
 *
 * Up to 8% of the Oy's net assets can be paid as "capital income dividend":
 *   - 25% of this is taxable capital income (30% tax → effective 7.5%)
 *   - Amounts exceeding €150k: 85% taxable at 30-34%
 *
 * Above the 8% threshold, dividend is treated as earned income:
 *   - 75% taxable as earned income (progressive tax)
 *
 * @param {number} netAssets - Oy's net assets (mathematical share value)
 * @param {number} distributableProfit - Maximum profit available for distribution
 * @param {number} marginalEarnedIncomeTaxRate - Shareholder's marginal earned income rate (0-0.535)
 */
export function calculateDividendOptimization(netAssets, distributableProfit, marginalEarnedIncomeTaxRate = 0.40) {
  const CAPITAL_INCOME_TAX_RATE = 0.30;
  const CAPITAL_INCOME_HIGH_RATE = 0.34;
  const CAPITAL_INCOME_THRESHOLD = 150000;

  const eightPercentLine = netAssets * 0.08;
  const maxDividend = Math.max(0, distributableProfit);

  // Scenario 1: Pay dividends up to the 8% line only
  const capitalDividend = Math.min(eightPercentLine, maxDividend);
  const taxableCapital = capitalDividend * 0.25;
  const taxFreePortion = capitalDividend * 0.75;

  let capitalTax;
  if (taxableCapital <= CAPITAL_INCOME_THRESHOLD) {
    capitalTax = taxableCapital * CAPITAL_INCOME_TAX_RATE;
  } else {
    capitalTax =
      CAPITAL_INCOME_THRESHOLD * CAPITAL_INCOME_TAX_RATE +
      (taxableCapital - CAPITAL_INCOME_THRESHOLD) * CAPITAL_INCOME_HIGH_RATE;
  }

  const capitalEffectiveRate = capitalDividend > 0 ? capitalTax / capitalDividend : 0;

  // Scenario 2: Additional dividend above 8% line (treated as earned income)
  const excessAvailable = Math.max(0, maxDividend - capitalDividend);
  const earnedIncomeDividend = excessAvailable;
  const taxableEarned = earnedIncomeDividend * 0.75;
  const earnedIncomeTax = taxableEarned * marginalEarnedIncomeTaxRate;
  const earnedEffectiveRate = earnedIncomeDividend > 0 ? earnedIncomeTax / earnedIncomeDividend : 0;

  // Combined
  const totalDividend = capitalDividend + earnedIncomeDividend;
  const totalTax = capitalTax + earnedIncomeTax;
  const netAfterTax = totalDividend - totalTax;
  const combinedEffectiveRate = totalDividend > 0 ? totalTax / totalDividend : 0;

  // Salary comparison: what if you paid yourself salary instead?
  const salaryGrossEquivalent = totalDividend;
  const employerCosts = salaryGrossEquivalent * 0.20; // ~20% employer side costs
  const salaryTax = salaryGrossEquivalent * marginalEarnedIncomeTaxRate;
  const salaryNet = salaryGrossEquivalent - salaryTax;
  const salaryTotalCostToOy = salaryGrossEquivalent + employerCosts;

  // Retained in company for net assets growth
  const retainedSuggestion = Math.max(0, distributableProfit - capitalDividend);

  return {
    netAssets,
    distributableProfit,
    eightPercentLine: Math.round(eightPercentLine * 100) / 100,
    capitalDividend: Math.round(capitalDividend * 100) / 100,
    capitalTax: Math.round(capitalTax * 100) / 100,
    capitalEffectiveRate: Math.round(capitalEffectiveRate * 10000) / 10000,
    taxFreePortion: Math.round(taxFreePortion * 100) / 100,
    earnedIncomeDividend: Math.round(earnedIncomeDividend * 100) / 100,
    earnedIncomeTax: Math.round(earnedIncomeTax * 100) / 100,
    earnedEffectiveRate: Math.round(earnedEffectiveRate * 10000) / 10000,
    totalDividend: Math.round(totalDividend * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    netAfterTax: Math.round(netAfterTax * 100) / 100,
    combinedEffectiveRate: Math.round(combinedEffectiveRate * 10000) / 10000,
    salaryComparison: {
      gross: Math.round(salaryGrossEquivalent * 100) / 100,
      tax: Math.round(salaryTax * 100) / 100,
      net: Math.round(salaryNet * 100) / 100,
      employerCosts: Math.round(employerCosts * 100) / 100,
      totalCostToOy: Math.round(salaryTotalCostToOy * 100) / 100,
    },
    recommendation:
      capitalDividend > 0 && earnedEffectiveRate > capitalEffectiveRate + 0.1
        ? `Optimal: Pay €${capitalDividend.toFixed(0)} as capital dividend (${(capitalEffectiveRate * 100).toFixed(1)}% tax). Consider retaining €${retainedSuggestion.toFixed(0)} to grow net assets for next year.`
        : `Distribute the full €${totalDividend.toFixed(0)} — the blended rate of ${(combinedEffectiveRate * 100).toFixed(1)}% is competitive.`,
    retainedSuggestion: Math.round(retainedSuggestion * 100) / 100,
  };
}

// =============================
// Mileage Allowance
// =============================

export const FINLAND_MILEAGE_RATE = 0.30; // €/km (2025 Vero rate)

/**
 * Calculate total mileage allowance for a set of trips.
 */
export function calculateMileageAllowance(trips) {
  let totalKm = 0;
  let totalAllowance = 0;
  const details = (trips || []).map((trip) => {
    const km = parseFloat(trip.km) || 0;
    const rate = trip.rate || FINLAND_MILEAGE_RATE;
    const allowance = km * rate;
    totalKm += km;
    totalAllowance += allowance;
    return {
      ...trip,
      km,
      rate,
      allowance: Math.round(allowance * 100) / 100,
    };
  });
  return {
    totalKm,
    totalAllowance: Math.round(totalAllowance * 100) / 100,
    details,
  };
}

// =============================
// Tax-Free Benefits Summary
// =============================

export const TAX_FREE_BENEFITS = [
  { id: "per_diem_full", label: "Per Diem (Full Day, >10h)", annualLimit: null, perUse: 51 },
  { id: "per_diem_partial", label: "Per Diem (Partial Day, >6h)", annualLimit: null, perUse: 24 },
  { id: "mileage", label: "Mileage Allowance", annualLimit: null, perUse: 0.30, unit: "€/km" },
  { id: "sports_culture", label: "Sports & Culture Benefit", annualLimit: 400, perUse: null },
  { id: "phone", label: "Phone Benefit", annualLimit: null, perUse: null, note: "Reasonable business use — Oy pays bill directly" },
  { id: "internet", label: "Home Internet", annualLimit: null, perUse: null, note: "Business portion — Oy pays directly" },
  { id: "lunch", label: "Lunch Benefit (Lounasetu)", annualLimit: null, perUse: 12.70, unit: "€/day" },
  { id: "gifts", label: "Tax-Free Gifts", annualLimit: 100, perUse: null, note: "Per occasion, non-cash only" },
  { id: "loan_repayment", label: "Shareholder Loan Repayment", annualLimit: null, perUse: null, note: "Up to outstanding loan balance" },
  { id: "expense_reimbursement", label: "Expense Reimbursements", annualLimit: null, perUse: null, note: "Personal card used for business — receipts required" },
];

export function generateBillOfSalePDF(items, sellerName, buyerName, dateStr, signatureDataUrl, config) {
  const doc = createPdfDoc();
  const pageW = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(20);
  doc.setTextColor(...PDF_COLORS.primary);
  doc.text("KAUPPAKIRJA", pageW / 2, 22, { align: "center" });
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("Bill of Sale", pageW / 2, 29, { align: "center" });

  let y = 38;

  // Company info
  if (config?.businessName) {
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(config.businessName, 14, y);
    if (config.businessId) doc.text(`Y-tunnus: ${config.businessId}`, 14, y + 4);
    y += 12;
  }

  // Parties & date
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text(`Myyjä / Seller: ${sellerName}`, 14, y);
  y += 6;
  doc.text(`Ostaja / Buyer: ${buyerName}`, 14, y);
  y += 6;
  doc.text(`Päivämäärä / Date: ${dateStr}`, 14, y);
  y += 10;

  // Description
  doc.setFontSize(9);
  doc.text(
    "The Seller hereby transfers ownership of the following Pokémon TCG trading cards to the Buyer",
    14,
    y
  );
  y += 4;
  doc.text(
    "at 20% of fair market value as determined at the time of transfer.",
    14,
    y
  );
  y += 8;

  // Items table
  const headers = [["#", "Card Name", "Set", "Number", "Cond.", "Qty", "Market (€)", "Sale (€)"]];
  const rows = items.map((item, i) => [
    String(i + 1),
    item.name || "Unknown",
    item.set || "",
    item.number || "",
    item.condition || "NM",
    String(item.quantity || 1),
    (item.marketValue || 0).toFixed(2),
    (item.salePrice || 0).toFixed(2),
  ]);

  const totalMarket = items.reduce((s, i) => s + (i.marketValue || 0) * (i.quantity || 1), 0);
  const totalSale = items.reduce((s, i) => s + (i.salePrice || 0) * (i.quantity || 1), 0);
  rows.push(["", "", "", "", "", "TOTAL", totalMarket.toFixed(2), totalSale.toFixed(2)]);

  autoTable(doc, {
    startY: y,
    head: headers,
    body: rows,
    theme: "grid",
    headStyles: { fillColor: PDF_COLORS.headerBg, textColor: PDF_COLORS.headerText, fontSize: 7, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: PDF_COLORS.text },
    alternateRowStyles: { fillColor: PDF_COLORS.altRow },
    margin: { left: 14, right: 14 },
    styles: { cellPadding: 1.5, overflow: "linebreak" },
    didParseCell: (data) => {
      // Bold the totals row
      if (data.section === "body" && data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [230, 240, 250];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Ensure we have room for the signature
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  // Legal text
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.text);
  const legalLines = [
    "Myyjä vakuuttaa olevansa korttejen oikea omistaja eikä niihin kohdistu kolmansien osapuolien vaatimuksia.",
    "The Seller confirms sole ownership of the cards and that no third-party claims exist.",
    "",
    "Omistusoikeus siirtyy ostajalle allekirjoituspäivänä.",
    "Ownership transfers to the Buyer on the date of signature below.",
  ];
  legalLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 4;
  });
  y += 6;

  // Signature area
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.text);
  doc.text("Allekirjoitus / Signature:", 14, y);
  y += 4;

  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, "PNG", 14, y, 60, 25);
      y += 28;
    } catch {
      doc.text("[Signature image could not be embedded]", 14, y + 5);
      y += 12;
    }
  } else {
    doc.line(14, y + 10, 80, y + 10);
    y += 15;
  }

  doc.setFontSize(8);
  doc.text(sellerName, 14, y);
  y += 4;
  doc.text(dateStr, 14, y);

  addPdfFooter(doc);

  // Return both blob and trigger download
  const pdfBlob = doc.output("blob");
  doc.save(`kauppakirja_${dateStr}.pdf`);
  return pdfBlob;
}
