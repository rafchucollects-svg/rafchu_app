import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { CheckCircle2, ArrowRight, ArrowLeftRight, Upload, Search } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { parseReconciliationCSV, suggestMatches, transactionConsideration, transactionLabel, canCorrectAmount, validateReview, identifyTransfers, statementEvidence } from "@/utils/reconciliation";
import { loadReconciliation, importReconciliationSources, saveReconciliationDraft, finalizeReconciliation, automaticallyReconcile } from "@/utils/reconciliationStore";

const money = (amount, currency) => `${Number(amount).toFixed(2)} ${currency}`;
const day = (value) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fieldClass = "w-full rounded-lg border border-border bg-background p-2 text-sm";
const panelClass = "rounded-2xl border border-border bg-card p-5 sm:p-6";
const checkClass = "h-4 w-4 shrink-0 appearance-auto accent-amber-700";
const emptyDraft = { sourceIds: [], transactionIds: [], amounts: {}, rates: {}, currency: "EUR", note: "", evidence: "", classification: "cards" };

function PaymentReview({ source, pending, transactions: allTransactions, transfers, restoredDraft, onSave, onLater, busy }) {
  const [draft, setDraft] = useState(() => ({ ...emptyDraft, sourceIds: [source.id], currency: source.currency,
    classification: transfers.has(source.id) ? "transfer" : "cards",
    note: transfers.get(source.id) || "", evidence: "",
    ...(restoredDraft?.sourceIds?.includes(source.id) ? restoredDraft : {}),
  }));
  const [search, setSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [error, setError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const sources = pending.filter((s) => draft.sourceIds.includes(s.id));
  const transactions = allTransactions.filter((tx) => draft.transactionIds.includes(tx.id));
  const hasRates = sources.every((s) => s.currency === draft.currency || Number(draft.rates[s.currency]) > 0);
  const total = sources.reduce((sum, s) => sum + Math.round(s.amount * (s.currency === draft.currency ? 1 : Number(draft.rates[s.currency] || 0)) * 100), 0) / 100;
  const finalTotal = transactions.reduce((sum, tx) => sum + Math.round(Number(draft.amounts[tx.id] || 0) * 100), 0) / 100;
  const effectiveSources = sources.map((s) => transfers.has(s.id) ? { ...s, kind: "transfer" } : s);
  const suggestions = useMemo(() => suggestMatches(effectiveSources, allTransactions, draft.rates, draft.currency), [effectiveSources, allTransactions, draft.rates, draft.currency]);
  const set = (key, value) => { setError(""); setDraftMessage(""); setDraft((d) => ({ ...d, [key]: value })); };
  const choose = (ids) => {
    const selected = allTransactions.filter((tx) => ids.includes(tx.id));
    const single = selected.length === 1 && hasRates && canCorrectAmount(selected[0]) && transactionConsideration(selected[0]).currency === draft.currency;
    setDraft((d) => ({ ...d, transactionIds: ids, amounts: Object.fromEntries(selected.map((tx) => [tx.id, String(single ? total : transactionConsideration(tx).amount)])) }));
    setError(""); setDraftMessage("");
  };
  const review = { ...draft, sources, transactions, resolutionMode: "manual",
    note: draft.note.trim() || (draft.classification === "cards" ? "User confirmed the selected card deal(s) against the statement payment(s)." : `User classified this movement as ${draft.classification}.`),
    evidence: draft.evidence.trim() || `${statementEvidence(sources)}. No separate receipt was attached in this review.`,
  };
  let validation = "";
  try {
    if (sources.length !== draft.sourceIds.length || transactions.length !== draft.transactionIds.length) throw new Error("A selected record is no longer available. Refresh and choose it again.");
    if (draft.classification === "cards" && effectiveSources.some((s) => s.kind === "transfer")) throw new Error("This is an account transfer. Choose Transfer / payout to clear it without creating a sale.");
    validateReview(review);
  } catch (err) { validation = err.message; }
  const save = async (asDraft = false) => {
    setError(""); setDraftMessage("");
    if (!asDraft && validation) { setError(validation); return; }
    try { await onSave(asDraft ? draft : review, asDraft); if (asDraft) setDraftMessage("Progress saved. This payment still needs review."); }
    catch (err) { setError(err.message); }
  };
  const changed = transactions.some((tx) => Math.round(transactionConsideration(tx).amount * 100) !== Math.round(Number(draft.amounts[tx.id]) * 100));
  return <section className={panelClass} aria-label="Review one payment">
    <div className="flex flex-wrap justify-between gap-3 border-b border-border pb-5">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment to review</p><h2 className="mt-2 text-3xl font-bold tabular-nums">{money(source.amount, source.currency)}</h2><p className="mt-1 text-sm text-muted-foreground">{source.amount > 0 ? "Received" : "Paid"} · {source.provider} · {day(source.date)}</p></div>
      <div className="max-w-xl text-sm"><p className="font-medium break-words">{source.description || source.reference}</p><p className="mt-2 break-all text-xs text-muted-foreground">{source.reference}</p></div>
    </div>
    <fieldset disabled={busy} className="min-w-0 space-y-5 pt-5">
      <label className="block max-w-sm text-sm font-medium">What is this payment?<select aria-label="Movement type" className={`${fieldClass} mt-1`} value={draft.classification} onChange={(e) => setDraft((d) => ({ ...d, classification: e.target.value, transactionIds: [], amounts: {} }))}>
        <option value="cards">Card sale / purchase / trade</option><option value="transfer">Transfer / payout</option><option value="expense">Expense / reimbursement</option><option value="other">Other — accountant review</option>
      </select></label>
      {draft.classification !== "cards" ? <div className="rounded-xl bg-muted p-4 text-sm"><ArrowLeftRight className="mb-2 h-5 w-5" /><p>{transfers.get(source.id) || "Save this classification without linking or changing a card sale."}</p><p className="mt-2 text-muted-foreground">{draft.classification === "transfer" ? "Moving money between your accounts does not create another sale." : "This adds a note for your accountant. Expenses and other income still belong in their usual ledger."}</p></div> : <>
        <div><h3 className="font-semibold">Which cards were involved?</h3><p className="mt-1 text-sm text-muted-foreground">Choose the matching deal below. A deal can contain several cards.</p></div>
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Recommended card deals">
          {suggestions.slice(0, 6).map((suggestion) => {
            const label = suggestion.ids.map((id) => transactionLabel(allTransactions.find((tx) => tx.id === id))).join(" / ");
            const selected = suggestion.ids.length === draft.transactionIds.length && suggestion.ids.every((id) => draft.transactionIds.includes(id));
            return <button type="button" aria-pressed={selected} aria-label={`Choose ${label}`} key={suggestion.ids.join("+")} onClick={() => choose(suggestion.ids)} className={`rounded-xl border-2 p-4 text-left transition-colors ${selected ? "border-amber-500 bg-amber-50 text-slate-900" : "border-border hover:border-amber-300"}`}>
              <span className="flex items-center justify-between gap-2 text-xs font-semibold"><span>{selected ? "Selected" : suggestion.confidence === "Likely" ? "Best match" : "Possible match"}</span>{selected && <CheckCircle2 className="h-4 w-4" />}</span>
              <span className="mt-2 block font-semibold">{label}</span><span className="mt-2 block text-sm">App: {money(suggestion.total, draft.currency)}</span>
              <span className="mt-1 block text-xs opacity-75">{suggestion.reasons.join(" · ")}</span>
            </button>;
          })}
        </div>
        {!suggestions.length && <p className="rounded-xl bg-muted p-4 text-sm">{source.currency !== draft.currency && !hasRates ? "Add a verified exchange rate below to compare this payment with your app deals." : "No close match found. Search for a card or classify the payment above."}</p>}
        <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Find another deal or select several</summary>
          <div className="mt-3 flex items-center gap-2"><Search className="h-4 w-4" /><input aria-label="Search app transactions" placeholder="Search card name or buyer" className={fieldClass} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="mt-3 max-h-64 overflow-y-auto space-y-2">{allTransactions.filter((tx) => !tx.reconciliationId && transactionConsideration(tx) && transactionConsideration(tx).currency === draft.currency && Math.sign(transactionConsideration(tx).amount) === Math.sign(source.amount) && (search.trim() ? `${transactionLabel(tx)} ${tx.counterparty?.name || tx.counterpartyName || ""}`.toLowerCase().includes(search.toLowerCase()) : Math.abs(Number(tx.ts) - source.date) < 45 * 86400000)).slice(0, 60).map((tx) => <label key={tx.id} className="flex gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" className={checkClass} aria-label={`Select deal ${transactionLabel(tx)}`} checked={draft.transactionIds.includes(tx.id)} onChange={(e) => choose(e.target.checked ? [...draft.transactionIds, tx.id] : draft.transactionIds.filter((id) => id !== tx.id))} /><span>{transactionLabel(tx)}<span className="block text-xs text-muted-foreground">{day(tx.ts)} · {money(transactionConsideration(tx).amount, draft.currency)}</span></span></label>)}</div>
          <p className="mt-3 text-sm">Deal missing from the app? <Link className="underline" to="/vendor/deal-calculator">Record the deal</Link>, then return and refresh.</p>
        </details>
        <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Split payment or different currency</summary>
          <p className="mt-3 text-sm text-muted-foreground">Add other payments belonging to the same deal before saving. Up to 8 payments and 8 app deals can be grouped.</p>
          <input aria-label="Search related payments" className={`${fieldClass} mt-3`} placeholder="Find another payment" value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} />
          <div className="mt-3 max-h-48 overflow-y-auto space-y-2">{pending.filter((s) => s.id !== source.id && !transfers.has(s.id) && Math.sign(s.amount) === Math.sign(source.amount) && `${s.description} ${s.reference} ${s.amount}`.toLowerCase().includes(paymentSearch.toLowerCase())).map((s) => <label key={s.id} className="flex gap-2 text-sm"><input className={checkClass} type="checkbox" aria-label={`Add payment ${s.reference}`} checked={draft.sourceIds.includes(s.id)} onChange={(e) => set("sourceIds", e.target.checked ? [...draft.sourceIds, s.id] : draft.sourceIds.filter((id) => id !== s.id))} /><span>{money(s.amount, s.currency)} · {day(s.date)} · {s.description || s.reference}</span></label>)}</div>
          <label className="mt-3 block text-sm">App deal currency<input aria-label="Review currency" className={fieldClass} value={draft.currency} maxLength={3} onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase(), transactionIds: [], amounts: {} }))} /></label>
          {[...new Set(sources.map((s) => s.currency))].filter((c) => c !== draft.currency).map((c) => <label key={c} className="mt-3 block text-sm">Verified rate: 1 {c} in {draft.currency}<input type="number" step="any" min="0" className={fieldClass} value={draft.rates[c] || ""} onChange={(e) => set("rates", { ...draft.rates, [c]: e.target.value })} /></label>)}
        </details>
        {transactions.length > 0 && <div className="rounded-xl bg-muted p-4 space-y-3"><h3 className="font-semibold">Confirm the amount</h3>
          {transactions.map((tx) => <label className="block text-sm" key={tx.id}>{transactionLabel(tx)}<span className="block text-xs text-muted-foreground">Recorded: {money(transactionConsideration(tx).amount, draft.currency)}</span><input aria-label={`Final amount for ${transactionLabel(tx)}`} type="number" step="0.01" className={`${fieldClass} mt-1 max-w-xs`} value={draft.amounts[tx.id] ?? ""} disabled={!canCorrectAmount(tx)} onChange={(e) => set("amounts", { ...draft.amounts, [tx.id]: e.target.value })} />{!canCorrectAmount(tx) && <span className="block text-xs">Change this amount in the original deal workflow to keep inventory costs and trade values consistent.</span>}</label>)}
          <p className="text-sm">Statement: <strong>{hasRates ? money(total, draft.currency) : "Exchange rate needed"}</strong> · Selected deals: <strong>{money(finalTotal, draft.currency)}</strong></p>
          {hasRates && Math.abs(total - finalTotal) > 0.005 && <p className="text-sm font-medium text-amber-800">{money(total - finalTotal, draft.currency)} still to allocate. Adjust the amount or add the remaining deal/payment.</p>}
          {changed && <p className="text-sm font-medium">Saving will update the selected sale amount(s) shown above. The original values are kept in the accountant report.</p>}
        </div>}
      </>}
      <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Notes and receipts (optional)</summary><p className="mt-2 text-sm text-muted-foreground">The statement reference is saved as supporting evidence. Add a deal message, receipt reference, or explain a discount if useful.</p><label className="mt-3 block text-sm">Note<textarea aria-label="Explanation / recommendation" className={fieldClass} rows={2} value={draft.note} onChange={(e) => set("note", e.target.value)} /></label><label className="mt-3 block text-sm">Receipt or other evidence<textarea aria-label="Receipt or other evidence" className={fieldClass} rows={2} value={draft.evidence} onChange={(e) => set("evidence", e.target.value)} /></label></details>
      <div className="border-t border-border pt-4 space-y-3">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
        {draftMessage && <p role="status" className="text-sm text-emerald-700">{draftMessage}</p>}
        <div className="flex flex-wrap gap-3"><Button onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save and next"}<ArrowRight className="ml-2 h-4 w-4" /></Button><Button variant="outline" onClick={onLater} disabled={busy}>Review later</Button><Button variant="ghost" onClick={() => save(true)} disabled={busy}>Save progress</Button></div>
        <p className="text-xs text-muted-foreground">Save and next clears this payment and adds its record to the accountant report. Save progress keeps it unfinished.</p>
      </div>
    </fieldset>
  </section>;
}

export function Reconciliation() {
  const { db, user } = useApp();
  const [data, setData] = useState({ sources: [], reviews: [], transactions: [], draft: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [later, setLater] = useState([]);
  const [sumupCurrency, setSumupCurrency] = useState("EUR");
  const inFlight = useRef(false);
  const reviewHeading = useRef(null);
  const previousPayment = useRef(null);
  const refresh = useCallback(async () => {
    if (!db || !user) return;
    const [reconciliation, snapshot] = await Promise.all([loadReconciliation(db, user.uid), getDocs(collection(db, "transactions", user.uid, "entries"))]);
    const next = { ...reconciliation, transactions: snapshot.docs.map((s) => ({ ...s.data(), id: s.id })) };
    setData(next);
    return next;
  }, [db, user]);
  useEffect(() => {
    setLoading(true);
    refresh().then((next) => setActiveId(next?.draft?.sourceIds?.[0] || null)).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [refresh]);
  const transfers = useMemo(() => identifyTransfers(data.sources), [data.sources]);
  const claimed = useMemo(() => new Set(data.reviews.flatMap((r) => r.sourceIds)), [data.reviews]);
  const pending = useMemo(() => data.sources.filter((s) => !claimed.has(s.id) && s.kind !== "excluded").sort((a, b) => b.date - a.date || a.id.localeCompare(b.id)), [data.sources, claimed]);
  const active = pending.find((s) => s.id === activeId) || pending.find((s) => !later.includes(s.id)) || pending[0];
  useEffect(() => {
    if (previousPayment.current && previousPayment.current !== active?.id) {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView?.({ block: "start" });
    }
    previousPayment.current = active?.id;
  }, [active?.id]);
  const autoMatches = data.reviews.filter((r) => r.resolutionMode === "automatic" && r.classification === "cards").reduce((n, r) => n + r.sourceIds.length, 0);
  const autoTransfers = data.reviews.filter((r) => r.resolutionMode === "automatic" && r.classification === "transfer").reduce((n, r) => n + r.sourceIds.length, 0);
  const manual = data.reviews.filter((r) => r.resolutionMode !== "automatic").reduce((n, r) => n + r.sourceIds.length, 0);
  const excluded = data.sources.filter((s) => s.kind === "excluded").length;
  const automatic = autoMatches + autoTransfers + excluded;
  const run = async (action) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try { return await action(); } finally { inFlight.current = false; setBusy(false); setProgress(""); }
  };
  const match = async () => {
    setProgress("Matching payments and identifying transfers…");
    return automaticallyReconcile(db, user.uid, ({ completed, total }) => setProgress(`Automatically cleared ${completed} of ${total} payments…`));
  };
  const upload = (event) => {
    const input = event.target;
    const files = [...(input.files || [])];
    if (!files.length) return;
    run(async () => {
      let added = 0, count = 0;
      // Parse every chosen file first; malformed files never start a partial import.
      const parsedFiles = [];
      for (const file of files) {
        setProgress(`Reading ${file.name}…`);
        try { parsedFiles.push({ file, rows: await parseReconciliationCSV(await file.text(), { filename: file.name, sumupCurrency }) }); }
        catch (err) { throw new Error(`${file.name}: ${err.message}`); }
      }
      for (const { file, rows } of parsedFiles) {
        count += rows.length;
        added += await importReconciliationSources(db, user.uid, rows, ({ processed, total }) => setProgress(`Importing ${file.name}: ${processed} of ${total} rows checked…`));
      }
      await match();
      await refresh();
      setMessage(`${added} new rows imported; ${count - added} already present. Automatic matching is complete. Review the remaining payments below.`);
    }).catch(async (err) => { setError(`${err.message} You can retry; imported rows and completed reviews will not be duplicated.`); try { await refresh(); } catch { /* Keep the last loaded records available. */ } }).finally(() => { input.value = ""; });
  };
  const save = async (review, asDraft) => run(async () => {
    if (asDraft) { await saveReconciliationDraft(db, user.uid, review); setData((current) => ({ ...current, draft: review })); return; }
    await finalizeReconciliation(db, user.uid, review);
    // Reflect the successful commit immediately, even if the following refresh fails.
    setData((current) => ({ ...current, draft: null, reviews: [...current.reviews, { ...review, id: `saved-${review.sources[0].id}`, sourceIds: review.sources.map((s) => s.id), changes: [], finalizedAt: Date.now(), reviewer: user.uid }], transactions: current.transactions.map((tx) => review.transactions.some((t) => t.id === tx.id) ? { ...tx, reconciliationId: "saved" } : tx) }));
    setActiveId(null);
    setMessage("Payment saved. Your accountant report is updated. Continue with the next payment.");
    try { await refresh(); } catch { setMessage("Payment saved. The latest list could not be refreshed; use Refresh when your connection returns."); }
  });
  if (!user) return <p>Please sign in to reconcile transactions.</p>;
  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <header className="flex flex-wrap justify-between items-start gap-4"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Accounting</p><h1 className="mt-1 text-3xl font-bold">Reconciliation</h1><p className="mt-2 text-muted-foreground">Upload your statements. We match what we can. You clear the rest, one payment at a time.</p></div><Link className="text-sm font-semibold underline" to="/vendor/tax-reporting">Accountant report →</Link></header>
    <section className={panelClass}><div className="flex items-start gap-3"><Upload className="mt-1 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Import statements</h2><p className="mt-1 text-sm text-muted-foreground">Choose your Wise balance statements and SumUp transactions CSVs together. Repeat uploads are skipped.</p></div></div><div className="mt-4 flex flex-wrap items-end gap-4"><label className="text-sm">CSV files<input aria-label="Import reconciliation CSV" type="file" multiple accept=".csv,text/csv" onChange={upload} disabled={busy || loading} className="mt-2 block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-100 file:px-4 file:py-2 file:font-semibold file:text-amber-950" /></label><label className="text-sm">SumUp export currency<input aria-label="SumUp export currency" className={`${fieldClass} mt-1 max-w-24`} value={sumupCurrency} maxLength={3} onChange={(e) => setSumupCurrency(e.target.value.toUpperCase())} /></label></div><p className="mt-3 text-xs text-muted-foreground">Exact, unambiguous matches are saved automatically without changing sale amounts. SumUp payouts into Wise are transfers, so sales are counted once.</p>
      {progress && <p role="status" className="mt-3 text-sm font-medium" aria-live="polite">{progress}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    </section>
    {loading ? <p role="status">Loading records…</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Reconciliation progress">{[[data.sources.length, "Imported rows"], [automatic, "Automatically classified"], [manual, "Manually cleared"], [pending.length, "Need your review"]].map(([count, label]) => <div key={label} className={`rounded-xl border p-4 ${label === "Need your review" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-border bg-card"}`}><p className="text-3xl font-bold tabular-nums">{count}</p><p className="mt-1 text-xs font-medium">{label}</p></div>)}</div>
      {data.sources.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">{autoMatches} exact matches · {autoTransfers} account transfers · {excluded} payout / unsuccessful rows excluded</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await match(); await refresh(); setMessage("Automatic matching complete. Remaining payments are ready for review."); }).catch(async (err) => { setError(err.message); try { await refresh(); } catch { /* Retry is available. */ } })}>Match imported statements</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => refresh()).catch((err) => setError(err.message))}>Refresh</Button></div></div>}
      {active ? <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={reviewHeading} tabIndex={-1} className="scroll-mt-24 font-semibold">Review next <span className="font-normal text-muted-foreground">· {pending.length} remaining</span></h2><select aria-label="Choose payment to review" className="max-w-full rounded-lg border border-border bg-card p-2 text-sm sm:max-w-sm" value={active.id} disabled={busy} onChange={(e) => setActiveId(e.target.value)}>{pending.map((s) => <option key={s.id} value={s.id}>{money(s.amount, s.currency)} · {s.provider} · {day(s.date)}</option>)}</select></div>
        <PaymentReview key={active.id} source={active} pending={pending} transactions={data.transactions} transfers={transfers} restoredDraft={data.draft} onSave={save} busy={busy} onLater={() => { setLater((ids) => [...ids, active.id]); const index = pending.findIndex((s) => s.id === active.id); setActiveId(pending[(index + 1) % pending.length]?.id); }} />
      </> : <div className={`${panelClass} text-center`}><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 text-xl font-semibold">{data.sources.length ? "All payments cleared" : "Ready for your statements"}</h2><p className="mt-2 text-sm text-muted-foreground">{data.sources.length ? "Your matches and classifications are saved in the accountant report." : "Import the CSV files above to start matching your payments."}</p></div>}
      <details className={panelClass}><summary className="cursor-pointer font-semibold">Completed activity · {data.reviews.length} saved groups</summary><p className="mt-2 text-sm text-muted-foreground">Automatic and manual decisions are recorded here and in your accountant report. Finalized records preserve the original values.</p><div className="mt-4 max-h-96 overflow-y-auto space-y-2">{data.reviews.map((r) => <details key={r.id} className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer">{r.resolutionMode === "automatic" ? "Automatic" : "Manual"} · {money(r.total ?? r.sources.reduce((n, s) => n + s.amount, 0), r.currency)} · {r.classification === "cards" ? "Card deal" : r.classification === "transfer" ? "Transfer / payout" : r.classification}</summary><p className="mt-2">{r.note}</p><p className="mt-2 text-muted-foreground">{r.evidence}</p>{r.changes.map(({ before, after }) => <p className="mt-2" key={before.id}>{transactionLabel(before)}: {money(transactionConsideration(before).amount, before.currency || "EUR")} → {money(transactionConsideration(after).amount, after.currency || "EUR")}</p>)}</details>)}</div></details>
    </>}
  </div>;
}
