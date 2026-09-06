import { computeMarketValues, formatCurrency } from "@/utils/cardHelpers";
import { getMarketValueCards, isGradedCard } from "@/utils/marketValueDisplay";

export function InventoryMarketValues({
  card,
  condition = "NM",
  currency = "USD",
  formatPrice,
  marketSource = "tcg",
}) {
  if (isGradedCard(card)) return null;

  const marketValues = computeMarketValues(card, {
    condition,
    targetCurrency: currency,
    marketSource,
  });
  const marketValueCards = getMarketValueCards(marketValues);
  const fmt = formatPrice || ((value) => formatCurrency(value ?? 0, currency));

  return (
    <div
      aria-label={`${card?.name || "Card"} market values`}
      className="grid grid-cols-3 gap-1.5 pl-6 sm:pl-7"
      data-testid="inventory-market-values"
    >
      {marketValueCards.map((item) => (
        <div
          key={item.key}
          className={`min-w-0 rounded-lg border px-2 py-1.5 ${item.className}`}
          title={`${item.label}: ${item.value > 0 ? fmt(item.value) : "No market data"}`}
        >
          <div className="truncate text-[9px] font-medium leading-tight text-muted-foreground sm:text-[10px]">
            {item.label}
          </div>
          <div className="mt-0.5 truncate text-xs font-bold tabular-nums sm:text-sm">
            {item.value > 0 ? fmt(item.value) : "—"}
          </div>
          {item.key === "selectedMarket" && (
            <div className="mt-0.5 truncate text-[8px] font-medium leading-tight text-muted-foreground sm:text-[9px]">
              {item.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
