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
  Repeat,
  PauseCircle,
  PlayCircle,
  Zap,
  Calendar,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useExpenses } from "@/contexts/ExpenseContext";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  CURRENCIES,
  SETTLEMENT_STATUSES,
  formatExpenseDate,
  getCategoryColor,
} from "@/utils/expenseHelpers";

const FREQUENCIES = [
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function frequencyLabel(id) {
  return FREQUENCIES.find((f) => f.id === id)?.label || "Monthly";
}

export function RecurringExpensesTab() {
  const {
    recurring,
    addRecurring,
    updateRecurring,
    deleteRecurring,
    postRecurringNow,
  } = useExpenses();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  const sorted = useMemo(() => {
    return [...recurring].sort((a, b) => {
      if (a.active === false && b.active !== false) return 1;
      if (b.active === false && a.active !== false) return -1;
      return (a.nextDueDate || "").localeCompare(b.nextDueDate || "");
    });
  }, [recurring]);

  const totalMonthlyEUR = useMemo(() => {
    return recurring
      .filter((r) => r.active !== false && r.currency === "EUR")
      .reduce((sum, r) => {
        const amt = parseFloat(r.amount) || 0;
        if (r.frequency === "monthly") return sum + amt;
        if (r.frequency === "yearly") return sum + amt / 12;
        if (r.frequency === "weekly") return sum + amt * 4.345;
        if (r.frequency === "biweekly") return sum + amt * 2.1725;
        return sum;
      }, 0);
  }, [recurring]);

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (
      !confirm(
        "Delete this recurring expense? Past auto-generated entries will remain in your expense list."
      )
    )
      return;
    await deleteRecurring(id);
  };

  const handleToggleActive = async (entry) => {
    await updateRecurring(entry.id, { active: entry.active === false });
  };

  const handlePostNow = async (entry) => {
    if (
      !confirm(
        `Post a ${entry.currency} ${entry.amount} expense for "${entry.name}" now?`
      )
    )
      return;
    await postRecurringNow(entry.id);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const editingEntry = editingId ? recurring.find((r) => r.id === editingId) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5 text-purple-600" />
          <div>
            <h2 className="text-xl font-semibold">Recurring Expenses</h2>
            <p className="text-sm text-muted-foreground">
              Auto-post fixed expenses (rent, subscriptions, etc.) on a schedule
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Recurring
        </Button>
      </div>

      {/* Summary */}
      {recurring.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Active schedules</div>
              <p className="text-2xl font-bold">
                {recurring.filter((r) => r.active !== false).length}
              </p>
              <p className="text-xs text-muted-foreground">
                of {recurring.length} total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground mb-1">
                Estimated monthly (EUR)
              </div>
              <p className="text-2xl font-bold">
                EUR {totalMonthlyEUR.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                Active EUR schedules only
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground mb-1">Due today or overdue</div>
              <p className="text-2xl font-bold">
                {
                  recurring.filter(
                    (r) =>
                      r.active !== false &&
                      r.nextDueDate &&
                      r.nextDueDate <= todayISO
                  ).length
                }
              </p>
              <p className="text-xs text-muted-foreground">
                Auto-posted on next app load
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <RecurringForm
          entry={editingEntry}
          onSave={async (data) => {
            if (editingId) {
              await updateRecurring(editingId, data);
            } else {
              await addRecurring(data);
            }
            handleClose();
          }}
          onClose={handleClose}
        />
      )}

      {/* Empty state */}
      {recurring.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Repeat className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-1">
              No recurring expenses yet
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Set up rent, storage, software subscriptions, etc. and they'll be
              auto-posted on schedule.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingId(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add your first recurring expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((entry) => (
            <RecurringRow
              key={entry.id}
              entry={entry}
              todayISO={todayISO}
              onEdit={() => handleEdit(entry)}
              onDelete={() => handleDelete(entry.id)}
              onToggleActive={() => handleToggleActive(entry)}
              onPostNow={() => handlePostNow(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================
// Recurring row
// =============================

function RecurringRow({
  entry,
  todayISO,
  onEdit,
  onDelete,
  onToggleActive,
  onPostNow,
}) {
  const isActive = entry.active !== false;
  const isOverdue =
    isActive && entry.nextDueDate && entry.nextDueDate < todayISO;
  const isDueToday =
    isActive && entry.nextDueDate && entry.nextDueDate === todayISO;

  return (
    <Card className={`overflow-hidden ${!isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-medium">{entry.name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(
                  entry.category
                )}`}
              >
                {entry.category}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                {frequencyLabel(entry.frequency)}
              </span>
              {!isActive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                  Paused
                </span>
              )}
              {isOverdue && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </span>
              )}
              {isDueToday && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Due today
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {entry.vendor && <div>Vendor: {entry.vendor}</div>}
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Next due:{" "}
                <span className="font-medium text-foreground">
                  {entry.nextDueDate
                    ? formatExpenseDate(entry.nextDueDate)
                    : "—"}
                </span>
              </div>
              {entry.lastPostedDate && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  Last posted: {formatExpenseDate(entry.lastPostedDate)}
                </div>
              )}
              {entry.endDate && (
                <div>Ends: {formatExpenseDate(entry.endDate)}</div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg">
              {entry.currency} {Number(entry.amount).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              per {entry.frequency === "yearly" ? "year" : entry.frequency === "weekly" ? "week" : entry.frequency === "biweekly" ? "2 weeks" : "month"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onPostNow}
            disabled={!isActive}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            Post now
          </Button>
          <Button variant="outline" size="sm" onClick={onToggleActive}>
            {isActive ? (
              <>
                <PauseCircle className="h-3.5 w-3.5 mr-1" />
                Pause
              </>
            ) : (
              <>
                <PlayCircle className="h-3.5 w-3.5 mr-1" />
                Resume
              </>
            )}
          </Button>
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
      </CardContent>
    </Card>
  );
}

// =============================
// Recurring form (add / edit)
// =============================

function RecurringForm({ entry, onSave, onClose }) {
  const isEditing = !!entry;
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    name: entry?.name || "",
    category: entry?.category || "Rent / Storage",
    description: entry?.description || "",
    amount: entry?.amount?.toString() || "",
    currency: entry?.currency || "EUR",
    vendor: entry?.vendor || "",
    paymentMethod: entry?.paymentMethod || "Bank Transfer",
    notes: entry?.notes || "",
    frequency: entry?.frequency || "monthly",
    dayOfMonth: entry?.dayOfMonth ?? new Date().getDate(),
    startDate: entry?.startDate || today,
    nextDueDate: entry?.nextDueDate || entry?.startDate || today,
    endDate: entry?.endDate || "",
    autoPost: entry?.autoPost ?? true,
    settlementStatus: entry?.settlementStatus || "unsettled",
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);

    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setSaveError("Please enter a valid amount.");
      return;
    }
    if (!form.name.trim()) {
      setSaveError("Please give this recurring expense a name (e.g. \"Monthly rent\").");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        amount,
        endDate: form.endDate || null,
      };
      await onSave(payload);
    } catch (err) {
      console.error("Save error:", err);
      setSaveError(err.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
      <Card className="w-full max-w-2xl my-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
              {isEditing ? "Edit Recurring Expense" : "Add Recurring Expense"}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Name *
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Monthly rent, Adobe CC, Storage unit"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Category *</label>
                <Select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  required
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Frequency *</label>
                <Select
                  value={form.frequency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, frequency: e.target.value }))
                  }
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Amount *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Currency</label>
                <Select
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value }))
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Payment Method
                </label>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paymentMethod: e.target.value }))
                  }
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Vendor / Payee
              </label>
              <Input
                value={form.vendor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor: e.target.value }))
                }
                placeholder="e.g. Landlord name, Adobe"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Description (used on each posted expense)
              </label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="e.g. Office rent"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Start date *
                </label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      startDate: e.target.value,
                      nextDueDate:
                        !isEditing || !f.nextDueDate
                          ? e.target.value
                          : f.nextDueDate,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Next due date
                </label>
                <Input
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nextDueDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  End date (optional)
                </label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>

            {form.frequency === "monthly" && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Day of month (1-31)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={form.dayOfMonth}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dayOfMonth: parseInt(e.target.value) || 1,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Months with fewer days will use the last day of the month.
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">
                Default Settlement Status
              </label>
              <Select
                value={form.settlementStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, settlementStatus: e.target.value }))
                }
              >
                {SETTLEMENT_STATUSES.filter((s) => s.id !== "reimbursed").map(
                  (s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  )
                )}
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-y"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes (will be appended to each generated expense)"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.autoPost}
                onChange={(e) =>
                  setForm((f) => ({ ...f, autoPost: e.target.checked }))
                }
                className="h-4 w-4"
              />
              Auto-post when due (otherwise only post manually with "Post now")
            </label>

            {saveError && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {saveError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                <Check className="h-4 w-4 mr-1" />
                {saving ? "Saving..." : isEditing ? "Update" : "Add"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
