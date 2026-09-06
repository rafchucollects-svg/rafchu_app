import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetchConditionAwarePriceBeta } from '@/utils/apiHelpers';
import { convertCurrency, formatCurrency } from '@/utils/cardHelpers';
import { isGradedCard } from '@/utils/marketValueDisplay';

const STATUS_COPY = {
  exact: {
    label: 'Exact condition price',
    detail: 'Matched to a condition-specific TCGplayer SKU.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  estimated: {
    label: 'Estimated condition price',
    detail: 'The exact condition was unavailable, so this uses a nearby condition from the same printing.',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
  },
};

function formatProviderTimestamp(value) {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

export function ConditionAwarePriceBeta({ card, currency = 'USD', formatPrice }) {
  const [result, setResult] = useState(null);
  const [printing, setPrinting] = useState(card?.variant || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cardKey = [card?.entryId, card?.tcgplayerId || card?.tcgPlayerId, card?.condition].join(':');
  useEffect(() => {
    setResult(null);
    setPrinting(card?.variant || '');
    setError('');
  }, [cardKey, card?.variant]);

  const fmt = formatPrice || ((value) => formatCurrency(value, currency));
  const formatUsdValue = (value) => fmt(convertCurrency(Number(value), currency, 'USD'));
  const price = result?.price || null;
  const statusCopy = STATUS_COPY[result?.status] || null;
  const printingOptions = result?.printingOptions || [];
  const needsPrinting = result?.status === 'printing-confirmation-required';
  const isEnglish = String(card?.language || (card?.isJapanese ? 'Japanese' : 'English')).toLowerCase() === 'english';
  const displayedDate = useMemo(() => formatProviderTimestamp(price?.lastUpdated), [price?.lastUpdated]);

  const checkPrice = async () => {
    setLoading(true);
    setError('');
    try {
      const nextResult = await apiFetchConditionAwarePriceBeta(card, { printing });
      setResult(nextResult);
      if (nextResult.selectedPrinting) setPrinting(nextResult.selectedPrinting);
    } catch (requestError) {
      setError(requestError.message || 'Condition-aware pricing is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  if (!isEnglish || isGradedCard(card)) return null;

  return (
    <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/50 p-4" data-testid="condition-aware-price-beta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-violet-950">
            <FlaskConical className="h-4 w-4" />
            Condition-aware pricing
            <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900">
              Beta
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-violet-800/80">
            Checks the exact English printing and condition. This test does not change Seller Ask.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={checkPrice}
          disabled={loading}
          className="border-violet-300 bg-white text-violet-900 hover:bg-violet-100"
        >
          {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : result ? <RefreshCw className="mr-1.5 h-4 w-4" /> : null}
          {loading ? 'Checking…' : result ? 'Check again' : 'Check condition price'}
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {needsPrinting && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="font-medium text-amber-950">Confirm the printing</div>
          <p className="mt-1 text-xs text-amber-800">
            This card has separate prices for more than one printing, so Rafchu will not guess.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={printing}
              onChange={(event) => setPrinting(event.target.value)}
              className="min-w-56 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
              aria-label="Card printing"
            >
              <option value="">Select printing…</option>
              {printingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.targetConditionPrice ? ` · $${option.targetConditionPrice.toFixed(2)}` : ''}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" onClick={checkPrice} disabled={!printing || loading}>
              Price selected printing
            </Button>
          </div>
        </div>
      )}

      {price && statusCopy && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)]">
          <div className={`rounded-xl border p-4 ${statusCopy.className}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide">{statusCopy.label}</div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase">
                <ShieldCheck className="h-3 w-3" />
                {price.confidence} confidence
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">{formatUsdValue(price.amount)}</div>
            {price.estimateRange && (
              <div className="mt-1 text-xs font-medium">
                Test range {formatUsdValue(price.estimateRange.low)}–{formatUsdValue(price.estimateRange.high)}
              </div>
            )}
            <p className="mt-2 text-xs opacity-80">{statusCopy.detail}</p>
          </div>

          <div className="rounded-xl border border-violet-200 bg-white p-4 text-xs text-slate-700">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              <dt className="text-slate-500">Matched card</dt>
              <dd className="font-medium text-right">{result.identity?.name}</dd>
              <dt className="text-slate-500">Printing</dt>
              <dd className="font-medium text-right">{result.selectedPrinting}</dd>
              <dt className="text-slate-500">Condition</dt>
              <dd className="font-medium text-right">{result.condition?.label}</dd>
              <dt className="text-slate-500">Source</dt>
              <dd className="font-medium text-right">{price.source}</dd>
              {price.tcgplayerSkuId && (
                <>
                  <dt className="text-slate-500">TCGplayer SKU</dt>
                  <dd className="font-mono text-right">{price.tcgplayerSkuId}</dd>
                </>
              )}
              {displayedDate && (
                <>
                  <dt className="text-slate-500">Updated</dt>
                  <dd className="text-right">{displayedDate}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}

      {result && !price && !needsPrinting && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          No trustworthy condition price was found for this exact card and printing.
        </div>
      )}
    </section>
  );
}
