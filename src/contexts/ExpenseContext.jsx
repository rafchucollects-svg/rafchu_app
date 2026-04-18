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
import { fetchECBRates, convertToEUR } from "@/utils/taxHelpers";

const ExpenseContext = createContext(null);

export const useExpenses = () => {
  const context = useContext(ExpenseContext);
  if (!context) throw new Error("useExpenses must be used within ExpenseProvider");
  return context;
};

export function ExpenseProvider({ children }) {
  const { user, db } = useApp();

  const [expenses, setExpenses] = useState([]);
  const [shows, setShows] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [ecbRates, setEcbRates] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setExpenses([]);
      setShows([]);
      setPayouts([]);
      setCorrections([]);
      setLoading(false);
      return;
    }
    loadExpenses();
    loadShows();
    loadPayouts();
    loadCorrections();
  }, [user, db]);

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
    await Promise.all([loadExpenses(), loadShows(), loadPayouts()]);
  }, [loadExpenses, loadShows, loadPayouts]);

  const value = {
    expenses,
    corrections,
    shows,
    payouts,
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
    setExpenseSettlementStatus,
    ecbRates,
    loading,
    refreshData,
  };

  return <ExpenseContext.Provider value={value}>{children}</ExpenseContext.Provider>;
}
