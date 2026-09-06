const MARKET_VALUE_THEMES = {
  sellerAsk: "border-amber-200 bg-amber-50/70",
  selectedMarket: "border-violet-200 bg-violet-50/70",
  quickSale: "border-emerald-200 bg-emerald-50/70",
};

export function isGradedCard(card) {
  const explicitlyGraded = card?.isGraded === true || card?.isGraded === "true";
  const hasGradeDetails = Boolean(card?.gradingCompany && card?.grade != null && card?.grade !== "");
  return explicitlyGraded || hasGradeDetails;
}

export function getMarketValueCards(marketValues) {
  return [
    {
      key: "sellerAsk",
      label: "Seller Ask",
      value: marketValues.sellerAsk,
      description: "Current pricing rule",
    },
    {
      key: "selectedMarket",
      label: "Selected Market",
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
