import { describe, expect, it } from "vitest";
import {
  allocatePurchaseCosts,
  assessTaxRecordCompleteness,
  buildTaxReadyTransaction,
} from "./transactionHelpers";

describe("allocatePurchaseCosts", () => {
  it("keeps market values separate and reconciles paid cost", () => {
    const lines = allocatePurchaseCosts([
      { name: "Card A", quantity: 1, unitPrice: 75, totalPrice: 75 },
      { name: "Card B", quantity: 1, unitPrice: 25, totalPrice: 25 },
    ], 60);
    expect(lines[0]).toMatchObject({ marketUnitPrice: 75, marketTotal: 75, unitCost: 45, totalCost: 45 });
    expect(lines[1]).toMatchObject({ marketUnitPrice: 25, marketTotal: 25, unitCost: 15, totalCost: 15 });
    expect(lines.reduce((sum, line) => sum + line.totalCost, 0)).toBe(60);
  });

  it("falls back to quantity when no market values exist", () => {
    const lines = allocatePurchaseCosts([
      { name: "Card A", quantity: 2 },
      { name: "Card B", quantity: 1 },
    ], 30);
    expect(lines[0].totalCost).toBe(20);
    expect(lines[1].totalCost).toBe(10);
  });
});

describe("buildTaxReadyTransaction", () => {
  it("adds the tax audit envelope without removing legacy fields", () => {
    const tx = buildTaxReadyTransaction({
      type: "buy",
      totalValue: 80,
      currency: "EUR",
      counterpartyName: "Private Seller",
      paymentMethod: "bank_transfer",
      documentNumber: "PUR-2026-001",
      marginSchemeEligibility: "eligible_private_seller",
      itemsIn: [{ name: "Charizard ex", quantity: 1, unitPrice: 100, totalPrice: 100 }],
    }, { uid: "user-1", now: 1000, id: "abc123" });

    expect(tx.totalValue).toBe(80);
    expect(tx.schemaVersion).toBe(2);
    expect(tx.itemsIn[0]).toMatchObject({ marketTotal: 100, totalCost: 80 });
    expect(tx.counterparty.name).toBe("Private Seller");
    expect(tx.documents.number).toBe("PUR-2026-001");
    expect(tx.tax.jurisdiction).toBe("FI");
    expect(tx.audit.createdBy).toBe("user-1");
    expect(tx.taxRecord.status).toBe("complete");
  });

  it("flags missing filing evidence instead of inventing it", () => {
    const tx = buildTaxReadyTransaction({
      type: "sale",
      totalValue: 100,
      currency: "EUR",
      itemsOut: [{ name: "Pikachu", quantity: 1, unitPrice: 100, costBasis: 40 }],
    }, { now: 1000 });
    const assessment = assessTaxRecordCompleteness(tx);
    expect(assessment.status).toBe("needs_review");
    expect(assessment.missingFields).toEqual(expect.arrayContaining([
      "counterparty.name",
      "payment.method",
      "sourceDocument",
      "tax.treatment",
    ]));
  });
});
