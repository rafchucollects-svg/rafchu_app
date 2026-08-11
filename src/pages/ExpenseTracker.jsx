import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Receipt,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  Camera,
  Upload,
  X,
  ScanLine,
  Pencil,
  Filter,
  TrendingUp,
  DollarSign,
  BarChart3,
  Image,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Search,
  Wallet,
  CreditCard,
  Clock,
  CircleHelp,
  CheckCircle2,
  Repeat,
  Utensils,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useExpenses } from "@/contexts/ExpenseContext";
import { ShowScheduleTab } from "@/components/ShowScheduleTab";
import { ReimbursementsTab } from "@/components/ReimbursementsTab";
import { RecurringExpensesTab } from "@/components/RecurringExpensesTab";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  CURRENCIES,
  getCategoryColor,
  computeExpenseSummary,
  formatExpenseDate,
  exportExpenseCSV,
  exportExpensePDF,
  getSettlementStatus,
  getSettlementColor,
  getSettlementLabel,
} from "@/utils/expenseHelpers";

export function ExpenseTracker() {
  const { user } = useApp();
  const {
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    uploadReceipt,
    scanReceipt,
    setExpenseSettlementStatus,
    loading,
    refreshData,
  } = useExpenses();

  const [activeTab, setActiveTab] = useState("expenses");
  const [openPerDiemForm, setOpenPerDiemForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSettlement, setFilterSettlement] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              Please sign in to access expense tracking.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading expenses...</span>
        </div>
      </div>
    );
  }

  const filteredExpenses = expenses.filter((e) => {
    if (filterCategory !== "all" && e.category !== filterCategory) return false;
    if (filterSettlement !== "all" && getSettlementStatus(e) !== filterSettlement)
      return false;
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [
        e.description,
        e.vendor,
        e.category,
        e.notes,
        e.paymentMethod,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const summary = computeExpenseSummary(filteredExpenses, {
    from: filterDateFrom,
    to: filterDateTo,
  });

  const handleEdit = (expense) => {
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this expense?")) return;
    await deleteExpense(id);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingId(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold">Expense Tracker</h1>
            <p className="text-muted-foreground">
              Vendor Toolkit &middot; Business expenses &amp; receipts
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={refreshData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {activeTab === "expenses" && (
            <Button size="sm" onClick={() => { setEditingId(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add Expense
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => {
              setActiveTab("shows");
              setOpenPerDiemForm(true);
            }}
          >
            <Utensils className="h-4 w-4 mr-1" />
            Add Per Diem
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Select
          value={activeTab}
          onChange={(event) => setActiveTab(event.target.value)}
          className="mb-4 w-full sm:hidden"
          aria-label="Expense section"
        >
          <option value="expenses">Expenses</option>
          <option value="recurring">Recurring expenses</option>
          <option value="reimbursements">Reimbursements</option>
          <option value="shows">Show Schedule &amp; Per Diems</option>
        </Select>

        <TabsList className="mb-6 hidden h-auto w-full flex-wrap justify-start gap-1 p-1 sm:flex">
          <TabsTrigger value="expenses" className="shrink-0">
            <Receipt className="h-4 w-4 mr-1" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="recurring" className="shrink-0">
            <Repeat className="h-4 w-4 mr-1" />
            Recurring
          </TabsTrigger>
          <TabsTrigger value="reimbursements" className="shrink-0">
            <Wallet className="h-4 w-4 mr-1" />
            Reimbursements
          </TabsTrigger>
          <TabsTrigger value="shows" className="shrink-0">
            <CalendarDays className="h-4 w-4 mr-1" />
            Show Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shows">
          <ShowScheduleTab
            openNewShow={openPerDiemForm}
            onOpenNewShowHandled={() => setOpenPerDiemForm(false)}
          />
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringExpensesTab />
        </TabsContent>

        <TabsContent value="reimbursements">
          <ReimbursementsTab
            onEditExpense={(id) => {
              setEditingId(id);
              setShowForm(true);
              setActiveTab("expenses");
            }}
          />
        </TabsContent>

        <TabsContent value="expenses">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total Spend
            </div>
            <p className="text-2xl font-bold">
              EUR {summary.totalEUR.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">{summary.count} expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Top Category
            </div>
            {summary.topCategory ? (
              <>
                <p className="text-lg font-bold truncate">{summary.topCategory[0]}</p>
                <p className="text-xs text-muted-foreground">
                  EUR {summary.topCategory[1].total.toFixed(2)} ({summary.topCategory[1].count} items)
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BarChart3 className="h-4 w-4" />
              Categories Used
            </div>
            <p className="text-2xl font-bold">
              {Object.keys(summary.byCategory).length}
            </p>
            <p className="text-xs text-muted-foreground">
              of {EXPENSE_CATEGORIES.length} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expenses by description, vendor, notes..."
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
            <Select
              value={filterSettlement}
              onChange={(e) => setFilterSettlement(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="unsettled">Unsettled</option>
              <option value="pending">Pending reimbursement</option>
              <option value="reimbursed">Reimbursed</option>
              <option value="company_card">Paid with company card</option>
            </Select>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              placeholder="From date"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              placeholder="To date"
            />
          </div>
          {(filterCategory !== "all" || filterSettlement !== "all" || filterDateFrom || filterDateTo || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setSearchQuery("");
                setFilterCategory("all");
                setFilterSettlement("all");
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Export Buttons */}
      {filteredExpenses.length > 0 && (
        <div className="flex gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportExpenseCSV(filteredExpenses, "expenses.csv")}
          >
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportExpensePDF(filteredExpenses, summary, "expense_report.pdf")}
          >
            <Download className="h-4 w-4 mr-1" />
            PDF
          </Button>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <ExpenseForm
          expense={editingId ? expenses.find((e) => e.id === editingId) : null}
          onSave={async (data) => {
            if (editingId) {
              await updateExpense(editingId, data);
            } else {
              await addExpense(data);
            }
            handleFormClose();
          }}
          onClose={handleFormClose}
          uploadReceipt={uploadReceipt}
          scanReceipt={scanReceipt}
        />
      )}

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No expenses yet</p>
            <Button size="sm" onClick={() => { setEditingId(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add your first expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredExpenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              expanded={expandedId === expense.id}
              onToggle={() => setExpandedId(expandedId === expense.id ? null : expense.id)}
              onEdit={() => handleEdit(expense)}
              onDelete={() => handleDelete(expense.id)}
              onSetSettlement={(status) =>
                setExpenseSettlementStatus(expense.id, status)
              }
            />
          ))}
        </div>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================
// Expense Row
// =============================

function ExpenseRow({ expense, expanded, onToggle, onEdit, onDelete, onSetSettlement }) {
  const settlementStatus = getSettlementStatus(expense);
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
            <span className="font-medium truncate">
              {expense.description || expense.vendor || "Untitled expense"}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(expense.category)}`}>
              {expense.category}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${getSettlementColor(settlementStatus)}`}
              title={getSettlementLabel(settlementStatus)}
            >
              {getSettlementLabel(settlementStatus)}
            </span>
            {expense.receiptUrl && (
              <Image className="h-3.5 w-3.5 text-muted-foreground" title="Has receipt" />
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {formatExpenseDate(expense.date)}
            {expense.vendor && ` · ${expense.vendor}`}
            {settlementStatus === "reimbursed" && expense.reimbursedDate && (
              <span className="text-green-700">
                {" "}· Reimbursed {formatExpenseDate(expense.reimbursedDate)}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold">
            {expense.currency !== "EUR" && (
              <span className="text-sm text-muted-foreground mr-1">
                {expense.currency} {expense.amount?.toFixed(2)}
              </span>
            )}
          </p>
          <p className="font-bold text-base">EUR {expense.amountEUR?.toFixed(2)}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-sm">
            <div>
              <span className="text-muted-foreground">Payment</span>
              <p className="font-medium">{expense.paymentMethod || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Currency</span>
              <p className="font-medium">{expense.currency}</p>
            </div>
            {expense.currency !== "EUR" && (
              <div>
                <span className="text-muted-foreground">Exchange Rate</span>
                <p className="font-medium">{expense.exchangeRate?.toFixed(4)}</p>
              </div>
            )}
            {expense.notes && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Notes</span>
                <p className="font-medium">{expense.notes}</p>
              </div>
            )}
          </div>

          {expense.receiptUrl && (
            <div className="mb-3">
              <a
                href={expense.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <Image className="h-4 w-4" />
                View receipt
              </a>
            </div>
          )}

          {expense.ocrData && (
            <div className="mb-3 p-2 bg-blue-50 rounded-lg text-xs">
              <span className="font-medium text-blue-700">OCR scanned</span>
              <span className="text-blue-600 ml-2">
                Confidence: {(expense.ocrData.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Settlement status quick-actions */}
          <div className="mb-3 p-3 bg-white border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Settlement status
              </span>
            </div>
            {settlementStatus === "reimbursed" ? (
              <div className="text-sm">
                <p className="text-green-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Reimbursed
                  {expense.reimbursedDate &&
                    ` on ${formatExpenseDate(expense.reimbursedDate)}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Manage this reimbursement from the Reimbursements tab (edit
                  the linked payout to re-allocate).
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={
                    settlementStatus === "unsettled" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => onSetSettlement("unsettled")}
                >
                  <CircleHelp className="h-3.5 w-3.5 mr-1" />
                  Unsettled
                </Button>
                <Button
                  variant={
                    settlementStatus === "pending" ? "default" : "outline"
                  }
                  size="sm"
                  className={
                    settlementStatus === "pending"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : ""
                  }
                  onClick={() => onSetSettlement("pending")}
                >
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  Pending reimbursement
                </Button>
                <Button
                  variant={
                    settlementStatus === "company_card" ? "default" : "outline"
                  }
                  size="sm"
                  className={
                    settlementStatus === "company_card"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : ""
                  }
                  onClick={() => onSetSettlement("company_card")}
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1" />
                  Paid with company card
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={onDelete}>
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
// Expense Form (Add / Edit)
// =============================

function ExpenseForm({ expense, onSave, onClose, uploadReceipt, scanReceipt }) {
  const isEditing = !!expense;

  const [form, setForm] = useState({
    date: expense?.date || new Date().toISOString().slice(0, 10),
    category: expense?.category || "",
    description: expense?.description || "",
    amount: expense?.amount?.toString() || "",
    currency: expense?.currency || "EUR",
    vendor: expense?.vendor || "",
    paymentMethod: expense?.paymentMethod || "Cash",
    notes: expense?.notes || "",
    receiptUrl: expense?.receiptUrl || null,
    ocrData: expense?.ocrData || null,
    settlementStatus: expense?.settlementStatus || "unsettled",
  });
  const isReimbursed = form.settlementStatus === "reimbursed";

  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(expense?.receiptUrl || null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setScanError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setReceiptFile(file);
    setScanError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        setReceiptFile(file);
        setScanError(null);
        const reader = new FileReader();
        reader.onload = (ev) => setReceiptPreview(ev.target.result);
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const handleScan = async () => {
    if (!receiptFile && !form.receiptUrl) return;
    setScanning(true);
    setScanError(null);

    try {
      let storagePath;

      if (receiptFile) {
        setUploading(true);
        const result = await uploadReceipt(receiptFile);
        storagePath = result.storagePath;
        setForm((prev) => ({ ...prev, receiptUrl: result.downloadUrl, receiptStoragePath: result.storagePath }));
        setReceiptFile(null);
        setUploading(false);
      } else {
        const urlPath = form.receiptUrl;
        const match = urlPath.match(/expense_receipts%2F[^?]+/);
        if (match) {
          storagePath = decodeURIComponent(match[0]);
        } else {
          throw new Error("Cannot determine storage path from existing receipt URL.");
        }
      }

      const ocrResult = await scanReceipt(storagePath);

      const matchedCategory = EXPENSE_CATEGORIES.find(
        (c) => c.toLowerCase() === (ocrResult.category || "").toLowerCase()
      ) || "";

      setForm((prev) => ({
        ...prev,
        amount: ocrResult.amount?.toString() || prev.amount,
        currency: ocrResult.currency || prev.currency,
        vendor: ocrResult.vendor || prev.vendor,
        date: ocrResult.date || prev.date,
        category: matchedCategory || prev.category,
        description: ocrResult.description || prev.description,
        ocrData: ocrResult,
      }));
    } catch (err) {
      console.error("Scan error:", err);
      setScanError(err.message || "Failed to scan receipt. You can still enter data manually.");
    } finally {
      setScanning(false);
      setUploading(false);
    }
  };

  const [saveError, setSaveError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);

    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setSaveError("Please enter a valid amount.");
      return;
    }
    if (!form.category) {
      setSaveError("Please select a category.");
      return;
    }

    setSaving(true);

    try {
      let receiptUrl = form.receiptUrl;
      let receiptStoragePath = form.receiptStoragePath || null;
      if (receiptFile && !receiptUrl) {
        setUploading(true);
        const result = await uploadReceipt(receiptFile);
        receiptUrl = result.downloadUrl;
        receiptStoragePath = result.storagePath;
        setUploading(false);
      }

      // Preserve payout linkage if this expense is reimbursed (managed by
      // the Reimbursements tab, not editable inline here).
      const payload = {
        ...form,
        amount,
        receiptUrl,
        receiptStoragePath,
      };
      if (isReimbursed) {
        payload.settlementStatus = "reimbursed";
        payload.payoutId = expense?.payoutId ?? null;
        payload.reimbursedDate = expense?.reimbursedDate ?? null;
      } else {
        payload.payoutId = null;
        payload.reimbursedDate = null;
      }

      await onSave(payload);
    } catch (err) {
      console.error("Save error:", err);
      setSaveError(err.message || "Failed to save expense. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4"
      onPaste={handlePaste}
    >
      <Card className="w-full max-w-2xl my-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
              {isEditing ? "Edit Expense" : "Add Expense"}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Receipt Upload Area */}
          <div
            className="border-2 border-dashed rounded-lg p-4 mb-4 text-center transition-colors hover:border-primary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {receiptPreview ? (
              <div className="relative inline-block">
                <img
                  src={receiptPreview}
                  alt="Receipt preview"
                  className="max-h-48 rounded-lg mx-auto"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 bg-white/80 h-7 w-7"
                  onClick={() => {
                    setReceiptPreview(null);
                    setReceiptFile(null);
                    setForm((prev) => ({ ...prev, receiptUrl: null, ocrData: null }));
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="py-4">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Drag &amp; drop, paste a screenshot, or
                </p>
                <div className="flex gap-2 justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Browse
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    Camera
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />

            {(receiptFile || form.receiptUrl) && (
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleScan}
                  disabled={scanning || uploading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {scanning ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      {uploading ? "Uploading..." : "Scanning receipt..."}
                    </>
                  ) : (
                    <>
                      <ScanLine className="h-4 w-4 mr-1" />
                      Scan Receipt with AI
                    </>
                  )}
                </Button>
              </div>
            )}

            {scanError && (
              <div className="mt-2 flex items-center gap-1 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {scanError}
              </div>
            )}

            {form.ocrData && !scanning && (
              <div className="mt-2 flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Receipt scanned — fields pre-filled. Review and save.
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Date *</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Category *</label>
                <Select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  required
                >
                  <option value="">Select category...</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of the expense"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Amount *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Currency</label>
                <Select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Payment Method</label>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Vendor / Merchant</label>
              <Input
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="Store or vendor name"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Settlement Status
              </label>
              <Select
                value={form.settlementStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, settlementStatus: e.target.value }))
                }
                disabled={isReimbursed}
              >
                <option value="unsettled">Unsettled</option>
                <option value="pending">Pending reimbursement</option>
                <option value="company_card">Paid with company card</option>
                {isReimbursed && (
                  <option value="reimbursed">Reimbursed</option>
                )}
              </Select>
              {isReimbursed && (
                <p className="text-xs text-muted-foreground mt-1">
                  This expense is linked to a payout. Edit or delete the payout
                  in the Reimbursements tab to change its status.
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>

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
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    {isEditing ? "Update Expense" : "Add Expense"}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
