import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Wallet,
  Clock,
  AlertCircle,
  CircleHelp,
  Receipt,
  CheckCircle2,
  Banknote,
  LinkIcon,
  Search,
} from "lucide-react";
import { useExpenses } from "@/contexts/ExpenseContext";
import {
  PAYOUT_METHODS,
  getSettlementStatus,
  getSettlementColor,
  getSettlementLabel,
  computeReimbursementSummary,
  computePayoutTotal,
  formatExpenseDate,
  getCategoryColor,
} from "@/utils/expenseHelpers";

export function ReimbursementsTab() {
  const {
    expenses,
    payouts,
    addPayout,
    updatePayout,
    deletePayout,
    setExpenseSettlementStatus,
  } = useExpenses();

  const [showForm, setShowForm] = useState(false);
  const [editingPayoutId, setEditingPayoutId] = useState(null);
  const [expandedPayoutId, setExpandedPayoutId] = useState(null);
  const [classifierFilter, setClassifierFilter] = useState("all");
  const [showClassifier, setShowClassifier] = useState(true);
  const [classifierSearch, setClassifierSearch] = useState("");

  const expensesById = useMemo(() => {
    const map = {};
    for (const e of expenses) map[e.id] = e;
    return map;
  }, [expenses]);

  const summary = useMemo(
    () => computeReimbursementSummary(expenses),
    [expenses]
  );

  const needsClassification = useMemo(() => {
    let list = expenses.filter((e) => {
      const s = getSettlementStatus(e);
      return s === "unsettled" || s === "pending";
    });
    if (classifierFilter !== "all") {
      list = list.filter((e) => getSettlementStatus(e) === classifierFilter);
    }
    if (classifierSearch.trim()) {
      const q = classifierSearch.toLowerCase();
      list = list.filter((e) =>
        [e.description, e.vendor, e.category, e.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [expenses, classifierFilter, classifierSearch]);

  const editingPayout = editingPayoutId
    ? payouts.find((p) => p.id === editingPayoutId)
    : null;

  const openNewPayout = () => {
    setEditingPayoutId(null);
    setShowForm(true);
  };
  const openEditPayout = (payoutId) => {
    setEditingPayoutId(payoutId);
    setShowForm(true);
  };
  const closeForm = () => {
    setEditingPayoutId(null);
    setShowForm(false);
  };

  const handleDelete = async (payoutId) => {
    if (
      !confirm(
        "Delete this payout? Linked expenses will revert to 'Pending reimbursement'."
      )
    )
      return;
    await deletePayout(payoutId);
  };

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<CircleHelp className="h-4 w-4" />}
          label="Unsettled"
          count={summary.buckets.unsettled.count}
          total={summary.buckets.unsettled.totalEUR}
          accent="text-gray-700"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="Pending reimbursement"
          count={summary.buckets.pending.count}
          total={summary.buckets.pending.totalEUR}
          accent="text-amber-700"
          highlight={summary.buckets.pending.count > 0}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Reimbursed"
          count={summary.buckets.reimbursed.count}
          total={summary.buckets.reimbursed.totalEUR}
          accent="text-green-700"
        />
        <SummaryCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Company card"
          count={summary.buckets.company_card.count}
          total={summary.buckets.company_card.totalEUR}
          accent="text-blue-700"
        />
      </div>

      {/* Total owed callout */}
      {summary.totalOwed > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-900">
                EUR {summary.totalOwed.toFixed(2)} still owed to you
              </p>
              <p className="text-sm text-amber-700">
                {summary.buckets.unsettled.count} unsettled +{" "}
                {summary.buckets.pending.count} pending reimbursement.
                Classify them below or create a payout.
              </p>
            </div>
            <Button size="sm" onClick={openNewPayout}>
              <Plus className="h-4 w-4 mr-1" />
              New Payout
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Classifier */}
      <Card>
        <CardContent className="p-4">
          <button
            onClick={() => setShowClassifier((v) => !v)}
            className="w-full flex items-center justify-between mb-2"
          >
            <div className="flex items-center gap-2">
              {showClassifier ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <h3 className="font-semibold">Expenses to classify</h3>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                {
                  expenses.filter((e) => {
                    const s = getSettlementStatus(e);
                    return s === "unsettled" || s === "pending";
                  }).length
                }
              </span>
            </div>
          </button>

          {showClassifier && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={classifierSearch}
                    onChange={(e) => setClassifierSearch(e.target.value)}
                    placeholder="Search by description, vendor, category..."
                    className="pl-9"
                  />
                </div>
                <Select
                  value={classifierFilter}
                  onChange={(e) => setClassifierFilter(e.target.value)}
                >
                  <option value="all">All needing classification</option>
                  <option value="unsettled">Unsettled only</option>
                  <option value="pending">Pending only</option>
                </Select>
              </div>

              {needsClassification.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  Everything is classified. Nice work.
                </div>
              ) : (
                <div className="space-y-2">
                  {needsClassification.map((expense) => (
                    <ClassifierRow
                      key={expense.id}
                      expense={expense}
                      onSetStatus={(status) =>
                        setExpenseSettlementStatus(expense.id, status)
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payouts list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Payouts</h3>
          <Button size="sm" onClick={openNewPayout}>
            <Plus className="h-4 w-4 mr-1" />
            New Payout
          </Button>
        </div>

        {payouts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Banknote className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-3">
                No payouts recorded yet. Create one to reimburse multiple
                expenses in a single payment.
              </p>
              <Button size="sm" onClick={openNewPayout}>
                <Plus className="h-4 w-4 mr-1" />
                Create your first payout
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {payouts.map((payout) => (
              <PayoutRow
                key={payout.id}
                payout={payout}
                expensesById={expensesById}
                expanded={expandedPayoutId === payout.id}
                onToggle={() =>
                  setExpandedPayoutId(
                    expandedPayoutId === payout.id ? null : payout.id
                  )
                }
                onEdit={() => openEditPayout(payout.id)}
                onDelete={() => handleDelete(payout.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Payout form modal */}
      {showForm && (
        <PayoutForm
          payout={editingPayout}
          expenses={expenses}
          onClose={closeForm}
          onSave={async (data) => {
            if (editingPayout) {
              await updatePayout(editingPayout.id, data);
            } else {
              await addPayout(data);
            }
            closeForm();
          }}
        />
      )}
    </div>
  );
}

// =============================
// Summary card
// =============================

function SummaryCard({ icon, label, count, total, accent, highlight }) {
  return (
    <Card className={highlight ? "ring-1 ring-amber-300" : ""}>
      <CardContent className="p-4">
        <div
          className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${accent}`}
        >
          {icon}
          {label}
        </div>
        <p className="text-xl font-bold">EUR {total.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">
          {count} expense{count === 1 ? "" : "s"}
        </p>
      </CardContent>
    </Card>
  );
}

// =============================
// Classifier row
// =============================

function ClassifierRow({ expense, onSetStatus }) {
  const status = getSettlementStatus(expense);
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/40 transition-colors flex-wrap sm:flex-nowrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {expense.description || expense.vendor || "Untitled expense"}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(
              expense.category
            )}`}
          >
            {expense.category}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${getSettlementColor(
              status
            )}`}
          >
            {getSettlementLabel(status)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatExpenseDate(expense.date)}
          {expense.vendor && ` · ${expense.vendor}`}
          {expense.paymentMethod && ` · ${expense.paymentMethod}`}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-semibold">EUR {expense.amountEUR?.toFixed(2)}</p>
      </div>
      <div className="flex gap-1 flex-shrink-0 w-full sm:w-auto">
        <Button
          variant={status === "company_card" ? "default" : "outline"}
          size="sm"
          className={
            status === "company_card"
              ? "bg-blue-600 hover:bg-blue-700"
              : ""
          }
          onClick={() => onSetStatus("company_card")}
          title="Paid with company card"
        >
          <CreditCard className="h-3.5 w-3.5 mr-1" />
          Company card
        </Button>
        <Button
          variant={status === "pending" ? "default" : "outline"}
          size="sm"
          className={
            status === "pending" ? "bg-amber-600 hover:bg-amber-700" : ""
          }
          onClick={() => onSetStatus("pending")}
          title="Flag as pending reimbursement"
        >
          <Clock className="h-3.5 w-3.5 mr-1" />
          Pending
        </Button>
      </div>
    </div>
  );
}

// =============================
// Payout row
// =============================

function PayoutRow({ payout, expensesById, expanded, onToggle, onEdit, onDelete }) {
  const total = computePayoutTotal(payout, expensesById);
  const linkedCount = (payout.expenseIds || []).length;
  const missingCount = (payout.expenseIds || []).filter(
    (id) => !expensesById[id]
  ).length;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex-shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{formatExpenseDate(payout.date)}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
              {payout.method || "Bank Transfer"}
            </span>
            {payout.reference && (
              <span className="text-xs text-muted-foreground font-mono truncate">
                {payout.reference}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {linkedCount} expense{linkedCount === 1 ? "" : "s"} reimbursed
            {missingCount > 0 && (
              <span className="text-red-600 ml-1">
                · {missingCount} missing
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold">EUR {total.toFixed(2)}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-sm">
            <div>
              <span className="text-muted-foreground">Date</span>
              <p className="font-medium">{formatExpenseDate(payout.date)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Method</span>
              <p className="font-medium">{payout.method || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Reference</span>
              <p className="font-medium font-mono text-xs">
                {payout.reference || "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Total</span>
              <p className="font-medium">EUR {total.toFixed(2)}</p>
            </div>
          </div>

          {payout.notes && (
            <div className="mb-3 text-sm">
              <span className="text-muted-foreground">Notes:</span>{" "}
              <span>{payout.notes}</span>
            </div>
          )}

          <div className="mb-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <LinkIcon className="h-3.5 w-3.5" />
              Linked expenses ({linkedCount})
            </p>
            {linkedCount === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No expenses linked to this payout.
              </p>
            ) : (
              <div className="space-y-1">
                {(payout.expenseIds || []).map((eid) => {
                  const e = expensesById[eid];
                  if (!e) {
                    return (
                      <div
                        key={eid}
                        className="p-2 border border-red-200 rounded text-xs text-red-700 bg-red-50"
                      >
                        Expense no longer exists (ID: {eid})
                      </div>
                    );
                  }
                  return (
                    <div
                      key={eid}
                      className="flex items-center gap-2 p-2 bg-white border rounded text-sm"
                    >
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="truncate">
                            {e.description || e.vendor || "Untitled"}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${getCategoryColor(
                              e.category
                            )}`}
                          >
                            {e.category}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatExpenseDate(e.date)}
                          {e.vendor && ` · ${e.vendor}`}
                        </div>
                      </div>
                      <span className="font-medium flex-shrink-0">
                        EUR {e.amountEUR?.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================
// Payout form
// =============================

function PayoutForm({ payout, expenses, onClose, onSave }) {
  const isEditing = !!payout;

  const [form, setForm] = useState({
    date: payout?.date || new Date().toISOString().slice(0, 10),
    method: payout?.method || "Bank Transfer",
    reference: payout?.reference || "",
    notes: payout?.notes || "",
    expenseIds: payout?.expenseIds || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expenseSearch, setExpenseSearch] = useState("");

  // Eligible expenses: anything currently unsettled, pending, OR already in
  // this payout (so you can uncheck them while editing).
  const currentIds = new Set(form.expenseIds);
  const eligibleExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (currentIds.has(e.id)) return true;
      const s = getSettlementStatus(e);
      return s === "unsettled" || s === "pending";
    });
  }, [expenses, form.expenseIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEligible = useMemo(() => {
    if (!expenseSearch.trim()) return eligibleExpenses;
    const q = expenseSearch.toLowerCase();
    return eligibleExpenses.filter((e) =>
      [e.description, e.vendor, e.category, e.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [eligibleExpenses, expenseSearch]);

  const selectedTotal = useMemo(() => {
    return form.expenseIds.reduce((sum, id) => {
      const e = expenses.find((x) => x.id === id);
      return sum + (e?.amountEUR || 0);
    }, 0);
  }, [form.expenseIds, expenses]);

  const toggleExpense = (id) => {
    setForm((f) => {
      const has = f.expenseIds.includes(id);
      return {
        ...f,
        expenseIds: has
          ? f.expenseIds.filter((x) => x !== id)
          : [...f.expenseIds, id],
      };
    });
  };

  const selectAllVisible = () => {
    setForm((f) => {
      const visibleIds = filteredEligible.map((e) => e.id);
      const next = new Set([...f.expenseIds, ...visibleIds]);
      return { ...f, expenseIds: [...next] };
    });
  };

  const clearAll = () => {
    setForm((f) => ({ ...f, expenseIds: [] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.date) {
      setError("Payout date is required.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      console.error("Save payout failed:", err);
      setError(err.message || "Failed to save payout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
      <Card className="w-full max-w-3xl my-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
              {isEditing ? "Edit Payout" : "New Payout"}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Payout Date *
                </label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Payment Method
                </label>
                <Select
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, method: e.target.value }))
                  }
                >
                  {PAYOUT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Reference / Transaction ID
              </label>
              <Input
                value={form.reference}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reference: e.target.value }))
                }
                placeholder="e.g. Wise transfer ID, bank reference"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[70px] resize-y"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional notes"
              />
            </div>

            {/* Expense picker */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <label className="text-sm font-medium">
                  Allocate expenses to this payout
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="text-blue-600 hover:underline"
                  >
                    Select all shown
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search eligible expenses..."
                  className="pl-9"
                />
              </div>

              {filteredEligible.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg">
                  <Wallet className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                  No eligible expenses. Only unsettled or pending expenses can
                  be added.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
                  {filteredEligible.map((e) => {
                    const checked = form.expenseIds.includes(e.id);
                    const status = getSettlementStatus(e);
                    return (
                      <label
                        key={e.id}
                        className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-accent/40 ${
                          checked ? "bg-blue-50" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExpense(e.id)}
                          className="h-4 w-4 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">
                              {e.description || e.vendor || "Untitled"}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${getCategoryColor(
                                e.category
                              )}`}
                            >
                              {e.category}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${getSettlementColor(
                                status
                              )}`}
                            >
                              {getSettlementLabel(status)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatExpenseDate(e.date)}
                            {e.vendor && ` · ${e.vendor}`}
                            {e.paymentMethod && ` · ${e.paymentMethod}`}
                          </div>
                        </div>
                        <span className="text-sm font-semibold flex-shrink-0">
                          EUR {e.amountEUR?.toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-muted-foreground">
                  {form.expenseIds.length} selected
                </span>
                <span className="font-semibold">
                  Total: EUR {selectedTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                <Check className="h-4 w-4 mr-1" />
                {saving
                  ? "Saving..."
                  : isEditing
                  ? "Update Payout"
                  : "Save Payout"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
