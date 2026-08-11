import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    user: { uid: "test-user", email: "vendor@example.com" },
    db: {},
    collectionItems: [],
    currency: "EUR",
  }),
}));

vi.mock("@/contexts/ExpenseContext", () => ({
  useExpenses: () => ({
    expenses: [],
    shows: [],
    recurringExpenses: [],
    reimbursements: [],
    loading: false,
    refreshData: vi.fn(),
    addExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    uploadReceipt: vi.fn(),
    scanReceipt: vi.fn(),
    setExpenseSettlementStatus: vi.fn(),
  }),
}));

vi.mock("@/contexts/TaxContext", () => ({
  useTax: () => ({
    loading: false,
    taxConfig: {},
    purchaseDiary: [],
    shareholderEntries: [],
    otherRevenue: [],
    lossCarryForward: [],
    mileageTrips: [],
    taxFreeBenefits: [],
    saveTaxConfig: vi.fn(),
  }),
}));

import { ExpenseTracker } from "./ExpenseTracker";
import { TaxReporting } from "./TaxReporting";

describe("vendor route smoke tests", () => {
  it("renders the expenses route after its data has loaded", () => {
    const html = renderToStaticMarkup(<ExpenseTracker />);

    expect(html).toContain("Expense Tracker");
    expect(html).toContain("Add Per Diem");
  });

  it("renders the tax reporting route after its data has loaded", () => {
    const html = renderToStaticMarkup(<TaxReporting />);

    expect(html).toContain("Tax Reporting");
    expect(html).toContain("Accountant Export");
  });
});
