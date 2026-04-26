import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FileText,
  Settings,
  BookOpen,
  Calculator,
  Package,
  Landmark,
  TrendingUp,
  Plus,
  Trash2,
  Download,
  Upload,
  Save,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Camera,
  X,
  Building2,
  ArrowDownUp,
  ClipboardSignature,
  Pen,
  Check,
  Search,
  Sparkles,
  Car,
  Gift,
  PiggyBank,
  ArrowRight,
  Info,
  MapPin,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useTax } from "@/contexts/TaxContext";
import {
  formatCurrency,
  computeItemMetrics,
  computeInventoryTotals,
} from "@/utils/cardHelpers";
import {
  calculateMarginTax,
  calculateCOGS,
  evaluateInventoryForTax,
  getQuarterRange,
  getMonthRange,
  getAnnualRange,
  getAcquisitionCost,
  FINLAND_VAT_RATE,
  FINLAND_CORPORATE_TAX_RATE,
  FINLAND_MILEAGE_RATE,
  STOCK_PURCHASE_CATEGORY,
  calculateProfitAndLoss,
  calculateLossCarryForward,
  calculateDividendOptimization,
  calculateMileageAllowance,
  TAX_FREE_BENEFITS,
  exportPurchaseDiaryCSV,
  exportMarginTaxCSV,
  exportInventoryValuationCSV,
  exportShareholderLedgerCSV,
  exportPurchaseDiaryPDF,
  exportMarginTaxPDF,
  exportInventoryValuationPDF,
  exportShareholderLedgerPDF,
  exportCOGSReportPDF,
  exportProfitLossCSV,
  exportProfitLossPDF,
  generateBillOfSalePDF,
} from "@/utils/taxHelpers";
import { useExpenses } from "@/contexts/ExpenseContext";
import { getCategoryColor } from "@/utils/expenseHelpers";
import { parseWiseCSV, computeBankSummary, exportBankCSV } from "@/utils/bankHelpers";
import {
  collection as fsCollection,
  query,
  orderBy,
  getDocs,
  where,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import SignaturePad from "signature_pad";
import { toast } from "@/components/ui/Toaster";
import { confirm } from "@/components/ui/ConfirmDialog";

export function TaxReporting() {
  const { user, db, collectionItems, currency } = useApp();
  const tax = useTax();
  const [activeTab, setActiveTab] = useState("settings");

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              Please sign in to access tax reporting.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tax.loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading tax data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <FileText className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-3xl font-bold">Tax Reporting</h1>
          <p className="text-muted-foreground">
            Vendor Toolkit &middot; Marginaaliverotus
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="purchases">
            <BookOpen className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Purchase Diary</span>
          </TabsTrigger>
          <TabsTrigger value="margin">
            <Calculator className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Margin Tax</span>
          </TabsTrigger>
          <TabsTrigger value="valuation">
            <Package className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Inventory</span>
          </TabsTrigger>
          <TabsTrigger value="shareholder">
            <Landmark className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Loan Ledger</span>
          </TabsTrigger>
          <TabsTrigger value="cogs">
            <TrendingUp className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">COGS</span>
          </TabsTrigger>
          <TabsTrigger value="pnl">
            <FileText className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">P&L</span>
          </TabsTrigger>
          <TabsTrigger value="bank">
            <Building2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Bank</span>
          </TabsTrigger>
          <TabsTrigger value="losses">
            <ArrowDownUp className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Loss C/F</span>
          </TabsTrigger>
          <TabsTrigger value="dividends">
            <PiggyBank className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Dividends</span>
          </TabsTrigger>
          <TabsTrigger value="taxfree">
            <Gift className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Tax-Free</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <TaxSettingsTab />
        </TabsContent>
        <TabsContent value="purchases">
          <PurchaseDiaryTab />
        </TabsContent>
        <TabsContent value="margin">
          <MarginTaxTab />
        </TabsContent>
        <TabsContent value="valuation">
          <InventoryValuationTab />
        </TabsContent>
        <TabsContent value="shareholder">
          <ShareholderLedgerTab />
        </TabsContent>
        <TabsContent value="cogs">
          <COGSTab />
        </TabsContent>
        <TabsContent value="pnl">
          <ProfitLossTab />
        </TabsContent>
        <TabsContent value="bank">
          <BankTransactionsTab />
        </TabsContent>
        <TabsContent value="losses">
          <LossCarryForwardTab />
        </TabsContent>
        <TabsContent value="dividends">
          <DividendOptimizerTab />
        </TabsContent>
        <TabsContent value="taxfree">
          <TaxFreePaymentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================
// Tab 1: Tax Settings
// =============================

function TaxSettingsTab() {
  const tax = useTax();
  const [form, setForm] = useState(tax.taxConfig || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (tax.taxConfig) setForm(tax.taxConfig);
  }, [tax.taxConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await tax.saveTaxConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Company Information</h2>
          <p className="text-sm text-muted-foreground mb-4">
            This information will appear on your tax reports.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Company Name (Oy)
            </label>
            <Input
              value={form.companyName || ""}
              onChange={(e) =>
                setForm({ ...form, companyName: e.target.value })
              }
              placeholder="My Cards Oy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Business ID (Y-tunnus)
            </label>
            <Input
              value={form.businessId || ""}
              onChange={(e) =>
                setForm({ ...form, businessId: e.target.value })
              }
              placeholder="1234567-8"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              VAT Number (ALV-numero)
            </label>
            <Input
              value={form.vatNumber || ""}
              onChange={(e) =>
                setForm({ ...form, vatNumber: e.target.value })
              }
              placeholder="FI12345678"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <Input
              value={form.address || ""}
              onChange={(e) =>
                setForm({ ...form, address: e.target.value })
              }
              placeholder="Company address"
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold mb-3">Fiscal Year</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Fiscal Year Start
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={form.fiscalYearStart || 1}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fiscalYearStart: parseInt(e.target.value),
                  })
                }
              >
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Fiscal Year End
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={form.fiscalYearEnd || 12}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fiscalYearEnd: parseInt(e.target.value),
                  })
                }
              >
                {months.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold mb-3">VAT Filing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                ALV Filing Period (Ilmoitusjakso)
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={form.vatFilingPeriod || "quarterly"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    vatFilingPeriod: e.target.value,
                  })
                }
              >
                <option value="monthly">Monthly (Kuukausittain)</option>
                <option value="quarterly">Quarterly (Neljännesvuosittain)</option>
                <option value="annual">Annual (Vuosittain)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Check your Vero decision — filing frequency depends on turnover.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-lg font-semibold mb-3">Defaults</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Default Payment Method
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md text-sm"
                value={form.defaultPaymentMethod || "Wise"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultPaymentMethod: e.target.value,
                  })
                }
              >
                <option value="Wise">Wise</option>
                <option value="MobilePay">MobilePay</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="PayPal">PayPal</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 2: Purchase Diary
// =============================

function PurchaseDiaryTab() {
  const tax = useTax();
  const { user, db, currency } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    location: "",
    sellerName: "",
    itemName: "",
    set: "",
    condition: "NM",
    quantity: 1,
    originalCurrency: "EUR",
    originalAmount: "",
    paymentMethod: tax.taxConfig?.defaultPaymentMethod || "Wise",
    notes: "",
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [txEntries, setTxEntries] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);

  // Load buy/trade incoming transactions to auto-populate
  useEffect(() => {
    if (!user || !db) return;
    let cancelled = false;
    const loadTransactions = async () => {
      setLoadingTx(true);
      try {
        const col = fsCollection(db, "transactions", user.uid, "entries");
        const snap = await getDocs(query(col, orderBy("ts", "desc")));
        const auto = [];
        snap.docs.forEach((d) => {
          const tx = { id: d.id, ...d.data() };
          if (tx.type === "buy" && tx.itemsIn) {
            tx.itemsIn.forEach((item, idx) => {
              auto.push({
                id: `tx-${tx.id}-in-${idx}`,
                purchaseId: "BUY",
                date: tx.ts,
                location: "",
                sellerName: "",
                itemName: item.name || "",
                set: item.set || "",
                condition: item.condition || "NM",
                quantity: item.quantity || 1,
                originalCurrency: tx.currency || "EUR",
                originalAmount: item.unitPrice || 0,
                priceEUR: item.unitPrice || 0,
                paymentMethod: "",
                notes: tx.notes || "",
                source: "buy",
              });
            });
          } else if (tx.type === "trade" && tx.itemsIn) {
            tx.itemsIn.forEach((item, idx) => {
              auto.push({
                id: `tx-${tx.id}-in-${idx}`,
                purchaseId: "TRADE-IN",
                date: tx.ts,
                location: "",
                sellerName: "",
                itemName: item.name || "",
                set: item.set || "",
                condition: item.condition || "NM",
                quantity: item.quantity || 1,
                originalCurrency: tx.currency || "EUR",
                originalAmount: item.unitPrice || item.marketValue || 0,
                priceEUR: item.unitPrice || item.marketValue || 0,
                paymentMethod: "Trade",
                notes: tx.notes || "",
                source: "trade",
              });
            });
          }
        });
        if (!cancelled) setTxEntries(auto);
      } catch (err) {
        console.error("Failed to load transaction entries for diary:", err);
      } finally {
        if (!cancelled) setLoadingTx(false);
      }
    };
    loadTransactions();
    return () => { cancelled = true; };
  }, [user, db]);

  const allEntries = useMemo(() => {
    const manual = tax.purchaseDiary.map((e) => ({ ...e, source: "manual" }));
    return [...manual, ...txEntries].sort((a, b) => (b.date || 0) - (a.date || 0));
  }, [tax.purchaseDiary, txEntries]);

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      location: "",
      sellerName: "",
      itemName: "",
      set: "",
      condition: "NM",
      quantity: 1,
      originalCurrency: "EUR",
      originalAmount: "",
      paymentMethod: tax.taxConfig?.defaultPaymentMethod || "Wise",
      notes: "",
    });
    setReceiptFile(null);
  };

  const handleSubmit = async () => {
    if (!form.itemName || !form.originalAmount) {
      toast.info("Please fill in at least item name and amount.");
      return;
    }
    setSubmitting(true);
    try {
      let receiptUrls = [];
      if (receiptFile) {
        const tempId = `temp_${Date.now()}`;
        const url = await tax.uploadReceipt(receiptFile, tempId);
        if (url) receiptUrls.push(url);
      }

      await tax.addPurchaseEntry({
        ...form,
        date: new Date(form.date).getTime(),
        quantity: parseInt(form.quantity) || 1,
        receiptUrls,
      });

      resetForm();
      setShowForm(false);
    } catch {
      toast.error("Failed to add entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const sourceLabel = (entry) => {
    if (entry.source === "buy") return "Deal Calculator (Buy)";
    if (entry.source === "trade") return "Trade (In)";
    return null;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">
              Purchase Diary (Ostopäiväkirja)
            </h2>
            <p className="text-sm text-muted-foreground">
              Mandatory legal log for all goods bought from private individuals.
              Automatically includes completed purchases and trade-ins.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportPurchaseDiaryCSV(
                  allEntries,
                  `purchase_diary_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
              disabled={allEntries.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportPurchaseDiaryPDF(
                  allEntries,
                  tax.taxConfig,
                  `purchase_diary_${new Date().toISOString().slice(0, 10)}.pdf`
                )
              }
              disabled={allEntries.length === 0}
            >
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Entry
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="border rounded-lg p-4 mb-4 bg-accent/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm({ ...form, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Event / Location
                </label>
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="e.g. Helsinki Card Show"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Seller Name
                </label>
                <Input
                  value={form.sellerName}
                  onChange={(e) =>
                    setForm({ ...form, sellerName: e.target.value })
                  }
                  placeholder="Private Seller"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Item Name
                </label>
                <Input
                  value={form.itemName}
                  onChange={(e) =>
                    setForm({ ...form, itemName: e.target.value })
                  }
                  placeholder="Charizard VMAX"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Set</label>
                <Input
                  value={form.set}
                  onChange={(e) =>
                    setForm({ ...form, set: e.target.value })
                  }
                  placeholder="Shining Fates"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Condition
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={form.condition}
                  onChange={(e) =>
                    setForm({ ...form, condition: e.target.value })
                  }
                >
                  <option value="NM">NM</option>
                  <option value="LP">LP</option>
                  <option value="MP">MP</option>
                  <option value="HP">HP</option>
                  <option value="DMG">DMG</option>
                  <option value="PSA 10">PSA 10</option>
                  <option value="PSA 9">PSA 9</option>
                  <option value="CGC 10">CGC 10</option>
                  <option value="BGS 9.5">BGS 9.5</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Qty</label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Currency
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={form.originalCurrency}
                  onChange={(e) =>
                    setForm({ ...form, originalCurrency: e.target.value })
                  }
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="JPY">JPY</option>
                  <option value="GBP">GBP</option>
                  <option value="SEK">SEK</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Amount
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.originalAmount}
                  onChange={(e) =>
                    setForm({ ...form, originalAmount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Payment Method
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm({ ...form, paymentMethod: e.target.value })
                  }
                >
                  <option value="Wise">Wise</option>
                  <option value="MobilePay">MobilePay</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="PayPal">PayPal</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <Input
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Optional notes"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Receipt Photo
                </label>
                <label className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer hover:bg-accent/50 transition-colors">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground truncate">
                    {receiptFile ? receiptFile.name : "Attach photo..."}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving..." : "Save Entry"}
              </Button>
            </div>
          </div>
        )}

        {loadingTx ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading transaction data...
          </div>
        ) : allEntries.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No purchase entries yet. Add your first purchase above, or complete
              a purchase/trade in the calculators.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Item</th>
                  <th className="pb-2 pr-3">Seller</th>
                  <th className="pb-2 pr-3">Location</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3 text-right">EUR</th>
                  <th className="pb-2 pr-3">Payment</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {allEntries.map((entry) => (
                  <tr key={entry.id} className={`border-b ${entry.source !== "manual" ? "bg-blue-50/40" : "hover:bg-accent/30"}`}>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {entry.source === "manual" ? (
                        entry.purchaseId
                      ) : (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          entry.source === "buy" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {sourceLabel(entry)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {entry.date
                        ? new Date(entry.date).toLocaleDateString("fi-FI")
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{entry.itemName}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.set}
                        {entry.condition ? ` · ${entry.condition}` : ""}
                        {entry.quantity > 1 ? ` · x${entry.quantity}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {entry.sellerName || "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {entry.location || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {entry.originalCurrency !== "EUR"
                        ? `${(entry.originalAmount || 0).toFixed?.(2) ?? entry.originalAmount} ${entry.originalCurrency}`
                        : ""}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                      {formatCurrency(entry.priceEUR || entry.originalAmount, "EUR")}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {entry.paymentMethod}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {entry.receiptUrls?.length > 0 && (
                          <a
                            href={entry.receiptUrls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-accent rounded"
                            title="View receipt"
                          >
                            <Camera className="h-3.5 w-3.5 text-blue-500" />
                          </a>
                        )}
                        {entry.source === "manual" && (
                          <button
                            onClick={() => tax.deletePurchaseEntry(entry.id)}
                            className="p-1 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-sm text-muted-foreground text-right">
              Total purchases:{" "}
              <span className="font-semibold">
                {formatCurrency(
                  allEntries.reduce(
                    (s, e) => s + (e.priceEUR || e.originalAmount || 0) * (e.quantity || 1),
                    0
                  ),
                  "EUR"
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 3: Margin Tax Report
// =============================

function MarginTaxTab() {
  const { user, db, currency } = useApp();
  const tax = useTax();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const vatFilingPeriod = tax.taxConfig?.vatFilingPeriod || "quarterly";
  const [period, setPeriod] = useState(() => {
    if (vatFilingPeriod === "monthly") return new Date().getMonth() + 1;
    if (vatFilingPeriod === "annual") return 0;
    return Math.ceil((new Date().getMonth() + 1) / 3);
  });
  const [allTransactions, setAllTransactions] = useState([]);
  const [loadingSales, setLoadingSales] = useState(true);

  const fiscalStart = tax.taxConfig?.fiscalYearStart || 1;

  const loadTransactions = useCallback(async () => {
    if (!user || !db) return;
    setLoadingSales(true);
    try {
      const col = fsCollection(db, "transactions", user.uid, "entries");
      const snap = await getDocs(query(col, orderBy("ts", "desc")));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllTransactions(all);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoadingSales(false);
    }
  }, [user, db]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Compute period boundaries based on configured filing frequency
  const { start: periodStart, end: periodEnd } = useMemo(() => {
    if (vatFilingPeriod === "monthly") return getMonthRange(year, period, fiscalStart);
    if (vatFilingPeriod === "annual") return getAnnualRange(year, fiscalStart);
    return getQuarterRange(year, period, fiscalStart);
  }, [year, period, fiscalStart, vatFilingPeriod]);

  // Filter transactions to the selected period
  const salesData = useMemo(() => {
    return allTransactions.filter((tx) => {
      const ts = tx.ts || 0;
      return ts >= periodStart.getTime() && ts <= periodEnd.getTime();
    });
  }, [allTransactions, periodStart, periodEnd]);

  // Figure out which quarters actually have data (for user guidance)
  const quartersWithData = useMemo(() => {
    const qSet = new Set();
    allTransactions.forEach((tx) => {
      const ts = tx.ts;
      if (!ts) return;
      const d = new Date(ts);
      const q = Math.ceil((d.getMonth() + 1) / 3);
      const y = d.getFullYear();
      qSet.add(`Q${q} ${y}`);
    });
    return [...qSet].sort().reverse();
  }, [allTransactions]);

  // Direct sales
  const directSales = salesData.filter(
    (tx) => tx.type === "sale" || tx.type === "sell"
  );
  const directSalesTotal = directSales.reduce(
    (s, tx) => s + (tx.totalValue || tx.totalAmount || 0),
    0
  );

  // Trade outgoing items count as sales
  const trades = salesData.filter((tx) => tx.type === "trade");
  const tradeOutgoing = [];
  trades.forEach((tx) => {
    (tx.itemsOut || []).forEach((item) => {
      tradeOutgoing.push({
        ...item,
        ts: tx.ts,
        notes: tx.notes || "Trade (Out)",
        totalValue: (item.unitPrice || 0) * (item.quantity || 1),
        source: "trade",
      });
    });
  });
  const tradeOutgoingTotal = tradeOutgoing.reduce(
    (s, item) => s + (item.totalValue || 0),
    0
  );

  // Combined sales = direct sales + trade outgoing
  const sales = [
    ...directSales.map((tx) => ({ ...tx, source: "sale" })),
    ...tradeOutgoing,
  ];
  const totalSales = directSalesTotal + tradeOutgoingTotal;

  // Purchase cost = acquisition cost of items SOLD (COGS), not purchases in the period.
  // For margin tax, the deductible cost is what those specific sold items cost you.
  const cogsForMargin = useMemo(() => {
    const saleTx = salesData.filter((tx) => tx.type === "sale" || tx.type === "sell");
    return calculateCOGS(saleTx);
  }, [salesData]);

  // Trade outgoing items also have a cost basis
  const tradeOutgoingCost = useMemo(() => {
    return tradeOutgoing.reduce((sum, item) => {
      const costBasis = item.costBasis || (item.unitPrice || 0) * 0.8 || 0;
      return sum + costBasis * (item.quantity || 1);
    }, 0);
  }, [tradeOutgoing]);

  const totalPurchaseCost = cogsForMargin.totalCOGS + tradeOutgoingCost;

  const report = calculateMarginTax(totalSales, totalPurchaseCost);
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const periodLabel = vatFilingPeriod === "monthly"
    ? `${MONTH_NAMES[period - 1]} ${year}`
    : vatFilingPeriod === "annual"
      ? `FY ${year}`
      : `Q${period} ${year}`;
  const periodDateRange = `${periodStart.toLocaleDateString("fi-FI")} – ${periodEnd.toLocaleDateString("fi-FI")}`;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">
              Margin Tax Report (Marginaaliverolaskelma)
            </h2>
            <p className="text-sm text-muted-foreground">
              {vatFilingPeriod === "monthly" ? "Monthly" : vatFilingPeriod === "annual" ? "Annual" : "Quarterly"} VAT filing for used goods under the margin scheme.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportMarginTaxCSV(report, periodLabel, `margin_tax_${periodLabel}.csv`)
              }
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportMarginTaxPDF(
                  report,
                  periodLabel,
                  sales,
                  tax.taxConfig,
                  `margin_tax_${periodLabel}.pdf`
                )
              }
            >
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium mb-1">Year</label>
            <select
              className="px-3 py-2 border rounded-md text-sm"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          {vatFilingPeriod !== "annual" && (
            <div>
              <label className="block text-xs font-medium mb-1">
                {vatFilingPeriod === "monthly" ? "Month" : "Quarter"}
              </label>
              <select
                className="px-3 py-2 border rounded-md text-sm"
                value={period}
                onChange={(e) => setPeriod(parseInt(e.target.value))}
              >
                {vatFilingPeriod === "monthly" ? (
                  MONTH_NAMES.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))
                ) : (
                  <>
                    <option value={1}>Q1</option>
                    <option value={2}>Q2</option>
                    <option value={3}>Q3</option>
                    <option value={4}>Q4</option>
                  </>
                )}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={loadTransactions}
              disabled={loadingSales}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${loadingSales ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mb-6">
          Period: {periodDateRange}
          {!loadingSales && salesData.length === 0 && allTransactions.length > 0 && (
            <span className="ml-2 text-amber-600">
              No transactions in this period.
              {quartersWithData.length > 0 && (
                <> Data found in: {quartersWithData.slice(0, 4).join(", ")}</>
              )}
            </span>
          )}
          {!loadingSales && salesData.length > 0 && (
            <span className="ml-2 text-green-600">
              {salesData.length} transaction(s) found
            </span>
          )}
        </div>

        {loadingSales ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading sales data...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium">
                  Total Sales
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {formatCurrency(report.totalSales, "EUR")}
                </div>
                <div className="text-xs text-blue-500">
                  {directSales.length} sale(s){tradeOutgoing.length > 0 && ` + ${tradeOutgoing.length} trade out`}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-sm text-orange-600 font-medium">
                  Total Purchase Cost
                </div>
                <div className="text-2xl font-bold text-orange-900">
                  {formatCurrency(report.totalPurchaseCost, "EUR")}
                </div>
                <div className="text-xs text-orange-500">
                  {cogsForMargin.details.length + tradeOutgoing.length} sold item(s)
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium">
                  Gross Margin
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {formatCurrency(report.grossMargin, "EUR")}
                </div>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-purple-800 mb-3">
                VAT Calculation (ALV {(FINLAND_VAT_RATE * 100).toFixed(1)}%)
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Gross Margin</span>
                  <span className="font-mono">
                    {formatCurrency(report.grossMargin, "EUR")}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    ÷ {(1 + FINLAND_VAT_RATE).toFixed(3)} × {FINLAND_VAT_RATE}
                  </span>
                  <span>Margin / (1+ALV) × ALV</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-purple-900">
                  <span>VAT Payable</span>
                  <span className="font-mono">
                    {formatCurrency(report.vatPayable, "EUR")}
                  </span>
                </div>
                <div className="flex justify-between text-green-700">
                  <span>Net Margin (after VAT)</span>
                  <span className="font-mono">
                    {formatCurrency(report.netMargin, "EUR")}
                  </span>
                </div>
              </div>
            </div>

            {sales.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Sales &amp; Trade Outgoing in {periodLabel}
                </h3>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {sales.map((tx, idx) => (
                    <div
                      key={tx.id || `trade-out-${idx}`}
                      className={`flex items-center justify-between text-sm p-2 rounded ${
                        tx.source === "trade" ? "bg-blue-50/60" : "bg-accent/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {new Date(tx.ts).toLocaleDateString("fi-FI")}
                        </span>
                        {tx.source === "trade" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            Trade Out
                          </span>
                        )}
                        <span>{tx.source === "trade" ? (tx.name || "Trade item") : (tx.notes || "Sale")}</span>
                      </div>
                      <span className="font-semibold">
                        {formatCurrency(
                          tx.totalValue || tx.totalAmount,
                          "EUR"
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 4: Inventory Valuation
// =============================

function InventoryValuationTab() {
  const { collectionItems, currency } = useApp();
  const tax = useTax();
  const [showWriteDownOnly, setShowWriteDownOnly] = useState(false);

  const valuatedItems = useMemo(
    () => evaluateInventoryForTax(collectionItems, computeItemMetrics, currency),
    [collectionItems, currency]
  );

  const filtered = showWriteDownOnly
    ? valuatedItems.filter((i) => i.writeDown)
    : valuatedItems;

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, item) => ({
        totalAcquisition: acc.totalAcquisition + (item.totalAcquisitionCost || 0),
        totalMarket: acc.totalMarket + (item.totalMarketValue || 0),
        totalWriteDown: acc.totalWriteDown + (item.writeDownAmount || 0),
        count: acc.count + (item.quantity || 1),
        writeDownCount: acc.writeDownCount + (item.writeDown ? 1 : 0),
      }),
      {
        totalAcquisition: 0,
        totalMarket: 0,
        totalWriteDown: 0,
        count: 0,
        writeDownCount: 0,
      }
    );
  }, [filtered]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">
              Inventory Valuation (Varastolistaus)
            </h2>
            <p className="text-sm text-muted-foreground">
              Year-end stock valuation at original acquisition cost.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={showWriteDownOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowWriteDownOnly(!showWriteDownOnly)}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Write-Downs ({totals.writeDownCount})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportInventoryValuationCSV(
                  filtered,
                  `inventory_valuation_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportInventoryValuationPDF(
                  filtered,
                  tax.taxConfig,
                  `inventory_valuation_${new Date().toISOString().slice(0, 10)}.pdf`
                )
              }
              disabled={filtered.length === 0}
            >
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600">Items in Stock</div>
            <div className="text-xl font-bold text-blue-900">
              {totals.count}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600">
              Total Acquisition Cost
            </div>
            <div className="text-xl font-bold text-green-900">
              {formatCurrency(totals.totalAcquisition, "EUR")}
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="text-xs text-purple-600">
              Current Market Value
            </div>
            <div className="text-xl font-bold text-purple-900">
              {formatCurrency(totals.totalMarket, "EUR")}
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600">
              Potential Write-Down
            </div>
            <div className="text-xl font-bold text-red-900">
              {formatCurrency(totals.totalWriteDown, "EUR")}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {showWriteDownOnly
                ? "No items eligible for write-down."
                : "No inventory items found."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Set</th>
                  <th className="pb-2 pr-3">Cond</th>
                  <th className="pb-2 pr-3 text-right">Qty</th>
                  <th className="pb-2 pr-3 text-right">Acq. Cost</th>
                  <th className="pb-2 pr-3 text-right">Market</th>
                  <th className="pb-2 pr-3 text-right">Write-Down</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((item) => (
                  <tr
                    key={item.entryId}
                    className={`border-b ${item.writeDown ? "bg-red-50/50" : "hover:bg-accent/30"}`}
                  >
                    <td className="py-2 pr-3 font-medium">{item.name}</td>
                    <td className="py-2 pr-3 text-xs">{item.set}</td>
                    <td className="py-2 pr-3 text-xs">{item.condition}</td>
                    <td className="py-2 pr-3 text-right">
                      {item.quantity || 1}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatCurrency(item.totalAcquisitionCost, "EUR")}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatCurrency(item.totalMarketValue, "EUR")}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {item.writeDown ? (
                        <span className="text-red-600 font-semibold flex items-center justify-end gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {formatCurrency(item.writeDownAmount, "EUR")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Showing 200 of {filtered.length} items. Export CSV for full list.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 5: Shareholder Loan Ledger
// =============================

function ShareholderLedgerTab() {
  const { user, db, collectionItems, currency } = useApp();
  const tax = useTax();
  const [showForm, setShowForm] = useState(false);
  const [showBillOfSale, setShowBillOfSale] = useState(false);
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billProcessing, setBillProcessing] = useState(false);
  const [billSuccess, setBillSuccess] = useState(null);
  const [pastBills, setPastBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const sigCanvasRef = useRef(null);
  const sigPadRef = useRef(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "credit",
    description: "",
    amount: "",
    category: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Load past bills of sale
  useEffect(() => {
    if (!user || !db) return;
    setLoadingBills(true);
    const col = fsCollection(db, "bill_of_sale", user.uid, "entries");
    getDocs(query(col, orderBy("date", "desc")))
      .then((snap) => setPastBills(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => console.error("Failed to load bills:", err))
      .finally(() => setLoadingBills(false));
  }, [user, db, billSuccess]);

  // Initialize signature pad when canvas mounts
  useEffect(() => {
    if (showBillOfSale && sigCanvasRef.current && !sigPadRef.current) {
      sigPadRef.current = new SignaturePad(sigCanvasRef.current, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(0, 0, 0)",
      });
    }
    return () => {
      if (!showBillOfSale) sigPadRef.current = null;
    };
  }, [showBillOfSale]);

  // Prepare bill of sale items with market values
  const billItems = useMemo(() => {
    if (!showBillOfSale || !collectionItems?.length) return [];
    return collectionItems.map((item) => {
      const metrics = computeItemMetrics(item, currency);
      const marketValue = metrics.suggested || 0;
      const salePrice = Math.round(marketValue * 0.2 * 100) / 100;
      return {
        ...item,
        marketValue,
        salePrice,
      };
    });
  }, [showBillOfSale, collectionItems, currency]);

  const billTotalMarket = billItems.reduce((s, i) => s + (i.marketValue || 0) * (i.quantity || 1), 0);
  const billTotalSale = billItems.reduce((s, i) => s + (i.salePrice || 0) * (i.quantity || 1), 0);

  const handleBillOfSale = async () => {
    if (!user || !db) return;
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.info("Please sign before confirming.");
      return;
    }
    if (billItems.length === 0) {
      toast.info("No inventory items to transfer.");
      return;
    }

    setBillProcessing(true);
    try {
      const signatureDataUrl = sigPadRef.current.toDataURL("image/png");
      const sellerName = tax.taxConfig?.ownerName || user.displayName || "Owner";
      const buyerName = tax.taxConfig?.businessName || "Company";

      // 1. Generate PDF blob
      const pdfBlob = generateBillOfSalePDF(
        billItems,
        sellerName,
        buyerName,
        billDate,
        signatureDataUrl,
        tax.taxConfig
      );

      // 2. Upload PDF to Firebase Storage
      const storage = getStorage();
      const pdfFileName = `bill_of_sale_${billDate}_${Date.now()}.pdf`;
      const storageRef = ref(storage, `bill_of_sale/${user.uid}/${pdfFileName}`);
      await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
      const pdfUrl = await getDownloadURL(storageRef);

      // 3-5. Batch all Firestore writes atomically
      const updatedItems = collectionItems.map((item) => {
        const metrics = computeItemMetrics(item, currency);
        const marketValue = metrics.suggested || 0;
        return {
          ...item,
          buyPrice: Math.round(marketValue * 0.2 * 100) / 100,
          acquiredVia: "bill-of-sale",
        };
      });

      const batch = writeBatch(db);

      // 3. Update inventory cost basis
      const collRef = doc(db, "collections", user.uid);
      batch.set(collRef, { items: updatedItems }, { merge: true });

      // 4. Add shareholder ledger credit entry
      const ledgerCol = fsCollection(db, "tax_shareholder", user.uid, "entries");
      const ledgerRef = doc(ledgerCol);
      batch.set(ledgerRef, {
        date: new Date(billDate).getTime(),
        type: "credit",
        category: "Card Transfer (Personal → Oy)",
        description: `Bill of Sale — ${billItems.length} cards transferred at 20% market value`,
        amount: billTotalSale,
        notes: `PDF: ${pdfUrl}`,
      });

      // 5. Save bill metadata
      const billCol = fsCollection(db, "bill_of_sale", user.uid, "entries");
      const billRef = doc(billCol);
      batch.set(billRef, {
        date: new Date(billDate).getTime(),
        itemCount: billItems.length,
        totalMarketValue: billTotalMarket,
        totalSalePrice: billTotalSale,
        pdfUrl,
        signedAt: Date.now(),
        sellerName,
        buyerName,
      });

      await batch.commit();

      // Refresh context state after successful batch
      await tax.refreshData();

      setBillSuccess({ pdfUrl, itemCount: billItems.length, total: billTotalSale });
      setShowBillOfSale(false);
    } catch (err) {
      console.error("Bill of Sale failed:", err);
      toast.error("Failed to process Bill of Sale: " + err.message);
    } finally {
      setBillProcessing(false);
    }
  };

  const CATEGORIES = {
    credit: [
      "Card Transfer (Personal → Oy)",
      "Cash Injection",
      "Other Credit",
    ],
    debit: [
      "Cash Withdrawal",
      "Salary/Dividend",
      "Other Debit",
    ],
    expense: [
      "Travel",
      "Hotel / Accommodation",
      "Event Entry Fee",
      "Shipping",
      "Supplies / Packaging",
      "Software / Subscriptions",
      "Marketing",
      "Other Expense",
    ],
  };

  const sortedEntries = useMemo(() => {
    return [...tax.shareholderEntries].sort(
      (a, b) => (a.date || 0) - (b.date || 0)
    );
  }, [tax.shareholderEntries]);

  const runningBalances = useMemo(() => {
    let balance = 0;
    return sortedEntries.map((e) => {
      if (e.type === "credit") balance += e.amount || 0;
      else if (e.type === "debit") balance -= e.amount || 0;
      else if (e.type === "expense") balance += e.amount || 0;
      return balance;
    });
  }, [sortedEntries]);

  const currentBalance = runningBalances.length > 0
    ? runningBalances[runningBalances.length - 1]
    : 0;

  const totalCredits = sortedEntries
    .filter((e) => e.type === "credit")
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalDebits = sortedEntries
    .filter((e) => e.type === "debit")
    .reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenses = sortedEntries
    .filter((e) => e.type === "expense")
    .reduce((s, e) => s + (e.amount || 0), 0);

  const handleSubmit = async () => {
    if (!form.amount || isNaN(parseFloat(form.amount))) {
      toast.info("Please enter a valid amount.");
      return;
    }
    setSubmitting(true);
    try {
      await tax.addShareholderEntry({
        ...form,
        date: new Date(form.date).getTime(),
        amount: parseFloat(form.amount),
      });
      setForm({
        date: new Date().toISOString().slice(0, 10),
        type: "credit",
        description: "",
        amount: "",
        category: "",
        notes: "",
      });
      setShowForm(false);
    } catch {
      toast.error("Failed to add entry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">
              Shareholder Loan Ledger (Osakaslainasuhde)
            </h2>
            <p className="text-sm text-muted-foreground">
              Tracks credits (personal → Oy), debits (withdrawals), and business
              expenses.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportShareholderLedgerCSV(
                  sortedEntries,
                  `shareholder_ledger_${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
              disabled={sortedEntries.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportShareholderLedgerPDF(
                  sortedEntries,
                  tax.taxConfig,
                  `shareholder_ledger_${new Date().toISOString().slice(0, 10)}.pdf`
                )
              }
              disabled={sortedEntries.length === 0}
            >
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Entry
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
              onClick={() => { setShowBillOfSale(!showBillOfSale); setBillSuccess(null); }}
            >
              <ClipboardSignature className="h-4 w-4 mr-1" />
              Bill of Sale
            </Button>
          </div>
        </div>

        {/* Bill of Sale Success */}
        {billSuccess && (
          <div className="border border-green-300 bg-green-50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-800">Bill of Sale Completed</span>
            </div>
            <p className="text-sm text-green-700">
              {billSuccess.itemCount} cards transferred at {formatCurrency(billSuccess.total, "EUR")} total.
              Inventory cost basis updated and ledger entry created.
            </p>
            <a
              href={billSuccess.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-purple-700 underline mt-1 inline-block"
            >
              Download signed PDF
            </a>
          </div>
        )}

        {/* Bill of Sale Flow */}
        {showBillOfSale && (
          <div className="border-2 border-purple-200 rounded-lg p-4 mb-4 bg-purple-50/30 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-purple-900 flex items-center gap-2">
                <ClipboardSignature className="h-5 w-5" />
                Kauppakirja — Bill of Sale
              </h3>
              <button onClick={() => setShowBillOfSale(false)} className="p-1 hover:bg-purple-100 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Transfer your personal cards to the Oy at 20% of fair market value.
              This will update all inventory cost basis and create a signed document.
            </p>

            {/* Date picker */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Transaction Date:</label>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-48"
              />
            </div>

            {/* Preview table */}
            {billItems.length > 0 ? (
              <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-purple-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Card</th>
                      <th className="px-2 py-1.5 text-left">Set</th>
                      <th className="px-2 py-1.5">Cond.</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Market (€)</th>
                      <th className="px-2 py-1.5 text-right">Sale @ 20% (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billItems.slice(0, 200).map((item, idx) => (
                      <tr key={item.entryId || idx} className="border-b last:border-0 hover:bg-purple-50/50">
                        <td className="px-2 py-1">{item.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">{item.set} #{item.number}</td>
                        <td className="px-2 py-1 text-center">{item.condition || "NM"}</td>
                        <td className="px-2 py-1 text-right">{item.quantity || 1}</td>
                        <td className="px-2 py-1 text-right">{item.marketValue?.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-semibold text-purple-700">{item.salePrice?.toFixed(2)}</td>
                      </tr>
                    ))}
                    {billItems.length > 200 && (
                      <tr>
                        <td colSpan={6} className="text-center py-1 text-muted-foreground">
                          +{billItems.length - 200} more items
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-purple-100 font-semibold">
                    <tr>
                      <td colSpan={4} className="px-2 py-1.5 text-right">Totals:</td>
                      <td className="px-2 py-1.5 text-right">{billTotalMarket.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right text-purple-700">{billTotalSale.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No inventory items found.</p>
            )}

            {/* Summary */}
            <div className="flex items-center gap-4 text-sm">
              <span><strong>{billItems.length}</strong> cards</span>
              <span>Market: <strong>{formatCurrency(billTotalMarket, "EUR")}</strong></span>
              <span>Sale (20%): <strong className="text-purple-700">{formatCurrency(billTotalSale, "EUR")}</strong></span>
            </div>

            {/* Signature pad */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Pen className="h-3.5 w-3.5" /> Digital Signature
                </label>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => sigPadRef.current?.clear()}
                >
                  Clear signature
                </button>
              </div>
              <div className="border-2 border-gray-300 rounded bg-white">
                <canvas
                  ref={sigCanvasRef}
                  width={500}
                  height={150}
                  className="w-full"
                  style={{ touchAction: "none" }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Sign above to authorize the transfer
              </p>
            </div>

            {/* Confirm */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowBillOfSale(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={handleBillOfSale}
                disabled={billProcessing || billItems.length === 0}
              >
                {billProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <ClipboardSignature className="h-4 w-4 mr-1" /> Sign & Execute
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Past Bills of Sale */}
        {pastBills.length > 0 && !showBillOfSale && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Past Bills of Sale</h4>
            <div className="space-y-1">
              {pastBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between text-xs border rounded px-3 py-2 bg-muted/20">
                  <span>
                    {bill.date ? new Date(bill.date).toLocaleDateString("fi-FI") : "—"} &middot;{" "}
                    {bill.itemCount} cards &middot; {formatCurrency(bill.totalSalePrice, "EUR")}
                  </span>
                  <a
                    href={bill.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-700 underline"
                  >
                    Download PDF
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600">Total Credits</div>
            <div className="text-xl font-bold text-green-900">
              {formatCurrency(totalCredits, "EUR")}
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600">Total Debits</div>
            <div className="text-xl font-bold text-red-900">
              {formatCurrency(totalDebits, "EUR")}
            </div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="text-xs text-orange-600">Total Expenses</div>
            <div className="text-xl font-bold text-orange-900">
              {formatCurrency(totalExpenses, "EUR")}
            </div>
          </div>
          <div
            className={`border rounded-lg p-3 ${
              currentBalance >= 0
                ? "bg-blue-50 border-blue-200"
                : "bg-red-50 border-red-300"
            }`}
          >
            <div
              className={`text-xs ${
                currentBalance >= 0 ? "text-blue-600" : "text-red-600"
              }`}
            >
              Running Balance
            </div>
            <div
              className={`text-xl font-bold ${
                currentBalance >= 0 ? "text-blue-900" : "text-red-900"
              }`}
            >
              {formatCurrency(currentBalance, "EUR")}
            </div>
            {currentBalance < 0 && (
              <div className="text-xs text-red-600 font-medium flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" />
                Over-withdrawn — tax risk!
              </div>
            )}
          </div>
        </div>

        {showForm && (
          <div className="border rounded-lg p-4 mb-4 bg-accent/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm({ ...form, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Type</label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value, category: "" })
                  }
                >
                  <option value="credit">
                    Credit (Personal → Oy)
                  </option>
                  <option value="debit">
                    Debit (Oy → Personal)
                  </option>
                  <option value="expense">
                    Business Expense
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Category
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  <option value="">Select...</option>
                  {(CATEGORIES[form.type] || []).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Description
                </label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="What is this for?"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Amount (EUR)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <Input
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving..." : "Save Entry"}
              </Button>
            </div>
          </div>
        )}

        {sortedEntries.length === 0 ? (
          <div className="text-center py-8">
            <Landmark className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No ledger entries yet. Add your first transaction above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">Category</th>
                  <th className="pb-2 pr-3">Description</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3 text-right">Balance</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => (
                  <tr key={entry.id} className="border-b hover:bg-accent/30">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {entry.date
                        ? new Date(entry.date).toLocaleDateString("fi-FI")
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          entry.type === "credit"
                            ? "bg-green-100 text-green-700"
                            : entry.type === "debit"
                            ? "bg-red-100 text-red-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {entry.type === "credit"
                          ? "Credit"
                          : entry.type === "debit"
                          ? "Debit"
                          : "Expense"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {entry.category || "—"}
                    </td>
                    <td className="py-2 pr-3">{entry.description}</td>
                    <td className="py-2 pr-3 text-right font-semibold">
                      <span
                        className={
                          entry.type === "debit"
                            ? "text-red-600"
                            : entry.type === "credit"
                            ? "text-green-600"
                            : "text-orange-600"
                        }
                      >
                        {entry.type === "debit" ? "-" : "+"}
                        {formatCurrency(entry.amount, "EUR")}
                      </span>
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-mono ${
                        runningBalances[idx] < 0
                          ? "text-red-600 font-bold"
                          : ""
                      }`}
                    >
                      {formatCurrency(runningBalances[idx], "EUR")}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => tax.deleteShareholderEntry(entry.id)}
                        className="p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 6: COGS Dashboard
// =============================

function COGSTab() {
  const { user, db, currency } = useApp();
  const tax = useTax();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadYearSales = useCallback(async () => {
    if (!user || !db) return;
    setLoading(true);
    try {
      const fiscalStart = tax.taxConfig?.fiscalYearStart || 1;
      const startDate = new Date(year, fiscalStart - 1, 1);
      const endDate = new Date(year + 1, fiscalStart - 1, 0, 23, 59, 59, 999);

      const col = fsCollection(db, "transactions", user.uid, "entries");
      const snap = await getDocs(query(col, orderBy("ts", "desc")));
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((tx) => {
          if (tx.type !== "sale" && tx.type !== "sell") return false;
          const ts = tx.ts || 0;
          return ts >= startDate.getTime() && ts <= endDate.getTime();
        });
      setSalesData(all);
    } catch (err) {
      console.error("Failed to load COGS data:", err);
    } finally {
      setLoading(false);
    }
  }, [user, db, year, tax.taxConfig]);

  useEffect(() => {
    loadYearSales();
  }, [loadYearSales]);

  const { totalCOGS, details } = useMemo(
    () => calculateCOGS(salesData),
    [salesData]
  );

  const totalRevenue = salesData.reduce(
    (s, tx) => s + (tx.totalValue || tx.totalAmount || 0),
    0
  );
  const grossProfit = totalRevenue - totalCOGS;
  const profitTax = grossProfit > 0 ? grossProfit * 0.2 : 0;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Cost of Goods Sold (COGS)</h2>
            <p className="text-sm text-muted-foreground">
              Tracks acquisition cost of sold items for income tax (20% profit
              tax).
            </p>
          </div>
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-xs font-medium mb-1">Year</label>
              <select
                className="px-3 py-2 border rounded-md text-sm"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
              >
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadYearSales}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCOGSReportPDF(
                  details,
                  totalRevenue,
                  totalCOGS,
                  year,
                  tax.taxConfig,
                  `cogs_report_${year}.pdf`
                )
              }
              disabled={details.length === 0}
            >
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading COGS data...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs text-blue-600">Total Revenue</div>
                <div className="text-xl font-bold text-blue-900">
                  {formatCurrency(totalRevenue, "EUR")}
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <div className="text-xs text-orange-600">COGS</div>
                <div className="text-xl font-bold text-orange-900">
                  {formatCurrency(totalCOGS, "EUR")}
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-xs text-green-600">Gross Profit</div>
                <div className="text-xl font-bold text-green-900">
                  {formatCurrency(grossProfit, "EUR")}
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="text-xs text-purple-600">
                  Est. Profit Tax (20%)
                </div>
                <div className="text-xl font-bold text-purple-900">
                  {formatCurrency(profitTax, "EUR")}
                </div>
              </div>
            </div>

            {details.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No sales recorded in {year}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <h3 className="text-sm font-semibold mb-2">
                  Sold Items ({details.length})
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Item</th>
                      <th className="pb-2 pr-3 text-right">Qty</th>
                      <th className="pb-2 pr-3 text-right">Cost Basis</th>
                      <th className="pb-2 pr-3 text-right">Sale Price</th>
                      <th className="pb-2 pr-3 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.slice(0, 200).map((d, idx) => (
                      <tr key={idx} className="border-b hover:bg-accent/30">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {d.saleDate
                            ? new Date(d.saleDate).toLocaleDateString("fi-FI")
                            : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{d.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.set} #{d.number}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right">{d.quantity}</td>
                        <td className="py-2 pr-3 text-right">
                          {formatCurrency(d.costBasis, "EUR")}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatCurrency(d.salePrice, "EUR")}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right font-semibold ${
                            d.profit >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {d.profit >= 0 ? "+" : ""}
                          {formatCurrency(d.profit, "EUR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {details.length > 200 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Showing 200 of {details.length} items.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 7: P&L (Tuloslaskelma)
// =============================

const OTHER_REVENUE_CATEGORIES = [
  "Cashback / Rewards",
  "Consulting Services",
  "App Revenue",
  "Sponsorship / Affiliate",
  "Refunds Received",
  "Other Income",
];

function ProfitLossTab() {
  const { user, db, currency } = useApp();
  const tax = useTax();
  const { expenses } = useExpenses();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(0); // 0 = full year
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showRevenueForm, setShowRevenueForm] = useState(false);
  const [revForm, setRevForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "EUR",
    category: "Other Income",
    description: "",
  });
  const [revSubmitting, setRevSubmitting] = useState(false);

  const fiscalStart = tax.taxConfig?.fiscalYearStart || 1;

  const loadTransactions = useCallback(async () => {
    if (!user || !db) return;
    setLoading(true);
    try {
      const col = fsCollection(db, "transactions", user.uid, "entries");
      const snap = await getDocs(query(col, orderBy("ts", "desc")));
      setAllTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [user, db]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Period boundaries — full year = Q1 start → Q4 end
  const periodRange = useMemo(() => {
    if (quarter === 0) {
      const q1 = getQuarterRange(year, 1, fiscalStart);
      const q4 = getQuarterRange(year, 4, fiscalStart);
      return { start: q1.start, end: q4.end };
    }
    return getQuarterRange(year, quarter, fiscalStart);
  }, [year, quarter, fiscalStart]);

  const periodLabel = quarter === 0 ? `FY ${year}` : `Q${quarter} ${year}`;

  // Filter transactions to period
  const periodTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      const ts = tx.ts || 0;
      return ts >= periodRange.start.getTime() && ts <= periodRange.end.getTime();
    });
  }, [allTransactions, periodRange]);

  // Revenue: sales + trade outgoing
  const revenue = useMemo(() => {
    let total = 0;
    periodTransactions.forEach((tx) => {
      if (tx.type === "sale" || tx.type === "sell") {
        total += tx.totalValue || tx.totalAmount || 0;
      }
      if (tx.type === "trade") {
        (tx.itemsOut || []).forEach((item) => {
          total += (item.unitPrice || 0) * (item.quantity || 1);
        });
      }
    });
    return total;
  }, [periodTransactions]);

  // COGS from sales
  const cogsData = useMemo(() => {
    const salesTx = periodTransactions.filter(
      (tx) => tx.type === "sale" || tx.type === "sell"
    );
    return calculateCOGS(salesTx);
  }, [periodTransactions]);

  // Filter expenses to period
  const periodExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (!exp.date) return false;
      const d = new Date(exp.date).getTime();
      return d >= periodRange.start.getTime() && d <= periodRange.end.getTime();
    });
  }, [expenses, periodRange]);

  // Split expenses: stock purchases vs operating
  const { stockPurchaseExpenses, opexByCategory, allOpex } = useMemo(() => {
    let stock = 0;
    const byCategory = {};
    const opexItems = [];

    periodExpenses.forEach((exp) => {
      const amount = exp.amountEUR || exp.amount || 0;
      if (exp.category === STOCK_PURCHASE_CATEGORY) {
        stock += amount;
      } else {
        const cat = exp.category || "Other";
        byCategory[cat] = (byCategory[cat] || 0) + amount;
        opexItems.push(exp);
      }
    });

    return { stockPurchaseExpenses: stock, opexByCategory: byCategory, allOpex: opexItems };
  }, [periodExpenses]);

  // Filter other revenue to period
  const periodOtherRevenue = useMemo(() => {
    return (tax.otherRevenue || []).filter((entry) => {
      const d = entry.date || 0;
      return d >= periodRange.start.getTime() && d <= periodRange.end.getTime();
    });
  }, [tax.otherRevenue, periodRange]);

  const otherRevenueTotal = useMemo(
    () => periodOtherRevenue.reduce((s, e) => s + (e.amountEUR || e.amount || 0), 0),
    [periodOtherRevenue]
  );

  // Compute P&L
  const pl = useMemo(
    () => calculateProfitAndLoss(revenue, cogsData.totalCOGS, stockPurchaseExpenses, opexByCategory, otherRevenueTotal),
    [revenue, cogsData.totalCOGS, stockPurchaseExpenses, opexByCategory, otherRevenueTotal]
  );

  const handleAddRevenue = async () => {
    if (!revForm.amount || isNaN(parseFloat(revForm.amount))) return;
    setRevSubmitting(true);
    try {
      await tax.addRevenueEntry({
        date: new Date(revForm.date).getTime(),
        amount: parseFloat(revForm.amount),
        currency: revForm.currency,
        category: revForm.category,
        description: revForm.description,
      });
      setRevForm({
        date: new Date().toISOString().slice(0, 10),
        amount: "",
        currency: "EUR",
        category: "Other Income",
        description: "",
      });
      setShowRevenueForm(false);
    } catch {
      toast.error("Failed to add revenue entry.");
    } finally {
      setRevSubmitting(false);
    }
  };

  const toggleCategory = (cat) =>
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading P&L data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Tuloslaskelma — Income Statement</h2>
            <p className="text-sm text-muted-foreground">
              Vero-compliant P&L for Finnish Oy &middot; {(FINLAND_CORPORATE_TAX_RATE * 100).toFixed(0)}% yhteisövero
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-2 py-1.5 text-sm bg-background"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="border rounded px-2 py-1.5 text-sm bg-background"
            >
              <option value={0}>Full Year</option>
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportProfitLossCSV(pl, periodLabel, `tuloslaskelma_${periodLabel}.csv`)}
            >
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportProfitLossPDF(pl, periodLabel, tax.taxConfig, `tuloslaskelma_${periodLabel}.pdf`)}
            >
              <Download className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        </div>

        {/* Period info */}
        <p className="text-xs text-muted-foreground">
          Period: {periodRange.start.toLocaleDateString("fi-FI")} – {periodRange.end.toLocaleDateString("fi-FI")}
          &nbsp;&middot;&nbsp;{periodTransactions.length} transactions &middot; {periodExpenses.length} expenses
        </p>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Kokonaistuotot" sublabel="Total Revenue" value={pl.totalRevenue} color="blue" />
          <SummaryCard label="Bruttokate" sublabel="Gross Margin" value={pl.grossMargin} color="emerald" />
          <SummaryCard label="Liiketulos" sublabel="EBIT" value={pl.operatingProfit} color={pl.operatingProfit >= 0 ? "purple" : "red"} />
          <SummaryCard label="Tilikauden tulos" sublabel="Net Profit" value={pl.netProfit} color={pl.netProfit >= 0 ? "green" : "red"} />
        </div>

        {/* Tuloslaskelma table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-2.5 font-semibold">Line Item</th>
                <th className="px-4 py-2.5 font-semibold text-right">EUR</th>
              </tr>
            </thead>
            <tbody>
              <PLRow label="LIIKEVAIHTO (Card Sales Revenue)" value={pl.revenue} bold section />
              {pl.otherRevenue > 0 && (
                <>
                  <PLRow label="Liiketoiminnan muut tuotot (Other Operating Income)" value={pl.otherRevenue} indent />
                  <PLRow label="KOKONAISTUOTOT (Total Revenue)" value={pl.totalRevenue} bold section />
                </>
              )}
              <PLRow spacer />
              <PLRow label="Materiaalit ja palvelut (Materials & Services)" bold section />
              <PLRow label="Myytyjen tuotteiden hankintameno (COGS)" value={-pl.cogs} indent />
              {pl.stockPurchaseExpenses > 0 && (
                <PLRow label="Varaston lisäostot (Stock Purchases)" value={-pl.stockPurchaseExpenses} indent />
              )}
              <PLRow label="Materiaalit yhteensä (Total Materials)" value={-pl.totalMaterials} bold indent />
              <PLRow spacer />
              <PLRow label="BRUTTOKATE (Gross Margin)" value={pl.grossMargin} bold section />
              <PLRow spacer />
              <PLRow label="Liiketoiminnan muut kulut (Operating Expenses)" bold section />
              {Object.entries(pl.operatingExpensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) =>
                  amount > 0 ? (
                    <PLRow key={cat} label={cat} value={-amount} indent />
                  ) : null
                )}
              <PLRow label="Kulut yhteensä (Total Opex)" value={-pl.totalOpex} bold indent />
              <PLRow spacer />
              <PLRow label="LIIKETULOS (Operating Profit / EBIT)" value={pl.operatingProfit} bold section />
              <PLRow spacer />
              <PLRow label="TULOS ENNEN VEROJA (Profit Before Tax)" value={pl.operatingProfit} bold />
              <PLRow label={`Tuloverot (Income Tax ${(FINLAND_CORPORATE_TAX_RATE * 100).toFixed(0)}%)`} value={-pl.incomeTax} />
              <PLRow spacer />
              <PLRow label="TILIKAUDEN TULOS (Net Profit)" value={pl.netProfit} bold section highlight />
            </tbody>
          </table>
        </div>

        {/* Expense breakdown by category */}
        {Object.keys(pl.operatingExpensesByCategory).length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <ChevronDown className="h-4 w-4" />
              Operating Expense Breakdown
            </h3>
            <div className="space-y-1">
              {Object.entries(pl.operatingExpensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => {
                  if (amount <= 0) return null;
                  const catExpenses = allOpex.filter((e) => (e.category || "Other") === cat);
                  const isExpanded = expandedCategories[cat];
                  return (
                    <div key={cat} className="border rounded">
                      <button
                        onClick={() => toggleCategory(cat)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(cat)}`}>
                            {cat}
                          </span>
                          <span className="text-muted-foreground">({catExpenses.length})</span>
                        </div>
                        <span className="font-medium">{formatCurrency(amount, "EUR")}</span>
                      </button>
                      {isExpanded && catExpenses.length > 0 && (
                        <div className="border-t px-3 py-2 bg-muted/20">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pb-1">Date</th>
                                <th className="text-left pb-1">Description</th>
                                <th className="text-left pb-1">Vendor</th>
                                <th className="text-right pb-1">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catExpenses.slice(0, 50).map((exp) => (
                                <tr key={exp.id} className="border-b border-muted/30 last:border-0">
                                  <td className="py-1 pr-2 whitespace-nowrap">
                                    {exp.date ? new Date(exp.date).toLocaleDateString("fi-FI") : "—"}
                                  </td>
                                  <td className="py-1 pr-2 truncate max-w-[200px]">
                                    {exp.description || "—"}
                                  </td>
                                  <td className="py-1 pr-2">{exp.vendor || "—"}</td>
                                  <td className="py-1 text-right font-medium">
                                    {formatCurrency(exp.amountEUR || exp.amount, "EUR")}
                                  </td>
                                </tr>
                              ))}
                              {catExpenses.length > 50 && (
                                <tr>
                                  <td colSpan={4} className="py-1 text-center text-muted-foreground">
                                    +{catExpenses.length - 50} more
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Other Revenue Journal */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              Other Operating Income ({periodOtherRevenue.length} entries &middot; {formatCurrency(otherRevenueTotal, "EUR")})
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRevenueForm(!showRevenueForm)}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Revenue
            </Button>
          </div>

          {showRevenueForm && (
            <div className="border rounded-lg p-3 bg-blue-50/30 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <Input
                    type="date"
                    value={revForm.date}
                    onChange={(e) => setRevForm({ ...revForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Amount</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={revForm.amount}
                    onChange={(e) => setRevForm({ ...revForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Currency</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                    value={revForm.currency}
                    onChange={(e) => setRevForm({ ...revForm, currency: e.target.value })}
                  >
                    {["EUR", "USD", "GBP", "SEK", "JPY"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                    value={revForm.category}
                    onChange={(e) => setRevForm({ ...revForm, category: e.target.value })}
                  >
                    {OTHER_REVENUE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Description</label>
                  <Input
                    placeholder="e.g. Wise cashback"
                    value={revForm.description}
                    onChange={(e) => setRevForm({ ...revForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowRevenueForm(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddRevenue} disabled={revSubmitting}>
                  {revSubmitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}

          {periodOtherRevenue.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-1.5 pr-2">Date</th>
                    <th className="pb-1.5 pr-2">Category</th>
                    <th className="pb-1.5 pr-2">Description</th>
                    <th className="pb-1.5 pr-2 text-right">Amount</th>
                    <th className="pb-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {periodOtherRevenue.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {entry.date ? new Date(entry.date).toLocaleDateString("fi-FI") : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                          {entry.category}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">{entry.description || "—"}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold text-green-600">
                        +{formatCurrency(entry.amountEUR || entry.amount, "EUR")}
                      </td>
                      <td className="py-1.5">
                        <button
                          onClick={() => tax.deleteRevenueEntry(entry.id)}
                          className="p-1 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, sublabel, value, color }) {
  const bgMap = {
    blue: "bg-blue-50 border-blue-200",
    emerald: "bg-emerald-50 border-emerald-200",
    purple: "bg-purple-50 border-purple-200",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
  };
  const textMap = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    purple: "text-purple-700",
    green: "text-green-700",
    red: "text-red-700",
  };
  return (
    <div className={`rounded-lg border p-3 ${bgMap[color] || "bg-muted/30 border-muted"}`}>
      <div className="text-xs font-medium text-muted-foreground">{sublabel}</div>
      <div className="text-[10px] text-muted-foreground/70">{label}</div>
      <div className={`text-lg font-bold mt-1 ${textMap[color] || ""}`}>
        {formatCurrency(value || 0, "EUR")}
      </div>
    </div>
  );
}

function PLRow({ label, value, bold, section, indent, spacer, highlight }) {
  if (spacer) {
    return (
      <tr>
        <td colSpan={2} className="h-2" />
      </tr>
    );
  }
  const isNegative = value != null && value < 0;
  return (
    <tr className={`${section ? "bg-muted/30" : ""} ${highlight ? "bg-green-50" : ""}`}>
      <td className={`px-4 py-1.5 ${indent ? "pl-8" : ""} ${bold ? "font-semibold" : ""}`}>
        {label}
      </td>
      <td
        className={`px-4 py-1.5 text-right tabular-nums ${bold ? "font-semibold" : ""} ${
          isNegative ? "text-red-600" : ""
        }`}
      >
        {value != null ? formatCurrency(value, "EUR") : ""}
      </td>
    </tr>
  );
}

// =============================
// Tab 8: Bank Transactions
// =============================

function BankTransactionsTab() {
  const { user, db } = useApp();
  const tax = useTax();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(0);
  const [allBankTx, setAllBankTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef(null);

  const fiscalStart = tax.taxConfig?.fiscalYearStart || 1;

  const loadBankTx = useCallback(async () => {
    if (!user || !db) return;
    setLoading(true);
    try {
      const col = fsCollection(db, "bank_transactions", user.uid, "entries");
      const snap = await getDocs(query(col, orderBy("date", "desc")));
      setAllBankTx(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load bank transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [user, db]);

  useEffect(() => {
    loadBankTx();
  }, [loadBankTx]);

  const periodRange = useMemo(() => {
    if (quarter === 0) {
      const q1 = getQuarterRange(year, 1, fiscalStart);
      const q4 = getQuarterRange(year, 4, fiscalStart);
      return { start: q1.start, end: q4.end };
    }
    return getQuarterRange(year, quarter, fiscalStart);
  }, [year, quarter, fiscalStart]);

  const filteredTx = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = allBankTx.filter((tx) => {
      const ts = tx.date || 0;
      if (ts < periodRange.start.getTime() || ts > periodRange.end.getTime()) return false;
      if (q) {
        const haystack = [
          tx.description,
          tx.payerName,
          tx.payeeName,
          tx.merchant,
          tx.paymentReference,
          tx.note,
          tx.category,
          tx.currency,
          tx.amount?.toFixed(2),
          tx.dateStr,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sortDir === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }, [allBankTx, periodRange, sortField, sortDir, searchQuery]);

  const summary = useMemo(() => computeBankSummary(filteredTx, tax.ecbRates), [filteredTx, tax.ecbRates]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user || !db) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parseWiseCSV(text);
      if (parsed.length === 0) {
        setImportError("No transactions found in file.");
        return;
      }
      // Deduplicate by TransferWise ID
      const existingIds = new Set(allBankTx.map((t) => t.transferWiseId).filter(Boolean));
      const newTx = parsed.filter((t) => !t.transferWiseId || !existingIds.has(t.transferWiseId));

      if (newTx.length === 0) {
        setImportError("All transactions already imported.");
        return;
      }

      const col = fsCollection(db, "bank_transactions", user.uid, "entries");
      const batch = writeBatch(db);
      newTx.forEach((tx) => {
        const docRef = doc(col);
        batch.set(docRef, { ...tx, importedAt: Date.now() });
      });
      await batch.commit();
      await loadBankTx();
      setImportError(null);
    } catch (err) {
      console.error("CSV import failed:", err);
      setImportError(err.message || "Failed to parse CSV.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClearAll = async () => {
    if (!user || !db) return;
    if (!(await confirm("Delete all imported bank transactions? This cannot be undone.", {
      title: "Delete bank transactions",
      confirmText: "Delete all",
      variant: "destructive",
    }))) return;
    setLoading(true);
    try {
      const col = fsCollection(db, "bank_transactions", user.uid, "entries");
      const snap = await getDocs(col);
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      setAllBankTx([]);
    } catch (err) {
      console.error("Failed to clear bank transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ field, children }) => (
    <th
      className="pb-2 pr-3 cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <ArrowDownUp className="h-3 w-3" />
        )}
      </span>
    </th>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading bank data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Bank Transactions</h2>
            <p className="text-sm text-muted-foreground">
              Wise Business statement reconciliation
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-2 py-1.5 text-sm bg-background"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="border rounded px-2 py-1.5 text-sm bg-background"
            >
              <option value={0}>Full Year</option>
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
            {filteredTx.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportBankCSV(
                    filteredTx,
                    `bank_${quarter === 0 ? `FY${year}` : `Q${quarter}_${year}`}.csv`
                  )
                }
              >
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            )}
          </div>
        </div>

        {/* Upload area */}
        <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/10 hover:bg-muted/20 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            id="bank-csv-upload"
          />
          <label htmlFor="bank-csv-upload" className="cursor-pointer">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              {importing ? "Importing..." : "Upload Wise Business CSV"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Drop a CSV file or click to browse
            </p>
          </label>
          {importError && (
            <p className="text-xs text-red-600 mt-2 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {importError}
            </p>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-green-50 border-green-200 p-3">
            <div className="text-xs text-green-600">Total Incoming</div>
            <div className="text-lg font-bold text-green-900">{formatCurrency(summary.totalIn, "EUR")}</div>
          </div>
          <div className="rounded-lg border bg-red-50 border-red-200 p-3">
            <div className="text-xs text-red-600">Total Outgoing</div>
            <div className="text-lg font-bold text-red-900">{formatCurrency(summary.totalOut, "EUR")}</div>
          </div>
          <div className={`rounded-lg border p-3 ${summary.net >= 0 ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
            <div className={`text-xs ${summary.net >= 0 ? "text-blue-600" : "text-red-600"}`}>Net</div>
            <div className={`text-lg font-bold ${summary.net >= 0 ? "text-blue-900" : "text-red-900"}`}>
              {formatCurrency(summary.net, "EUR")}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Transactions</div>
            <div className="text-lg font-bold">{summary.count}</div>
            {summary.totalFees > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">Fees: {formatCurrency(summary.totalFees, "EUR")}</div>
            )}
          </div>
        </div>

        {/* Period info + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {periodRange.start.toLocaleDateString("fi-FI")} – {periodRange.end.toLocaleDateString("fi-FI")}
            &nbsp;&middot;&nbsp;{allBankTx.length} total imported
          </p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm w-[220px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {allBankTx.length > 0 && (
              <Button size="sm" variant="ghost" className="text-red-600 text-xs" onClick={handleClearAll}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        {filteredTx.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {allBankTx.length === 0
                ? "No bank transactions imported yet. Upload a Wise CSV above."
                : searchQuery
                  ? `No transactions matching "${searchQuery}".`
                  : "No transactions in this period."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <SortHeader field="date">Date</SortHeader>
                  <th className="pb-2 pr-3">Description</th>
                  <SortHeader field="amount">Amount</SortHeader>
                  <th className="pb-2 pr-3">Currency</th>
                  <th className="pb-2 pr-3">Payer / Payee</th>
                  <th className="pb-2 pr-3">Reference</th>
                  <SortHeader field="runningBalance">Balance</SortHeader>
                </tr>
              </thead>
              <tbody>
                {filteredTx.slice(0, 500).map((tx) => (
                  <tr key={tx.id} className="border-b hover:bg-accent/30">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {tx.date ? new Date(tx.date).toLocaleDateString("fi-FI") : tx.dateStr || "—"}
                    </td>
                    <td className="py-2 pr-3 max-w-[200px] truncate" title={tx.description}>
                      {tx.description || tx.merchant || "—"}
                    </td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                      tx.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount?.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-xs">{tx.currency}</td>
                    <td className="py-2 pr-3 text-xs truncate max-w-[140px]" title={tx.payerName || tx.payeeName}>
                      {tx.amount >= 0 ? tx.payerName : tx.payeeName || "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs truncate max-w-[120px]" title={tx.paymentReference}>
                      {tx.paymentReference || "—"}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-xs">
                      {tx.runningBalance?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTx.length > 500 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Showing 500 of {filteredTx.length} transactions.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 9: Loss Carry-Forward
// =============================

function LossCarryForwardTab() {
  const tax = useTax();
  const { lossCarryForward, saveLossYear, deleteLossYear } = tax;

  const [showForm, setShowForm] = useState(false);
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formProfit, setFormProfit] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const result = useMemo(
    () => calculateLossCarryForward(lossCarryForward),
    [lossCarryForward]
  );

  const handleSave = async () => {
    if (!formYear) return;
    setSaving(true);
    try {
      await saveLossYear({
        year: parseInt(formYear),
        operatingProfit: formProfit,
        notes: formNotes,
      });
      setShowForm(false);
      setFormProfit("");
      setFormNotes("");
    } finally {
      setSaving(false);
    }
  };

  const totalTaxSaved = result.timeline.reduce((s, t) => s + t.taxSaved, 0);

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowDownUp className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold">Loss Carry-Forward</h2>
              <p className="text-sm text-muted-foreground">
                Track losses across fiscal years — Finnish Oy losses carry forward for 10 years
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Year
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">Remaining Carry-Forward</p>
            <p className="text-2xl font-bold text-blue-700">
              €{result.remainingCarryForward.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Available to offset future profits</p>
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Tax Saved</p>
            <p className="text-2xl font-bold text-green-700">
              €{totalTaxSaved.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">From losses offsetting profits</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">Years Tracked</p>
            <p className="text-2xl font-bold text-purple-700">{result.timeline.length}</p>
            <p className="text-xs text-muted-foreground">Fiscal year entries</p>
          </div>
        </div>

        {/* Add Form */}
        {showForm && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold">Add Fiscal Year Result</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Year</label>
                  <Input
                    type="number"
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                    min="2000"
                    max="2099"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Operating Profit (EUR)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formProfit}
                    onChange={(e) => setFormProfit(e.target.value)}
                    placeholder="-5000 for a loss, 3000 for profit"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use negative values for loss years
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Notes</label>
                  <Input
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="First year, startup costs..."
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Timeline Table */}
        {result.timeline.length === 0 ? (
          <div className="text-center py-8">
            <ArrowDownUp className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No fiscal year data yet. Add your yearly operating results to track loss carry-forward.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Year</th>
                  <th className="pb-2 pr-3 font-medium text-right">Operating Result</th>
                  <th className="pb-2 pr-3 font-medium text-right">Loss Added</th>
                  <th className="pb-2 pr-3 font-medium text-right">Loss Used</th>
                  <th className="pb-2 pr-3 font-medium text-right">Carry-Forward Balance</th>
                  <th className="pb-2 pr-3 font-medium text-right">Tax Saved</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {result.timeline.map((row) => (
                  <tr key={row.year} className="border-b hover:bg-accent/30">
                    <td className="py-2 pr-3 font-semibold">{row.year}</td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                      row.operatingResult >= 0 ? "text-green-600" : "text-red-600"
                    }`}>
                      €{row.operatingResult.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-red-500">
                      {row.lossAdded > 0 ? `+€${row.lossAdded.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-green-600">
                      {row.lossUsed > 0 ? `−€${row.lossUsed.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">
                      €{row.carryForwardAfter.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-green-600">
                      {row.taxSaved > 0 ? `€${row.taxSaved.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-600"
                        onClick={() => deleteLossYear(row.year)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Info */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">How it works</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                <li>Loss years add to the carry-forward balance (no tax owed).</li>
                <li>Profitable years consume the balance — reducing taxable income and saving 20% corporate tax on each euro offset.</li>
                <li>Finnish law allows carrying losses forward for <strong>10 years</strong>.</li>
                <li>Ownership changes over 50% may forfeit accumulated losses — check with your accountant.</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 10: Dividend Optimizer
// =============================

function DividendOptimizerTab() {
  const [netAssets, setNetAssets] = useState("");
  const [distributableProfit, setDistributableProfit] = useState("");
  const [marginalRate, setMarginalRate] = useState("0.40");
  const [result, setResult] = useState(null);

  const handleCalculate = () => {
    const na = parseFloat(netAssets) || 0;
    const dp = parseFloat(distributableProfit) || 0;
    const mr = parseFloat(marginalRate) || 0.40;
    if (na <= 0 && dp <= 0) return;
    setResult(calculateDividendOptimization(na, dp, mr));
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <PiggyBank className="h-6 w-6 text-green-600" />
          <div>
            <h2 className="text-xl font-bold">Dividend Optimizer</h2>
            <p className="text-sm text-muted-foreground">
              Calculate the optimal dividend split to minimize personal tax
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">
              Net Assets (EUR)
            </label>
            <Input
              type="number"
              step="0.01"
              value={netAssets}
              onChange={(e) => setNetAssets(e.target.value)}
              placeholder="e.g. 50000"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Oy's net assets (osakkeen matemaattinen arvo)
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Distributable Profit (EUR)
            </label>
            <Input
              type="number"
              step="0.01"
              value={distributableProfit}
              onChange={(e) => setDistributableProfit(e.target.value)}
              placeholder="e.g. 20000"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Maximum available for dividend
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Your Marginal Tax Rate
            </label>
            <select
              value={marginalRate}
              onChange={(e) => setMarginalRate(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="0.25">25% (low income)</option>
              <option value="0.30">30%</option>
              <option value="0.35">35%</option>
              <option value="0.40">40% (typical)</option>
              <option value="0.45">45%</option>
              <option value="0.50">50%</option>
              <option value="0.535">53.5% (top bracket)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Your personal earned income marginal rate
            </p>
          </div>
        </div>

        <Button onClick={handleCalculate} disabled={!netAssets && !distributableProfit}>
          <Calculator className="h-4 w-4 mr-1" />
          Calculate Optimal Split
        </Button>

        {result && (
          <>
            {/* Key Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-xs text-muted-foreground mb-1">8% Line</p>
                <p className="text-xl font-bold text-green-700">
                  €{result.eightPercentLine.toFixed(2)}
                </p>
                <p className="text-xs text-green-600">Sweet spot for capital dividends</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-xs text-muted-foreground mb-1">Capital Dividend</p>
                <p className="text-xl font-bold text-blue-700">
                  €{result.capitalDividend.toFixed(2)}
                </p>
                <p className="text-xs text-blue-600">
                  {(result.capitalEffectiveRate * 100).toFixed(1)}% effective tax
                </p>
              </div>
              <div className="rounded-lg bg-purple-50 p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Net to You</p>
                <p className="text-xl font-bold text-purple-700">
                  €{result.netAfterTax.toFixed(2)}
                </p>
                <p className="text-xs text-purple-600">
                  After all taxes paid
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Tax</p>
                <p className="text-xl font-bold text-amber-700">
                  €{result.totalTax.toFixed(2)}
                </p>
                <p className="text-xs text-amber-600">
                  {(result.combinedEffectiveRate * 100).toFixed(1)}% blended rate
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Capital Dividend */}
              <Card className="border-green-200">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-green-700 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Capital Income Dividend (up to 8% of net assets)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Dividend amount</span>
                      <span className="font-medium">€{result.capitalDividend.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax-free portion (75%)</span>
                      <span>€{result.taxFreePortion.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxable portion (25%) → 30% capital tax</span>
                      <span>€{result.capitalTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-green-700 border-t pt-2">
                      <span>Effective tax rate</span>
                      <span>{(result.capitalEffectiveRate * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Earned Income Dividend */}
              <Card className="border-orange-200">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-orange-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Earned Income Dividend (above 8% line)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Excess dividend</span>
                      <span className="font-medium">€{result.earnedIncomeDividend.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxable portion (75%) → earned income</span>
                      <span>€{(result.earnedIncomeDividend * 0.75).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax at {(parseFloat(marginalRate) * 100).toFixed(0)}% marginal rate</span>
                      <span>€{result.earnedIncomeTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-orange-700 border-t pt-2">
                      <span>Effective tax rate</span>
                      <span>{(result.earnedEffectiveRate * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Salary Comparison */}
            <Card className="border-slate-200 bg-slate-50/50">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Comparison: What if you paid yourself salary instead?
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Gross salary</p>
                    <p className="font-semibold">€{result.salaryComparison.gross.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Your income tax</p>
                    <p className="font-semibold text-red-600">−€{result.salaryComparison.tax.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Employer side costs (~20%)</p>
                    <p className="font-semibold text-red-600">−€{result.salaryComparison.employerCosts.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Net to you</p>
                    <p className="font-semibold">€{result.salaryComparison.net.toFixed(2)}</p>
                  </div>
                </div>
                <div className={`text-sm p-3 rounded-lg ${
                  result.netAfterTax > result.salaryComparison.net
                    ? "bg-green-100 text-green-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {result.netAfterTax > result.salaryComparison.net
                    ? `Dividend wins: You keep €${(result.netAfterTax - result.salaryComparison.net).toFixed(2)} more vs salary, and the Oy saves €${result.salaryComparison.employerCosts.toFixed(2)} in employer costs.`
                    : `Salary may be preferable here — consider YEL pension benefits and the deductibility of salary for the Oy.`
                  }
                </div>
              </CardContent>
            </Card>

            {/* Recommendation */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">Recommendation</p>
                  <p className="mt-1">{result.recommendation}</p>
                  {result.retainedSuggestion > 0 && (
                    <p className="mt-1 text-xs">
                      Retaining €{result.retainedSuggestion.toFixed(0)} grows net assets → raises the 8% line next year → more low-tax dividends.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Info */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Finnish dividend taxation (Osingon verotus)</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                <li><strong>Up to 8% of net assets:</strong> 25% taxable as capital income (30% tax) = 7.5% effective rate.</li>
                <li><strong>Above €150,000:</strong> 85% taxable at 30-34% capital gains rate.</li>
                <li><strong>Above 8% of net assets:</strong> 75% taxable as earned income (progressive rate).</li>
                <li>The Oy has already paid 20% corporate tax on the profit before distribution.</li>
                <li>Growing net assets each year raises the 8% threshold — a compounding advantage.</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================
// Tab 11: Tax-Free Payments
// =============================

function TaxFreePaymentsTab() {
  const tax = useTax();
  const {
    mileageTrips,
    addMileageTrip,
    deleteMileageTrip,
    taxFreeBenefits,
    addTaxFreeBenefit,
    deleteTaxFreeBenefit,
    shareholderEntries,
  } = tax;

  const [activeSection, setActiveSection] = useState("mileage");
  const [showMileageForm, setShowMileageForm] = useState(false);
  const [showBenefitForm, setShowBenefitForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Mileage form
  const [mForm, setMForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    from: "",
    to: "",
    purpose: "",
    km: "",
    roundTrip: false,
  });

  // Benefit form
  const [bForm, setBForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    benefitType: "",
    amount: "",
    description: "",
  });

  const mileageResult = useMemo(
    () => calculateMileageAllowance(mileageTrips),
    [mileageTrips]
  );

  const currentYear = new Date().getFullYear();
  const yearBenefits = taxFreeBenefits.filter(
    (b) => b.date && b.date.startsWith(String(currentYear))
  );
  const totalBenefitsThisYear = yearBenefits.reduce((s, b) => s + (b.amount || 0), 0);
  const yearMileage = mileageTrips.filter(
    (t) => t.date && t.date.startsWith(String(currentYear))
  );
  const yearMileageTotal = yearMileage.reduce((s, t) => s + (t.allowance || 0), 0);

  const loanBalance = useMemo(() => {
    return (shareholderEntries || []).reduce((bal, e) => {
      if (e.type === "credit" || e.type === "expense") return bal + (e.amount || 0);
      if (e.type === "debit") return bal - (e.amount || 0);
      return bal;
    }, 0);
  }, [shareholderEntries]);

  const handleSaveMileage = async () => {
    setSaving(true);
    try {
      const km = mForm.roundTrip ? (parseFloat(mForm.km) || 0) * 2 : parseFloat(mForm.km) || 0;
      await addMileageTrip({ ...mForm, km });
      setShowMileageForm(false);
      setMForm({ date: new Date().toISOString().slice(0, 10), from: "", to: "", purpose: "", km: "", roundTrip: false });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBenefit = async () => {
    setSaving(true);
    try {
      await addTaxFreeBenefit(bForm);
      setShowBenefitForm(false);
      setBForm({ date: new Date().toISOString().slice(0, 10), benefitType: "", amount: "", description: "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Gift className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-xl font-bold">Tax-Free Payments</h2>
            <p className="text-sm text-muted-foreground">
              Track mileage, benefits, and other tax-free ways to extract value from your Oy
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">Mileage Allowance ({currentYear})</p>
            <p className="text-xl font-bold text-green-700">€{yearMileageTotal.toFixed(2)}</p>
            <p className="text-xs text-green-600">{yearMileage.reduce((s, t) => s + (t.km || 0), 0)} km logged</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">Benefits Used ({currentYear})</p>
            <p className="text-xl font-bold text-blue-700">€{totalBenefitsThisYear.toFixed(2)}</p>
            <p className="text-xs text-blue-600">{yearBenefits.length} entries</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">Loan Balance Repayable</p>
            <p className="text-xl font-bold text-purple-700">€{Math.max(0, loanBalance).toFixed(2)}</p>
            <p className="text-xs text-purple-600">Tax-free repayment available</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-4">
            <p className="text-xs text-muted-foreground mb-1">All Tax-Free Total ({currentYear})</p>
            <p className="text-xl font-bold text-amber-700">
              €{(yearMileageTotal + totalBenefitsThisYear).toFixed(2)}
            </p>
            <p className="text-xs text-amber-600">Excl. loan repayments & reimbursements</p>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Button
            variant={activeSection === "mileage" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("mileage")}
          >
            <Car className="h-4 w-4 mr-1" />
            Mileage Log
          </Button>
          <Button
            variant={activeSection === "benefits" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("benefits")}
          >
            <Gift className="h-4 w-4 mr-1" />
            Benefits
          </Button>
          <Button
            variant={activeSection === "guide" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSection("guide")}
          >
            <Info className="h-4 w-4 mr-1" />
            Guide
          </Button>
        </div>

        {/* Mileage Section */}
        {activeSection === "mileage" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Car className="h-5 w-5 text-sky-600" />
                Mileage Log (Kilometrikorvaus)
              </h3>
              <Button size="sm" onClick={() => setShowMileageForm(!showMileageForm)}>
                <Plus className="h-4 w-4 mr-1" />
                Log Trip
              </Button>
            </div>

            {showMileageForm && (
              <Card className="border-sky-200 bg-sky-50/30">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Date</label>
                      <Input
                        type="date"
                        value={mForm.date}
                        onChange={(e) => setMForm((f) => ({ ...f, date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Purpose</label>
                      <Input
                        value={mForm.purpose}
                        onChange={(e) => setMForm((f) => ({ ...f, purpose: e.target.value }))}
                        placeholder="e.g. Card show, Post office, Meetup"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">From</label>
                      <Input
                        value={mForm.from}
                        onChange={(e) => setMForm((f) => ({ ...f, from: e.target.value }))}
                        placeholder="Starting location"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">To</label>
                      <Input
                        value={mForm.to}
                        onChange={(e) => setMForm((f) => ({ ...f, to: e.target.value }))}
                        placeholder="Destination"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Distance (km)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={mForm.km}
                        onChange={(e) => setMForm((f) => ({ ...f, km: e.target.value }))}
                        placeholder="One-way km"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={mForm.roundTrip}
                        onChange={(e) => setMForm((f) => ({ ...f, roundTrip: e.target.checked }))}
                        className="rounded"
                      />
                      Round trip (auto-doubles km)
                    </label>
                    {mForm.km && (
                      <span className="text-sm text-muted-foreground">
                        = €{((mForm.roundTrip ? parseFloat(mForm.km) * 2 : parseFloat(mForm.km)) * FINLAND_MILEAGE_RATE).toFixed(2)} allowance
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveMileage} disabled={saving || !mForm.km}>
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Save Trip
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowMileageForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {mileageTrips.length === 0 ? (
              <div className="text-center py-8">
                <Car className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No mileage trips logged yet. Start tracking your drives to shows, post office, meetups, etc.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Date</th>
                      <th className="pb-2 pr-3 font-medium">Route</th>
                      <th className="pb-2 pr-3 font-medium">Purpose</th>
                      <th className="pb-2 pr-3 font-medium text-right">km</th>
                      <th className="pb-2 pr-3 font-medium text-right">Rate</th>
                      <th className="pb-2 pr-3 font-medium text-right">Allowance</th>
                      <th className="pb-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mileageTrips.map((trip) => (
                      <tr key={trip.id} className="border-b hover:bg-accent/30">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {trip.date ? new Date(trip.date + "T00:00:00").toLocaleDateString("fi-FI") : "—"}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {trip.from && trip.to ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {trip.from} → {trip.to}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2 pr-3">{trip.purpose || "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{trip.km}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          €{(trip.rate || FINLAND_MILEAGE_RATE).toFixed(2)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-semibold text-green-600">
                          €{(trip.allowance || 0).toFixed(2)}
                        </td>
                        <td className="py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={() => deleteMileageTrip(trip.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2 pr-3" colSpan={3}>Total</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{mileageResult.totalKm} km</td>
                      <td className="py-2 pr-3"></td>
                      <td className="py-2 pr-3 text-right tabular-nums text-green-600">
                        €{mileageResult.totalAllowance.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Benefits Section */}
        {activeSection === "benefits" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Gift className="h-5 w-5 text-emerald-600" />
                Tax-Free Benefits Tracker
              </h3>
              <Button size="sm" onClick={() => setShowBenefitForm(!showBenefitForm)}>
                <Plus className="h-4 w-4 mr-1" />
                Log Benefit
              </Button>
            </div>

            {showBenefitForm && (
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Date</label>
                      <Input
                        type="date"
                        value={bForm.date}
                        onChange={(e) => setBForm((f) => ({ ...f, date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Benefit Type</label>
                      <select
                        value={bForm.benefitType}
                        onChange={(e) => setBForm((f) => ({ ...f, benefitType: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Select type...</option>
                        {TAX_FREE_BENEFITS.map((b) => (
                          <option key={b.id} value={b.id}>{b.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Amount (EUR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={bForm.amount}
                        onChange={(e) => setBForm((f) => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Description</label>
                    <Input
                      value={bForm.description}
                      onChange={(e) => setBForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Brief description"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveBenefit} disabled={saving || !bForm.benefitType}>
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowBenefitForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {taxFreeBenefits.length === 0 ? (
              <div className="text-center py-8">
                <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No benefits tracked yet. Log per diems, phone plans, sports benefits, and more.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Date</th>
                      <th className="pb-2 pr-3 font-medium">Benefit Type</th>
                      <th className="pb-2 pr-3 font-medium">Description</th>
                      <th className="pb-2 pr-3 font-medium text-right">Amount</th>
                      <th className="pb-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxFreeBenefits.map((entry) => {
                      const benefitLabel = TAX_FREE_BENEFITS.find((b) => b.id === entry.benefitType)?.label || entry.benefitType;
                      return (
                        <tr key={entry.id} className="border-b hover:bg-accent/30">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {entry.date ? new Date(entry.date + "T00:00:00").toLocaleDateString("fi-FI") : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                              {benefitLabel}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{entry.description || "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-semibold text-green-600">
                            €{(entry.amount || 0).toFixed(2)}
                          </td>
                          <td className="py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-600"
                              onClick={() => deleteTaxFreeBenefit(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2 pr-3" colSpan={3}>Total</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-green-600">
                        €{taxFreeBenefits.reduce((s, b) => s + (b.amount || 0), 0).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Guide Section */}
        {activeSection === "guide" && (
          <div className="space-y-4">
            <h3 className="font-semibold">All Tax-Free Payment Methods</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TAX_FREE_BENEFITS.map((benefit) => (
                <Card key={benefit.id} className="border-green-100">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-sm">{benefit.label}</h4>
                    <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {benefit.annualLimit && (
                        <p>Annual limit: <span className="font-medium text-foreground">€{benefit.annualLimit}</span></p>
                      )}
                      {benefit.perUse && (
                        <p>Rate: <span className="font-medium text-foreground">€{benefit.perUse}{benefit.unit ? ` ${benefit.unit}` : " per use"}</span></p>
                      )}
                      {benefit.note && <p>{benefit.note}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Important notes</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    <li>All tax-free payments must be genuinely business-related with documentation.</li>
                    <li>Mileage logs must include date, route, purpose, and km — Vero may audit these.</li>
                    <li>Per diems require overnight travel or travel beyond the normal working area.</li>
                    <li>Sports & culture benefit (€400/yr) must be available to all employees (even if it's just you).</li>
                    <li>Shareholder loan repayments are only tax-free up to the documented loan balance.</li>
                    <li>Keep all receipts — expense reimbursements without receipts become taxable income.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
