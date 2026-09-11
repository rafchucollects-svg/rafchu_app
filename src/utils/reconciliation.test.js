import { describe, it, expect } from "vitest";
import { readCSV, parseReconciliationCSV, suggestMatches, transactionConsideration, correctedTransaction, validateReview, identifyTransfers, planAutomaticReconciliation, allocateReconciliationAmounts, reconciliationAdjustment } from "./reconciliation";

const ts = Date.parse("2026-06-15T12:00:00Z");
const sale = (id, amount, name = "Pikachu") => ({ id, type: "sale", currency: "EUR", ts, totalValue: amount, itemsOut: [{ name, quantity: 1, unitPrice: amount, totalPrice: amount, costBasis: 20 }] });
const source = (id, amount, extra = {}) => ({ id, reference: id, provider: "Wise", kind: "payment", currency: "EUR", date: ts, amount, description: "", ...extra });
const review = (sources, transactions, amounts) => ({ sources, transactions, amounts, rates: {}, currency: "EUR", note: "Agreed deal price", evidence: "Show deal message; no receipt issued", classification: "cards" });

describe("implied sale adjustments", () => {
  it("allocates a ten-cent rounding difference across two sales and preserves their costs", () => {
    const sales = [sale("a", 39.9), sale("b", 100)];
    const amounts = allocateReconciliationAmounts(sales, 140, "EUR");
    expect(amounts).toEqual({ a: "39.93", b: "100.07" });
    const result = validateReview(review([source("p", 140)], sales, amounts));
    expect(result.total).toBe(140);
    expect(result.changes.every(({ after }) => after.itemsOut[0].costBasis === 20)).toBe(true);
    expect(sales.map((s) => s.totalValue)).toEqual([39.9, 100]);
    expect(reconciliationAdjustment(sales, 140, "EUR")).toMatchObject({ label: "Rounding up", amount: 0.1, original: 139.9 });
  });
  it("handles discounts, rounding down and larger price corrections", () => {
    const sales = [sale("a", 40), sale("b", 100)];
    expect(allocateReconciliationAmounts(sales, 126, "EUR")).toEqual({ a: "36", b: "90" });
    expect(reconciliationAdjustment(sales, 126, "EUR").label).toBe("Discount");
    expect(reconciliationAdjustment(sales, 139.9, "EUR").label).toBe("Rounding down");
    expect(reconciliationAdjustment(sales, 150, "EUR").label).toBe("Sale price adjustment");
    expect(reconciliationAdjustment(sales, 140, "EUR")).toBeNull();
  });
  it("balances cent remainders independently of selection order, including deep discounts", () => {
    const sales = [sale("c", 10), sale("a", 10), sale("b", 10)];
    expect(allocateReconciliationAmounts(sales, 10, "EUR")).toEqual({ a: "3.34", b: "3.33", c: "3.33" });
    expect(allocateReconciliationAmounts([...sales].reverse(), 10, "EUR")).toEqual(allocateReconciliationAmounts(sales, 10, "EUR"));
    expect(allocateReconciliationAmounts([sale("a", 0.01), sale("b", 0.01), sale("c", 100)], 0.03, "EUR")).toEqual({ a: "0.01", b: "0.01", c: "0.01" });
  });
  it("preserves fixed trade amounts and rejects unsupported corrections and currency mismatches", () => {
    const trade = { id: "trade", type: "trade", cashDirection: "in", cashAmount: 30, currency: "EUR" };
    expect(allocateReconciliationAmounts([trade, sale("s", 100)], 120, "EUR")).toEqual({ trade: "30", s: "90" });
    expect(() => allocateReconciliationAmounts([trade], 29, "EUR")).toThrow("original workflow");
    expect(() => allocateReconciliationAmounts([trade, sale("s", 100)], 20, "EUR")).toThrow("does not cover");
    expect(() => allocateReconciliationAmounts([sale("s", 100)], 90, "GBP")).toThrow("review currency");
  });
});

describe("automatic reconciliation", () => {
  const payout = (id, net) => source(id, 100, { provider: "SumUp", kind: "excluded", raw: { "Transaction type": "Payout", Status: "Paid", "Payout ID": "SUMUP TEST-BATCH", "Payout date": "2026-06-15", Payout: String(net), Date: "2026-06-14" } });
  it("recognizes a Wise deposit from summed net SumUp payouts, even without SumUp in the payer name", () => {
    const sources = [payout("a", 98.5), payout("b", 197), source("bank", 295.5, { description: "Received money from Sample Business" })];
    expect(identifyTransfers(sources).get("bank")).toContain("SUMUP TEST-BATCH");
    const plans = planAutomaticReconciliation({ sources, transactions: [sale("false-sale", 295.5)] });
    expect(plans).toHaveLength(1); expect(plans[0]).toMatchObject({ classification: "transfer", transactions: [], resolutionMode: "automatic" });
    expect(plans[0].note).toContain("no new sale");
  });
  it("does not classify by gross payout value, size, wrong currency, or ambiguous deposits", () => {
    const sources = [payout("a", 98.5), source("gross", 100), source("large", 4000), source("foreign", 98.5, { currency: "GBP" })];
    expect(identifyTransfers(sources).size).toBe(0);
    expect(identifyTransfers([payout("a", 98.5), source("b", 98.5), source("c", 98.5)]).size).toBe(0);
  });
  it("automatically matches only exact, unique, recent same-currency deals", () => {
    const sources = [source("p", 100), source("discount", 189), source("foreign", 50, { currency: "USD" })];
    const plans = planAutomaticReconciliation({ sources, transactions: [sale("exact", 100), sale("price", 190), sale("eur", 50)] });
    expect(plans).toHaveLength(1); expect(plans[0].transactionIds).toEqual(["exact"]); expect(plans[0].amounts).toEqual({ exact: 100 });
    expect(planAutomaticReconciliation({ sources: [source("p", 100, { date: ts + 5 * 86400000 })], transactions: [sale("s", 100)] })).toHaveLength(0);
  });
  it("leaves competing payments, duplicate deals, existing reviews, and saved drafts for manual handling", () => {
    expect(planAutomaticReconciliation({ sources: [source("p", 100), source("q", 100)], transactions: [sale("s", 100)] })).toEqual([]);
    expect(planAutomaticReconciliation({ sources: [source("p", 100)], transactions: [sale("s", 100), sale("t", 100)] })).toEqual([]);
    const input = { sources: [source("p", 100)], transactions: [sale("s", 100)] };
    expect(planAutomaticReconciliation({ ...input, reviews: [{ sourceIds: ["p"] }] })).toEqual([]);
    expect(planAutomaticReconciliation({ ...input, draft: { sourceIds: ["p"] } })).toEqual([]);
    expect(planAutomaticReconciliation({ ...input, transactions: [{ ...sale("s", 100), reconciliationId: "done" }] })).toEqual([]);
  });
});

describe("reconciliation import", () => {
  it("reads quoted commas, escaped quotes and embedded newlines", () => {
    expect(readCSV('a,b\r\n"card, name","line 1\n""line 2"""')).toEqual([["a", "b"], ["card, name", 'line 1\n"line 2"']]);
  });
  it("preserves Wise reversals, currencies and exact duplicate legs; IDs survive repeat imports", async () => {
    const csv = "TransferWise ID,Date,Amount,Currency,Description\nX,05/06/2026,40,EUR,Card\nX,05/06/2026,-40,EUR,Reversal\nX,05/06/2026,40,USD,FX\nX,05/06/2026,40,EUR,Card";
    const rows = await parseReconciliationCSV(csv);
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
    expect(new Date(rows[0].date).getMonth()).toBe(5);
    expect((await parseReconciliationCSV(csv, { filename: "again.csv" })).map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
  it("excludes SumUp payouts, failed and cancelled sales and requires an explicit export currency", async () => {
    const rows = await parseReconciliationCSV("Date,Transaction ID,Transaction type,Status,Total amount\n2026-06-15,S1,Sale,Successful,100\n2026-06-15,S1,Payout,Successful,98\n2026-06-15,S2,Sale,Failed,50\n2026-06-15,S3,Sale,Cancelled,20", { sumupCurrency: "GBP" });
    expect(rows.map((r) => r.kind)).toEqual(["payment", "excluded", "excluded", "excluded"]);
    expect(rows[0].currency).toBe("GBP");
  });
  it("rejects malformed amounts and unsupported formats instead of importing zeros", async () => {
    await expect(parseReconciliationCSV("TransferWise ID,Date,Amount,Currency\nX,2026-06-15,abc,EUR")).rejects.toThrow("amount");
    await expect(parseReconciliationCSV("Direction,Created on\nIN,2026-06-15")).rejects.toThrow("balance statement");
  });
});

describe("advisory matching", () => {
  it("finds two app deals against split transfers without reusing finalized records", () => {
    const suggestions = suggestMatches([source("p1", 100), source("p2", 200)], [sale("a", 120), sale("b", 180), { ...sale("locked", 300), reconciliationId: "done" }]);
    expect(suggestions[0].ids.sort()).toEqual(["a", "b"]);
    expect(suggestions[0].reasons).toContain("Exact amount");
    expect(suggestions.flatMap((s) => s.ids)).not.toContain("locked");
  });
  it("suggests a named discounted deal and compares only the cash leg of a trade", () => {
    const trade = { id: "t", type: "trade", currency: "EUR", ts, totalValue: 900, cashAmount: 220, cashDirection: "in", itemsOut: [{ name: "Gengar" }] };
    expect(transactionConsideration(trade).amount).toBe(220);
    expect(suggestMatches([source("p", 220, { description: "Gengar" })], [trade])[0].ids).toEqual(["t"]);
    expect(suggestMatches([source("p", 190, { description: "Pikachu" })], [sale("s", 200)])[0].difference).toBe(10);
  });
  it("never suggests payout transfers, mismatched directions or unverified currency conversions", () => {
    expect(suggestMatches([source("p", 100, { kind: "transfer" })], [sale("s", 100)])).toEqual([]);
    expect(suggestMatches([source("p", -100)], [sale("s", 100)])).toEqual([]);
    expect(suggestMatches([source("p", 100, { currency: "GBP" })], [sale("s", 120)])).toEqual([]);
    expect(suggestMatches([source("p", 100, { currency: "GBP" })], [sale("s", 120)], { GBP: 1.2 })[0].difference).toBe(0);
  });
});

describe("review and corrections", () => {
  it("preserves cost basis and original objects while allocating discount cents exactly", () => {
    const before = { ...sale("s", 300), itemsOut: [1, 2, 3].map(() => ({ name: "Card", quantity: 1, unitPrice: 100, costBasis: 20 })) };
    const after = correctedTransaction(before, 280, ts);
    expect(after.itemsOut.map((line) => line.totalPrice)).toEqual([93.33, 93.33, 93.34]);
    expect(after.itemsOut.map((line) => line.costBasis)).toEqual([20, 20, 20]);
    expect(after.totalValue).toBe(280);
    expect(after.totals.gross).toBe(280);
    expect(before.totalValue).toBe(300);
  });
  it("requires amounts to balance and explanation/evidence even for exact matches", () => {
    const input = review([source("p", 190)], [sale("s", 200)], { s: 190 });
    expect(validateReview(input).total).toBe(190);
    expect(() => validateReview({ ...input, amounts: { s: 200 } })).toThrow("do not equal");
    expect(() => validateReview({ ...input, evidence: "" })).toThrow("receipt");
    expect(() => validateReview({ ...input, amounts: { s: "" } })).toThrow("every final amount");
  });
  it("requires verified FX and compares converted payment cents", () => {
    const input = review([source("p", 100, { currency: "GBP" })], [sale("s", 120)], { s: 120 });
    expect(() => validateReview(input)).toThrow("verified GBP");
    expect(validateReview({ ...input, rates: { GBP: 1.2 } }).total).toBe(120);
  });
  it("rejects cost-sensitive price corrections and mixed incoming/outgoing groups", () => {
    expect(() => correctedTransaction({ ...sale("p", 100), type: "buy" }, -90, ts)).toThrow("inventory");
    expect(() => correctedTransaction({ ...sale("p", 100), hasConsignment: true }, 90, ts)).toThrow("settlement");
    expect(() => validateReview(review([source("in", 200), source("out", -100)], [sale("s", 100)], { s: 100 }))).toThrow("separately");
  });
  it("classifies non-card movements without silently posting card revenue", () => {
    const input = { ...review([source("p", -2400)], [], {}), classification: "expense" };
    expect(validateReview(input)).toEqual({ total: -2400, changes: [] });
    expect(() => validateReview({ ...input, transactions: [sale("s", 100)] })).toThrow("cannot change");
  });
});
