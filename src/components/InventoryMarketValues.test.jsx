import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryMarketValues } from "./InventoryMarketValues";

const formatPrice = (value) => `€${Number(value).toFixed(2)}`;

describe("InventoryMarketValues", () => {
  it("renders the three supported ungraded market values used by card details", () => {
    const html = renderToStaticMarkup(
      <InventoryMarketValues
        card={{
          name: "Charizard ex",
          prices: {
            tcgplayer: { market_price: 71, currency: "EUR" },
            cardmarket: {
              lowest7: 95,
              "30d_average": 141,
              currency: "EUR",
            },
          },
        }}
        currency="EUR"
        formatPrice={formatPrice}
      />,
    );

    expect(html).toContain("Seller Ask");
    expect(html).toContain("Selected Market");
    expect(html).toContain("TCGplayer");
    expect(html).toContain("Quick Sale");
    expect(html).not.toContain("Preferred Market");
    expect(html).not.toContain("Fair Market");
    expect(html).toContain("€141.00");
    expect(html).toContain("€71.00");
  });

  it("does not render ungraded market values for graded inventory", () => {
    const html = renderToStaticMarkup(
      <InventoryMarketValues
        card={{ name: "Graded Charizard", isGraded: true, gradedPrice: 500 }}
        currency="EUR"
        formatPrice={formatPrice}
      />,
    );

    expect(html).toBe("");
  });

  it("treats an explicit grade and grading company as graded", () => {
    const html = renderToStaticMarkup(
      <InventoryMarketValues
        card={{ name: "Slabbed Charizard", gradingCompany: "PSA", grade: "10" }}
        currency="EUR"
        formatPrice={formatPrice}
      />,
    );

    expect(html).toBe("");
  });

  it("shows the current manual price as Seller Ask without inventing API values", () => {
    const html = renderToStaticMarkup(
      <InventoryMarketValues
        card={{ name: "Shining Gyarados", overridePrice: 600, overridePriceCurrency: "EUR" }}
        currency="EUR"
        formatPrice={formatPrice}
      />,
    );

    expect(html).toContain("Seller Ask");
    expect(html).toContain("€600.00");
    expect(html.match(/No market data/g)).toHaveLength(2);
  });

  it("follows the selected CardMarket setting", () => {
    const html = renderToStaticMarkup(
      <InventoryMarketValues
        card={{
          name: "Charizard ex",
          prices: {
            tcgplayer: { market_price: 71, currency: "EUR" },
            cardmarket: { "30d_average": 141, currency: "EUR" },
          },
        }}
        currency="EUR"
        formatPrice={formatPrice}
        marketSource="cardmarket"
      />,
    );

    expect(html).toContain("Selected Market");
    expect(html).toContain("CardMarket");
    expect(html).toContain("€141.00");
  });
});
