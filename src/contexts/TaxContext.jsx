import { hasVendorAccess } from "@/utils/vendorAccess";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  doc,
  getDoc,
  setDoc,
  collection as fsCollection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useApp } from "./AppContext";
import { fetchECBRates, generatePurchaseId, convertToEUR, FINLAND_MILEAGE_RATE } from "@/utils/taxCore";

const TaxContext = createContext(null);

export const useTax = () => {
  const context = useContext(TaxContext);
  if (!context) throw new Error("useTax must be used within TaxProvider");
  return context;
};

export function TaxProvider({ children }) {
  const { user, db, userProfile } = useApp();
  const vendorEnabled = hasVendorAccess(userProfile);

  const [taxConfig, setTaxConfig] = useState(null);
  const [purchaseDiary, setPurchaseDiary] = useState([]);
  const [shareholderEntries, setShareholderEntries] = useState([]);
  const [otherRevenue, setOtherRevenue] = useState([]);
  const [lossCarryForward, setLossCarryForward] = useState([]);
  const [mileageTrips, setMileageTrips] = useState([]);
  const [taxFreeBenefits, setTaxFreeBenefits] = useState([]);
  const [ecbRates, setEcbRates] = useState({});
  const [loading, setLoading] = useState(true);

  // Load all tax data when user is available
  useEffect(() => {
    if (!user || !db || !vendorEnabled) {
      setTaxConfig(null);
      setPurchaseDiary([]);
      setShareholderEntries([]);
      setOtherRevenue([]);
      setLossCarryForward([]);
      setMileageTrips([]);
      setTaxFreeBenefits([]);
      setLoading(false);
      return;
    }
    loadAllTaxData();
  }, [user, db, vendorEnabled]);

  // Fetch ECB rates on mount
  useEffect(() => {
    fetchECBRates().then(setEcbRates);
  }, []);

  const loadAllTaxData = useCallback(async () => {
    if (!user || !db) return;
    setLoading(true);
    try {
      await Promise.all([
        loadTaxConfig(),
        loadPurchaseDiary(),
        loadShareholderEntries(),
        loadOtherRevenue(),
        loadLossCarryForward(),
        loadMileageTrips(),
        loadTaxFreeBenefits(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [user, db]);

  // =============================
  // Tax Config (Company Info)
  // =============================

  const loadTaxConfig = async () => {
    if (!user || !db) return;
    try {
      const snap = await getDoc(doc(db, "tax_config", user.uid));
      if (snap.exists()) {
        setTaxConfig(snap.data());
      } else {
        setTaxConfig({
          companyName: "",
          businessId: "",
          vatNumber: "",
          fiscalYearStart: 1,
          fiscalYearEnd: 12,
          vatFilingPeriod: "quarterly",
          defaultPaymentMethod: "Wise",
          address: "",
        });
      }
    } catch (err) {
      console.error("Failed to load tax config:", err);
    }
  };

  const saveTaxConfig = useCallback(
    async (config) => {
      if (!user || !db) return;
      try {
        await setDoc(doc(db, "tax_config", user.uid), config, { merge: true });
        setTaxConfig(config);
      } catch (err) {
        console.error("Failed to save tax config:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Purchase Diary
  // =============================

  const loadPurchaseDiary = async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "tax_purchases", user.uid, "entries");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setPurchaseDiary(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load purchase diary:", err);
    }
  };

  const addPurchaseEntry = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const rates = Object.keys(ecbRates).length ? ecbRates : await fetchECBRates();
      const { amountEUR, rate } = convertToEUR(
        entry.originalAmount,
        entry.originalCurrency || "EUR",
        rates
      );

      const purchaseId = generatePurchaseId(purchaseDiary);
      const fullEntry = {
        purchaseId,
        date: entry.date || Date.now(),
        location: entry.location || "",
        sellerName: entry.sellerName || "Private Seller",
        itemName: entry.itemName || "",
        set: entry.set || "",
        condition: entry.condition || "NM",
        quantity: entry.quantity || 1,
        originalCurrency: entry.originalCurrency || "EUR",
        originalAmount: parseFloat(entry.originalAmount) || 0,
        priceEUR: amountEUR,
        exchangeRate: rate,
        paymentMethod: entry.paymentMethod || taxConfig?.defaultPaymentMethod || "Wise",
        notes: entry.notes || "",
        receiptUrls: entry.receiptUrls || [],
        linkedEntryIds: entry.linkedEntryIds || [],
      };

      try {
        const col = fsCollection(db, "tax_purchases", user.uid, "entries");
        const docRef = await addDoc(col, fullEntry);
        const newEntry = { id: docRef.id, ...fullEntry };
        setPurchaseDiary((prev) => [newEntry, ...prev]);
        return newEntry;
      } catch (err) {
        console.error("Failed to add purchase entry:", err);
        throw err;
      }
    },
    [user, db, ecbRates, purchaseDiary, taxConfig]
  );

  const updatePurchaseEntry = useCallback(
    async (entryId, updates) => {
      if (!user || !db) return;
      try {
        await updateDoc(
          doc(db, "tax_purchases", user.uid, "entries", entryId),
          updates
        );
        setPurchaseDiary((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e))
        );
      } catch (err) {
        console.error("Failed to update purchase entry:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deletePurchaseEntry = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "tax_purchases", user.uid, "entries", entryId));
        setPurchaseDiary((prev) => prev.filter((e) => e.id !== entryId));
      } catch (err) {
        console.error("Failed to delete purchase entry:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Receipt Upload
  // =============================

  const uploadReceipt = useCallback(
    async (file, purchaseEntryId) => {
      if (!user || !file) return null;
      const storage = getStorage();
      const path = `tax_receipts/${user.uid}/${purchaseEntryId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      return getDownloadURL(storageRef);
    },
    [user]
  );

  // =============================
  // Shareholder Loan Ledger
  // =============================

  const loadShareholderEntries = async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "tax_shareholder", user.uid, "entries");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setShareholderEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load shareholder entries:", err);
    }
  };

  const addShareholderEntry = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const fullEntry = {
        date: entry.date || Date.now(),
        type: entry.type || "credit",
        description: entry.description || "",
        amount: parseFloat(entry.amount) || 0,
        category: entry.category || "",
        notes: entry.notes || "",
        receiptUrl: entry.receiptUrl || null,
      };

      try {
        const col = fsCollection(db, "tax_shareholder", user.uid, "entries");
        const docRef = await addDoc(col, fullEntry);
        const newEntry = { id: docRef.id, ...fullEntry };
        setShareholderEntries((prev) => [newEntry, ...prev]);
        return newEntry;
      } catch (err) {
        console.error("Failed to add shareholder entry:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deleteShareholderEntry = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "tax_shareholder", user.uid, "entries", entryId));
        setShareholderEntries((prev) => prev.filter((e) => e.id !== entryId));
      } catch (err) {
        console.error("Failed to delete shareholder entry:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Other Revenue Journal
  // =============================

  const loadOtherRevenue = async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "other_revenue", user.uid, "entries");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setOtherRevenue(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load other revenue:", err);
    }
  };

  const addRevenueEntry = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const rates = Object.keys(ecbRates).length ? ecbRates : await fetchECBRates();
      const { amountEUR, rate } = convertToEUR(
        entry.amount,
        entry.currency || "EUR",
        rates
      );

      const fullEntry = {
        date: entry.date || Date.now(),
        amount: parseFloat(entry.amount) || 0,
        currency: entry.currency || "EUR",
        amountEUR,
        exchangeRate: rate,
        category: entry.category || "Other Income",
        description: entry.description || "",
        notes: entry.notes || "",
        createdAt: Date.now(),
      };

      try {
        const col = fsCollection(db, "other_revenue", user.uid, "entries");
        const docRef = await addDoc(col, fullEntry);
        const newEntry = { id: docRef.id, ...fullEntry };
        setOtherRevenue((prev) => [newEntry, ...prev]);
        return newEntry;
      } catch (err) {
        console.error("Failed to add revenue entry:", err);
        throw err;
      }
    },
    [user, db, ecbRates]
  );

  const deleteRevenueEntry = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "other_revenue", user.uid, "entries", entryId));
        setOtherRevenue((prev) => prev.filter((e) => e.id !== entryId));
      } catch (err) {
        console.error("Failed to delete revenue entry:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Loss Carry-Forward (yearly snapshots)
  // =============================

  const loadLossCarryForward = async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "tax_loss_carry", user.uid, "years");
      const q = query(col, orderBy("year", "asc"));
      const snap = await getDocs(q);
      setLossCarryForward(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load loss carry-forward:", err);
    }
  };

  const saveLossYear = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const fullEntry = {
        year: entry.year,
        operatingProfit: parseFloat(entry.operatingProfit) || 0,
        notes: entry.notes || "",
      };
      try {
        const docId = `year_${entry.year}`;
        await setDoc(doc(db, "tax_loss_carry", user.uid, "years", docId), fullEntry);
        setLossCarryForward((prev) => {
          const existing = prev.findIndex((e) => e.year === entry.year);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { id: docId, ...fullEntry };
            return updated;
          }
          return [...prev, { id: docId, ...fullEntry }].sort((a, b) => a.year - b.year);
        });
      } catch (err) {
        console.error("Failed to save loss year:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deleteLossYear = useCallback(
    async (year) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "tax_loss_carry", user.uid, "years", `year_${year}`));
        setLossCarryForward((prev) => prev.filter((e) => e.year !== year));
      } catch (err) {
        console.error("Failed to delete loss year:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Mileage Trip Log
  // =============================

  const loadMileageTrips = async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "tax_mileage", user.uid, "trips");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setMileageTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load mileage trips:", err);
    }
  };

  const addMileageTrip = useCallback(
    async (trip) => {
      if (!user || !db) return;
      const km = parseFloat(trip.km) || 0;
      const rate = trip.rate || FINLAND_MILEAGE_RATE;
      const fullTrip = {
        date: trip.date || new Date().toISOString().slice(0, 10),
        from: trip.from || "",
        to: trip.to || "",
        purpose: trip.purpose || "",
        km,
        rate,
        allowance: Math.round(km * rate * 100) / 100,
        roundTrip: trip.roundTrip || false,
        notes: trip.notes || "",
      };

      try {
        const col = fsCollection(db, "tax_mileage", user.uid, "trips");
        const docRef = await addDoc(col, fullTrip);
        const newTrip = { id: docRef.id, ...fullTrip };
        setMileageTrips((prev) => [newTrip, ...prev]);
        return newTrip;
      } catch (err) {
        console.error("Failed to add mileage trip:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deleteMileageTrip = useCallback(
    async (tripId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "tax_mileage", user.uid, "trips", tripId));
        setMileageTrips((prev) => prev.filter((t) => t.id !== tripId));
      } catch (err) {
        console.error("Failed to delete mileage trip:", err);
        throw err;
      }
    },
    [user, db]
  );

  // =============================
  // Tax-Free Benefits Tracker
  // =============================

  const loadTaxFreeBenefits = async () => {
    if (!user || !db) return;
    try {
      const col = fsCollection(db, "tax_benefits", user.uid, "entries");
      const q = query(col, orderBy("date", "desc"));
      const snap = await getDocs(q);
      setTaxFreeBenefits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load tax-free benefits:", err);
    }
  };

  const addTaxFreeBenefit = useCallback(
    async (entry) => {
      if (!user || !db) return;
      const fullEntry = {
        date: entry.date || new Date().toISOString().slice(0, 10),
        benefitType: entry.benefitType || "",
        amount: parseFloat(entry.amount) || 0,
        description: entry.description || "",
        notes: entry.notes || "",
      };

      try {
        const col = fsCollection(db, "tax_benefits", user.uid, "entries");
        const docRef = await addDoc(col, fullEntry);
        const newEntry = { id: docRef.id, ...fullEntry };
        setTaxFreeBenefits((prev) => [newEntry, ...prev]);
        return newEntry;
      } catch (err) {
        console.error("Failed to add tax-free benefit:", err);
        throw err;
      }
    },
    [user, db]
  );

  const deleteTaxFreeBenefit = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      try {
        await deleteDoc(doc(db, "tax_benefits", user.uid, "entries", entryId));
        setTaxFreeBenefits((prev) => prev.filter((e) => e.id !== entryId));
      } catch (err) {
        console.error("Failed to delete tax-free benefit:", err);
        throw err;
      }
    },
    [user, db]
  );

  const value = {
    taxConfig,
    saveTaxConfig,
    purchaseDiary,
    addPurchaseEntry,
    updatePurchaseEntry,
    deletePurchaseEntry,
    uploadReceipt,
    shareholderEntries,
    addShareholderEntry,
    deleteShareholderEntry,
    otherRevenue,
    addRevenueEntry,
    deleteRevenueEntry,
    lossCarryForward,
    saveLossYear,
    deleteLossYear,
    mileageTrips,
    addMileageTrip,
    deleteMileageTrip,
    taxFreeBenefits,
    addTaxFreeBenefit,
    deleteTaxFreeBenefit,
    ecbRates,
    loading,
    refreshData: loadAllTaxData,
  };

  return <TaxContext.Provider value={value}>{children}</TaxContext.Provider>;
}
