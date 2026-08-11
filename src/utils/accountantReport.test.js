import { describe, expect, it } from "vitest";
import { buildAccountantReportData } from "./accountantReport";

const metrics = (item) => ({ cmLowest: item.market || 0, suggested: item.market || 0 });

describe("buildAccountantReportData", () => {
  it("combines trades, expenses, purchases, COGS, and inventory for the fiscal year", () => {
    const report = buildAccountantReportData({
      year: 2026,
      transactions: [
        {
          id: "sale-1",
          type: "sale",
          ts: Date.parse("2026-03-01"),
          totalValue: 200,
          itemsOut: [{ name: "Sold card", quantity: 1, unitPrice: 200, costBasis: 100 }],
        },
        {
          id: "trade-1",
          type: "trade",
          ts: Date.parse("2026-04-01"),
          itemsIn: [{ name: "Incoming", quantity: 1, unitCost: 80 }],
          itemsOut: [{ name: "Outgoing", quantity: 1, unitPrice: 120, costBasis: 60 }],
        },
        { id: "old", type: "sale", ts: Date.parse("2025-01-01"), totalValue: 999 },
      ],
      expenses: [
        { date: "2026-05-01", category: "Per Diem", amountEUR: 54 },
        { date: "2026-05-02", category: "Shipping & Postage", amountEUR: 20 },
      ],
      inventoryItems: [{ name: "Stock card", quantity: 1, buyPrice: 50, market: 75 }],
      shareholderEntries: [{ date: Date.parse("2026-02-01"), type: "credit", amount: 100 }],
      mileageTrips: [{ date: "2026-06-01", km: 10, rate: 0.55, allowance: 5.5 }],
      taxFreeBenefits: [{ date: "2026-07-01", benefitType: "sports_culture", amount: 50 }],
      computeItemMetrics: metrics,
    });

    expect(report.profitLoss.revenue).toBe(320);
    expect(report.profitLoss.cogs).toBe(160);
    expect(report.profitLoss.totalOpex).toBe(74);
    expect(report.marginTax.vatPayable).toBeCloseTo(32.51, 2);
    expect(report.purchases).toHaveLength(1);
    expect(report.perDiems).toHaveLength(1);
    expect(report.inventory[0]).toMatchObject({ acquisitionCost: 50, currentMarketPrice: 75 });
    expect(report.shareholderEntries).toHaveLength(1);
    expect(report.mileageTrips).toHaveLength(1);
    expect(report.taxFreeBenefits).toHaveLength(1);
  });

  it("surfaces missing cost basis and incomplete tax metadata", () => {
    const report = buildAccountantReportData({
      year: 2026,
      transactions: [{
        id: "sale-1",
        type: "sale",
        ts: Date.parse("2026-03-01"),
        totalValue: 100,
        taxRecord: { status: "needs_review" },
        itemsOut: [{ name: "Unknown cost", quantity: 1, unitPrice: 100 }],
      }],
      inventoryItems: [{ name: "Unknown inventory cost", market: 10 }],
      computeItemMetrics: metrics,
    });

    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("incomplete tax metadata"),
      expect.stringContaining("no recorded cost basis"),
      expect.stringContaining("no recorded acquisition cost"),
    ]));
  });
});
