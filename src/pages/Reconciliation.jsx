import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { parseReconciliationCSV, suggestMatches, transactionConsideration, transactionLabel, canCorrectAmount, validateReview } from "@/utils/reconciliation";
import { loadReconciliation, importReconciliationSources, saveReconciliationDraft, finalizeReconciliation } from "@/utils/reconciliationStore";

const emptyDraft = { sourceIds: [], transactionIds: [], amounts: {}, rates: {}, currency: "EUR", note: "", evidence: "", classification: "cards" };
const money = (amount, currency) => `${Number(amount).toFixed(2)} ${currency}`;
const day = (value) => new Date(value).toLocaleDateString();
const fieldClass = "w-full rounded-lg border border-border bg-background p-2 text-sm";

export function Reconciliation() {
  const { db, user } = useApp();
  const [data, setData] = useState({ sources: [], reviews: [], transactions: [] });
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [sumupCurrency, setSumupCurrency] = useState("EUR");
  const refresh = useCallback(async (restoreDraft = false) => {
    if (!user || !db) return;
    const [reconciliation, snapshot] = await Promise.all([
      loadReconciliation(db, user.uid), getDocs(collection(db, "transactions", user.uid, "entries")),
    ]);
    setData({ ...reconciliation, transactions: snapshot.docs.map((snap) => ({ ...snap.data(), id: snap.id })).sort((a, b) => b.ts - a.ts) });
    if (restoreDraft && reconciliation.draft) setDraft({ ...emptyDraft, ...reconciliation.draft });
  }, [db, user]);
  useEffect(() => {
    refresh(true).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [refresh]);
  const claimed = useMemo(() => new Set(data.reviews.flatMap((review) => review.sourceIds)), [data.reviews]);
  const available = data.sources.filter((source) => !claimed.has(source.id) && source.kind !== "excluded");
  const sources = available.filter((source) => draft.sourceIds.includes(source.id));
  const transactions = data.transactions.filter((tx) => draft.transactionIds.includes(tx.id));
  const review = { ...draft, sources, transactions };
  const hasRates = sources.every((source) => source.currency === draft.currency || Number(draft.rates[source.currency]) > 0);
  const paymentTotal = sources.reduce((total, source) => total + Math.round(source.amount * (source.currency === draft.currency ? 1 : Number(draft.rates[source.currency] || 0)) * 100), 0) / 100;
  const finalTotal = transactions.reduce((total, tx) => total + Math.round(Number(draft.amounts[tx.id] || 0) * 100), 0) / 100;
  const suggestions = useMemo(() => suggestMatches(
    data.sources.filter((source) => draft.sourceIds.includes(source.id) && !claimed.has(source.id)), data.transactions, draft.rates, draft.currency,
  ), [data, draft.sourceIds, draft.rates, draft.currency, claimed]);
  let validation = "";
  try {
    if (sources.length !== draft.sourceIds.length || transactions.length !== draft.transactionIds.length) throw new Error("A selected record is no longer available. Clear the selection and review again.");
    validateReview(review);
  } catch (err) { validation = err.message; }
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const chooseTransactions = (ids) => setDraft((current) => ({ ...current, transactionIds: ids,
    amounts: Object.fromEntries(ids.map((id) => [id, current.amounts[id] ?? String(transactionConsideration(data.transactions.find((tx) => tx.id === id))?.amount ?? 0)])),
  }));
  const run = async (action) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const upload = (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    run(async () => {
      const parsed = await parseReconciliationCSV(await file.text(), { filename: file.name, sumupCurrency });
      const added = await importReconciliationSources(db, user.uid, parsed);
      await refresh(); setMessage(`${added} new rows imported; ${parsed.length - added} already present. Payouts and unsuccessful SumUp rows stay outside card matching.`);
    });
  };
  const finalize = () => run(async () => {
    await finalizeReconciliation(db, user.uid, review);
    setDraft(emptyDraft);
    await refresh();
    setMessage("Finalized and added to the accountant report. Original values and your explanation are preserved.");
    try { await saveReconciliationDraft(db, user.uid, emptyDraft); }
    catch { setMessage("Finalized successfully. The saved draft could not be cleared; finalized payments cannot be used twice."); }
  });
  if (!user) return <p>Please sign in to reconcile transactions.</p>;
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Reconciliation</h1><p className="mt-2 text-muted-foreground">Match Wise and SumUp payments to card deals, review differences, and keep a record for your accountant.</p></div>
      <Link className="text-sm underline" to="/vendor/tax-reporting">Accountant report →</Link>
    </header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-semibold">1. Import statements</h2>
      <p className="text-sm text-muted-foreground">Upload Wise balance statements and SumUp transactions CSVs. Repeated uploads are skipped. The original rows are retained. Use the same export currency for repeat SumUp imports.</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">SumUp export currency<input aria-label="SumUp export currency" className={fieldClass} value={sumupCurrency} maxLength={3} onChange={(e) => setSumupCurrency(e.target.value.toUpperCase())} /></label>
        <label className="text-sm">CSV file<input aria-label="Import reconciliation CSV" className="block mt-1 text-sm" type="file" accept=".csv,text/csv" onChange={upload} disabled={busy || loading} /></label>
        <Button disabled={busy || loading} onClick={() => run(() => refresh())}>Refresh</Button>
      </div>
      <p className="text-sm">{available.length} awaiting review · {data.reviews.length} finalized groups · {data.sources.filter((s) => s.kind === "excluded").length} excluded SumUp rows</p>
    </section>
    {loading ? <p role="status">Loading records…</p> : <fieldset disabled={busy} className="grid min-w-0 gap-6 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold">2. Choose related payments</h2>
        <p className="text-sm text-muted-foreground">Select up to 8 payments for one deal. Group split transfers here. Incoming and outgoing payments are reviewed separately.</p>
        <input aria-label="Search payments" placeholder="Search reference, payer, date or amount" className={fieldClass} value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} />
        <div className="max-h-96 overflow-y-auto space-y-2">
          {available.filter((s) => `${s.provider} ${s.reference} ${s.description} ${s.amount} ${day(s.date)}`.toLowerCase().includes(sourceSearch.toLowerCase())).map((source) => <label key={source.id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input type="checkbox" aria-label={`Select ${source.provider} ${source.reference}`} className="mt-1 h-4 w-4 shrink-0 appearance-auto accent-amber-700" checked={draft.sourceIds.includes(source.id)} onChange={(e) => set("sourceIds", e.target.checked ? [...draft.sourceIds, source.id] : draft.sourceIds.filter((id) => id !== source.id))} />
            <span className="min-w-0 break-words"><strong>{money(source.amount, source.currency)}</strong> · {source.provider} · {day(source.date)}<span className="block">{source.description || source.reference}</span><small>{source.reference}{source.kind === "transfer" ? " · Transfer / payout — classify separately" : ""}</small></span>
          </label>)}
          {!available.length && <p className="text-sm text-muted-foreground">No unreviewed payments. Import a statement to begin.</p>}
        </div>
        <label className="block text-sm">Review currency<input className={fieldClass} value={draft.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></label>
        {[...new Set(sources.map((s) => s.currency))].filter((c) => c !== draft.currency).map((c) => <label className="block text-sm" key={c}>Verified rate: 1 {c} in {draft.currency}<input type="number" step="any" min="0" className={fieldClass} value={draft.rates[c] || ""} onChange={(e) => set("rates", { ...draft.rates, [c]: e.target.value })} /></label>)}
        <label className="block text-sm">Movement type<select className={fieldClass} value={draft.classification} onChange={(e) => setDraft((current) => ({ ...current, classification: e.target.value, transactionIds: [], amounts: {} }))}>
          <option value="cards">Card deal</option><option value="transfer">Transfer / payout</option><option value="expense">Expense / reimbursement</option><option value="other">Other — accountant review</option>
        </select></label>
        {draft.classification !== "cards" && <p className="text-sm text-muted-foreground">This records a classification in the report. Record expenses or other income in their normal ledger as well; this does not create an expense or income entry.</p>}
      </section>
      <section className="min-w-0 rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold">3. Review suggested card deals</h2>
        {draft.classification === "cards" && <>
          <p className="text-sm text-muted-foreground">Suggestions compare amounts, dates and shared card or payer names, including combinations of up to three deals. They need your review.</p>
          {suggestions.map((suggestion) => <div key={suggestion.ids.join("+")} className="rounded-lg border border-border p-3 text-sm space-y-2">
            <p><strong>{suggestion.confidence}</strong> · {money(suggestion.total, draft.currency)}</p>
            <p>{suggestion.ids.map((id) => transactionLabel(data.transactions.find((tx) => tx.id === id))).join(" / ")}</p>
            <p className="text-muted-foreground">{suggestion.reasons.join(" · ")}</p>
            <Button onClick={() => chooseTransactions(suggestion.ids)}>Use suggestion</Button>
          </div>)}
          {!suggestions.length && <p className="text-sm text-muted-foreground">Select payments to see suggestions, or find the deal manually below.</p>}
          <input aria-label="Search app transactions" placeholder="Find any card, deal or counterparty" className={fieldClass} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-60 overflow-y-auto space-y-2">
            {data.transactions.filter((tx) => !tx.reconciliationId && transactionConsideration(tx) && `${transactionLabel(tx)} ${tx.counterparty?.name || tx.counterpartyName || ""} ${tx.id}`.toLowerCase().includes(search.toLowerCase())).map((tx) => <label key={tx.id} className="flex gap-2 text-sm border-b border-border py-2">
              <input type="checkbox" aria-label={`Select deal ${transactionLabel(tx)}`} className="mt-1 h-4 w-4 shrink-0 appearance-auto accent-amber-700" checked={draft.transactionIds.includes(tx.id)} onChange={(e) => chooseTransactions(e.target.checked ? [...draft.transactionIds, tx.id] : draft.transactionIds.filter((id) => id !== tx.id))} />
              <span>{day(tx.ts)} · {transactionLabel(tx)}<span className="block text-muted-foreground">{tx.type} · {money(transactionConsideration(tx).amount, transactionConsideration(tx).currency)}</span></span>
            </label>)}
          </div>
          <p className="text-sm">No existing record? <Link className="underline" to="/vendor/deal-calculator">Record the deal</Link>, then return and refresh.</p>
        </>}
      </section>
      <section className="rounded-xl border border-border bg-card p-5 space-y-4 lg:col-span-2">
        <h2 className="font-semibold">4. Confirm the final record</h2>
        <p className="rounded-lg bg-muted p-3 text-sm">{sources.length} selected payment(s): <strong>{hasRates ? money(paymentTotal, draft.currency) : "FX rate needed"}</strong>
          {draft.classification === "cards" && <> · Final app amount: <strong>{money(finalTotal, draft.currency)}</strong> · Remaining difference: <strong>{hasRates ? money(paymentTotal - finalTotal, draft.currency) : "FX rate needed"}</strong></>}
        </p>
        {transactions.map((tx) => <label className="block text-sm" key={tx.id}>{transactionLabel(tx)} — original {money(transactionConsideration(tx)?.amount, tx.currency || "EUR")}
          <input aria-label={`Final amount for ${transactionLabel(tx)}`} type="number" step="0.01" className={fieldClass} value={draft.amounts[tx.id] ?? ""} disabled={!canCorrectAmount(tx)} onChange={(e) => set("amounts", { ...draft.amounts, [tx.id]: e.target.value })} />
          <span className="text-muted-foreground">{canCorrectAmount(tx) ? "A price correction is allocated across this sale’s card lines; original values remain in the audit record." : "Amount changes require the original deal workflow to preserve inventory costs, trade values and settlements."}</span>
        </label>)}
        <label className="block text-sm">Explanation / recommendation<textarea className={fieldClass} rows={3} value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="Why these payments and cards belong together; discounts, split payments or entry corrections." /></label>
        <label className="block text-sm">Receipt, supporting reference, or missing-receipt explanation<textarea className={fieldClass} rows={2} value={draft.evidence} onChange={(e) => set("evidence", e.target.value)} placeholder="Reference a receipt or deal message, or explain what evidence is available if no receipt was issued." /></label>
        <p className="text-sm text-muted-foreground">Finalization saves the source rows, FX rates, original and final app values, your explanation and reviewer. Finalized deals are locked against edits and deletion. Receipt and tax eligibility still need their usual review.</p>
        {validation && <p className="text-sm text-amber-800" role="status">{validation}</p>}
        <div className="flex gap-3 flex-wrap"><Button onClick={() => run(async () => { await saveReconciliationDraft(db, user.uid, draft); setMessage("Draft saved. You can return to finish it later."); })}>Save draft</Button>
          <Button disabled={Boolean(validation) || busy} onClick={finalize}>Approve and finalize</Button>
          <Button onClick={() => setDraft(emptyDraft)}>Clear selection</Button>
        </div>
      </section>
    </fieldset>}
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-semibold">Finalized review history</h2>
      {!data.reviews.length && <p className="text-sm text-muted-foreground">Approved groups will appear here and in the accountant package.</p>}
      {data.reviews.map((entry) => <details className="rounded-lg border border-border p-3 text-sm" key={entry.id}>
        <summary className="cursor-pointer">{day(entry.finalizedAt)} · {money(entry.total, entry.currency)} · {entry.classification} · {entry.sourceIds.length} source row(s)</summary>
        <p className="mt-2 whitespace-pre-wrap">{entry.note}</p><p className="mt-2 whitespace-pre-wrap">Evidence: {entry.evidence}</p>
        {entry.changes.map(({ before, after }) => <p key={before.id}>{transactionLabel(before)}: {money(transactionConsideration(before).amount, before.currency || "EUR")} → {money(transactionConsideration(after).amount, after.currency || "EUR")}</p>)}
        <p className="mt-2 break-all text-muted-foreground">Review {entry.id} · reviewer {entry.reviewer}</p>
      </details>)}
    </section>
  </div>;
}
