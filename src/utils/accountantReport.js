import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  calculateCOGS,
  calculateMarginTax,
  calculateProfitAndLoss,
  evaluateInventoryForTax,
  getAnnualRange,
  STOCK_PURCHASE_CATEGORY,
} from "./taxHelpers";

function toTimestamp(value) {
  if (typeof value === "number") return value;
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function isWithinPeriod(value, start, end) {
  const timestamp = toTimestamp(value);
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function asMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTransactionRevenue(transaction) {
  if (transaction.type !== "sale" && transaction.type !== "sell") return 0;
  return transaction.hasConsignment
    ? asMoney(transaction.vendorTakeHome)
    : asMoney(transaction.totalValue ?? transaction.totalAmount);
}

function purchaseRowsFromTransactions(transactions) {
  const rows = [];
  transactions.forEach((transaction) => {
    if (transaction.type !== "buy" && transaction.type !== "trade") return;
    (transaction.itemsIn || []).forEach((item, index) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitCost = item.unitCost != null
        ? asMoney(item.unitCost)
        : item.totalCost != null
          ? asMoney(item.totalCost) / quantity
          : asMoney(item.unitPrice);
      rows.push({
        id: `${transaction.id || "transaction"}-in-${index}`,
        purchaseId: transaction.internalVoucherId || transaction.documents?.number || transaction.id || "",
        date: transaction.ts,
        sellerName: transaction.counterparty?.name || transaction.counterpartyName || "",
        itemName: item.name || "",
        set: item.set || "",
        condition: item.condition || "",
        quantity,
        priceEUR: unitCost,
        documentNumber: transaction.documents?.number || transaction.documentNumber || "",
        source: transaction.type === "trade" ? "Trade-in" : "Deal purchase",
      });
    });
  });
  return rows;
}

export function buildAccountantReportData({
  year,
  fiscalYearStart = 1,
  transactions = [],
  expenses = [],
  purchaseDiary = [],
  inventoryItems = [],
  shareholderEntries = [],
  otherRevenue = [],
  mileageTrips = [],
  taxFreeBenefits = [],
  computeItemMetrics,
  currency = "EUR",
}) {
  const period = getAnnualRange(year, fiscalYearStart);
  const periodTransactions = transactions.filter((transaction) =>
    isWithinPeriod(transaction.ts, period.start, period.end)
  );
  const periodExpenses = expenses.filter((expense) =>
    isWithinPeriod(expense.date, period.start, period.end)
  );
  const periodOtherRevenue = otherRevenue.filter((entry) =>
    isWithinPeriod(entry.date, period.start, period.end)
  );
  const periodShareholderEntries = shareholderEntries.filter((entry) =>
    isWithinPeriod(entry.date, period.start, period.end)
  );
  const periodMileageTrips = mileageTrips.filter((trip) =>
    isWithinPeriod(trip.date, period.start, period.end)
  );
  const periodTaxFreeBenefits = taxFreeBenefits.filter((benefit) =>
    isWithinPeriod(benefit.date, period.start, period.end)
  );

  const taxableTransactions = periodTransactions.filter((transaction) =>
    ["sale", "sell", "trade"].includes(transaction.type)
  );
  const cogs = calculateCOGS(taxableTransactions);

  const salesRows = [];
  periodTransactions.forEach((transaction) => {
    if (transaction.type === "sale" || transaction.type === "sell") {
      salesRows.push({
        date: transaction.ts,
        source: transaction.hasConsignment ? "Consignment" : "Sale",
        description: transaction.notes || `${(transaction.itemsOut || []).length} card sale`,
        amountEUR: getTransactionRevenue(transaction),
      });
    } else if (transaction.type === "trade") {
      (transaction.itemsOut || []).forEach((item) => {
        salesRows.push({
          date: transaction.ts,
          source: "Trade-out",
          description: [item.name, item.set, item.number ? `#${item.number}` : ""].filter(Boolean).join(" · "),
          amountEUR: asMoney(item.totalPrice) || asMoney(item.unitPrice) * (Number(item.quantity) || 1),
        });
      });
    }
  });
  const revenue = salesRows.reduce((sum, row) => sum + row.amountEUR, 0);
  const otherRevenueTotal = periodOtherRevenue.reduce(
    (sum, entry) => sum + asMoney(entry.amountEUR ?? entry.amount),
    0,
  );

  let stockPurchaseExpenses = 0;
  const operatingExpensesByCategory = {};
  periodExpenses.forEach((expense) => {
    const amount = asMoney(expense.amountEUR ?? expense.amount);
    if (expense.category === STOCK_PURCHASE_CATEGORY) {
      stockPurchaseExpenses += amount;
    } else {
      const category = expense.category || "Other";
      operatingExpensesByCategory[category] = (operatingExpensesByCategory[category] || 0) + amount;
    }
  });

  const profitLoss = calculateProfitAndLoss(
    revenue,
    cogs.totalCOGS,
    stockPurchaseExpenses,
    operatingExpensesByCategory,
    otherRevenueTotal,
  );
  const marginTax = calculateMarginTax(revenue, cogs.totalCOGS);
  const manualPurchases = purchaseDiary
    .filter((entry) => isWithinPeriod(entry.date, period.start, period.end))
    .map((entry) => ({ ...entry, source: entry.source || "Manual diary" }));
  const purchases = [...manualPurchases, ...purchaseRowsFromTransactions(periodTransactions)]
    .sort((a, b) => toTimestamp(a.date) - toTimestamp(b.date));
  const inventory = evaluateInventoryForTax(inventoryItems, computeItemMetrics, currency)
    .map((item, index) => {
      const sourceItem = inventoryItems[index] || {};
      const recordedCost = [sourceItem.buyPrice, sourceItem.costBasis, sourceItem.acquisitionCost, sourceItem.unitCost]
        .map((value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null)
        .find((value) => value != null);
      const quantity = Number(item.quantity) || 1;
      const acquisitionCost = recordedCost ?? 0;
      const writeDown = acquisitionCost > 0 && item.currentMarketPrice < acquisitionCost;
      return {
        ...item,
        acquisitionCost,
        totalAcquisitionCost: acquisitionCost * quantity,
        writeDown,
        writeDownAmount: writeDown ? (acquisitionCost - item.currentMarketPrice) * quantity : 0,
        costBasisRecorded: recordedCost != null,
      };
    });
  const perDiems = periodExpenses.filter((expense) => expense.category === "Per Diem");

  const warnings = [];
  const incompleteTransactions = periodTransactions.filter(
    (transaction) => transaction.taxRecord?.status && transaction.taxRecord.status !== "complete"
  ).length;
  const unreliableFx = periodTransactions.filter(
    (transaction) => transaction.taxAccounting?.reliable === false
  ).length;
  const missingInventoryCosts = inventory.filter((item) => !item.costBasisRecorded).length;
  if (incompleteTransactions) warnings.push(`${incompleteTransactions} transaction(s) have incomplete tax metadata.`);
  if (cogs.missingCostBasisCount) warnings.push(`${cogs.missingCostBasisCount} sold/traded item(s) have no recorded cost basis.`);
  if (unreliableFx) warnings.push(`${unreliableFx} transaction(s) could not be reliably converted to EUR.`);
  if (missingInventoryCosts) warnings.push(`${missingInventoryCosts} current inventory item(s) have no recorded acquisition cost.`);
  if (year !== new Date().getFullYear()) {
    warnings.push("Inventory valuation is the current inventory snapshot, not a historical year-end snapshot.");
  }

  return {
    year,
    label: `FY ${year}`,
    period,
    transactions: periodTransactions,
    expenses: periodExpenses,
    purchases,
    salesRows,
    inventory,
    cogs,
    profitLoss,
    marginTax,
    shareholderEntries: periodShareholderEntries,
    mileageTrips: periodMileageTrips,
    taxFreeBenefits: periodTaxFreeBenefits,
    perDiems,
    warnings,
  };
}

const COLORS = {
  primary: [34, 87, 122],
  muted: [105, 115, 130],
  text: [24, 28, 36],
  header: [34, 87, 122],
  alt: [246, 248, 250],
  warning: [180, 83, 9],
};

function money(value) {
  return `EUR ${asMoney(value).toFixed(2)}`;
}

function dateLabel(value) {
  const timestamp = toTimestamp(value);
  return timestamp ? new Date(timestamp).toLocaleDateString("fi-FI") : "";
}

function addDocumentHeader(doc, title, subtitle, config) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.primary);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(subtitle, 14, 25);
  if (config?.companyName) {
    doc.setTextColor(...COLORS.text);
    doc.text(config.companyName, pageWidth - 14, 17, { align: "right" });
    doc.setTextColor(...COLORS.muted);
    doc.text(
      [config.businessId && `Y-tunnus ${config.businessId}`, config.vatNumber && `ALV ${config.vatNumber}`]
        .filter(Boolean).join(" · "),
      pageWidth - 14,
      23,
      { align: "right" },
    );
  }
  doc.setDrawColor(...COLORS.primary);
  doc.line(14, 29, pageWidth - 14, 29);
  return 35;
}

function addSection(doc, title, subtitle, config, orientation = "landscape") {
  doc.addPage("a4", orientation);
  return addDocumentHeader(doc, title, subtitle, config);
}

function renderTable(doc, startY, head, body, options = {}) {
  autoTable(doc, {
    startY,
    head: [head],
    body,
    theme: "grid",
    headStyles: { fillColor: COLORS.header, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.alt },
    margin: { left: 14, right: 14, bottom: 15 },
    styles: { cellPadding: 1.5, overflow: "linebreak" },
    ...options,
  });
}

function addFooters(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Generated ${new Date().toLocaleString("fi-FI")} · Rafchu accountant package`, 14, height - 7);
    doc.text(`Page ${page} / ${pageCount}`, width - 14, height - 7, { align: "right" });
  }
}

export function exportAccountantPackagePDF(report, config, filename) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const periodLabel = `${report.period.start.toLocaleDateString("fi-FI")} – ${report.period.end.toLocaleDateString("fi-FI")}`;
  let y = addDocumentHeader(doc, "Accountant Package", `${report.label} · ${periodLabel}`, config);

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text("Accounting overview", 14, y);
  y += 4;
  renderTable(doc, y, ["Metric", "EUR"], [
    ["Total revenue", money(report.profitLoss.totalRevenue)],
    ["Cost of goods sold", money(report.profitLoss.cogs)],
    ["Operating expenses", money(report.profitLoss.totalOpex)],
    ["Operating profit", money(report.profitLoss.operatingProfit)],
    ["Estimated corporate income tax", money(report.profitLoss.incomeTax)],
    ["Estimated net profit", money(report.profitLoss.netProfit)],
    ["Margin-scheme VAT payable", money(report.marginTax.vatPayable)],
  ], { tableWidth: 150, columnStyles: { 1: { halign: "right" } } });

  y = doc.lastAutoTable.finalY + 7;
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `${report.transactions.length} transactions · ${report.expenses.length} expenses · ${report.purchases.length} purchase lines · ${report.inventory.length} inventory rows`,
    14,
    y,
  );
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.text("Review before sending", 14, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...(report.warnings.length ? COLORS.warning : COLORS.muted));
  const reviewLines = report.warnings.length
    ? report.warnings
    : ["No automatic data-quality warnings were detected."];
  reviewLines.forEach((warning) => {
    doc.text(`• ${warning}`, 16, y, { maxWidth: 175 });
    y += 5;
  });
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("Supporting bookkeeping export; review classifications and filing treatment with your accountant.", 14, y + 3);

  y = addSection(doc, "Tuloslaskelma — Income Statement", report.label, config, "portrait");
  renderTable(doc, y, ["Line item", "EUR"], [
    ["Card sales and trade revenue", money(report.profitLoss.revenue)],
    ["Other operating income", money(report.profitLoss.otherRevenue)],
    ["Total revenue", money(report.profitLoss.totalRevenue)],
    ["Cost of goods sold", money(-report.profitLoss.cogs)],
    ["Additional stock purchases", money(-report.profitLoss.stockPurchaseExpenses)],
    ["Gross margin", money(report.profitLoss.grossMargin)],
    ...Object.entries(report.profitLoss.operatingExpensesByCategory || {}).map(([category, amount]) => [category, money(-amount)]),
    ["Total operating expenses", money(-report.profitLoss.totalOpex)],
    ["Operating profit", money(report.profitLoss.operatingProfit)],
    ["Estimated income tax", money(-report.profitLoss.incomeTax)],
    ["Estimated net profit", money(report.profitLoss.netProfit)],
  ], { columnStyles: { 1: { halign: "right" } } });

  y = addSection(doc, "Expense Ledger", `${report.expenses.length} entries · ${report.label}`, config);
  renderTable(doc, y, ["Date", "Category", "Description", "Vendor", "Payment", "EUR", "Receipt"], report.expenses.map((expense) => [
    dateLabel(expense.date), expense.category || "", expense.description || "", expense.vendor || "",
    expense.paymentMethod || "", money(expense.amountEUR ?? expense.amount), expense.receiptUrl ? "Yes" : "No",
  ]), { columnStyles: { 5: { halign: "right" } } });

  y = addSection(doc, "Ostopäiväkirja — Purchase Diary", `${report.purchases.length} lines · ${report.label}`, config);
  renderTable(doc, y, ["Date", "Voucher", "Seller", "Item", "Set", "Cond.", "Qty", "Unit EUR", "Source"], report.purchases.map((purchase) => [
    dateLabel(purchase.date), purchase.purchaseId || "", purchase.sellerName || "", purchase.itemName || "",
    purchase.set || "", purchase.condition || "", String(purchase.quantity || 1), money(purchase.priceEUR), purchase.source || "",
  ]), { columnStyles: { 6: { halign: "right" }, 7: { halign: "right" } } });

  y = addSection(doc, "Marginaaliverolaskelma", `Margin Tax · ${report.label}`, config, "portrait");
  renderTable(doc, y, ["Calculation", "EUR"], [
    ["Eligible sales / revenue", money(report.marginTax.totalSales)],
    ["Recorded cost of sold goods", money(report.marginTax.totalPurchaseCost)],
    ["Gross margin", money(report.marginTax.grossMargin)],
    ["VAT payable on positive margin", money(report.marginTax.vatPayable)],
    ["Net margin after VAT", money(report.marginTax.netMargin)],
  ], { tableWidth: 160, columnStyles: { 1: { halign: "right" } } });
  const salesStart = doc.lastAutoTable.finalY + 8;
  renderTable(doc, salesStart, ["Date", "Source", "Description", "EUR"], report.salesRows.map((sale) => [
    dateLabel(sale.date), sale.source, sale.description, money(sale.amountEUR),
  ]), { columnStyles: { 3: { halign: "right" } } });

  y = addSection(doc, "Cost of Goods Sold", `${report.cogs.details.length} sold/traded lines · ${report.label}`, config);
  renderTable(doc, y, ["Date", "Item", "Set", "Qty", "Unit cost", "COGS", "Sale", "Profit", "Status"], report.cogs.details.map((item) => [
    dateLabel(item.saleDate), item.name || "", item.set || "", String(item.quantity || 1), money(item.costBasis),
    money(item.cogs), money(asMoney(item.salePrice) * (item.quantity || 1)), money(item.profit), item.costUnknown ? "Missing cost" : item.isConsigned ? "Consigned" : "Recorded",
  ]), { columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } } });

  y = addSection(doc, "Varastolistaus — Current Inventory", `${report.inventory.length} rows · generated ${new Date().toLocaleDateString("fi-FI")}`, config);
  renderTable(doc, y, ["Item", "Set", "No.", "Condition", "Qty", "Unit cost", "Market", "Total cost", "Write-down"], report.inventory.map((item) => [
    item.name || "", item.set || "", item.number || "", item.condition || "", String(item.quantity || 1),
    money(item.acquisitionCost), money(item.currentMarketPrice), money(item.totalAcquisitionCost), item.writeDown ? money(item.writeDownAmount) : "—",
  ]), { columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } } });

  y = addSection(doc, "Shareholder & Travel Ledger", report.label, config);
  renderTable(doc, y, ["Date", "Type", "Description", "EUR"], report.shareholderEntries.map((entry) => [
    dateLabel(entry.date), entry.type || "", entry.description || "", money(entry.amount),
  ]), { columnStyles: { 3: { halign: "right" } } });
  let nextY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.text("Per diems recorded as expenses", 14, nextY);
  renderTable(doc, nextY + 3, ["Date", "Description", "EUR", "Status"], report.perDiems.map((entry) => [
    dateLabel(entry.date), entry.description || "", money(entry.amountEUR ?? entry.amount), entry.settlementStatus || "",
  ]), { columnStyles: { 2: { halign: "right" } } });
  nextY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.text("Mileage allowances", 14, nextY);
  renderTable(doc, nextY + 3, ["Date", "Route", "Purpose", "Kilometres", "Rate", "Allowance"], report.mileageTrips.map((trip) => [
    dateLabel(trip.date), `${trip.from || ""} – ${trip.to || ""}`, trip.purpose || "", String(trip.km || 0), money(trip.rate), money(trip.allowance),
  ]), { columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } });
  nextY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.text("Other tax-free payments and benefits", 14, nextY);
  renderTable(doc, nextY + 3, ["Date", "Type", "Description", "EUR"], report.taxFreeBenefits.map((benefit) => [
    dateLabel(benefit.date), benefit.benefitType || "", benefit.description || "", money(benefit.amount),
  ]), { columnStyles: { 3: { halign: "right" } } });

  addFooters(doc);
  doc.save(filename || `accountant_package_${report.year}.pdf`);
}
