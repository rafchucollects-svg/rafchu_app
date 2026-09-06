import { hasVendorAccess } from "@/utils/vendorAccess";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  doc,
  setDoc,
  getDoc,
  collection as fsCollection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useApp } from "./AppContext";
import { fetchECBRates, convertToEUR } from "@/utils/taxCore";

const ExpenseContext = createContext(null);

export const useExpenses = () => {
  const context = useContext(ExpenseContext);
  if (!context) throw new Error("useExpenses must be used within ExpenseProvider");
  return context;
};

export function ExpenseProvider({ children }) {
  const { user, db, userProfile } = useApp();
  const vendorEnabled = hasVendorAccess(userProfile);

  const [expenses, setExpenses] = useState([]);
  const [shows, setShows] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [ecbRates, setEcbRates] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db || !vendorEnabled) {
      setExpenses([]);
      setShows([]);
      setPayouts([]);
      setRecurring([]);
      setCorrections([]);
      setLoading(false);
      return;
    }
    loadExpenses();
    loadShows();
    loadPayouts();
    loadRecurring();
    loadCorrections();
  }, [user, db, vendorEnabled]);

  useEffect(() => {
    fetchECBRates().then(setEcbRates);
  }, []);

  const loadExpenses = useCallback(async () => {
    if (!user || !db) return;
    setLoading(true);
    try {
      const col = fsCollection(db, "expenses", user.uid, "entries");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load expenses:", err);
    } finally {
      setLoading(false);
    }
  }, [user, db]);

  const loadCorrections = useCallback(async () => {
    if (!user || !db) return;
    try {
      const snap = await getDoc(doc(db, "expense_preferences", user.uid));
      if (snap.exists()) {
        setCorrections(snap.data().corrections || []);
      }
    } catch (err) {
      console.error("Failed to load corrections:", err);
    }
  }, [user, db]);

  // =============================
  // Shows CRUD
  // =============================

  const loadShows = useCallback(async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "expense_shows", user.uid, "entries");
      const q = query(col, orderBy("startDate", "desc"));
      const snap = await getDocs(q);
      setShows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load shows:", err);
    }
  }, [user, db]);

  const addShow = useCallback(
    async (show) => {
      if (!user || !db) return;
      const now = Date.now();
      const fullShow = {
        name: show.name || "",
        country: show.country || "Finland",
        city: show.city || "",
        startDate: show.startDate || "",
        endDate: show.endDate || "",
        travelDays: show.travelDays || 1,
        perDiemRate: show.perDiemRate || 0,
        perDiemTotal: show.perDiemTotal || 0,
        perDiemConfirmed: false,
        perDiemExpenseId: null,
        checklist: { tableFees: false, flights: false, perDiems: false, hotel: false, ...show.checklist },
        linkedExpenseIds: show.linkedExpenseIds || [],
        notes: show.notes || "",
        createdAt: now,
        updatedAt: now,
      };

      try {
        const col = fsCollection(db, "expense_shows", user.uid, "entries");
        const docRef = await addDoc(col, fullShow);
        const newShow = { id: docRef.id, ...fullShow };
        setShows((prev) => [newShow, ...prev]);
        return newShow;
      } catch (err) {
        console.error("Failed to add show:", err);
        throw err;
      }
    },
    [user, db]
  );

  const updateShow = useCallback(
    async (showId, updates) => {
      if (!user || !db) return;
      try {
        const patched = { ...updates, updatedAt: Date.now() };
        await updateDoc(doc(db, "expense_shows", user.uid, "entries", showId), patched);
        setShows((prev) => prev.map((s) => (s.id === showId ? { ...s, ...patched } : s)));
      } catch (err) {
        console.error("Failed to update show:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deleteShow = useCallback(
    async (showId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "expense_shows", user.uid, "entries", showId));
        setShows((prev) => prev.filter((s) => s.id !== showId));
      } catch (err) {
        console.error("Failed to delete show:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Payouts (reimbursements)
  // =============================

  const loadPayouts = useCallback(async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "expense_payouts", user.uid, "entries");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load payouts:", err);
    }
  }, [user, db]);

  // =============================
  // Recurring Expenses
  // =============================

  const loadRecurring = useCallback(async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "expense_recurring", user.uid, "entries");
      const q = query(col, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setRecurring(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load recurring expenses:", err);
    }
  }, [user, db]);

  // Low-level patch that bypasses expense-level recompute logic (no FX refetch).
  const patchExpenseFields = useCallback(
    async (expenseId, fields) => {
      if (!user || !db) return;
      const patch = { ...fields, updatedAt: Date.now() };
      await updateDoc(doc(db, "expenses", user.uid, "entries", expenseId), patch);
      setExpenses((prev) =>
        prev.map((e) => (e.id === expenseId ? { ...e, ...patch } : e))
      );
    },
    [user, db]
  );

  const setExpenseSettlementStatus = useCallback(
    async (expenseId, statusId) => {
      if (!user || !db) return;
      const existing = expenses.find((e) => e.id === expenseId);
      const priorPayoutId = existing?.payoutId || null;

      const patch = {
        settlementStatus: statusId,
      };
      // Clear payout link when moving away from reimbursed.
      if (statusId !== "reimbursed") {
        patch.payoutId = null;
        patch.reimbursedDate = null;
      }
      await patchExpenseFields(expenseId, patch);

      // If the expense was previously linked to a payout and we're no longer
      // reimbursed, prune the expense ID from that payout too.
      if (priorPayoutId && statusId !== "reimbursed") {
        const payout = payouts.find((p) => p.id === priorPayoutId);
        if (payout) {
          const nextIds = (payout.expenseIds || []).filter(
            (id) => id !== expenseId
          );
          if (nextIds.length !== (payout.expenseIds || []).length) {
            const payoutPatch = { expenseIds: nextIds, updatedAt: Date.now() };
            try {
              await updateDoc(
                doc(db, "expense_payouts", user.uid, "entries", priorPayoutId),
                payoutPatch
              );
              setPayouts((prev) =>
                prev.map((p) =>
                  p.id === priorPayoutId ? { ...p, ...payoutPatch } : p
                )
              );
            } catch (err) {
              console.error("Failed to prune expense from payout:", err);
            }
          }
        }
      }
    },
    [user, db, expenses, payouts, patchExpenseFields]
  );

  const addPayout = useCallback(
    async (payout) => {
      if (!user || !db) return;
      const now = Date.now();
      const expenseIds = payout.expenseIds || [];
      const fullPayout = {
        date: payout.date || new Date().toISOString().slice(0, 10),
        method: payout.method || "Bank Transfer",
        reference: payout.reference || "",
        notes: payout.notes || "",
        expenseIds,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const col = fsCollection(db, "expense_payouts", user.uid, "entries");
        const docRef = await addDoc(col, fullPayout);
        const newPayout = { id: docRef.id, ...fullPayout };
        setPayouts((prev) => [newPayout, ...prev]);

        // Mark linked expenses as reimbursed.
        await Promise.all(
          expenseIds.map((eid) =>
            patchExpenseFields(eid, {
              settlementStatus: "reimbursed",
              payoutId: newPayout.id,
              reimbursedDate: fullPayout.date,
            })
          )
        );

        return newPayout;
      } catch (err) {
        console.error("Failed to add payout:", err);
        throw err;
      }
    },
    [user, db, patchExpenseFields]
  );

  const updatePayout = useCallback(
    async (payoutId, updates) => {
      if (!user || !db) return;
      const existing = payouts.find((p) => p.id === payoutId);
      if (!existing) return;

      try {
        const patched = { ...updates, updatedAt: Date.now() };
        await updateDoc(
          doc(db, "expense_payouts", user.uid, "entries", payoutId),
          patched
        );
        const next = { ...existing, ...patched };
        setPayouts((prev) => prev.map((p) => (p.id === payoutId ? next : p)));

        const prevIds = new Set(existing.expenseIds || []);
        const nextIds = new Set(next.expenseIds || []);
        const added = [...nextIds].filter((id) => !prevIds.has(id));
        const removed = [...prevIds].filter((id) => !nextIds.has(id));

        await Promise.all([
          ...added.map((eid) =>
            patchExpenseFields(eid, {
              settlementStatus: "reimbursed",
              payoutId,
              reimbursedDate: next.date,
            })
          ),
          ...removed.map((eid) =>
            patchExpenseFields(eid, {
              settlementStatus: "pending",
              payoutId: null,
              reimbursedDate: null,
            })
          ),
          // If date changed, refresh reimbursedDate on still-linked expenses.
          ...(updates.date && updates.date !== existing.date
            ? [...nextIds]
                .filter((id) => prevIds.has(id))
                .map((eid) => patchExpenseFields(eid, { reimbursedDate: next.date }))
            : []),
        ]);
      } catch (err) {
        console.error("Failed to update payout:", err);
        throw err;
      }
    },
    [user, db, payouts, patchExpenseFields]
  );

  const deletePayout = useCallback(
    async (payoutId) => {
      if (!user || !db) return;
      const existing = payouts.find((p) => p.id === payoutId);
      try {
        await deleteDoc(doc(db, "expense_payouts", user.uid, "entries", payoutId));
        setPayouts((prev) => prev.filter((p) => p.id !== payoutId));

        if (existing?.expenseIds?.length) {
          await Promise.all(
            existing.expenseIds.map((eid) =>
              patchExpenseFields(eid, {
                settlementStatus: "pending",
                payoutId: null,
                reimbursedDate: null,
              })
            )
          );
        }
      } catch (err) {
        console.error("Failed to delete payout:", err);
        throw err;
      }
    },
    [user, db, payouts, patchExpenseFields]
  );

  // =============================
  // Expense CRUD (must be defined before confirmPerDiem which depends on addExpense)
  // =============================

  const MAX_CORRECTIONS = 30;

  const recordCorrection = useCallback(
    async (ocrData, savedFields) => {
      if (!user || !db || !ocrData) return;

      const diffs = {};
      if (ocrData.description && savedFields.description && ocrData.description !== savedFields.description) {
        diffs.ocrDescription = ocrData.description;
        diffs.userDescription = savedFields.description;
      }
      if (ocrData.category && savedFields.category && ocrData.category !== savedFields.category) {
        diffs.ocrCategory = ocrData.category;
        diffs.userCategory = savedFields.category;
      }
      if (ocrData.vendor && savedFields.vendor && ocrData.vendor !== savedFields.vendor) {
        diffs.ocrVendor = ocrData.vendor;
        diffs.userVendor = savedFields.vendor;
      }

      if (Object.keys(diffs).length === 0) return;

      const correction = {
        vendor: savedFields.vendor || ocrData.vendor || "",
        ...diffs,
        savedAt: Date.now(),
      };

      const updated = [...corrections, correction].slice(-MAX_CORRECTIONS);

      try {
        await setDoc(doc(db, "expense_preferences", user.uid), { corrections: updated });
        setCorrections(updated);
      } catch (err) {
        console.error("Failed to save correction:", err);
      }
    },
    [user, db, corrections]
  );

  const autoLinkExpenseToShow = useCallback(
    async (expense) => {
      if (!expense?.date || (expense.category !== "Travel" && expense.category !== "Per Diem")) return null;
      const matching = shows.find(
        (s) => s.startDate && s.endDate && expense.date >= s.startDate && expense.date <= s.endDate
      );
      if (!matching) return null;
      if (matching.linkedExpenseIds?.includes(expense.id)) return matching;

      const updatedIds = [...(matching.linkedExpenseIds || []), expense.id];
      await updateShow(matching.id, { linkedExpenseIds: updatedIds });
      return matching;
    },
    [shows, updateShow]
  );

  const addExpense = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const rates = Object.keys(ecbRates).length ? ecbRates : await fetchECBRates();
      const { amountEUR, rate } = convertToEUR(
        entry.amount,
        entry.currency || "EUR",
        rates
      );

      const now = Date.now();
      const fullEntry = {
        date: entry.date || new Date().toISOString().slice(0, 10),
        category: entry.category || "Other",
        description: entry.description || "",
        amount: parseFloat(entry.amount) || 0,
        currency: entry.currency || "EUR",
        amountEUR,
        exchangeRate: rate,
        vendor: entry.vendor || "",
        paymentMethod: entry.paymentMethod || "Cash",
        receiptUrl: entry.receiptUrl || null,
        receiptStoragePath: entry.receiptStoragePath || null,
        ocrData: entry.ocrData || null,
        notes: entry.notes || "",
        settlementStatus: entry.settlementStatus || "unsettled",
        payoutId: entry.payoutId || null,
        reimbursedDate: entry.reimbursedDate || null,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const col = fsCollection(db, "expenses", user.uid, "entries");
        const docRef = await addDoc(col, fullEntry);
        const newEntry = { id: docRef.id, ...fullEntry };
        setExpenses((prev) => [newEntry, ...prev]);

        if (entry.ocrData) {
          recordCorrection(entry.ocrData, {
            description: fullEntry.description,
            category: fullEntry.category,
            vendor: fullEntry.vendor,
          });
        }

        if (fullEntry.category === "Travel" || fullEntry.category === "Per Diem") {
          autoLinkExpenseToShow(newEntry).catch(() => {});
        }

        return newEntry;
      } catch (err) {
        console.error("Failed to add expense:", err);
        throw err;
      }
    },
    [user, db, ecbRates, recordCorrection, autoLinkExpenseToShow]
  );

  // =============================
  // Per Diem Confirmation (depends on addExpense + updateShow)
  // =============================

  const confirmPerDiem = useCallback(
    async (showId) => {
      if (!user || !db) return;
      const show = shows.find((s) => s.id === showId);
      if (!show || show.perDiemConfirmed) return;

      const expenseEntry = await addExpense({
        date: show.startDate,
        category: "Per Diem",
        description: `${show.name} per diem (${show.travelDays} days)`,
        amount: show.perDiemTotal,
        currency: "EUR",
        vendor: "Per diem allowance",
        paymentMethod: "Bank Transfer",
        notes: `Auto-generated from show: ${show.name}. ${show.country}${show.city ? ", " + show.city : ""}. Rate: EUR ${show.perDiemRate}/day.`,
      });

      if (expenseEntry) {
        await updateShow(showId, {
          perDiemConfirmed: true,
          perDiemExpenseId: expenseEntry.id,
          checklist: { ...show.checklist, perDiems: true },
        });
      }
    },
    [user, db, shows, addExpense, updateShow]
  );

  // =============================
  // Recurring Expenses CRUD + auto-post
  // =============================

  const addRecurring = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      const fullEntry = {
        name: entry.name || entry.description || "Recurring expense",
        category: entry.category || "Rent / Storage",
        description: entry.description || "",
        amount: parseFloat(entry.amount) || 0,
        currency: entry.currency || "EUR",
        vendor: entry.vendor || "",
        paymentMethod: entry.paymentMethod || "Bank Transfer",
        notes: entry.notes || "",
        frequency: entry.frequency || "monthly",
        dayOfMonth: entry.dayOfMonth ?? new Date().getDate(),
        startDate: entry.startDate || today,
        endDate: entry.endDate || null,
        nextDueDate: entry.nextDueDate || entry.startDate || today,
        lastPostedDate: entry.lastPostedDate || null,
        autoPost: entry.autoPost ?? true,
        active: entry.active ?? true,
        settlementStatus: entry.settlementStatus || "unsettled",
        createdAt: now,
        updatedAt: now,
      };
      try {
        const col = fsCollection(db, "expense_recurring", user.uid, "entries");
        const docRef = await addDoc(col, fullEntry);
        const newEntry = { id: docRef.id, ...fullEntry };
        setRecurring((prev) => [newEntry, ...prev]);
        return newEntry;
      } catch (err) {
        console.error("Failed to add recurring expense:", err);
        throw err;
      }
    },
    [user, db]
  );

  const updateRecurring = useCallback(
    async (entryId, updates) => {
      if (!user || !db) return;
      try {
        const patched = { ...updates, updatedAt: Date.now() };
        await updateDoc(
          doc(db, "expense_recurring", user.uid, "entries", entryId),
          patched
        );
        setRecurring((prev) =>
          prev.map((r) => (r.id === entryId ? { ...r, ...patched } : r))
        );
      } catch (err) {
        console.error("Failed to update recurring expense:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deleteRecurring = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "expense_recurring", user.uid, "entries", entryId));
        setRecurring((prev) => prev.filter((r) => r.id !== entryId));
      } catch (err) {
        console.error("Failed to delete recurring expense:", err);
        throw err;
      }
    },
    [user, db]
  );

  // Compute the next due date AFTER a given posting date for a frequency.
  const computeNextDueDate = useCallback((fromDateISO, frequency, dayOfMonth) => {
    const d = new Date(fromDateISO + "T00:00:00");
    if (frequency === "weekly") {
      d.setDate(d.getDate() + 7);
    } else if (frequency === "biweekly") {
      d.setDate(d.getDate() + 14);
    } else if (frequency === "yearly") {
      d.setFullYear(d.getFullYear() + 1);
    } else {
      // monthly (default)
      d.setMonth(d.getMonth() + 1);
      if (dayOfMonth) {
        // Clamp to last day of month if needed.
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(dayOfMonth, lastDay));
      }
    }
    return d.toISOString().slice(0, 10);
  }, []);

  // Manually post a recurring expense for its current nextDueDate (or override).
  const postRecurringNow = useCallback(
    async (recurringId, overrideDate = null) => {
      if (!user || !db) return;
      const r = recurring.find((x) => x.id === recurringId);
      if (!r) return;
      const postDate = overrideDate || r.nextDueDate || new Date().toISOString().slice(0, 10);

      const expenseEntry = await addExpense({
        date: postDate,
        category: r.category,
        description: r.description || r.name,
        amount: r.amount,
        currency: r.currency,
        vendor: r.vendor,
        paymentMethod: r.paymentMethod,
        notes: r.notes
          ? `${r.notes}\n\nAuto-generated from recurring: ${r.name}`
          : `Auto-generated from recurring: ${r.name}`,
        settlementStatus: r.settlementStatus || "unsettled",
      });

      const next = computeNextDueDate(postDate, r.frequency, r.dayOfMonth);
      await updateRecurring(recurringId, {
        lastPostedDate: postDate,
        nextDueDate: next,
      });
      return expenseEntry;
    },
    [user, db, recurring, addExpense, computeNextDueDate, updateRecurring]
  );

  // Auto-post any active recurring expenses whose nextDueDate is on or before today.
  // Loops in case a schedule has multiple unposted periods (e.g. user opened the
  // app for the first time in 3 months).
  const runRecurringDue = useCallback(async () => {
    if (!user || !db) return;
    const todayISO = new Date().toISOString().slice(0, 10);
    const due = recurring.filter(
      (r) =>
        r.active !== false &&
        r.autoPost !== false &&
        r.nextDueDate &&
        r.nextDueDate <= todayISO &&
        (!r.endDate || r.nextDueDate <= r.endDate)
    );
    for (const r of due) {
      // Catch up: post repeatedly until nextDueDate moves past today.
      let cursor = r.nextDueDate;
      let last = r.lastPostedDate;
      let safety = 60;
      while (cursor && cursor <= todayISO && (!r.endDate || cursor <= r.endDate) && safety-- > 0) {
        await addExpense({
          date: cursor,
          category: r.category,
          description: r.description || r.name,
          amount: r.amount,
          currency: r.currency,
          vendor: r.vendor,
          paymentMethod: r.paymentMethod,
          notes: r.notes
            ? `${r.notes}\n\nAuto-generated from recurring: ${r.name}`
            : `Auto-generated from recurring: ${r.name}`,
          settlementStatus: r.settlementStatus || "unsettled",
        });
        last = cursor;
        cursor = computeNextDueDate(cursor, r.frequency, r.dayOfMonth);
      }
      await updateRecurring(r.id, {
        lastPostedDate: last,
        nextDueDate: cursor,
      });
    }
  }, [user, db, recurring, addExpense, computeNextDueDate, updateRecurring]);

  // Auto-run after recurring data is first loaded.
  useEffect(() => {
    if (!user || !db) return;
    if (recurring.length === 0) return;
    runRecurringDue().catch((err) =>
      console.error("Recurring auto-post failed:", err)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, db, recurring.length]);

  const updateExpense = useCallback(
    async (entryId, updates) => {
      if (!user || !db) return;
      try {
        const patchedUpdates = { ...updates, updatedAt: Date.now() };

        if (updates.amount !== undefined || updates.currency !== undefined) {
          const rates = Object.keys(ecbRates).length ? ecbRates : await fetchECBRates();
          const currentExpense = expenses.find((e) => e.id === entryId);
          const amount = updates.amount ?? currentExpense?.amount ?? 0;
          const currency = updates.currency ?? currentExpense?.currency ?? "EUR";
          const { amountEUR, rate } = convertToEUR(amount, currency, rates);
          patchedUpdates.amountEUR = amountEUR;
          patchedUpdates.exchangeRate = rate;
        }

        await updateDoc(
          doc(db, "expenses", user.uid, "entries", entryId),
          patchedUpdates
        );
        setExpenses((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, ...patchedUpdates } : e))
        );

        const currentExpense = expenses.find((e) => e.id === entryId);
        const ocrData = updates.ocrData || currentExpense?.ocrData;
        if (ocrData) {
          recordCorrection(ocrData, {
            description: patchedUpdates.description ?? currentExpense?.description,
            category: patchedUpdates.category ?? currentExpense?.category,
            vendor: patchedUpdates.vendor ?? currentExpense?.vendor,
          });
        }
      } catch (err) {
        console.error("Failed to update expense:", err);
        throw err;
      }
    },
    [user, db, ecbRates, expenses, recordCorrection]
  );

  const deleteExpense = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      try {
        const expense = expenses.find((e) => e.id === entryId);
        await deleteDoc(doc(db, "expenses", user.uid, "entries", entryId));

        const storagePath = expense?.receiptStoragePath;
        if (storagePath) {
          try {
            const storage = getStorage();
            const receiptRef = ref(storage, storagePath);
            await deleteObject(receiptRef);
          } catch {
            // Receipt file may already be deleted
          }
        }

        setExpenses((prev) => prev.filter((e) => e.id !== entryId));

        // Prune this expense from any payout that referenced it.
        const linkedPayouts = payouts.filter((p) =>
          (p.expenseIds || []).includes(entryId)
        );
        await Promise.all(
          linkedPayouts.map(async (p) => {
            const nextIds = (p.expenseIds || []).filter((id) => id !== entryId);
            const patch = { expenseIds: nextIds, updatedAt: Date.now() };
            await updateDoc(
              doc(db, "expense_payouts", user.uid, "entries", p.id),
              patch
            );
            setPayouts((prev) =>
              prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x))
            );
          })
        );
      } catch (err) {
        console.error("Failed to delete expense:", err);
        throw err;
      }
    },
    [user, db, expenses, payouts]
  );

  const uploadReceipt = useCallback(
    async (file) => {
      if (!user || !file) return null;
      const storage = getStorage();
      const path = `expense_receipts/${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      return { downloadUrl, storagePath: path };
    },
    [user]
  );

  const scanReceipt = useCallback(
    async (storagePath) => {
      if (!user) return null;
      try {
        const functions = getFunctions();
        const parseReceiptFn = httpsCallable(functions, "parseReceipt");
        const result = await parseReceiptFn({
          storagePath,
          corrections: corrections.length > 0 ? corrections : undefined,
        });
        return result.data;
      } catch (err) {
        console.error("Receipt scan failed:", err);
        throw err;
      }
    },
    [user, corrections]
  );

  const refreshData = useCallback(async () => {
    await Promise.all([
      loadExpenses(),
      loadShows(),
      loadPayouts(),
      loadRecurring(),
    ]);
  }, [loadExpenses, loadShows, loadPayouts, loadRecurring]);

  const value = {
    expenses,
    corrections,
    shows,
    payouts,
    recurring,
    addExpense,
    updateExpense,
    deleteExpense,
    uploadReceipt,
    scanReceipt,
    addShow,
    updateShow,
    deleteShow,
    confirmPerDiem,
    addPayout,
    updatePayout,
    deletePayout,
    addRecurring,
    updateRecurring,
    deleteRecurring,
    postRecurringNow,
    runRecurringDue,
    setExpenseSettlementStatus,
    ecbRates,
    loading,
    refreshData,
  };

  return <ExpenseContext.Provider value={value}>{children}</ExpenseContext.Provider>;
}
