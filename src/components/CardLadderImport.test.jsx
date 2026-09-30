import { describe, expect, it } from "vitest";
import {
  applyCardLadderPurchasePrice,
  cardLadderCertificateKey,
  cardLadderCompositeKey,
  cardLadderMatchScore,
  findManualDealCardMatch,
  manualDealCardMatchScore,
  parseCardLadderMoney,
  parseCardLadderCondition,
  preserveDealAcquisitionData,
  preserveEditedCardLadderPurchasePrice,
  toPerUnitCardLadderAmount,
} from "@/utils/cardLadderImport";

describe("Card Ladder grading imports", () => {
  it.each([
    ["BGS10", "BGS", "10"],
    ["Beckett 9.50", "BGS", "9.5"],
    ["BGS Pristine 10", "BGS", "10"],
    ["BGS 10 (Black Label)", "BGS", "10 Black Label"],
    ["CGC 10 Gem Mint", "CGC", "10"],
    ["cgc Pristine10", "CGC", "10 Pristine"],
    ["CGC Perfect 10", "CGC", "10 Perfect"],
    ["CGC 9.5", "CGC", "9.5"],
    ["PSA 9 MINT", "PSA", "9"],
    ["SGC 8", "SGC", "8"],
  ])("normalizes the CSV condition %s", (condition, company, grade) => {
    expect(parseCardLadderCondition(condition)).toEqual({ company, grade });
  });

  it.each(["BGS", "CGC"])("imports the full numeric %s range", company => {
    for (let grade = 1; grade <= 10; grade += 0.5) {
      expect(parseCardLadderCondition(`${company} ${grade.toFixed(1)}`)).toEqual({ company, grade: String(grade) });
    }
  });

  it("retains unsupported source qualifiers without merging them into numeric grades", () => {
    expect(parseCardLadderCondition("CGC 10 Unknown Label")).toEqual({ company: "CGC", grade: "10 Unknown Label" });
    const card = { name: "Pikachu", set: "Base Set", number: "58", gradingCompany: "CGC", grade: "10" };
    expect(cardLadderCompositeKey({ ...card, grade: "10 Unknown Label" })).not.toBe(cardLadderCompositeKey(card));
  });

  it("uses equivalent grade aliases while retaining separate company and label identities", () => {
    const card = { name: "Pikachu", set: "Base Set", number: "58", gradingCompany: "BGS", grade: "10" };
    expect(cardLadderCompositeKey({ ...card, gradingCompany: "Beckett", grade: "Pristine 10" })).toBe(cardLadderCompositeKey(card));
    expect(cardLadderCompositeKey({ ...card, grade: 10 })).toBe(cardLadderCompositeKey(card));
    const grades = [card, { ...card, grade: "10 Black Label" },
      { ...card, gradingCompany: "CGC" }, { ...card, gradingCompany: "CGC", grade: "10 Pristine" },
      { ...card, gradingCompany: "CGC", grade: "10 Perfect" }];
    expect(new Set(grades.map(cardLadderCompositeKey)).size).toBe(grades.length);
  });

  it("does not deduplicate or reconcile identical certificate numbers across graders or tiers", () => {
    const card = { name: "Pikachu", set: "Base Set", number: "58", gradingCompany: "BGS", grade: "10", cardladderData: { slabSerial: "123456" } };
    const manual = { ...card, entryId: "manual", id: "manual-card", isManualEntry: true, buyPrice: 100, acquiredVia: "buy", acquisitionTransactionId: "purchase" };
    const equivalent = { ...card, gradingCompany: "Beckett", grade: "Pristine 10" };
    expect(cardLadderCertificateKey(card)).toBe(cardLadderCertificateKey(equivalent));
    expect(manualDealCardMatchScore(equivalent, manual)).toBe(1000);
    for (const other of [{ ...card, gradingCompany: "CGC" }, { ...card, grade: "10 Black Label" }, { ...card, grade: "9.5" }]) {
      expect(cardLadderCertificateKey(other)).not.toBe(cardLadderCertificateKey(card));
      expect(manualDealCardMatchScore(other, manual)).toBe(0);
    }
  });
});

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
