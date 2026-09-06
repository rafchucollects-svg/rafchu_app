/**
 * Wise Business CSV parser and bank transaction helpers.
 * Supports both "Balance Statement" and "Transaction History" export formats.
 */



function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDate(dateStr) {
  if (!dateStr) return 0;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Parse a Wise Business CSV string into an array of transaction objects.
 * Auto-detects between "Balance Statement" format and "Transaction History" format.
 * Positive amounts = incoming, negative = outgoing.
 */
export function parseWiseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerFields = parseCsvLine(lines[0]);
  const colIndex = {};
  headerFields.forEach((h, i) => {
    colIndex[h.replace(/^\uFEFF/, "").trim()] = i;
  });

  const get = (fields, colName) => {
    const idx = colIndex[colName];
    return idx !== undefined ? (fields[idx] || "").trim() : "";
  };

  // Detect format: "Transaction History" has "Direction" + "Created on" columns
  const isTransactionHistory =
    colIndex["Direction"] !== undefined && colIndex["Created on"] !== undefined;
  // "Balance Statement" has "Date" + "Amount" columns
  const isBalanceStatement =
    colIndex["Date"] !== undefined && colIndex["Amount"] !== undefined;

  if (!isTransactionHistory && !isBalanceStatement) {
    throw new Error(
      "CSV format not recognized. Expected a Wise 'Transaction History' or 'Balance Statement' export."
    );
  }

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 3) continue;

    // Skip non-completed transactions in history format
    if (isTransactionHistory) {
      const status = get(fields, "Status");
      if (status && status !== "COMPLETED") continue;
    }

    let tx;

    if (isTransactionHistory) {
      const direction = get(fields, "Direction");
      const sourceAmount = parseFloat(get(fields, "Source amount (after fees)")) || 0;
      const targetAmount = parseFloat(get(fields, "Target amount (after fees)")) || 0;
      const sourceCurrency = get(fields, "Source currency") || "EUR";
      const targetCurrency = get(fields, "Target currency") || "EUR";
      const dateStr = get(fields, "Finished on") || get(fields, "Created on");

      const sourceFee = parseFloat(get(fields, "Source fee amount")) || 0;
      const targetFee = parseFloat(get(fields, "Target fee amount")) || 0;

      // NEUTRAL = internal currency conversion within the Wise account.
      // Not real income/expense — skip to avoid inflating totals.
      if (direction === "NEUTRAL") continue;

      // For IN: the target amount is what you received
      // For OUT: the source amount is what you paid (negate it)
      const amount = direction === "OUT" ? -sourceAmount : targetAmount;
      const currency = direction === "OUT" ? sourceCurrency : targetCurrency;

      // Compute EUR equivalent using the best available data:
      // 1. If the effective currency is already EUR → use it directly
      // 2. If the *other* side of the transaction is EUR → use that EUR amount
      // 3. Otherwise → null (will be converted using ECB rates at display time)
      let amountEUR = null;
      if (currency === "EUR") {
        amountEUR = amount;
      } else if (direction === "OUT" && targetCurrency === "EUR") {
        amountEUR = -targetAmount;
      } else if (direction === "OUT" && sourceCurrency !== "EUR" && targetCurrency !== "EUR") {
        amountEUR = null;
      } else if (direction === "IN" && sourceCurrency === "EUR") {
        amountEUR = sourceAmount;
      }

      tx = {
        transferWiseId: get(fields, "ID"),
        date: parseDate(dateStr),
        dateStr,
        amount,
        currency,
        amountEUR,
        description: get(fields, "Category") || (direction === "IN" ? "Incoming" : "Outgoing"),
        paymentReference: get(fields, "Reference"),
        runningBalance: 0,
        exchangeRate: get(fields, "Exchange rate"),
        payerName: direction === "IN" ? get(fields, "Source name") : "",
        payeeName: direction === "OUT" ? get(fields, "Target name") : "",
        merchant: "",
        totalFees: sourceFee + targetFee,
        note: get(fields, "Note"),
        status: get(fields, "Status"),
        category: get(fields, "Category"),
        direction,
      };
    } else {
      // Balance Statement format
      const dateStr = get(fields, "Date");
      tx = {
        transferWiseId: get(fields, "TransferWise ID"),
        date: parseDate(dateStr),
        dateStr,
        amount: parseFloat(get(fields, "Amount")) || 0,
        currency: get(fields, "Currency") || "EUR",
        description: get(fields, "Description"),
        paymentReference: get(fields, "Payment Reference"),
        runningBalance: parseFloat(get(fields, "Running Balance")) || 0,
        exchangeRate: get(fields, "Exchange Rate"),
        payerName: get(fields, "Payer Name"),
        payeeName: get(fields, "Payee Name"),
        merchant: get(fields, "Merchant"),
        totalFees: parseFloat(get(fields, "Total fees")) || 0,
        note: get(fields, "Note"),
      };
    }

    results.push(tx);
  }

  return results;
}

/**
 * Get the EUR equivalent for a transaction.
 * Priority: pre-computed amountEUR (from Wise CSV) → ECB rate conversion → raw amount.
 */
function resolveEUR(tx, ecbRates) {
  if (tx.amountEUR != null) return tx.amountEUR;
  if (tx.currency === "EUR") return tx.amount;
  if (ecbRates) {
    const rate = ecbRates[tx.currency];
    if (rate && rate !== 0) return tx.amount / rate;
  }
  return tx.amount;
}

/**
 * Compute summary stats from parsed bank transactions.
 * Uses pre-computed amountEUR (actual Wise rate at transaction time) when available,
 * falls back to ECB rate conversion for remaining non-EUR transactions.
 */
export function computeBankSummary(transactions, ecbRates) {
  let totalIn = 0;
  let totalOut = 0;
  let totalFees = 0;

  transactions.forEach((tx) => {
    if (tx.direction === "NEUTRAL") return;
    const amtEUR = resolveEUR(tx, ecbRates);
    if (amtEUR > 0) totalIn += amtEUR;
    else totalOut += Math.abs(amtEUR);

    const feeAmt = tx.totalFees || 0;
    if (feeAmt > 0) {
      if (tx.currency === "EUR" || !ecbRates) {
        totalFees += feeAmt;
      } else {
        const rate = ecbRates[tx.currency];
        totalFees += (rate && rate !== 0) ? feeAmt / rate : feeAmt;
      }
    }
  });

  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    totalFees,
    count: transactions.length,
  };
}

/**
 * Export bank transactions as CSV.
 */
export function exportBankCSV(transactions, filename) {
  const headers = [
    "Date",
    "Amount",
    "Currency",
    "Description",
    "Payer",
    "Payee",
    "Merchant",
    "Reference",
    "Running Balance",
    "Fees",
  ];

  const escape = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = transactions.map((tx) => [
    tx.dateStr || (tx.date ? new Date(tx.date).toISOString().slice(0, 10) : ""),
    tx.amount?.toFixed(2) ?? "",
    tx.currency,
    tx.description,
    tx.payerName,
    tx.payeeName,
    tx.merchant,
    tx.paymentReference,
    tx.runningBalance?.toFixed(2) ?? "",
    tx.totalFees?.toFixed(2) ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "bank_transactions.csv";
  a.click();
  URL.revokeObjectURL(url);
}
