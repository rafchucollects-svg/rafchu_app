import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { computeItemMetrics, formatCurrency } from "@/utils/cardHelpers";
import { toast } from "@/components/ui/Toaster";

export function TradeBinder() {
  const { user, collectionItems, currency, updateCollectionItem } = useApp();
  const [busy, setBusy] = useState(null);
  const items = collectionItems.filter(item => item.forTrade);
  const remove = async item => {
    setBusy(item.entryId);
    try { await updateCollectionItem(item.entryId, { forTrade: false }); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(null); }
  };
  if (!user) return <p>Sign in to view your trade binder.</p>;
  return <div className="mx-auto max-w-6xl space-y-5"><div><h1 className="text-3xl font-bold">Trade binder</h1><p className="mt-2 text-muted-foreground">Cards you have marked as available for trade. Your selection is saved across devices.</p></div>
    <Link className="inline-block font-semibold underline" to="/collector/collection">Select cards from your collection</Link>
    {!items.length && <div className="rounded-2xl border bg-card p-6">Select cards in your collection and choose “Add to Trade Binder” to get started.</div>}
    <div className="grid gap-3 sm:grid-cols-2">{items.map(item => <article key={item.entryId} className="flex gap-4 rounded-2xl border bg-card p-4">{item.image && <img className="h-28 w-20 object-contain" src={item.image} alt={item.name} loading="lazy" />}<div className="min-w-0 flex-1"><h2 className="font-bold">{item.name}</h2><p className="text-sm text-muted-foreground">{item.set} · #{item.number} · {item.condition} · ×{item.quantity || 1}</p><p className="my-2">{computeItemMetrics(item,currency).suggested > 0 ? formatCurrency(computeItemMetrics(item,currency).suggested,currency) : "Price unavailable"}</p><Button size="sm" variant="outline" disabled={busy === item.entryId} onClick={() => remove(item)}>Remove from binder</Button></div></article>)}</div>
  </div>;
}
