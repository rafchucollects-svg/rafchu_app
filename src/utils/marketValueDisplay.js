const MARKET_VALUE_THEMES = {
  sellerAsk: "border-amber-200 bg-amber-50/70",
  preferredMarket: "border-violet-200 bg-violet-50/70",
  quickSale: "border-emerald-200 bg-emerald-50/70",
};

export function getMarketValueCards(marketValues) {
  return [
    {
      key: "sellerAsk",
      label: "Seller Ask",
      value: marketValues.sellerAsk,
      description: "Current pricing rule",
    },
    {
      key: "preferredMarket",
      label: "Preferred Market",
      value: marketValues.preferredMarket,
      description: marketValues.preferredSource,
    },
    {
      key: "quickSale",
      label: "Quick Sale",
      value: marketValues.quickSale,
      description: "Lower liquid benchmark",
    },
  ].map((item) => ({ ...item, className: MARKET_VALUE_THEMES[item.key] }));
}
