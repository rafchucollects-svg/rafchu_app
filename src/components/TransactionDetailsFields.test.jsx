import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TransactionDetailsFields } from "./TransactionDetailsFields";
import { createEmptyTransactionDetails } from "../utils/transactionHelpers";

describe("TransactionDetailsFields", () => {
  it("renders the evidence fields needed for transaction review", () => {
    const html = renderToStaticMarkup(
      <TransactionDetailsFields
        value={createEmptyTransactionDetails("sale")}
        onChange={() => {}}
        type="sale"
      />,
    );

    expect(html).toContain("Transaction date");
    expect(html).toContain("Counterparty / customer name");
    expect(html).toContain("Payment method");
    expect(html).toContain("Receipt / invoice / voucher number");
    expect(html).toContain("Margin-scheme eligibility");
    expect(html).toContain("VAT treatment for this transaction");
    expect(html).toContain("Receipt / invoice URL");
  });
});
