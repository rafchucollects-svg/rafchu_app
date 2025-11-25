import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { doc, onSnapshot, setDoc, collection, addDoc, getDoc } from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { computeItemMetrics } from "@/utils/cardHelpers";

/**
 * CollectionContext provides collection, inventory, wishlist, and transaction state
 * This changes when users add/remove/update cards
 */

const CollectionContext = createContext(null);

export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (!context) {
    throw new Error("useCollection must be used within CollectionProvider");
  }
  return context;
};

export const CollectionProvider = ({ children }) => {
  const { user, db, userProfile } = useAuth();

  // Collection/Inventory state
  const [collectionItems, setCollectionItems] = useState([]);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionSortBy, setCollectionSortBy] = useState("addedAt");
  const [collectionSortDir, setCollectionSortDir] = useState("desc");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);
  const [viewingUid, setViewingUid] = useState(null);

  // Wishlist state
  const [wishlistItems, setWishlistItems] = useState([]);

  // Trade Binder state (collector mode)
  const [tradeItems, setTradeItems] = useState([]);

  // Buy List state (collector mode)
  const [buyItems, setBuyItems] = useState([]);

  // Transaction state
  const [transactions, setTransactions] = useState([]);

  // Load collection items (real-time listener)
  useEffect(() => {
    if (!user || !db) {
      setCollectionItems([]);
      return;
    }

    const colRef = doc(db, "collector_collections", user.uid);
    const unsubscribe = onSnapshot(colRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const items = data.items || [];
        setCollectionItems(items);
      } else {
        setCollectionItems([]);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  // Load wishlist items (real-time listener)
  useEffect(() => {
    if (!user || !db) {
      setWishlistItems([]);
      return;
    }

    const wishRef = doc(db, "wishlists", user.uid);
    const unsubscribe = onSnapshot(wishRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWishlistItems(data.items || []);
      } else {
        setWishlistItems([]);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  // Load transactions (real-time listener)
  useEffect(() => {
    if (!user || !db) {
      setTransactions([]);
      return;
    }

    const transRef = doc(db, "transactions", user.uid);
    const unsubscribe = onSnapshot(transRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTransactions(data.items || []);
      } else {
        setTransactions([]);
      }
    });

    return () => unsubscribe();
  }, [user, db]);

  // Add card to collection/inventory
  const addToCollection = useCallback(
    async (card, options = {}, mode = null) => {
      if (!user || !db) return;

      const isVendor = userProfile?.vendorAccess?.enabled === true;
      const targetMode = mode || (isVendor ? "vendor" : "collector");

      // Read latest collection to avoid race conditions
      const colRef = doc(db, "collector_collections", user.uid);
      const snap = await getDoc(colRef);
      const latestItems = snap.exists() ? snap.data().items || [] : [];

      // Build new item with robust fallbacks
      const newItem = {
        entryId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        cardId: card.cardId || card.id || card.slug || "unknown",
        name: card.name || "Unknown Card",
        set: card.set || "",
        number: card.number || "",
        rarity: card.rarity || "",
        image: card.image || null,
        addedAt: Date.now(),
        quantity: options.quantity || 1,
        condition: options.condition || "NM",
        language: options.language || "English",
        isGraded: options.isGraded || false,
        gradingCompany: options.gradingCompany || null,
        grade: options.grade || null,
        gradedPrice: options.gradedPrice || null,
        variant: options.variant || "normal",
        comment: options.comment || "",
        overridePrice: options.customPrice || null,
        overridePriceCurrency: options.customPrice ? (userProfile?.currency || "USD") : null,
        prices: card.prices || {},
        links: card.links || {},
      };

      // Calculate suggested price
      let suggestedPrice = 0;
      if (newItem.isGraded && newItem.gradedPrice) {
        // For graded cards, use the graded price directly
        suggestedPrice = parseFloat(newItem.gradedPrice);
      } else {
        // For ungraded cards, compute from market prices
        const metrics = computeItemMetrics(newItem, {
          marketSource: userProfile?.marketSource || "cardmarket",
          currency: userProfile?.currency || "USD",
          isVendor: targetMode === "vendor",
        });
        suggestedPrice = metrics.suggested || 0;
      }

      newItem.calculatedSuggestedPrice = suggestedPrice;

      // Update Firestore
      const updatedItems = [...latestItems, newItem];
      await setDoc(colRef, { items: updatedItems }, { merge: true });
    },
    [user, db, userProfile]
  );

  // Remove card from collection
  const removeFromCollection = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      const colRef = doc(db, "collector_collections", user.uid);
      const updated = collectionItems.filter((item) => item.entryId !== entryId);
      await setDoc(colRef, { items: updated }, { merge: true });
    },
    [user, db, collectionItems]
  );

  // Update collection item
  const updateCollectionItem = useCallback(
    async (entryId, updates) => {
      if (!user || !db) return;
      const colRef = doc(db, "collector_collections", user.uid);
      const updated = collectionItems.map((item) =>
        item.entryId === entryId ? { ...item, ...updates } : item
      );
      await setDoc(colRef, { items: updated }, { merge: true });
    },
    [user, db, collectionItems]
  );

  // Add to wishlist
  const addToWishlist = useCallback(
    async (card) => {
      if (!user || !db) return;
      const wishRef = doc(db, "wishlists", user.uid);
      const newItem = {
        entryId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        cardId: card.cardId || card.id || card.slug,
        name: card.name,
        set: card.set,
        number: card.number,
        image: card.image,
        addedAt: Date.now(),
      };
      const updated = [...wishlistItems, newItem];
      await setDoc(wishRef, { items: updated }, { merge: true });
    },
    [user, db, wishlistItems]
  );

  // Remove from wishlist
  const removeFromWishlist = useCallback(
    async (entryId) => {
      if (!user || !db) return;
      const wishRef = doc(db, "wishlists", user.uid);
      const updated = wishlistItems.filter((item) => item.entryId !== entryId);
      await setDoc(wishRef, { items: updated }, { merge: true });
    },
    [user, db, wishlistItems]
  );

  // Add transaction
  const addTransaction = useCallback(
    async (transaction) => {
      if (!user || !db) return;
      const transRef = doc(db, "transactions", user.uid);
      const newTransaction = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        ...transaction,
      };
      const updated = [newTransaction, ...transactions];
      await setDoc(transRef, { items: updated }, { merge: true });
    },
    [user, db, transactions]
  );

  const value = {
    // Collection
    collectionItems,
    collection: collectionItems, // Alias for Insights pages
    setCollectionItems,
    collectionSearch,
    setCollectionSearch,
    collectionSortBy,
    setCollectionSortBy,
    collectionSortDir,
    setCollectionSortDir,
    selectedCollectionIds,
    setSelectedCollectionIds,
    viewingUid,
    setViewingUid,
    addToCollection,
    removeFromCollection,
    updateCollectionItem,

    // Wishlist
    wishlistItems,
    setWishlistItems,
    addToWishlist,
    removeFromWishlist,

    // Trade & Buy
    tradeItems,
    setTradeItems,
    buyItems,
    setBuyItems,

    // Transactions
    transactions,
    setTransactions,
    addTransaction,
  };

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
};

