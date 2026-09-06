import { useState } from "react";
import { collection, doc, getDocs, limit, orderBy, query, runTransaction } from "firebase/firestore";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/Toaster";

export function InventoryTrash({ collectionName }) {
  const { db, user } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!user || !db) return;
    setBusy(true);
    try {
      const result = await getDocs(query(collection(db, collectionName, user.uid, "trash"), orderBy("deletedAt", "desc"), limit(50)));
      setItems(result.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })));
      setOpen(true);
    } catch { toast.error("Could not load recently deleted cards. Please retry."); }
    finally { setBusy(false); }
  };
  const restore = async id => {
    setBusy(true);
    try {
      const inventoryRef = doc(db, collectionName, user.uid);
      const trashRef = doc(inventoryRef, "trash", id);
      await runTransaction(db, async transaction => {
        const [inventory, removed] = await Promise.all([transaction.get(inventoryRef), transaction.get(trashRef)]);
        if (!removed.exists()) throw new Error("This card has already been restored.");
        const latest = inventory.data()?.items || [];
        if (latest.some(item => item.entryId === id)) throw new Error("This card is already in your inventory.");
        transaction.set(inventoryRef, { items: [...latest, removed.data().item] }, { merge: true });
        transaction.delete(trashRef);
      });
      setItems(previous => previous.filter(item => item.id !== id));
      toast.success("Card restored");
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  if (!user) return null;
  return <section className="mb-4 rounded-xl border bg-card p-3">
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => open ? setOpen(false) : load()}>{open ? "Close recently deleted" : "Recently deleted"}</Button>
    {open && <div className="mt-3 space-y-2">
      <p className="text-xs text-muted-foreground">Restore your 50 most recent deletions. Cards remain here until restored.</p>
      {!items.length && <p className="text-sm">No deleted cards.</p>}
      {items.map(entry => <div key={entry.id} className="flex items-center justify-between gap-3 border-t pt-2 text-sm"><span>{entry.item.name} · {entry.item.set} · ×{entry.item.quantity || 1}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => restore(entry.id)}>Restore</Button></div>)}
    </div>}
  </section>;
}
