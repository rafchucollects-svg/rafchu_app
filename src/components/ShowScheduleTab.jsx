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
  RefreshCw,
  CalendarDays,
  MapPin,
  ChevronDown,
  ChevronRight,
  Plane,
  Hotel,
  Utensils,
  Ticket,
  Receipt,
  AlertTriangle,
  CheckCircle,
  LinkIcon,
} from "lucide-react";
import { useExpenses } from "@/contexts/ExpenseContext";
import { getCountryList, calculatePerDiem, getPerDiemRate } from "@/utils/perDiemRates";
import { formatExpenseDate } from "@/utils/expenseHelpers";

const COUNTRY_LIST = getCountryList();

export function ShowScheduleTab() {
  const {
    shows,
    expenses,
    addShow,
    updateShow,
    deleteShow,
    confirmPerDiem,
  } = useExpenses();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const upcoming = shows.filter((s) => s.endDate >= new Date().toISOString().slice(0, 10));
  const pendingPerDiems = shows.filter((s) => !s.perDiemConfirmed && s.perDiemTotal > 0);
  const totalPending = pendingPerDiems.reduce((sum, s) => sum + (s.perDiemTotal || 0), 0);

  const handleDelete = async (id) => {
    if (!confirm("Delete this show?")) return;
    await deleteShow(id);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CalendarDays className="h-4 w-4" />
              Shows
            </div>
            <p className="text-2xl font-bold">{shows.length}</p>
            <p className="text-xs text-muted-foreground">{upcoming.length} upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Utensils className="h-4 w-4" />
              Pending Per Diems
            </div>
            <p className="text-2xl font-bold">EUR {totalPending.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{pendingPerDiems.length} shows unconfirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-center">
            <Button size="sm" onClick={() => { setEditingId(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add Show
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ShowFormModal
          show={editingId ? shows.find((s) => s.id === editingId) : null}
          onSave={async (data) => {
            if (editingId) {
              await updateShow(editingId, data);
            } else {
              await addShow(data);
            }
            setShowForm(false);
            setEditingId(null);
          }}
          onClose={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {/* Show List */}
      {shows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-2">No shows scheduled</p>
            <Button size="sm" onClick={() => { setEditingId(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add your first show
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {shows.map((show) => (
            <ShowRow
              key={show.id}
              show={show}
              expenses={expenses}
              expanded={expandedId === show.id}
              onToggle={() => setExpandedId(expandedId === show.id ? null : show.id)}
              onEdit={() => { setEditingId(show.id); setShowForm(true); }}
              onDelete={() => handleDelete(show.id)}
              onChecklistChange={async (field, value) => {
                await updateShow(show.id, {
                  checklist: { ...show.checklist, [field]: value },
                });
              }}
              onConfirmPerDiem={() => confirmPerDiem(show.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================
// Show Row
// =============================

function ShowRow({ show, expenses, expanded, onToggle, onEdit, onDelete, onChecklistChange, onConfirmPerDiem }) {
  const linkedExpenses = useMemo(
    () => (show.linkedExpenseIds || []).map((id) => expenses.find((e) => e.id === id)).filter(Boolean),
    [show.linkedExpenseIds, expenses]
  );

  const isUpcoming = show.endDate >= new Date().toISOString().slice(0, 10);
  const checklistItems = [
    { key: "tableFees", label: "Table Fees", icon: Ticket },
    { key: "flights", label: "Flights", icon: Plane },
    { key: "perDiems", label: "Per Diems", icon: Utensils },
    { key: "hotel", label: "Hotel", icon: Hotel },
  ];

  const checkedCount = checklistItems.filter((item) => show.checklist?.[item.key]).length;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex-shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{show.name || "Untitled show"}</span>
            {isUpcoming && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Upcoming</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {checkedCount}/4 expenses tracked
            </span>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatExpenseDate(show.startDate)} – {formatExpenseDate(show.endDate)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {show.country}{show.city ? `, ${show.city}` : ""}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold">EUR {show.perDiemTotal?.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{show.travelDays} days</p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-muted/30 space-y-4 pt-4">
          {/* Expense Checklist */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Expense Checklist</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {checklistItems.map(({ key, label, icon: Icon }) => {
                const checked = show.checklist?.[key] || false;
                return (
                  <button
                    key={key}
                    onClick={() => onChecklistChange(key, !checked)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                      checked
                        ? "bg-green-50 border-green-300 text-green-800"
                        : "bg-background border-input text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {checked ? <CheckCircle className="h-4 w-4 text-green-600" /> : <div className="h-4 w-4 rounded border border-input" />}
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per Diem Section */}
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  Per Diem: EUR {show.perDiemRate?.toFixed(2)}/day x {show.travelDays} days = EUR {show.perDiemTotal?.toFixed(2)}
                </p>
                <p className="text-xs text-blue-700">
                  {show.country === "Finland" ? "Domestic rate (Vero.fi 2026)" : `${show.country} rate (Vero.fi 2026)`}
                </p>
              </div>
              {show.perDiemConfirmed ? (
                <span className="flex items-center gap-1 text-sm text-green-700 font-medium">
                  <CheckCircle className="h-4 w-4" />
                  Added to expenses
                </span>
              ) : (
                <Button size="sm" onClick={onConfirmPerDiem} className="bg-blue-600 hover:bg-blue-700">
                  <Check className="h-4 w-4 mr-1" />
                  Confirm &amp; Add to Expenses
                </Button>
              )}
            </div>
          </div>

          {/* Linked Expenses */}
          {linkedExpenses.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <LinkIcon className="h-3.5 w-3.5" />
                Linked Expenses ({linkedExpenses.length})
              </h4>
              <div className="space-y-1">
                {linkedExpenses.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between text-sm p-2 rounded bg-background border">
                    <span>{exp.description || exp.vendor || "Expense"}</span>
                    <span className="font-medium">EUR {exp.amountEUR?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {show.notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Notes:</span> {show.notes}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
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
// Show Form Modal
// =============================

function ShowFormModal({ show, onSave, onClose }) {
  const isEditing = !!show;

  const [form, setForm] = useState({
    name: show?.name || "",
    country: show?.country || "Finland",
    city: show?.city || "",
    startDate: show?.startDate || "",
    endDate: show?.endDate || "",
    travelDays: show?.travelDays || 1,
    perDiemRate: show?.perDiemRate || 54,
    perDiemTotal: show?.perDiemTotal || 54,
    travelHoursFirstDay: show?.travelHoursFirstDay ?? 11,
    travelHoursLastDay: show?.travelHoursLastDay ?? 11,
    freeMeals: show?.freeMeals ?? 0,
    notes: show?.notes || "",
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [countrySearch, setCountrySearch] = useState("");

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRY_LIST;
    const lower = countrySearch.toLowerCase();
    return COUNTRY_LIST.filter((c) => c.toLowerCase().includes(lower));
  }, [countrySearch]);

  const recalc = (overrides = {}) => {
    const merged = { ...form, ...overrides };
    const result = calculatePerDiem(merged.country, merged.startDate, merged.endDate, {
      travelHoursFirstDay: merged.travelHoursFirstDay,
      travelHoursLastDay: merged.travelHoursLastDay,
      freeMeals: merged.freeMeals,
    });
    setForm((f) => ({
      ...f,
      ...overrides,
      travelDays: result.days,
      perDiemRate: result.rate,
      perDiemTotal: result.total,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    if (!form.name.trim()) { setSaveError("Show name is required."); return; }
    if (!form.startDate || !form.endDate) { setSaveError("Start and end dates are required."); return; }

    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setSaveError(err.message || "Failed to save show.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
      <Card className="w-full max-w-lg my-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{isEditing ? "Edit Show" : "Add Show"}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Show Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Card Expo Sweden 2026"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Country *</label>
                <div className="relative">
                  <Input
                    value={countrySearch || form.country}
                    onChange={(e) => {
                      setCountrySearch(e.target.value);
                    }}
                    onFocus={() => setCountrySearch(form.country)}
                    onBlur={() => {
                      setTimeout(() => setCountrySearch(""), 200);
                    }}
                    placeholder="Search country..."
                  />
                  {countrySearch && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredCountries.slice(0, 20).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setCountrySearch("");
                            recalc({ country: c });
                          }}
                        >
                          {c} — EUR {getPerDiemRate(c)}/day
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">City</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="e.g., Stockholm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Date *</label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => recalc({ startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Date *</label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => recalc({ endDate: e.target.value })}
                />
              </div>
            </div>

            {/* Per Diem Preview */}
            {form.startDate && form.endDate && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-blue-900 font-medium">Per Diem Estimate</span>
                  <span className="text-blue-900 font-bold">EUR {form.perDiemTotal.toFixed(2)}</span>
                </div>
                <p className="text-blue-700 text-xs">
                  {form.travelDays} day{form.travelDays !== 1 ? "s" : ""} &middot; EUR {form.perDiemRate.toFixed(2)}/day ({form.country})
                </p>

                {form.country?.toLowerCase() === "finland" && form.travelDays > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-blue-200">
                    <div>
                      <label className="text-xs text-blue-700">Hours first day</label>
                      <select
                        className="w-full px-2 py-1 border rounded text-xs bg-white"
                        value={form.travelHoursFirstDay}
                        onChange={(e) => recalc({ travelHoursFirstDay: parseInt(e.target.value) })}
                      >
                        <option value={11}>&gt;10h (full)</option>
                        <option value={8}>&gt;6h (partial)</option>
                        <option value={5}>&le;6h (none)</option>
                      </select>
                    </div>
                    {form.travelDays > 1 && (
                      <div>
                        <label className="text-xs text-blue-700">Hours last day</label>
                        <select
                          className="w-full px-2 py-1 border rounded text-xs bg-white"
                          value={form.travelHoursLastDay}
                          onChange={(e) => recalc({ travelHoursLastDay: parseInt(e.target.value) })}
                        >
                          <option value={11}>&gt;10h (full)</option>
                          <option value={8}>&gt;6h (partial)</option>
                          <option value={5}>&le;6h (none)</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1 border-t border-blue-200">
                  <div>
                    <label className="text-xs text-blue-700">Free meals provided</label>
                    <Input
                      type="number"
                      min="0"
                      className="h-7 w-16 text-xs"
                      value={form.freeMeals}
                      onChange={(e) => recalc({ freeMeals: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <p className="text-xs text-blue-600 mt-3">
                    Each free meal reduces allowance by 50% for one day (ateriavähennys)
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-blue-200">
                  <label className="text-xs text-blue-700">Override rate:</label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-7 w-24 text-xs"
                    value={form.perDiemRate}
                    onChange={(e) => {
                      const rate = parseFloat(e.target.value) || 0;
                      setForm((f) => ({ ...f, perDiemRate: rate, perDiemTotal: rate * f.travelDays }));
                    }}
                  />
                  <label className="text-xs text-blue-700">Override days:</label>
                  <Input
                    type="number"
                    min="1"
                    className="h-7 w-16 text-xs"
                    value={form.travelDays}
                    onChange={(e) => {
                      const days = parseInt(e.target.value) || 1;
                      setForm((f) => ({ ...f, travelDays: days, perDiemTotal: f.perDiemRate * days }));
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-y"
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
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />Saving...</>
                ) : (
                  <><Check className="h-4 w-4 mr-1" />{isEditing ? "Update Show" : "Add Show"}</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
