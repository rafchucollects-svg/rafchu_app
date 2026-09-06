import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { computeItemMetrics, formatCurrency } from "@/utils/cardHelpers";

export function CollectionInsights() {
  const { user, collectionItems, currency } = useApp();
  const stats = useMemo(() => {
    let quantity = 0, value = 0, unpriced = 0, graded = 0;
    const sets = new Map();
    const conditions = new Map();
    for (const item of collectionItems) {
      const count = Number(item.quantity) || 1;
      const price = computeItemMetrics(item, currency).suggested;
      quantity += count;
      if (price > 0) value += price * count; else unpriced += count;
      if (item.isGraded) graded += count;
      sets.set(item.set || "Unknown set", (sets.get(item.set || "Unknown set") || 0) + count);
      conditions.set(item.condition || "NM", (conditions.get(item.condition || "NM") || 0) + count);
    }
    return { quantity, value, unpriced, graded, sets: [...sets].sort((a,b) => b[1]-a[1]), conditions: [...conditions] };
  }, [collectionItems, currency]);
  if (!user) return <p>Sign in to see your collection insights.</p>;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-3xl font-bold">Collection insights</h1><p className="mt-2 text-muted-foreground">Your collection today. Values are estimates from available pricing and your overrides.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Cards", stats.quantity], ["Estimated value", formatCurrency(stats.value, currency)], ["Graded cards", stats.graded], ["Without a price", stats.unpriced]].map(([label,value]) => <div key={label} className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    {!stats.quantity ? <p>Add your first cards through <Link className="underline" to="/search">card search</Link> to start tracking your collection.</p> : <div className="grid gap-5 md:grid-cols-2">{[["Largest sets", stats.sets.slice(0,10)], ["Condition breakdown", stats.conditions]].map(([title, rows]) => <section className="rounded-2xl border bg-card p-5" key={title}><h2 className="mb-4 font-bold">{title}</h2>{rows.map(([label,count]) => <div className="mb-3" key={label}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><span>{count}</span></div><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-amber-400" style={{width:`${100*count/stats.quantity}%`}} /></div></div>)}</section>)}</div>}
    <Link to="/collector/collection" className="inline-block font-semibold underline">Manage collection</Link>
  </div>;
}
