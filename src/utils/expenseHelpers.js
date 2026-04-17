import { jsPDF } from "jspdf";
import "jspdf-autotable";

export const EXPENSE_CATEGORIES = [
  "Inventory / Stock Purchase",
  "Card Grading Fees",
  "Platform & Transaction Fees",
  "Shipping & Postage",
  "Packaging & Supplies",
  "Event / Tournament Fees",
  "Travel",
  "Per Diem",
  "Vehicle / Mileage",
  "Marketing & Advertising",
  "Equipment",
  "Depreciation",
  "Software & Subscriptions",
  "Rent / Storage",
  "Home Office",
  "Phone & Internet",
  "Utilities",
  "Insurance",
  "Bank & FX Fees",
  "Professional Services",
  "Accounting / Bookkeeping",
  "Education & Training",
  "Membership Fees",
  "Meals & Representation",
  "Bad Debt",
  "Other",
];

export const PAYMENT_METHODS = [
  "Cash",
  "Debit Card",
  "Credit Card",
  "Bank Transfer",
  "Wise",
  "PayPal",
  "MobilePay",
  "Other",
];

export const CURRENCIES = ["EUR", "USD", "GBP", "SEK", "NOK", "DKK", "JPY", "CHF"];

export function getCategoryColor(category) {
  const colors = {
    "Inventory / Stock Purchase": "bg-blue-100 text-blue-800",
    "Card Grading Fees": "bg-violet-100 text-violet-800",
    "Platform & Transaction Fees": "bg-rose-100 text-rose-800",
    "Shipping & Postage": "bg-amber-100 text-amber-800",
    "Packaging & Supplies": "bg-orange-100 text-orange-800",
    "Event / Tournament Fees": "bg-purple-100 text-purple-800",
    "Travel": "bg-teal-100 text-teal-800",
    "Per Diem": "bg-lime-100 text-lime-800",
    "Vehicle / Mileage": "bg-sky-100 text-sky-800",
    "Marketing & Advertising": "bg-pink-100 text-pink-800",
    "Equipment": "bg-slate-100 text-slate-800",
    "Depreciation": "bg-neutral-100 text-neutral-800",
    "Software & Subscriptions": "bg-indigo-100 text-indigo-800",
    "Rent / Storage": "bg-stone-100 text-stone-800",
    "Home Office": "bg-fuchsia-100 text-fuchsia-800",
    "Phone & Internet": "bg-blue-100 text-blue-700",
    "Utilities": "bg-cyan-100 text-cyan-800",
    "Insurance": "bg-red-100 text-red-800",
    "Bank & FX Fees": "bg-yellow-100 text-yellow-800",
    "Professional Services": "bg-emerald-100 text-emerald-800",
    "Accounting / Bookkeeping": "bg-green-100 text-green-800",
    "Education & Training": "bg-indigo-100 text-indigo-700",
    "Membership Fees": "bg-teal-100 text-teal-700",
    "Meals & Representation": "bg-orange-100 text-orange-700",
    "Bad Debt": "bg-red-100 text-red-700",
    "Other": "bg-gray-100 text-gray-800",
  };
  return colors[category] || colors["Other"];
}

export function computeExpenseSummary(expenses, dateRange) {
  let filtered = expenses;
  if (dateRange?.from) {
    filtered = filtered.filter((e) => e.date >= dateRange.from);
  }
  if (dateRange?.to) {
    filtered = filtered.filter((e) => e.date <= dateRange.to);
  }

  const totalEUR = filtered.reduce((sum, e) => sum + (e.amountEUR || 0), 0);
  const count = filtered.length;

  const byCategory = {};
  for (const e of filtered) {
    const cat = e.category || "Other";
    if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
    byCategory[cat].total += e.amountEUR || 0;
    byCategory[cat].count += 1;
  }

  const topCategory =
    Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)[0] || null;

  const byMonth = {};
  for (const e of filtered) {
    const month = (e.date || "").slice(0, 7);
    if (!month) continue;
    if (!byMonth[month]) byMonth[month] = 0;
    byMonth[month] += e.amountEUR || 0;
  }

  return { totalEUR, count, byCategory, topCategory, byMonth };
}

export function formatExpenseDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function exportExpenseCSV(expenses, filename) {
  const headers = [
    "Date",
    "Category",
    "Description",
    "Vendor",
    "Amount",
    "Currency",
    "Amount (EUR)",
    "Payment Method",
    "Notes",
  ];

  const rows = expenses.map((e) => [
    e.date || "",
    e.category || "",
    e.description || "",
    e.vendor || "",
    e.amount?.toFixed(2) || "0.00",
    e.currency || "EUR",
    e.amountEUR?.toFixed(2) || "0.00",
    e.paymentMethod || "",
    e.notes || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename || "expenses.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportExpensePDF(expenses, summary, filename) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Expense Report", 14, 20);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 14, 28);
  doc.text(`Total Expenses: ${summary.count}`, 14, 34);
  doc.text(`Total Amount: EUR ${summary.totalEUR.toFixed(2)}`, 14, 40);

  if (summary.topCategory) {
    doc.text(
      `Top Category: ${summary.topCategory[0]} (EUR ${summary.topCategory[1].total.toFixed(2)})`,
      14,
      46
    );
  }

  doc.autoTable({
    startY: 54,
    head: [["Date", "Category", "Description", "Vendor", "Amount", "EUR", "Payment"]],
    body: expenses.map((e) => [
      e.date || "",
      e.category || "",
      e.description || "",
      e.vendor || "",
      `${e.currency || "EUR"} ${e.amount?.toFixed(2) || "0.00"}`,
      `EUR ${e.amountEUR?.toFixed(2) || "0.00"}`,
      e.paymentMethod || "",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  if (Object.keys(summary.byCategory).length > 0) {
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text("Summary by Category", 14, finalY);

    doc.autoTable({
      startY: finalY + 4,
      head: [["Category", "Count", "Total (EUR)", "% of Total"]],
      body: Object.entries(summary.byCategory)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([cat, data]) => [
          cat,
          data.count,
          `EUR ${data.total.toFixed(2)}`,
          summary.totalEUR > 0
            ? `${((data.total / summary.totalEUR) * 100).toFixed(1)}%`
            : "0%",
        ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [34, 197, 94] },
    });
  }

  doc.save(filename || "expense_report.pdf");
}
