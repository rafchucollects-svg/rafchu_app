import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { cardmarketRequest, saveCardmarketBinding, saveCardmarketOffers } from '@/utils/cardmarketCompanion';
import { CARDMARKET_CONDITIONS, cardmarketInventoryKey, cardmarketTarget, safeCardmarketImage, safeCardmarketProduct, summarizeCardmarketOffers } from '@/utils/cardmarketSync';
import { cardmarketSearchUrl, suggestCardmarketProducts } from '@/utils/cardmarketProducts';
import { formatCurrency, convertCurrency } from '@/utils/cardHelpers';

const eur = value => value == null ? '—' : formatCurrency(value, 'EUR');
const basic = 'mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm';
function CardmarketPhoto({ src, name, seller = false, productUrl }) {
  const [failed, setFailed] = useState(false);
  const url = safeCardmarketImage(src, seller ? 'seller' : 'product');
  if (!url) return null;
  return <a href={failed && safeCardmarketProduct(productUrl) ? productUrl : url} target="_blank" rel="noopener noreferrer" className="block w-24 shrink-0 text-center text-xs text-blue-800 underline" onClick={e => e.stopPropagation()}>
    {!failed && <img src={url} alt={`${seller ? 'Seller photo' : 'Cardmarket reference'} of ${name}`} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-24 rounded-md border border-slate-200 bg-slate-50 object-contain" onError={() => setFailed(true)} />}
    {failed && <span className="flex h-32 items-center rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-500 no-underline">Cardmarket isn’t serving this image here.</span>}
    <span className="mt-1 block">{failed ? seller ? 'Seller photo on Cardmarket' : 'View product on Cardmarket' : seller ? 'Seller photo · enlarge' : 'Product reference'}</span>
    {!seller && <span className="mt-1 block text-[10px] leading-tight text-slate-500 no-underline">Pictured variant may differ</span>}
  </a>;
}
export function CardmarketMatchForm({ item, busy, candidates = [], lookupError, onSave }) {
  const target = cardmarketTarget(item);
  const saved = item.cardmarketBinding?.inventoryKey === cardmarketInventoryKey(item) ? item.cardmarketBinding : null;
  const suggestions = suggestCardmarketProducts(item, candidates);
  const [customUrl, setCustomUrl] = useState(null);
  const productUrl = customUrl ?? saved?.productUrl ?? suggestions[0]?.productUrl ?? '';
  const suggestion = suggestions.find(row => row.productUrl === productUrl);
  const [confirmedUrl, setConfirmedUrl] = useState(null);
  const [form, setForm] = useState(() => {
    const firstEdition = saved?.firstEdition ?? target.firstEdition;
    return { language: saved?.language || target.language || '', condition: saved?.condition || target.condition || '', finish: saved?.finish || target.finish || '', firstEdition: firstEdition === null ? '' : String(firstEdition), confirmed: false };
  });
  const confirmed = form.confirmed && confirmedUrl === productUrl;
  const set = (key, value) => setForm(current => ({ ...current, [key]: value, ...(key !== 'confirmed' ? { confirmed: false } : {}) }));
  const changeUrl = value => { setCustomUrl(value); set('confirmed', false); };
  return <details className="mt-3 rounded-lg border border-slate-200 p-3" open={!saved}>
    <summary className="cursor-pointer text-sm font-medium">{saved ? 'Review or change product match' : productUrl ? 'Review suggested product' : 'Find the Cardmarket product'}</summary>
    {target.issues.length > 0 && <p className="mt-2 text-xs text-amber-800">{target.issues.join(' ')}</p>}
    {productUrl && safeCardmarketProduct(productUrl) && <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm">
      <p className="font-medium">{saved && productUrl === saved.productUrl ? 'Saved product match' : customUrl !== null ? 'Your selected product' : 'Suggested product'}</p>
      <a className="mt-1 block text-blue-800 underline" href={productUrl} target="_blank" rel="noopener noreferrer">{suggestion ? `${suggestion.name} · ${suggestion.set} · #${suggestion.number}` : 'Open this Cardmarket product'}</a>
      <p className="mt-1 text-xs text-slate-600">{suggestion?.reason || 'Check the expansion, number and printing before saving.'}</p>
      {suggestions.length > 1 && <label className="mt-2 block text-xs">Other product suggestions<select className={basic} value={suggestion ? productUrl : ''} onChange={e => changeUrl(e.target.value)}><option value="" disabled>Choose a suggestion…</option>{suggestions.map(row => <option key={row.productUrl} value={row.productUrl}>{row.name} · {row.set} · #{row.number} · {row.productUrl.split('/').pop()}</option>)}</select></label>}
    </div>}
    {!productUrl && <p className="mt-2 text-sm text-slate-600">Click Suggest product links above to search for this card automatically.</p>}
    {lookupError && <p className="mt-2 text-xs text-amber-800">{lookupError}</p>}
    <label className="mt-3 block text-xs">Product URL — suggested automatically; replace it if needed<input aria-label={`Cardmarket URL for ${item.entryId}`} className={basic} type="url" value={productUrl} onChange={e => changeUrl(e.target.value)} /></label>
    <a className="mt-2 inline-block text-xs text-blue-800 underline" href={cardmarketSearchUrl(item)} target="_blank" rel="noopener noreferrer">Search Cardmarket yourself</a>
    <div className="mt-2 grid grid-cols-2 gap-3">
      <label className="text-xs">Card language<select className={basic} value={form.language} onChange={e => set('language', e.target.value)}><option value="">Confirm…</option><option>English</option><option>Japanese</option></select></label>
      <label className="text-xs">Cardmarket condition (Inventory: {item.condition || 'unknown'})<select className={basic} value={form.condition} onChange={e => set('condition', e.target.value)}><option value="">Confirm…</option>{CARDMARKET_CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="text-xs">Reverse holo<select className={basic} value={form.finish} onChange={e => set('finish', e.target.value)}><option value="">Confirm…</option><option value="reverse">Yes — Reverse Holo</option><option value="non-reverse">No — regular printing</option></select></label>
      <label className="text-xs">First edition<select className={basic} value={form.firstEdition} onChange={e => set('firstEdition', e.target.value)}><option value="">Confirm…</option><option value="true">Yes — 1st Edition</option><option value="false">No — Unlimited / not first edition</option></select></label>
    </div>
    <p className="mt-2 text-xs text-slate-600">Uses your existing condition mapping. Only offers in the selected condition will match. Reverse holo and edition tags become offer filters after you confirm the product.</p>
    <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 h-4 w-4 appearance-auto accent-blue-700" checked={confirmed} onChange={e => { set('confirmed', e.target.checked); setConfirmedUrl(productUrl); }} />I checked the product, language, condition, reverse status and edition against my card.</label>
    <Button className="mt-2" size="sm" disabled={busy || !confirmed || !safeCardmarketProduct(productUrl) || !form.language || !form.finish || !form.condition || form.firstEdition === ''} onClick={() => onSave({ ...form, productUrl, confirmed: true, firstEdition: form.firstEdition === 'true' })}>Save product match</Button>
  </details>;
}

export function CardmarketSyncPanel({ onClose }) {
  const { user, db, collectionItems = [], currency = 'EUR' } = useApp();
  const [status, setStatus] = useState(null);
  const [report, setReport] = useState(null);
  const [productResults, setProductResults] = useState([]);
  const productRun = useRef(null);
  const reportRevision = useRef(null);
  const reportRun = useRef(null);
  const [selected, setSelected] = useState({});
  const [excluded, setExcluded] = useState({});
  const [replaceManual, setReplaceManual] = useState(false);
  const [professionalOnly, setProfessionalOnly] = useState(false);
  const [onlyTagged, setOnlyTagged] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const s = await cardmarketRequest('status');
        if (alive) setStatus(s);
        const revision = s.reportRevision || s.runId;
        if (revision && reportRevision.current !== revision) {
          const next = await cardmarketRequest('report');
          if (alive && next?.captures) {
            setReport(next);
            if (reportRun.current !== next.runId) { setSelected({}); setExcluded({}); }
            reportRun.current = next.runId; reportRevision.current = revision;
          }
        }
        if (s.productRunId && productRun.current !== s.productRunId && s.status?.state !== 'running') {
          const result = await cardmarketRequest('products');
          if (alive) { setProductResults(result?.results || []); productRun.current = s.productRunId; }
        }
      } catch { if (alive) setStatus({ installed: false }); }
      finally { refreshing = false; }
    };
    void refresh(); const timer = setInterval(refresh, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const items = useMemo(() => collectionItems.filter(item => !item.isGraded && !(item.gradingCompany && item.grade)), [collectionItems]);
  const linked = items.filter(item => item.cardmarketBinding?.inventoryKey === cardmarketInventoryKey(item));
  const displayed = items.filter(item => !onlyTagged || item.isReverseHolo || item.isFirstEdition || item.isUnlimited || item.isStampedPromo || item.isPokeBall || item.isMasterBall || item.isSealed || item.isAutographed);
  const summaries = useMemo(() => Object.fromEntries(items.map(item => { try { return [item.entryId, summarizeCardmarketOffers(item, report?.captures?.find(row => row.entryId === item.entryId))]; } catch (err) { return [item.entryId, { status: 'error', reason: err.message, offers: [] }]; } })), [items, report]);
  const choices = items.filter(item => selected[item.entryId] && !excluded[item.entryId] && summaries[item.entryId].offers.some(offer => offer.offerId === selected[item.entryId] && (!professionalOnly || ['Professional', 'Powerseller'].includes(offer.sellerType)))).map(item => ({ entryId: item.entryId, method: 'selected-offer', offerId: selected[item.entryId], replaceManual }));
  const action = async callback => { setBusy(true); setError(''); setMessage(''); try { await callback(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const capturePending = status?.hasCaptureJob;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"><section aria-label="Cardmarket variant sync" className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Cardmarket · exact variant offers</h2><p className="mt-1 text-sm text-slate-600">Match once, capture current offers, then choose the price to apply. EUR asking prices per card, excluding shipping.</p></div><Button variant="ghost" onClick={onClose}>Close</Button></div>
    <p className={`mt-3 text-sm ${status?.status?.state === 'paused' ? 'rounded-lg bg-amber-50 p-3 text-amber-950' : ''}`} role="status">{status?.status?.state === 'paused' && <strong className="mb-1 block">Capture paused</strong>}{status?.status?.message || (status?.installed ? `Companion ${status.version} connected.` : 'Load the Cardmarket companion and refresh Rafchu to capture offers.')}</p>
    {status?.installed && !status?.capabilities?.includes('resumable-capture') && <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Capture recovery is available in companion 0.2.2. Update or reload the Cardmarket companion in Chrome’s Extensions page, then refresh Rafchu.</p>}
    <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !status?.installed || !status?.capabilities?.includes('product-suggestions') || !displayed.length || capturePending || status?.status?.state === 'running'} onClick={() => action(async () => { await cardmarketRequest('suggest', displayed.map(item => ({ entryId: item.entryId, name: item.name, set: cardmarketTarget(item).set, number: item.number, language: cardmarketTarget(item).language, inventoryKey: cardmarketInventoryKey(item) }))); setMessage('Finding product suggestions. Your edited URLs and saved matches will be kept.'); })}>Suggest product links</Button><Button disabled={busy || !status?.installed || !linked.length || capturePending || status?.status?.state === 'running'} onClick={() => action(async () => { await cardmarketRequest('start', linked.map(item => ({ entryId: item.entryId, name: item.name, binding: item.cardmarketBinding }))); setMessage('Capture started. Leave the Cardmarket reader tab open.'); })}>Capture {linked.length} linked {linked.length === 1 ? 'card' : 'cards'}</Button>
      <Button variant="outline" disabled={busy || !status?.runId} onClick={() => action(async () => { const next = await cardmarketRequest('report'); if (!next?.captures) throw new Error('No report yet.'); setReport(next); setSelected({}); setExcluded({}); })}>Review latest offers</Button>
      {capturePending && <Button variant="outline" disabled={busy} onClick={() => action(() => cardmarketRequest('open-reader'))}>Open Cardmarket reader</Button>}
      {status?.canResume && <Button disabled={busy} onClick={() => action(async () => { await cardmarketRequest('resume'); setMessage('Resuming at the unfinished card. Completed offers are kept.'); })}>Resume capture</Button>}
      {(capturePending || status?.status?.state === 'running') && <Button variant="outline" onClick={() => action(() => cardmarketRequest('cancel'))}>Stop capture</Button>}
    </div>
    <details className="mt-3 text-sm"><summary className="cursor-pointer underline">Companion setup</summary><p className="mt-2"><a href="/cardmarket-companion.zip" download className="text-blue-800 underline">Download Cardmarket companion</a>, unzip it, and choose that folder with Load unpacked in Chrome’s Extensions page. Then refresh Rafchu. This pilot captures public offers and never buys cards or changes Cardmarket listings.</p></details>
    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 appearance-auto accent-blue-700" checked={onlyTagged} onChange={e => setOnlyTagged(e.target.checked)} />Show cards with variant tags only ({displayed.length} shown)</label>
    <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 appearance-auto accent-blue-700" checked={professionalOnly} onChange={e => setProfessionalOnly(e.target.checked)} />Show Professional and Powerseller offers only</label>
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}{message && <p className="mt-3 text-sm text-blue-800" role="status">{message}</p>}
    <div className="mt-4 space-y-4">{displayed.map(item => {
      const target = cardmarketTarget(item); const summary = summaries[item.entryId]; const id = item.entryId;
      const capture = report?.captures?.find(row => row.entryId === id);
      const referenceImage = capture?.inventoryKey === cardmarketInventoryKey(item) && safeCardmarketProduct(capture.productUrl) === item.cardmarketBinding?.productUrl ? capture.productImageUrl : null;
      const manual = item.overridePrice ?? item.manualPrice; const manualCurrency = item.overridePrice != null ? item.overridePriceCurrency || currency : item.manualPriceCurrency || currency;
      const manualEur = manual == null ? null : convertCurrency(Number(manual), 'EUR', manualCurrency);
      return <article className="rounded-xl border border-slate-200 p-4" key={id}>
        <div className="flex flex-wrap items-start gap-3"><CardmarketPhoto key={referenceImage} src={referenceImage} name={item.name} productUrl={capture?.filteredUrl || capture?.productUrl} /><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.name} #{item.number}</h3><p className="text-xs text-slate-600">{target.set} · {target.language || 'Confirm language'} · {item.condition} → {item.cardmarketBinding?.condition || target.condition || 'confirm condition'}</p><p className="mt-1 text-xs font-medium text-blue-800">{[target.finish === 'reverse' ? 'Reverse Holo' : null, target.firstEdition === true ? '1st Edition' : target.firstEdition === false ? 'Unlimited' : null].filter(Boolean).join(' · ') || 'Confirm printing below'}</p></div><div className="text-right text-xs text-slate-600">Current manual price<p className="mt-1 text-base font-semibold text-slate-950">{eur(manualEur)}</p></div></div>
        <CardmarketMatchForm candidates={productResults.find(row => row.entryId === id && row.inventoryKey === cardmarketInventoryKey(item))?.candidates || []} lookupError={productResults.find(row => row.entryId === id && row.inventoryKey === cardmarketInventoryKey(item))?.error} key={cardmarketInventoryKey(item) + JSON.stringify(item.cardmarketBinding || {})} item={item} busy={busy} onSave={choice => action(async () => { await saveCardmarketBinding(db, user?.uid, item, choice); setMessage(`Saved ${item.name} product match. Capture linked cards to read offers.`); })} />
        {report && <div className="mt-3"><p className="text-sm">{!capture && capturePending ? 'Waiting for this card. Completed offers will appear here automatically.' : !capture ? 'No offers captured for this card yet.' : summary.status === 'ready' ? `${summary.offers.length} matching ${summary.offers.length === 1 ? 'offer' : 'offers'} from ${summary.sellerCount} ${summary.sellerCount === 1 ? 'seller' : 'sellers'}` : summary.reason || 'No matching offers. Current price stays unchanged.'}</p>
          {summary.warnings?.map(warning => <p className="mt-1 text-xs text-amber-800" key={warning}>{warning}</p>)}
          {summary.offers.length > 0 && <><p className="mt-1 text-xs text-slate-500">{summary.excluded} offers excluded for condition, variant, language, signatures, alterations or grading. Choose one matching offer below.</p><p className="mt-1 text-xs text-slate-500">Captured {new Date(capture.capturedAt).toLocaleString()}. Product references may show a different printing; seller photos show the advertised copy.</p>{professionalOnly && !summary.offers.some(offer => ['Professional', 'Powerseller'].includes(offer.sellerType)) && <p className="mt-2 text-sm text-slate-600">No matching Professional or Powerseller offers. Turn off the seller filter to see private listings.</p>}<div className="mt-2 max-h-96 space-y-2 overflow-y-auto">{summary.offers.filter(offer => !professionalOnly || ['Professional', 'Powerseller'].includes(offer.sellerType)).map(offer => <label className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm ${selected[id] === offer.offerId ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} key={offer.offerId}>
            <input type="radio" className="mt-1 h-4 w-4 shrink-0 appearance-auto accent-blue-700" name={`offer-${id}`} checked={selected[id] === offer.offerId} onChange={() => { setSelected(current => ({ ...current, [id]: offer.offerId })); setExcluded(current => ({ ...current, [id]: false })); }} />
            <span className="min-w-40 flex-1"><span className="font-semibold">{eur(offer.price)}</span> · {offer.seller} · {offer.country}<span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${['Professional', 'Powerseller'].includes(offer.sellerType) ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{offer.sellerType || 'Seller type unavailable'}</span><span className="mt-1 block text-xs text-slate-600">{offer.condition} · {offer.language} · {offer.finish === 'reverse' ? 'Reverse Holo' : 'Non-reverse'} · {offer.firstEdition ? '1st Edition' : 'Not first edition'}</span>{offer.comments && <span className="mt-1 block text-xs">{offer.comments}</span>}<a href={offer.url} target="_blank" rel="noopener noreferrer" className="mr-3 text-xs text-blue-800 underline">View offer</a></span><CardmarketPhoto key={offer.scanUrl} src={offer.scanUrl} name={`${item.name} offered by ${offer.seller}`} productUrl={offer.url} seller />
          </label>)}</div><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 appearance-auto accent-blue-700" checked={choices.some(choice => choice.entryId === id)} disabled={!selected[id] || (professionalOnly && !summary.offers.some(offer => offer.offerId === selected[id] && ['Professional', 'Powerseller'].includes(offer.sellerType)))} onChange={e => setExcluded(current => ({ ...current, [id]: !e.target.checked }))} />Include this price update</label></>}
        </div>}
      </article>;
    })}</div>
    {report && <div className="sticky bottom-0 mt-4 border-t bg-white py-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 appearance-auto accent-blue-700" checked={replaceManual} onChange={e => setReplaceManual(e.target.checked)} /><span>Replace my manual selling prices on the selected cards with the offers I chose. Leave unchecked to save separate market estimates and keep manual prices.</span></label><Button className="mt-3" disabled={busy || !choices.length || !user?.uid} onClick={() => action(async () => { const result = await saveCardmarketOffers(db, user.uid, report, choices); setMessage(`Saved ${result.updatedCount} chosen ${result.updatedCount === 1 ? 'price' : 'prices'}. ${replaceManual ? 'Selected manual selling prices were updated.' : 'Manual selling prices were preserved.'}`); setSelected({}); })}>Apply {choices.length} chosen {choices.length === 1 ? 'price' : 'prices'}</Button></div>}
  </section></div>;
}
