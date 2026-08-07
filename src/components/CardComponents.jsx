import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Heart } from "lucide-react";
import { computeTcgPrice, getCardmarketAvg, getCardmarketLowest, computeMarketValues, formatCurrency, convertCurrency, CONDITION_STYLES } from "@/utils/cardHelpers";

/**
 * Shared card display components
 */

// Condition styling helper
function conditionClasses(condition, variant = "badge") {
  const defaultStyle = {
    badge: "border border-slate-300 bg-slate-100 text-slate-700 shadow-sm",
    select: "border border-slate-300 bg-slate-50 text-slate-700 focus:border-slate-500 focus:ring-slate-500/40",
  };
  const theme = CONDITION_STYLES[condition] ?? (CONDITION_STYLES.default || defaultStyle);
  return theme[variant] ?? ((CONDITION_STYLES.default || defaultStyle)[variant] || "");
}

// Price row component
export function PriceRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm opacity-70 flex items-center gap-1">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// Card prices display
export function CardPrices({ card, condition = "NM", formatPrice, mode = "vendor", marketSource = "tcg", currency = "USD" }) {
  const tcgPrice = computeTcgPrice(card, condition, currency);
  const baseTcg = computeTcgPrice(card, "NM", currency);
  const cmAvg = getCardmarketAvg(card, "NM", currency) || 0;
  const cmLowest = getCardmarketLowest(card, condition, currency) || 0;
  const cmLowestNm = getCardmarketLowest(card, "NM", currency) || 0;
  const cmCurrency = card?.prices?.cardmarket?.currency || 'EUR';
  const tcgCurrency = card?.prices?.tcgplayer?.currency || 'USD';
  const cmAvg7 = convertCurrency(
    Number(card?.prices?.cardmarket?.avg7 ?? card?.prices?.cardmarket?.["7d_average"]) || 0,
    currency,
    cmCurrency,
  );
  const tcgMid = convertCurrency(
    Number(card?.prices?.tcgplayer?.mid_price) || 0,
    currency,
    tcgCurrency,
  );
  const diff = tcgPrice - (cmAvg || cmLowest || 0);
  const fmt = formatPrice || ((value) => formatCurrency(value ?? 0, currency));
  const conditionBadgeEl = (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses(condition, "badge")}`}
    >
      {condition}
    </span>
  );
  
  // For collector mode, show only selected market
  const isCollector = mode === "collector";
  const showTcg = !isCollector || marketSource === "tcg";
  const showCardmarket = !isCollector || marketSource === "cardmarket";
  
  const hasTcgData = baseTcg > 0;
  const hasCmData = cmAvg > 0 || cmLowest > 0;
  const marketValues = computeMarketValues(card, {
    condition,
    targetCurrency: currency,
    marketSource,
  });
  const marketValueCards = [
    {
      label: "Seller Ask",
      value: marketValues.sellerAsk,
      description: "Current pricing rule",
      className: "border-amber-200 bg-amber-50/70",
    },
    {
      label: "Fair Market",
      value: marketValues.fairMarket,
      description: `Median of ${marketValues.availableBenchmarkCount} benchmark${marketValues.availableBenchmarkCount === 1 ? "" : "s"}`,
      className: "border-blue-200 bg-blue-50/70",
    },
    {
      label: "Preferred Market",
      value: marketValues.preferredMarket,
      description: marketValues.preferredSource,
      className: "border-violet-200 bg-violet-50/70",
    },
    {
      label: "Quick Sale",
      value: marketValues.quickSale,
      description: "Lower liquid benchmark",
      className: "border-emerald-200 bg-emerald-50/70",
    },
  ];
  const fmtMarketValue = (value) => value > 0 ? fmt(value) : "—";
  
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="rounded-2xl border-border/70 p-4 shadow-sm md:col-span-2">
        <CardContent className="p-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Market values</div>
              <div className="text-xs text-muted-foreground">
                Ungraded · {condition} · normalized to {currency}
              </div>
            </div>
            {marketValues.availableBenchmarkCount < 2 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                Limited market data
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {marketValueCards.map((item) => (
              <div key={item.label} className={`rounded-xl border p-3 ${item.className}`}>
                <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmtMarketValue(item.value)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{item.description}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {showTcg && (
        <Card className="rounded-2xl p-4 shadow">
          <CardContent className="space-y-2 p-0">
            <div className="mb-2 font-semibold">TCGplayer ({currency})</div>
            <PriceRow
              label={
                <>
                  <span>Market</span>
                  {conditionBadgeEl}
                </>
              }
              value={fmt(tcgPrice)}
            />
            <PriceRow
              label={
                <>
                  <span>Market</span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses("NM", "badge")}`}
                  >
                    NM
                  </span>
                </>
              }
              value={fmt(baseTcg)}
            />
            <PriceRow
              label="Mid"
              value={fmt(tcgMid)}
            />
          </CardContent>
        </Card>
      )}

      {showCardmarket && (
        <Card className="rounded-2xl p-4 shadow">
          <CardContent className="space-y-2 p-0">
            <div className="mb-2 font-semibold">CardMarket ({currency})</div>
            <PriceRow label="Lowest Listing" value={fmt(cmLowest)} />
            <PriceRow
              label={
                <>
                  <span>Lowest</span>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses("NM", "badge")}`}
                  >
                    NM
                  </span>
                </>
              }
              value={fmt(cmLowestNm)}
            />
            <PriceRow label="7d Avg" value={fmt(cmAvg7)} />
            <PriceRow label="30d Avg" value={fmt(cmAvg)} />
            {Number(card?.prices?.cardmarket?.availableItems || card?.prices?.cardmarket?.available_items) > 0 && (
              <PriceRow
                label="Listings"
                value={String(card.prices.cardmarket.availableItems || card.prices.cardmarket.available_items)}
              />
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Price Comparison (Vendor only) */}
      {!isCollector && hasTcgData && hasCmData && (
        <Card className="rounded-2xl p-4 shadow md:col-span-2">
          <CardContent className="space-y-2 p-0">
            <div className="mb-2 font-semibold">Price Comparison</div>
            <PriceRow
              label={
                <>
                  <span>TCGplayer</span>
                  {conditionBadgeEl}
                  <span className="hidden sm:inline">vs. CM Avg</span>
                  <span className="sm:hidden">vs CM Avg</span>
                </>
              }
              value={
                tcgPrice && (cmAvg || cmLowest)
                  ? `${fmt(tcgPrice)} vs ${fmt(
                      cmAvg || cmLowest,
                    )} (${diff > 0 ? "+" : ""}${fmt(diff)})`
                  : "–"
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Suggestion item with quick add buttons
export function SuggestionItem({
  item,
  onPick,
  onQuickAddCollection,
  onQuickAddBuy = () => {},
  onQuickAddWishlist = () => {},
  mode = "vendor",
}) {
  const thumb = item.image;
  const isVendor = mode === "vendor";
  return (
    <div className="rounded-lg p-2 hover:bg-muted">
      {/* Card info row: always full width */}
      <button
        className="flex w-full items-center gap-2.5 text-left"
        onClick={() => onPick(item)}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={item.name}
            className="h-14 w-10 rounded-md border object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-14 w-10 rounded-md border bg-slate-200 flex items-center justify-center text-[8px] text-gray-500 font-semibold text-center p-1 leading-tight flex-shrink-0">
            NO IMG
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm sm:text-base">{item.name}</div>
          <div className="truncate text-[11px] sm:text-xs opacity-70">
            {(item.set || "—")} • {(item.rarity || "—")} • #{item.number || "—"}
          </div>
        </div>
      </button>
      {/* Action buttons row */}
      <div className="flex items-center gap-1.5 mt-1.5 pl-[50px]">
        <Button
          size="sm"
          variant="secondary"
          className="text-xs h-7 px-2.5"
          onClick={() => onQuickAddCollection(item)}
        >
          + {isVendor ? 'Inventory' : 'Collection'}
        </Button>
        {!isVendor && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            onClick={() => onQuickAddWishlist(item)}
          >
            <Heart className="h-3.5 w-3.5 text-pink-600" />
          </Button>
        )}
        {isVendor && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 px-2.5"
            onClick={() => onQuickAddBuy(item)}
          >
            + Deal
          </Button>
        )}
      </div>
    </div>
  );
}

// Condition select dropdown
export function ConditionSelect({ value, onChange, className = "", ...props }) {
  const opts = ["NM", "LP", "MP", "HP", "DMG"];
  const themed = conditionClasses(value, "select");
  return (
    <select
      className={`rounded-lg px-2 py-1 text-sm font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 ${themed} ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    >
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// External links display
export function ExternalLinks({ links }) {
  if (!links) return null;
  const entries = [
    links.tcgdex && {
      key: "tcgdex",
      label: "TCGdex",
      href: links.tcgdex,
    },
    links.cardmarket && {
      key: "cardmarket",
      label: "CardMarket",
      href: links.cardmarket,
    },
    links.tcgplayer && {
      key: "tcgplayer",
      label: "TCGplayer",
      href: links.tcgplayer,
    },
  ].filter(Boolean);
  if (!entries.length) return null;
  return (
    <div className="flex items-center gap-2">
      {entries.map((entry) => (
        <a
          key={entry.key}
          className="inline-flex items-center gap-1 text-sm underline"
          href={entry.href}
          target="_blank"
          rel="noreferrer"
        >
          {entry.label} <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}
