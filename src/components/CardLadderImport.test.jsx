import { describe, expect, it } from "vitest";
import {
  applyCardLadderPurchasePrice,
  cardLadderCompositeKey,
  cardLadderMatchScore,
  findManualDealCardMatch,
  manualDealCardMatchScore,
  parseCardLadderMoney,
  preserveDealAcquisitionData,
  preserveEditedCardLadderPurchasePrice,
  toPerUnitCardLadderAmount,
} from "@/utils/cardLadderImport";

describe("Card Ladder purchase prices", () => {
  it("parses Investment as a per-unit USD buy price", () => {
    const totalInvestment = parseCardLadderMoney("$1,200.00");
    expect(totalInvestment).toBe(1200);
    expect(toPerUnitCardLadderAmount(totalInvestment, 2)).toBe(600);
  });

  it("promotes Investment to accounting cost basis with source metadata", () => {
    const imported = applyCardLadderPurchasePrice(
      {
        name: "Pikachu",
        cardladderData: { investment: 125.5, datePurchased: "2025-03-04" },
      },
      "USD",
    );

    expect(imported.buyPrice).toBe(125.5);
    expect(imported.buyPriceCurrency).toBe("USD");
    expect(imported.taxAcquisition).toMatchObject({
      recordedCost: 125.5,
      currency: "USD",
      source: "cardladder",
      sourceAmount: 125.5,
      sourceCurrency: "USD",
    });
  });

  it("uses purchase price and date to distinguish otherwise-identical holdings", () => {
    const incoming = {
      name: "Pikachu",
      set: "Base Set",
      number: "58",
      gradingCompany: "PSA",
      grade: "10",
      cardladderData: { investment: 125.5, datePurchased: "2025-03-04" },
    };
    const correctHolding = {
      ...incoming,
      entryId: "correct",
      cardladderData: { investment: 125.5, datePurchased: "2025-03-04" },
    };
    const customizedWrongHolding = {
      ...incoming,
      entryId: "wrong",
      imageManuallySet: true,
      cardladderData: { investment: 300, datePurchased: "2024-01-01" },
    };

    expect(cardLadderCompositeKey(incoming)).toBe(cardLadderCompositeKey(correctHolding));
    expect(cardLadderMatchScore(incoming, correctHolding)).toBeGreaterThan(
      cardLadderMatchScore(incoming, customizedWrongHolding),
    );
  });

  it("preserves an edited purchase price while refreshing Card Ladder metadata", () => {
    const refreshed = applyCardLadderPurchasePrice(
      { cardladderData: { investment: 150, datePurchased: "2025-03-04" } },
      "USD",
    );
    const merged = preserveEditedCardLadderPurchasePrice(
      refreshed,
      {
        buyPrice: 99,
        buyPriceCurrency: "EUR",
        buyPriceManuallySet: true,
        taxAcquisition: { sourceAmount: 125, sourceCurrency: "USD" },
      },
      "EUR",
    );

    expect(merged.buyPrice).toBe(99);
    expect(merged.buyPriceCurrency).toBe("EUR");
    expect(merged.buyPriceManuallySet).toBe(true);
    expect(merged.taxAcquisition).toMatchObject({
      recordedCost: 99,
      currency: "EUR",
      sourceAmount: 150,
      sourceCurrency: "USD",
      manuallyAdjusted: true,
    });
  });

  it("matches the Pikachu-style manual deal entry to its later Card Ladder row", () => {
    const cardLadderCard = {
      name: "Pikachu",
      set: "Japanese Promo",
      rarity: "Spring Battle Road",
      number: "095",
      quantity: 1,
      isGraded: true,
      gradingCompany: "PSA",
      grade: "10",
      cardladderData: {
        setRaw: "Pokemon Japanese Promo",
        variation: "Spring Battle Road",
        year: "2008",
        investment: 900,
      },
    };
    const dealCard = {
      entryId: "deal-pikachu",
      id: "manual-pikachu",
      name: "Pikachu-Holo",
      set: "2008 Pokemon Japanese Promo",
      rarity: "Spring Battle Road",
      number: "#095",
      quantity: 1,
      isManualEntry: true,
      isGraded: true,
      gradingCompany: "PSA",
      grade: 10,
      buyPrice: 725,
      buyPriceCurrency: "EUR",
      acquiredVia: "buy",
      acquisitionTransactionId: "purchase-123",
      taxAcquisition: { recordedCost: 725, documentNumber: "PUR-123" },
    };

    expect(manualDealCardMatchScore(cardLadderCard, dealCard)).toBeGreaterThanOrEqual(210);
    expect(findManualDealCardMatch(cardLadderCard, [dealCard])?.candidate).toBe(dealCard);

    const reconciled = preserveDealAcquisitionData(
      applyCardLadderPurchasePrice(cardLadderCard, "EUR"),
      dealCard,
      "EUR",
    );
    expect(reconciled).toMatchObject({
      buyPrice: 725,
      buyPriceCurrency: "EUR",
      acquiredVia: "buy",
      acquisitionTransactionId: "purchase-123",
      reconciledFromManualDeal: true,
    });
    expect(reconciled.taxAcquisition).toMatchObject({
      recordedCost: 725,
      documentNumber: "PUR-123",
      cardladderInvestment: 900,
      reconciledFromCardLadder: true,
    });

    const reimported = preserveEditedCardLadderPurchasePrice(
      applyCardLadderPurchasePrice({
        ...cardLadderCard,
        cardladderData: { ...cardLadderCard.cardladderData, investment: 950 },
      }, "EUR"),
      reconciled,
      "EUR",
    );
    expect(reimported).toMatchObject({
      buyPrice: 725,
      buyPriceCurrency: "EUR",
      acquiredVia: "buy",
      acquisitionTransactionId: "purchase-123",
      reconciledFromManualDeal: true,
    });
    expect(reimported.taxAcquisition).toMatchObject({
      recordedCost: 725,
      documentNumber: "PUR-123",
      cardladderInvestment: 950,
      dealCostPreserved: true,
    });
  });

  it("does not merge an ambiguous or differently numbered manual slab", () => {
    const incoming = {
      name: "Pikachu",
      set: "Japanese Promo",
      rarity: "Spring Battle Road",
      number: "095",
      gradingCompany: "PSA",
      grade: "10",
      cardladderData: { variation: "Spring Battle Road" },
    };
    const candidate = {
      entryId: "one",
      id: "manual-one",
      name: "Pikachu-Holo",
      set: "Japanese Promo",
      rarity: "Spring Battle Road",
      number: "095",
      isManualEntry: true,
      isGraded: true,
      gradingCompany: "PSA",
      grade: 10,
      buyPrice: 100,
      acquiredVia: "buy",
      acquisitionTransactionId: "tx-one",
    };

    expect(findManualDealCardMatch(incoming, [candidate, { ...candidate, entryId: "two" }])).toBeNull();
    expect(manualDealCardMatchScore(incoming, { ...candidate, number: "096" })).toBe(0);
  });
});
