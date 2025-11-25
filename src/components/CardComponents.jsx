import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Heart } from "lucide-react";
import { computeTcgPrice, getCardmarketAvg, getCardmarketLowest, formatCurrency, CONDITION_STYLES } from "@/utils/cardHelpers";

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
  const cm = card?.prices?.cardmarket;
  const tcgPrice = computeTcgPrice(card, condition);
  const baseTcg =
    Number(card?.prices?.tcgplayer?.market_price ?? card?.prices?.tcgplayer?.mid_price) ||
    0;
  const cmAvg = getCardmarketAvg(card) || 0;
  const cmLowest = getCardmarketLowest(card) || 0;
  const diff = tcgPrice - (cmAvg || cmLowest || 0);
  const fmt = formatPrice || ((value) => formatCurrency(value ?? 0));
  const conditionBadgeEl = (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionClasses(condition, "badge")}`}
    >
      {condition}
    </span>
  );
  
  // Check if we're using PriceCharting fallback
  const isFallback = card?.isFallbackPrice;
  const fallbackPrice = card?.prices?.tcgplayer?.market_price || 0;
  
  // For collector mode, show only selected market
  const isCollector = mode === "collector";
  const showTcg = !isCollector || marketSource === "tcg";
  const showCardmarket = !isCollector || marketSource === "cardmarket";
  
  // Determine if we should show PriceCharting box instead of empty TCG/CM boxes
  const hasTcgData = baseTcg > 0;
  const hasCmData = cmAvg > 0 || cmLowest > 0;
  
  // Show PriceCharting if fallback and the market we're showing has no data
  const showPriceChartingForTcg = showTcg && isFallback && !hasTcgData;
  const showPriceChartingForCm = showCardmarket && isFallback && !hasCmData;
  
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* TCGplayer box OR PriceCharting fallback */}
      {showTcg && !showPriceChartingForTcg && (
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
              value={fmt(card?.prices?.tcgplayer?.mid_price || 0)}
            />
          </CardContent>
        </Card>
      )}
      
      {showPriceChartingForTcg && (
        <Card className="rounded-2xl p-4 shadow border-purple-200 bg-purple-50">
          <CardContent className="space-y-2 p-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-purple-700">PriceCharting ({currency})</span>
              {card?.name && (
                <a
                  href={`https://www.pricecharting.com/game/pokemon-cards?q=${encodeURIComponent(card.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 underline"
                >
                  View <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <PriceRow
              label={
                <>
                  <span>Market</span>
                  {conditionBadgeEl}
                </>
              }
              value={fmt(fallbackPrice)}
            />
            <PriceRow
              label="Low (Est.)"
              value={fmt(fallbackPrice * 0.8)}
            />
            <PriceRow
              label="High (Est.)"
              value={fmt(fallbackPrice * 1.2)}
            />
            <div className="text-xs text-purple-600 mt-2 pt-2 border-t border-purple-200">
              ℹ️ Using PriceCharting data (not in TCGPlayer)
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* CardMarket box OR PriceCharting fallback */}
      {showCardmarket && !showPriceChartingForCm && (
        <Card className="rounded-2xl p-4 shadow">
          <CardContent className="space-y-2 p-0">
            <div className="mb-2 font-semibold">CardMarket (EUR)</div>
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
              value={fmt(cm?.lowest_near_mint || 0)}
            />
            <PriceRow label="7d Avg" value={fmt(card?.prices?.cardmarket?.avg7 || 0)} />
            <PriceRow label="30d Avg" value={fmt(cm?.avg30 || 0)} />
          </CardContent>
        </Card>
      )}
      
      {showPriceChartingForCm && (
        <Card className="rounded-2xl p-4 shadow border-purple-200 bg-purple-50">
          <CardContent className="space-y-2 p-0">
            <div className="mb-2 font-semibold text-purple-700">PriceCharting ({currency})</div>
            <PriceRow
              label={
                <>
                  <span>Market</span>
                  {conditionBadgeEl}
                </>
              }
              value={fmt(fallbackPrice)}
            />
            <PriceRow
              label="Low (Est.)"
              value={fmt(fallbackPrice * 0.8)}
            />
            <PriceRow
              label="High (Est.)"
              value={fmt(fallbackPrice * 1.2)}
            />
            <div className="text-xs text-purple-600 mt-2 pt-2 border-t border-purple-200">
              ℹ️ Using PriceCharting data (not in CardMarket)
            </div>
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
  onQuickAddTrade,
  onQuickAddBuy = () => {},
  onQuickAddWishlist = () => {},
  mode = "vendor",
}) {
  const thumb = item.image;
  const isVendor = mode === "vendor";
  return (
    <div className="flex items-center justify-between rounded-lg p-2 hover:bg-muted">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onPick(item)}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={item.name}
            className="h-14 w-10 rounded-md border object-cover"
          />
        ) : (
          <div className="h-14 w-10 rounded-md border bg-slate-200 flex items-center justify-center text-[8px] text-gray-500 font-semibold text-center p-1 leading-tight">
            IMAGE NOT FOUND
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-medium">{item.name}</div>
          <div className="truncate text-xs opacity-70">
            {(item.set || "—")} • {(item.rarity || "—")} • #
            {item.number || "—"}
          </div>
        </div>
      </button>
      <div className="ml-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onQuickAddCollection(item)}
        >
          + {isVendor ? 'Inventory' : 'Collection'}
        </Button>
        {!isVendor && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onQuickAddWishlist(item)}
            className="text-pink-600 hover:text-pink-700 hover:bg-pink-50"
          >
            <Heart className="h-4 w-4" />
          </Button>
        )}
        {isVendor && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAddTrade(item)}
            >
              + Trade
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAddBuy(item)}
            >
              + Buy
            </Button>
          </>
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

