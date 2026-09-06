import { describe, expect, it } from "vitest";
import {
  convertTransactionForTaxEUR,
  convertToEUR,
  FINLAND_MILEAGE_RATE,
  TAX_FREE_BENEFITS,
} from "./taxHelpers";

describe("convertTransactionForTaxEUR", () => {
  it("converts sales and cost basis into a consistent EUR reporting view", () => {
    const converted = convertTransactionForTaxEUR({
      type: "sale",
      currency: "USD",
      totalValue: 108,
      itemsOut: [{ name: "Card", quantity: 1, unitPrice: 108, costBasis: 54 }],
    }, { EUR: 1, USD: 1.08 });

    expect(converted.currency).toBe("EUR");
    expect(converted.totalValue).toBeCloseTo(100);
    expect(converted.itemsOut[0].unitPrice).toBeCloseTo(100);
    expect(converted.itemsOut[0].costBasis).toBeCloseTo(50);
    expect(converted.taxAccounting).toMatchObject({
      sourceCurrency: "USD",
      reliable: true,
    });
  });

  it("fails closed when an FX rate is unavailable", () => {
    const converted = convertTransactionForTaxEUR({
      type: "sale",
      currency: "CAD",
      totalValue: 100,
      itemsOut: [{ unitPrice: 100, costBasis: 40 }],
    }, { EUR: 1 });
    expect(converted.totalValue).toBe(0);
    expect(converted.itemsOut[0].costBasis).toBe(0);
    expect(converted.taxAccounting.reliable).toBe(false);
  });
});

describe("convertToEUR", () => {
  it("keeps EUR values unchanged", () => {
    expect(convertToEUR(42, "EUR", {})).toEqual({ amountEUR: 42, rate: 1, reliable: true });
  });
});

describe("2026 tax-free travel rates", () => {
  it("uses the current Vero mileage and domestic per-diem rates", () => {
    expect(FINLAND_MILEAGE_RATE).toBe(0.55);
    expect(TAX_FREE_BENEFITS.find((benefit) => benefit.id === "per_diem_full")?.perUse).toBe(54);
    expect(TAX_FREE_BENEFITS.find((benefit) => benefit.id === "per_diem_partial")?.perUse).toBe(25);
    expect(TAX_FREE_BENEFITS.find((benefit) => benefit.id === "mileage")?.perUse).toBe(0.55);
  });
});
