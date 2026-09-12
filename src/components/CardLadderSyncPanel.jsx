import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { autoSyncKey, companionRequest, saveCardLadderReport } from '@/utils/cardLadderCompanion';
import { buildSalesPreview, canAddCardLadderHolding, createSalesBinding, safeCardLadderImage } from '@/utils/cardLadderSales';

import { formatCardLadderMoney } from '@/utils/cardLadderCurrency';
const labels = { ready: 'Ready', 'no-sales': 'No matching sales in this window', incomplete: 'Capture incomplete', 'image-only': 'Add missing image · price unchanged', unmatched: 'Link an inventory card', ambiguous: 'Ambiguous match — choose a card' };

export function CardLadderSyncPanel() {
  const { user, db, collectionItems = [], currency = 'USD' } = useApp();
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [bindings, setBindings] = useState({});
  const [additions, setAdditions] = useState({});
  const [valueChoices, setValueChoices] = useState({});
  const [excluded, setExcluded] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(() => Boolean(user?.uid && localStorage.getItem(autoSyncKey(user.uid)) === 'true'));
  const refresh = useCallback(async () => {
    try { setStatus(await companionRequest('status')); } catch { setStatus({ installed: false }); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, [refresh]);
  const preview = useMemo(() => {
    if (!report) return { rows: [], error: '' };
    try { return { rows: buildSalesPreview(collectionItems, report, Date.now(), bindings), error: '' }; }
    catch (err) { return { rows: [], error: err.message }; }
  }, [collectionItems, report, bindings]);
  const isExcluded = row => excluded[row.holding.holdingId] ?? Boolean(row.statistics?.highIsAnomaly);
  const usesValue = row => row.fallbackValue != null && Boolean(valueChoices[row.holding.holdingId]);
  const ready = preview.rows.filter(row => (row.status === 'ready' || (['no-sales', 'image-only'].includes(row.status) && usesValue(row))) && !isExcluded(row));
  const imageOnly = preview.rows.filter(row => row.status === 'image-only' && !usesValue(row) && !isExcluded(row));
  const action = async callback => {
    setBusy(true); setError(''); setMessage('');
    try { await callback(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const load = data => {
    if (!data) throw new Error('No report yet. Run Sync Inventory first.');
    // Manual review takes control across this browser's Rafchu tabs.
    if (user?.uid) { localStorage.setItem(autoSyncKey(user.uid), 'false'); window.dispatchEvent(new Event('cardladder-preference')); }
    setAuto(false); setReport(data); setBindings({}); setAdditions({}); setExcluded({}); setValueChoices({});
  };
  const selectedAdditions = Object.fromEntries(Object.entries(additions).filter(([id]) => { const row = preview.rows.find(row => row.holding.holdingId === id); return row && !isExcluded(row); }));
  const addCount = Object.keys(selectedAdditions).length;

  return <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4" aria-label="CardLadder price sync">
    <h3 className="font-semibold text-emerald-950">Highest sale · last 14 days</h3>
    <p className="mt-1 text-sm text-emerald-900">Update graded cards or add missing cards from your CardLadder Inventory. Matches use card identity and grade; certificate numbers are ignored.</p>
    <p className="mt-2 text-sm" role="status">{status?.status?.message || (status?.installed ? 'Companion connected.' : 'Install the browser companion, then reload this app tab.')}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" disabled={busy || !status?.installed || status?.status?.state === 'running'} onClick={() => action(async () => { await companionRequest('start'); await refresh(); })}>Sync Inventory</Button>
      <Button size="sm" variant="outline" disabled={busy || !status?.runId} onClick={() => action(async () => load(await companionRequest('report')))}>Preview latest capture</Button>
      {status?.status?.state === 'running' && <Button size="sm" variant="outline" onClick={() => action(async () => { await companionRequest('cancel'); await refresh(); })}>Stop capture</Button>}
    </div>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium">Companion setup and report upload</summary>
      <ol className="ml-5 mt-2 list-decimal space-y-1">
        <li><a className="underline" href="/cardladder-companion.zip" download>Download the companion</a> and unzip it.</li>
        <li>In Chrome’s Extensions page, enable Developer mode, choose Load unpacked, and select the unzipped folder.</li>
        <li>Sign in to CardLadder and select Inventory. Keep your preferred display currency; the companion reads it from Account automatically. Clear Inventory search, then reload this Rafchu tab.</li>
      </ol>
      <p className="mt-2">Enable daily capture in the extension popup. Chrome must be running and CardLadder signed in; leave the reader tab visible while it works. Multicurrency captures require companion 1.1.0 and the updated Rafchu app. This release supports numeric PSA grades. Unsupported cards are skipped.</p>
      <label className="mt-3 block">Or upload a companion JSON report:
        <input className="mt-1 block w-full" type="file" accept=".json,application/json" onChange={event => {
          const file = event.target.files?.[0];
          if (file) void action(async () => { if (file.size > 8 * 1024 * 1024) throw new Error('Report exceeds 8 MB.'); load(JSON.parse(await file.text())); });
        }} />
      </label>
    </details>
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 flex-shrink-0 appearance-auto accent-emerald-700" type="checkbox" checked={auto} disabled={!user?.uid || Boolean(report)} onChange={event => {
        const enabled = event.target.checked; setAuto(enabled); localStorage.setItem(autoSyncKey(user.uid), String(enabled)); window.dispatchEvent(new Event('cardladder-preference'));
      }} />
      <span>{report ? 'Automatic updates are off while you review. Close the preview to enable them again.' : 'Automatically update existing cards from fresh captures, including the latest, while Rafchu is open on this browser. Adding new cards requires review below. Manual selling-price overrides stay unchanged.'}</span>
    </label>
    {(error || preview.error) && <p role="alert" className="mt-3 text-sm text-red-700">{error || preview.error}</p>}
    {message && <p role="status" className="mt-3 text-sm font-medium text-emerald-800">{message}</p>}
    {report && !preview.error && <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h4 className="font-semibold text-slate-950">Review inventory changes</h4><p className="text-xs text-slate-600">{report.startDate} – {report.endDate} · {report.currency || 'USD'} per card</p></div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setReport(null); setBindings({}); setAdditions({}); setExcluded({}); setValueChoices({}); }}>Close preview</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Uses CardLadder’s date-only two-week window (UTC). Includes auctions, fixed prices, and accepted offers. Titles must match the card number, name, and grade; bundles and conflicting grades are excluded.</p>
      <div className="my-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-auto font-medium">Selected: {ready.length} price {ready.length === 1 ? 'update' : 'updates'} · {addCount} new {addCount === 1 ? 'card' : 'cards'}{imageOnly.length ? ` · ${imageOnly.length} image-only ${imageOnly.length === 1 ? 'update' : 'updates'}` : ''}</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setExcluded(Object.fromEntries(preview.rows.map(row => [row.holding.holdingId, false])))}>Select all</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setExcluded(Object.fromEntries(preview.rows.map(row => [row.holding.holdingId, true])))}>Deselect all</Button>
      </div>
      <p className="mb-3 text-xs text-slate-600">Uncheck any card to leave it unchanged. Flagged high prices start unchecked and need review. Cards needing a match won’t apply until you link them or choose Add as new.</p>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {preview.rows.map(row => {
          const id = row.holding.holdingId;
          const money = value => formatCardLadderMoney(value, row.currency);
          const selectable = Boolean(row.high || usesValue(row) || row.status === 'image-only' || canAddCardLadderHolding(collectionItems, row.holding) || additions[id]);
          const checked = selectable && !isExcluded(row);
          const cardImage = safeCardLadderImage(row.holding.imageUrl);
          const proposedPrice = usesValue(row) ? row.fallbackValue : row.high?.price;
          const sameCurrency = row.currency === row.previousCurrency;
          const change = sameCurrency && proposedPrice != null && row.previousPrice != null ? proposedPrice - row.previousPrice : null;
          const manualPrice = row.item?.overridePrice ?? row.item?.manualPrice;
          const manualCurrency = row.item?.overridePrice != null ? row.item.overridePriceCurrency || currency : row.item?.manualPriceCurrency || 'USD';
          return <div className={`rounded-xl border bg-white p-4 text-sm ${checked ? 'border-emerald-200' : 'border-slate-200'}`} key={id}>
          <div className="flex items-start gap-3">
            <input aria-label={`Include ${row.holding.name} ${id}`} className="mt-1 h-5 w-5 shrink-0 appearance-auto accent-emerald-700" type="checkbox" checked={checked} disabled={busy || !selectable} onChange={event => setExcluded(current => ({ ...current, [id]: !event.target.checked }))} />
            <>{cardImage && <img src={cardImage} alt={`${row.holding.name} — CardLadder reference`} className="h-20 w-14 shrink-0 rounded bg-slate-50 object-contain" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} />}</><div className="min-w-0 flex-1"><p className="font-semibold text-slate-950">{row.holding.name} #{row.holding.number}</p><p className="mt-0.5 text-xs text-slate-600">{row.holding.set} {row.holding.variation}</p></div>
            <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">{row.holding.gradingCompany} {row.holding.grade}</span>
          </div>
          <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-xs text-slate-600">Current market estimate</p><p className="mt-1 font-semibold tabular-nums text-slate-900">{row.item ? formatCardLadderMoney(row.previousPrice, row.previousCurrency) : additions[id] ? 'New card' : 'Not linked'}</p></div>
            <div className="rounded-lg bg-emerald-50 p-2.5"><p className="text-xs text-emerald-900">14-day high</p><p className="mt-1 text-lg font-semibold tabular-nums text-emerald-950">{row.high ? money(row.high.price) : !row.holding.complete ? 'Unavailable' : 'No recent sales'}</p><p className="text-xs text-emerald-900">{row.high ? `${row.saleCount} eligible ${row.saleCount === 1 ? 'sale' : 'sales'}` : row.status === 'incomplete' || !row.holding.complete ? 'Capture incomplete' : usesValue(row) ? 'CardLadder Value selected below' : additions[id] ? 'Added without a price' : 'Price stays unchanged'}</p></div>
            <div className="hidden rounded-lg bg-slate-50 p-2.5 sm:block"><p className="text-xs text-slate-600">Change</p><p className="mt-1 font-semibold tabular-nums text-slate-900">{!sameCurrency && row.previousPrice != null && proposedPrice != null ? 'Different currencies' : change == null ? '—' : `${change > 0 ? '+' : ''}${money(change)}`}</p></div>
          </div>
          <p className={`text-xs font-medium ${checked && (row.status === 'unmatched' || row.status === 'ambiguous') && !additions[id] ? 'text-amber-800' : 'text-slate-600'}`}>{isExcluded(row) ? row.statistics?.highIsAnomaly ? 'Unusual high — unchecked until you review it' : 'Excluded from this save' : additions[id] ? 'Add as new card' : usesValue(row) && row.item && row.status !== 'ambiguous' ? 'Use CardLadder Value · ready' : labels[row.status]}</p>
          {!row.high && row.holding.complete && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-900">CardLadder Value · current provider estimate</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-blue-950">{money(row.fallbackValue)}</p>
            {row.fallbackValue != null ? <label className="mt-2 flex items-start gap-2 text-xs text-blue-950">
              <input aria-label={`Use CardLadder Value for ${row.holding.name} ${id}`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 appearance-auto accent-blue-700" checked={usesValue(row)} disabled={busy} onChange={event => {
                const chosen = event.target.checked;
                setValueChoices(current => ({ ...current, [id]: chosen }));
                if (chosen) setExcluded(current => ({ ...current, [id]: false }));
              }} />
              <span>Use {money(row.fallbackValue)} as the market estimate. This is not a sale in the 14-day window; automatic updates won’t use it.</span>
            </label> : <p className="mt-1 text-xs text-blue-900">No readable provider value was captured in this report’s currency. Your current price stays unchanged. For older reports, run a fresh capture with companion 1.1.0.</p>}
            {!usesValue(row) && <p className="mt-2 text-xs text-slate-600">Leave unchecked to keep your current market estimate and manual price.</p>}
          </div>}
          {row.high && <a className="mt-1 inline-block text-xs text-emerald-800 underline" href={row.high.url} target="_blank" rel="noopener noreferrer">View {money(row.high.price)} sale · {row.high.soldDate}{row.high.verified ? ' · CardLadder verified' : ''}</a>}
          {cardImage && <p className="mt-1 text-xs text-slate-500">CardLadder reference photo · may show the example slab. Existing images are preserved.</p>}
          {row.statistics && <div className={`mt-3 rounded-lg border p-3 ${row.statistics.anomalies.length ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-slate-600">Median</p><p className="mt-1 font-semibold tabular-nums">{money(row.statistics.median)}</p></div>
              <div><p className="text-slate-600">Average</p><p className="mt-1 font-semibold tabular-nums">{money(row.statistics.mean)}</p></div>
              <div><p className="text-slate-600">Std. deviation</p><p className="mt-1 font-semibold tabular-nums">{money(row.statistics.standardDeviation)}</p></div>
            </div>
            {!row.statistics.sufficient ? <p className="mt-2 text-xs text-amber-800">Only {row.saleCount} eligible {row.saleCount === 1 ? 'sale' : 'sales'} — fewer than 5 is too little data for this anomaly check.</p> : <>
              <p className="mt-2 text-xs font-medium">{row.statistics.anomalies.length ? `${row.statistics.anomalies.filter(sale => sale.direction === 'high').length} unusually high · ${row.statistics.anomalies.filter(sale => sale.direction === 'low').length} unusually low` : 'No unusual sales flagged in this window.'}</p>
              {row.statistics.highIsAnomaly && <p className="mt-1 text-xs text-amber-950">The proposed high is flagged. Highest unflagged sale: {money(row.statistics.highestUnflagged?.price)}. Checking this card applies the original high; automatic updates skip it.</p>}
            </>}
            <details className="mt-2 text-xs"><summary className="cursor-pointer underline">How this check works{row.statistics.anomalies.length ? ' and flagged sales' : ''}</summary>
              <p className="mt-2">Potential anomalies, not proof of an incorrect sale. With at least 5 sales, flag more than 3 standard deviations from the mean or a median-based modified z-score above 3.5. If median deviation is zero, flag prices at least 25% from the repeated median. All statistics use eligible, deduplicated sales in this window.</p>
              {row.statistics.anomalies.slice(0, 20).map(sale => <p className="mt-2" key={sale.url}><a className="text-amber-950 underline" href={sale.url} target="_blank" rel="noopener noreferrer">{sale.direction === 'high' ? 'High' : 'Low'}: {money(sale.price)} · {sale.soldDate}</a> · {sale.method === 'standard-deviation' ? `${Math.abs(sale.zScore).toFixed(1)} standard deviations` : sale.method === 'median-deviation' ? `modified z-score ${Math.abs(sale.modifiedZScore).toFixed(1)}` : '25%+ from repeated median'}<span className="mt-0.5 block text-slate-600">{sale.title}</span></p>)}
              {row.statistics.anomalies.length > 20 && <p className="mt-2">Showing the first 20 of {row.statistics.anomalies.length} flagged sales.</p>}
            </details>
          </div>}
          {row.locked && <p className="text-xs text-amber-800">Your manual selling price ({new Intl.NumberFormat('en-US', { style: 'currency', currency: manualCurrency }).format(manualPrice)}) remains active. Market-estimate updates do not replace it.</p>}
          {row.holding.error && <p className="text-xs text-amber-800">{row.holding.error}</p>}
          {(row.status === 'unmatched' || row.status === 'ambiguous' || bindings[row.holding.holdingId]) && <label className="mt-2 block text-xs">Choose an existing card, or add it if it is missing:
            <select aria-label={`Link ${row.holding.name} ${row.holding.holdingId}`} className="mt-1 w-full rounded border p-2" value={additions[row.holding.holdingId] ? '__new__' : bindings[row.holding.holdingId]?.entryId || ''} onChange={event => {
              const item = collectionItems.find(candidate => candidate.entryId === event.target.value);
              const addNew = event.target.value === '__new__';
              setBindings(current => { const next = { ...current }; if (item) next[row.holding.holdingId] = createSalesBinding(item, row.holding); else delete next[row.holding.holdingId]; return next; });
              setAdditions(current => { const next = { ...current }; if (addNew) next[row.holding.holdingId] = { quantity: 1, buyPrice: '', buyPriceCurrency: currency }; else delete next[row.holding.holdingId]; return next; });
            }}>
              <option value="">Choose a matching card or add as new…</option>
              {canAddCardLadderHolding(collectionItems, row.holding) && <option value="__new__">Add as new — I checked that it is missing</option>}
              {collectionItems.filter(item => item.isGraded && String(item.grade) === String(row.holding.grade) && item.gradingCompany?.toUpperCase() === row.holding.gradingCompany).map(item => <option key={item.entryId} value={item.entryId}>{item.name} #{item.number} · {typeof item.set === 'string' ? item.set : item.set?.name} · {item.rarity || ''} · {item.entryId.slice(-6)}</option>)}
            </select>
          </label>}
          {additions[row.holding.holdingId] && <div className="mt-2 rounded bg-emerald-50 p-2">
            <p className="mb-2 text-xs">Confirm how many you own. The capture does not provide quantity or purchase cost. Available CardLadder reference images are included; certificate number stays blank.</p>
            <div className="flex flex-wrap gap-3">
              <label className="text-xs">Quantity<input aria-label={`Quantity for ${row.holding.name} ${row.holding.holdingId}`} className="mt-1 block w-24 rounded border p-2" type="number" min="1" max="100000" step="1" value={additions[row.holding.holdingId].quantity} onChange={event => setAdditions(current => ({ ...current, [row.holding.holdingId]: { ...current[row.holding.holdingId], quantity: event.target.value } }))} /></label>
              <label className="text-xs">Purchase cost per card ({additions[row.holding.holdingId].buyPriceCurrency}, optional)<input aria-label={`Purchase cost for ${row.holding.name} ${row.holding.holdingId}`} className="mt-1 block w-40 rounded border p-2" type="number" min="0" step="0.01" placeholder="Unknown" value={additions[row.holding.holdingId].buyPrice} onChange={event => setAdditions(current => ({ ...current, [row.holding.holdingId]: { ...current[row.holding.holdingId], buyPrice: event.target.value } }))} /></label>
            </div>
          </div>}
        </div>; })}
      </div>
      <Button className="mt-3" size="sm" disabled={busy || (!ready.length && !addCount && !imageOnly.length) || !user?.uid} onClick={() => action(async () => {
        const selectedIds = [...ready.map(row => row.holding.holdingId), ...imageOnly.map(row => row.holding.holdingId), ...Object.keys(selectedAdditions)];
        const result = await saveCardLadderReport(db, user.uid, report, bindings, selectedAdditions, selectedIds, false, preview.rows.filter(row => usesValue(row) && selectedIds.includes(row.holding.holdingId)).map(row => row.holding.holdingId));
        setMessage(result.alreadyApplied ? 'This capture was already applied.' : `Updated ${result.updatedCount} ${result.updatedCount === 1 ? 'price' : 'prices'} and added ${result.addedCount} Inventory ${result.addedCount === 1 ? 'card' : 'cards'}.${result.imageUpdatedCount ? ` Filled ${result.imageUpdatedCount} missing ${result.imageUpdatedCount === 1 ? 'image' : 'images'}.` : ''}${result.skippedAddCount ? ` Skipped ${result.skippedAddCount} additions already in Inventory.` : ''} Existing quantities and purchase costs were preserved.`);
        setAdditions({});
      })}>Apply {ready.length} price {ready.length === 1 ? 'update' : 'updates'}{addCount ? ` and add ${addCount} new ${addCount === 1 ? 'card' : 'cards'}` : ''}{imageOnly.length ? ` and ${imageOnly.length} ${imageOnly.length === 1 ? 'image' : 'images'}` : ''}</Button>
    </div>}
  </section>;
}
