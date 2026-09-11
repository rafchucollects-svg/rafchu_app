// All matching is local and advisory. Source amounts retain their original currency.
export const cents = (value) => Math.round(Number(value) * 100);
const text = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const tokens = (value) => new Set(text(value).match(/[a-z0-9]{3,}/g) || []);

export function readCSV(input) {
  const rows = []; let row = [], field = "", quoted = false;
  const csv = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(field.trim()); field = "";
      if (c !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === "\r" && csv[i + 1] === "\n") i++;
      }
    } else field += c;
  }
  if (quoted) throw new Error("Unclosed quoted field in CSV.");
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function sourceDate(value) {
  // Wise statements use day/month/year. Never let Date.parse guess US dates.
  const european = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(.*)$/);
  const date = european ? `${european[3]}-${european[2]}-${european[1]}${european[4]}` : value;
  const ts = Date.parse(date);
  if (!Number.isFinite(ts)) throw new Error(`Invalid date: ${value}`);
  return ts;
}

export async function parseReconciliationCSV(input, { filename = "", sumupCurrency = "EUR" } = {}) {
  const [headers, ...rows] = readCSV(input);
  if (!headers || !rows.length) throw new Error("The CSV is empty.");
  const wise = headers.includes("TransferWise ID") && headers.includes("Amount");
  const sumup = headers.includes("Transaction ID") && headers.includes("Transaction type");
  if (!wise && !sumup) throw new Error("Use a Wise balance statement or SumUp transactions CSV. Use statements consistently; Wise history exports can overlap them.");
  if (!/^[A-Z]{3}$/.test(sumupCurrency)) throw new Error("Enter the three-letter SumUp export currency.");
  const occurrences = new Map();
  return Promise.all(rows.map(async (values, index) => {
    const raw = Object.fromEntries(headers.map((h, i) => [h, values[i] || ""]));
    const provider = wise ? "Wise" : "SumUp";
    const reference = raw[wise ? "TransferWise ID" : "Transaction ID"];
    const date = sourceDate(raw.Date || "");
    const amount = Number(raw[wise ? "Amount" : "Total amount"]);
    const currency = wise ? raw.Currency : (raw.Currency || sumupCurrency);
    if (!reference || !Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency) || raw[wise ? "Amount" : "Total amount"] === "") {
      throw new Error(`Check the ID, amount and currency on row ${index + 2}. Nothing was imported.`);
    }
    const kind = sumup
      ? (text(raw["Transaction type"]) === "sale" && text(raw.Status) === "successful" ? "payment" : "excluded")
      : (/sumup|balance transfer|conversion/i.test(`${raw.Description} ${raw["Payment Reference"]}`) ? "transfer" : "payment");
    // Include signed amount, currency and type: Wise IDs alone lose reversals/FX legs.
    const identity = JSON.stringify([provider, reference, currency, cents(amount), raw.Date, raw["Transaction type"] || "", raw.Status || ""]);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${identity}:${occurrence}`));
    const id = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
    return { id, provider, reference, date, amount, currency, kind, filename, raw,
      description: [raw.Description, raw["Payment Reference"], raw["Payer Name"], raw["Payee Name"], raw.Merchant].filter(Boolean).join(" · "),
    };
  }));
}

export function transactionConsideration(tx) {
  if (tx.type === "trade") {
    const direction = tx.cashDirection || tx.cash?.direction;
    if (!["in", "out"].includes(direction)) return null;
    return { amount: Number(tx.cashAmount ?? tx.cash?.amount ?? 0) * (direction === "out" ? -1 : 1), currency: tx.currency || "EUR" };
  }
  if (!["sale", "sell", "buy"].includes(tx.type)) return null;
  return { amount: Number(tx.totalValue ?? tx.totalAmount ?? tx.totals?.gross ?? 0) * (tx.type === "buy" ? -1 : 1), currency: tx.currency || "EUR" };
}

export function transactionLabel(tx) {
  return [...(tx.itemsOut || tx.cards || []), ...(tx.itemsIn || [])].map((item) => item.name).filter(Boolean).join(" + ") || tx.notes || tx.type;
}

// SumUp exports repeat each sale as a payout row. Payout is the net amount
// contributed to the bank deposit; Total amount is the original gross sale.
export function identifyTransfers(sources) {
  const batches = new Map();
  const seen = new Set();
  for (const source of sources) {
    const raw = source.raw || {};
    if (source.provider !== "SumUp" || text(raw["Transaction type"]) !== "payout" || text(raw.Status) !== "paid") continue;
    const amount = Number(raw.Payout);
    const date = Date.parse(raw["Payout date"]);
    if (!raw["Payout ID"] || !raw.Payout || !Number.isFinite(amount) || !Number.isFinite(date)) continue;
    const key = `${source.currency}:${raw["Payout ID"]}`;
    const identity = `${key}:${source.reference}:${raw.Date}:${cents(amount)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const batch = batches.get(key) || { currency: source.currency, reference: raw["Payout ID"], date, amount: 0 };
    batch.amount += cents(amount);
    batches.set(key, batch);
  }
  const transfers = new Map();
  const deposits = sources.filter((s) => s.provider === "Wise" && s.amount > 0);
  for (const source of sources) {
    if (source.kind === "excluded") continue;
    const description = `${source.description || ""} ${source.raw?.["Payer Name"] || ""} ${source.raw?.["Payment Reference"] || ""}`;
    if (source.kind === "transfer" || (source.provider === "Wise" && /\bsumup\b|balance transfer|conversion/i.test(description))) {
      transfers.set(source.id, "Transfer between accounts or currencies, identified by the statement description.");
      continue;
    }
    if (!deposits.includes(source)) continue;
    const matches = [...batches.values()].filter((batch) => batch.currency === source.currency && batch.amount === cents(source.amount)
      && source.date >= batch.date - 86400000 && source.date <= batch.date + 3 * 86400000);
    if (matches.length !== 1) continue;
    const batch = matches[0];
    // Ambiguous same-value deposits stay for review; never infer a transfer by size.
    if (deposits.filter((s) => s.currency === batch.currency && cents(s.amount) === batch.amount
      && s.date >= batch.date - 86400000 && s.date <= batch.date + 3 * 86400000).length !== 1) continue;
    transfers.set(source.id, `SumUp payout ${batch.reference}: net payout rows total ${(batch.amount / 100).toFixed(2)} ${batch.currency}, matching this Wise deposit. Money moved between accounts; no new sale.`);
  }
  return transfers;
}

export const statementEvidence = (sources) => sources.map((s) => `${s.provider} statement reference ${s.reference}`).join("; ");

export function planAutomaticReconciliation({ sources, transactions, reviews = [], draft = null }) {
  const claimed = new Set(reviews.flatMap((r) => r.sourceIds));
  const reserved = new Set(draft?.sourceIds || []);
  const reservedDeals = new Set(draft?.transactionIds || []);
  const transfers = identifyTransfers(sources);
  const pending = sources.filter((s) => !claimed.has(s.id) && s.kind !== "excluded");
  const usable = transactions.filter((tx) => !tx.reconciliationId);
  const candidates = new Map(pending.filter((s) => !transfers.has(s.id)).map((s) => [s.id, usable.filter((tx) => {
    const amount = transactionConsideration(tx);
    return amount && amount.currency === s.currency && cents(amount.amount) === cents(s.amount)
      && s.amount !== 0 && Math.abs(s.date - Number(tx.ts)) <= 3 * 86400000;
  })]));
  const plans = [];
  for (const source of pending) {
    if (reserved.has(source.id) || !source.amount) continue;
    const reason = transfers.get(source.id);
    const exact = candidates.get(source.id) || [];
    const tx = exact.length === 1 ? exact[0] : null;
    // One exact deal, one possible source, same currency, no amount correction.
    const unique = tx && !reservedDeals.has(tx.id) && [...candidates.values()].filter((list) => list.some((candidate) => candidate.id === tx.id)).length === 1;
    if (!reason && !unique) continue;
    plans.push({ sourceIds: [source.id], transactionIds: reason ? [] : [tx.id], sources: [source], transactions: reason ? [] : [tx],
      amounts: reason ? {} : { [tx.id]: transactionConsideration(tx).amount }, rates: {}, currency: source.currency,
      classification: reason ? "transfer" : "cards", resolutionMode: "automatic",
      note: reason || "Automatically matched: unique exact amount and currency within three days, with no competing payment or sale. App amounts unchanged.",
      evidence: `${statementEvidence([source])}. Matching evidence only; receipt status has not been verified.`,
    });
  }
  return plans;
}

export function suggestMatches(sources, transactions, rates = {}, currency = "EUR") {
  if (!sources.length || sources.some((s) => s.kind !== "payment")) return [];
  const amount = sources.reduce((sum, s) => sum + s.amount * (s.currency === currency ? 1 : Number(rates[s.currency] || 0)), 0);
  const missingFX = sources.some((s) => s.currency !== currency && !(Number(rates[s.currency]) > 0));
  const words = tokens(sources.map((s) => s.description).join(" "));
  const candidates = transactions.filter((tx) => !tx.reconciliationId).map((tx) => {
    const consideration = transactionConsideration(tx);
    if (!consideration || consideration.currency !== currency || Math.sign(consideration.amount) !== Math.sign(amount)) return null;
    const days = Math.min(...sources.map((s) => Math.abs(s.date - Number(tx.ts)) / 86400000));
    const overlap = [...tokens(`${transactionLabel(tx)} ${tx.counterparty?.name || tx.counterpartyName || ""} ${tx.payment?.reference || ""}`)].filter((w) => words.has(w));
    if (days > 45 && !overlap.length) return null;
    return { tx, consideration, days, overlap };
  }).filter(Boolean).sort((a, b) => (b.overlap.length - a.overlap.length) || (a.days - b.days)).slice(0, 32);
  const groups = candidates.map((candidate) => [candidate]);
  // Bounded search for multi-card deals, including nearby separate app entries.
  for (let a = 0; a < candidates.length; a++) {
    for (let b = a + 1; b < candidates.length; b++) {
      groups.push([candidates[a], candidates[b]]);
      if (a < 12 && b < 12) for (let c = b + 1; c < Math.min(12, candidates.length); c++) groups.push([candidates[a], candidates[b], candidates[c]]);
    }
  }
  return groups.map((group) => {
    const total = group.reduce((sum, g) => sum + g.consideration.amount, 0);
    const difference = Math.abs(total - amount);
    const relative = difference / Math.max(Math.abs(amount), 1);
    const days = Math.max(...group.map((g) => g.days));
    const overlap = [...new Set(group.flatMap((g) => g.overlap))];
    const score = (missingFX ? 0 : Math.max(0, 55 - relative * 150)) + Math.max(0, 25 - days * 2) + Math.min(25, overlap.length * 10) - (group.length - 1) * 3;
    return { ids: group.map((g) => g.tx.id), total, difference, score,
      confidence: score >= 75 && !missingFX ? "Likely" : "Possible",
      reasons: [missingFX ? "FX rate needed to compare amounts" : (difference < 0.005 ? "Exact amount" : `${difference.toFixed(2)} ${currency} difference`), `Within ${Math.ceil(days)} day(s)`, ...(overlap.length ? [`Shared words: ${overlap.join(", ")}`] : []), ...(group.length > 1 ? [`${group.length} app transactions combined`] : [])],
    };
  }).filter((g) => g.score >= 30).sort((a, b) => b.score - a.score).slice(0, 8);
}

export function canCorrectAmount(tx) {
  // Purchase cost changes require inventory/COGS propagation; consignment has a separate settlement ledger.
  return ["sale", "sell"].includes(tx.type) && !tx.hasConsignment && (!tx.originalCurrency || tx.originalCurrency === tx.currency)
    && (!tx.inputCurrency || tx.inputCurrency === tx.currency);
}

export function correctedTransaction(tx, signedAmount, now) {
  const original = transactionConsideration(tx);
  if (!original || !Number.isFinite(signedAmount) || Math.sign(signedAmount) !== Math.sign(original.amount)) throw new Error("Invalid transaction amount or direction.");
  if (cents(original.amount) === cents(signedAmount)) return { ...tx };
  if (!canCorrectAmount(tx)) throw new Error("Correct purchases, trades, consignment and foreign-currency deal amounts in their original workflow before reconciling, so inventory costs and settlement values stay consistent.");
  const lines = tx.itemsOut || tx.cards || [];
  const weight = lines.reduce((sum, line) => sum + Number(line.totalPrice ?? Number(line.unitPrice || 0) * Number(line.quantity || 1)), 0);
  if (!lines.length || weight <= 0) throw new Error("This sale needs card lines with prices before its amount can be corrected.");
  let remaining = cents(signedAmount);
  const itemsOut = lines.map((line, index) => {
    const quantity = Math.max(1, Number(line.quantity) || 1);
    const lineWeight = Number(line.totalPrice ?? Number(line.unitPrice || 0) * quantity);
    const allocated = index === lines.length - 1 ? remaining : Math.round(cents(signedAmount) * lineWeight / weight);
    remaining -= allocated;
    return { ...line, totalPrice: allocated / 100, unitPrice: allocated / 100 / quantity };
  });
  const fees = Number(tx.totals?.fees ?? tx.fees?.total ?? tx.feesTotal ?? 0);
  return { ...tx, totalValue: signedAmount, totalAmount: signedAmount,
    ...(tx.originalTotal != null ? { originalTotal: signedAmount } : {}),
    itemsOut, ...(tx.cards ? { cards: itemsOut } : {}), netValue: signedAmount - fees, updatedAt: now,
    totals: { ...(tx.totals || {}), gross: signedAmount, net: signedAmount - fees, currency: original.currency,
      ...(tx.totals?.originalGross != null ? { originalGross: signedAmount } : {}) },
  };
}

export function validateReview({ sources, transactions, amounts, rates = {}, currency, note, evidence, classification = "cards" }) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a three-letter review currency.");
  if (!sources.length || sources.length > 8 || transactions.length > 8) throw new Error("Select 1–8 source payments and at most 8 app transactions.");
  if (new Set(sources.map((s) => s.id)).size !== sources.length || new Set(transactions.map((tx) => tx.id)).size !== transactions.length) throw new Error("A source or app transaction was selected twice.");
  if (sources.some((s) => s.kind === "excluded")) throw new Error("Failed sales, cancellations and payout rows cannot reconcile card sales.");
  if (!note?.trim() || !evidence?.trim()) throw new Error("Add your explanation and receipt/reference or missing-receipt explanation.");
  const converted = sources.map((s) => {
    if (!Number.isFinite(s.amount) || s.amount === 0) throw new Error("A source payment must have a non-zero numeric amount.");
    const rate = s.currency === currency ? 1 : Number(rates[s.currency]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Enter a verified ${s.currency} to ${currency} rate.`);
    return cents(s.amount * rate);
  });
  if (converted.some((value) => Math.sign(value) !== Math.sign(converted[0]))) throw new Error("Reconcile incoming and outgoing movements separately.");
  const total = converted.reduce((sum, value) => sum + value, 0);
  if (classification !== "cards") {
    if (!["transfer", "expense", "other"].includes(classification) || transactions.length) throw new Error("Non-card classifications cannot change card transactions.");
    return { total: total / 100, changes: [] };
  }
  if (sources.some((s) => s.kind !== "payment")) throw new Error("Transfers cannot reconcile card sales.");
  if (!transactions.length) throw new Error("Choose the app transactions to match.");
  const changes = transactions.map((tx) => {
    if (tx.reconciliationId) throw new Error("An app transaction was already finalized. Refresh the page.");
    const original = transactionConsideration(tx);
    if (!original || original.currency !== currency) throw new Error("Selected app transactions must use the review currency.");
    const value = amounts[tx.id];
    if (value === "" || value == null || !Number.isFinite(Number(value))) throw new Error("Enter every final amount.");
    if (Math.sign(Number(value)) !== Math.sign(total)) throw new Error("Payment and app transaction directions must match.");
    return { before: tx, after: correctedTransaction(tx, cents(value) / 100, Date.now()) };
  });
  if (changes.reduce((sum, c) => sum + cents(transactionConsideration(c.after).amount), 0) !== total) throw new Error("Final app amounts must equal the selected payments. Explain discounts in the note and adjust the sale amount, or select additional payments.");
  return { total: total / 100, changes };
}
