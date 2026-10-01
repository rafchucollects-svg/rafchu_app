import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, Package, Search, LogIn, Award, MapPin, Sparkles, ChevronDown, X, LoaderCircle } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { LoginModal } from "@/components/LoginModal";
import { formatCurrency, computeItemMetrics, getConditionColorClass, convertCurrency, getConditionDisplayLabel } from "@/utils/cardHelpers";
import { getDoc, doc } from "firebase/firestore";
import "./SharedInventory.css";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const isNewCard = (item) => {
  const age = Date.now() - Number(item.addedAt);
  return Boolean(item.addedAt) && age >= 0 && age < TWO_WEEKS_MS;
};

const VARIANT_CONFIG = {
  isReverseHolo: { label: "Reverse Holo", color: "bg-blue-50 text-blue-800" },
  isStampedPromo: { label: "Stamped", color: "bg-purple-50 text-purple-800" },
  isSealed: { label: "Sealed", color: "bg-emerald-50 text-emerald-800" },
  isAutographed: { label: "Autographed", color: "bg-rose-50 text-rose-800" },
  isFirstEdition: { label: "1st Edition", color: "bg-amber-50 text-amber-900" },
  isPokeBall: { label: "Poké Ball", color: "bg-red-50 text-red-800" },
  isMasterBall: { label: "Master Ball", color: "bg-violet-50 text-violet-800" },
  isUnlimited: { label: "Unlimited", color: "bg-slate-100 text-slate-700" },
};

// Use the same seller price for both sorting and card display.
function getDisplayPrice(item, currency, roundUp) {
  let price;
  if (item.overridePrice != null) {
    const sourceCurrency = item.overridePriceCurrency || currency;
    price = sourceCurrency !== currency
      ? convertCurrency(item.overridePrice, currency, sourceCurrency)
      : Number(item.overridePrice);
  } else if (item.isGraded && item.gradedPrice) {
    const sourceCurrency = item.gradedPriceCurrency || "USD";
    price = sourceCurrency !== currency
      ? convertCurrency(item.gradedPrice, currency, sourceCurrency)
      : Number(item.gradedPrice);
  } else {
    price = computeItemMetrics(item, currency).suggested;
  }
  return roundUp ? Math.ceil(price) : price;
}

function InventoryCard({ item, currency, roundUp }) {
  const [failedImage, setFailedImage] = useState("");
  const variants = Object.entries(VARIANT_CONFIG).filter(([key]) => item[key]);
  const language = item.language || (item.isJapanese ? "Japanese" : "");
  const quantity = item.quantity || 1;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Keep image dimensions from widening the card in Safari. */}
      <div className="relative aspect-[3/4] w-full min-w-0 shrink-0 bg-slate-50">
        <div className="absolute inset-0 flex min-w-0 items-center justify-center p-3 sm:p-4">
          {item.image && failedImage !== item.image ? (
            <img
              src={item.image}
              alt={item.name || "Pokémon card"}
              className="block h-full w-full min-w-0 max-w-full object-contain"
              loading="lazy"
              decoding="async"
              onError={() => setFailedImage(item.image)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <Package className="h-9 w-9" aria-hidden="true" />
              <span className="text-xs">Image unavailable</span>
            </div>
          )}
        </div>
        {isNewCard(item) && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> New
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap gap-1">
          {item.isGraded ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-900">
              <Award className="h-3 w-3" aria-hidden="true" />
              {[item.gradingCompany, item.grade].filter(Boolean).join(" ") || "Graded"}
            </span>
          ) : (
            <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${getConditionColorClass(item.condition)}`}>
              {item.condition ? getConditionDisplayLabel(item.condition) : "Condition unspecified"}
            </span>
          )}
          {variants.map(([key, variant]) => (
            <span key={key} className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${variant.color}`}>
              {variant.label}
            </span>
          ))}
        </div>
        <h3 className="break-words text-sm font-extrabold leading-5 text-slate-950 sm:text-base" title={item.name}>
          {item.name || "Unnamed card"}
        </h3>
        <p className="mt-1 break-words text-xs leading-5 text-slate-600">
          {item.set}{item.number ? ` #${item.number}` : ""}
        </p>
        {language && <p className="mt-1 text-xs text-slate-600">{language}</p>}
        <div className="mt-auto pt-4">
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
              {formatCurrency(getDisplayPrice(item, currency, roundUp), currency)}
              {quantity > 1 && <span className="ml-1 text-xs font-medium tracking-normal text-slate-500">each</span>}
            </p>
            <p className="mt-1 text-xs text-slate-600">{quantity} available</p>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Displays the seller's shared inventory from public projections. */
export function SharedInventory() {
  const {
    user, db, currency, loginModalOpen, setLoginModalOpen, authHandlers,
    communityImages, getImageForCard, refreshCommunityImages,
  } = useApp();
  const [searchParams] = useSearchParams();
  const inventoryUserId = searchParams.get("inventory");
  const [inventoryItems, setInventoryItems] = useState([]);
  const [vendorName, setVendorName] = useState("Vendor");
  const [vendorPhoto, setVendorPhoto] = useState("");
  const [vendorCountry, setVendorCountry] = useState("");
  const [vendorRoundUpPrices, setVendorRoundUpPrices] = useState(false);
  const [inventoryAvailable, setInventoryAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [filterGraded, setFilterGraded] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setInventoryItems([]);
    setInventoryAvailable(false);
    setVendorName("Vendor");
    setVendorPhoto("");
    setVendorCountry("");
    setVendorRoundUpPrices(false);
    setLoadError(false);
    setSearchTerm("");
    setFilterGraded("all");
    setSortBy("name");

    if (!db || !inventoryUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const loadInventory = async () => {
      try {
        const [profileSnap, inventorySnap] = await Promise.all([
          getDoc(doc(db, "public_profiles", inventoryUserId)),
          getDoc(doc(db, "public_inventories", inventoryUserId)),
        ]);
        if (cancelled) return;
        if (!inventorySnap.exists() || !inventorySnap.data().shareEnabled) return;

        const data = inventorySnap.data();
        const profile = profileSnap.exists() ? profileSnap.data() : {};
        setVendorName(data.shareUsername || profile.username || profile.displayName || "Vendor");
        setVendorPhoto(profile.photoURL || "");
        setVendorCountry(profile.country || "");
        setVendorRoundUpPrices(data.roundUp === true);
        setInventoryAvailable(true);
        setInventoryItems((Array.isArray(data.items) ? data.items : []).filter(item => !item.excludeFromSale));
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load shared inventory:", error);
        if (error.code !== "permission-denied" && error.code !== "firestore/permission-denied") {
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadInventory();
    return () => { cancelled = true; };
  }, [db, inventoryUserId, loadAttempt]);

  useEffect(() => {
    if (inventoryItems.some(item => !item.image) && !communityImages && refreshCommunityImages) {
      refreshCommunityImages().catch(error => console.error("Failed to load card images:", error));
    }
  }, [inventoryItems, communityImages, refreshCommunityImages]);

  const enrichedItems = useMemo(() => inventoryItems.map(item => {
    if (item.image || !communityImages || !getImageForCard) return item;
    const image = getImageForCard(item);
    return image ? { ...item, image } : item;
  }), [inventoryItems, communityImages, getImageForCard]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return enrichedItems.filter(item => {
      if (filterGraded === "graded" && !item.isGraded) return false;
      if (filterGraded === "ungraded" && item.isGraded) return false;
      return !term || [item.name, item.set, item.number].some(value => String(value || "").toLowerCase().includes(term));
    });
  }, [enrichedItems, searchTerm, filterGraded]);

  const sortedItems = useMemo(() => [...filteredItems].sort((a, b) => {
    if (sortBy === "set") return (a.set || "").localeCompare(b.set || "") || (a.name || "").localeCompare(b.name || "");
    if (sortBy === "dateAdded") return (b.addedAt || 0) - (a.addedAt || 0);
    if (sortBy === "price" || sortBy === "priceAsc") {
      const difference = getDisplayPrice(a, currency, vendorRoundUpPrices) - getDisplayPrice(b, currency, vendorRoundUpPrices);
      return (sortBy === "priceAsc" ? difference : -difference) || (a.name || "").localeCompare(b.name || "");
    }
    return (a.name || "").localeCompare(b.name || "");
  }), [filteredItems, sortBy, vendorRoundUpPrices, currency]);

  const stats = useMemo(() => inventoryItems.reduce((result, item) => {
    const quantity = item.quantity || 1;
    result.count += quantity;
    if (item.isGraded) result.gradedCount += quantity;
    if (isNewCard(item)) result.newCount += quantity;
    return result;
  }, { count: 0, gradedCount: 0, newCount: 0 }), [inventoryItems]);

  const hasFilters = Boolean(searchTerm.trim()) || filterGraded !== "all";
  const clearFilters = () => { setSearchTerm(""); setFilterGraded("all"); };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-[1200px] items-center justify-center gap-3 px-4 text-slate-600" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading inventory…
      </div>
    );
  }

  if (!inventoryUserId || loadError || !inventoryAvailable) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <Store className="mx-auto mb-4 h-10 w-10 text-slate-500" aria-hidden="true" />
          <h1 className="text-xl font-extrabold text-slate-950">
            {!inventoryUserId ? "Inventory link missing" : loadError ? "Inventory could not be loaded" : "Inventory unavailable"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            {!inventoryUserId ? "Ask the seller for their inventory sharing link." : loadError ? "Please try again to load the seller's cards." : "This inventory is no longer shared, or the link is unavailable. Ask the seller for an updated link."}
          </p>
          {loadError && <Button className="mt-5 min-h-11" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Try again</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="shared-inventory-page min-h-screen bg-background pb-10">
      <div className="mx-auto max-w-[1200px] px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-7">
        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white" aria-labelledby="seller-name">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4 sm:gap-5 sm:p-6">
            {vendorPhoto ? (
              <img src={vendorPhoto} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-white/20 object-cover sm:h-16 sm:w-16 sm:rounded-2xl" onError={() => setVendorPhoto("")} />
            ) : (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 sm:h-16 sm:w-16 sm:rounded-2xl">
                <Store className="h-6 w-6 text-amber-300 sm:h-8 sm:w-8" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Cards for sale</p>
              <h1 id="seller-name" className="mt-1 break-words text-xl font-extrabold tracking-tight sm:text-3xl">{vendorName}</h1>
              {vendorCountry && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-300 sm:text-sm"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{vendorCountry}</p>}
            </div>
            {!user && (
              <Button variant="secondary" aria-label="Sign in" className="min-h-11 w-11 px-0 sm:w-auto sm:px-4" onClick={() => setLoginModalOpen(true)}>
                <LogIn className="h-4 w-4 sm:mr-2" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Sign in</span>
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-3 border-t border-white/10 bg-white/5 px-1 py-3 sm:px-5 sm:py-4">
            <div className="px-3">
              <dt className="text-[11px] leading-4 text-slate-300 sm:text-xs sm:leading-5">Cards available</dt>
              <dd className="mt-1 text-lg font-extrabold sm:text-2xl">{stats.count}</dd>
            </div>
            <div className="border-l border-white/10 px-3">
              <dt className="text-[11px] leading-4 text-slate-300 sm:text-xs sm:leading-5">Graded</dt>
              <dd className="mt-1 text-lg font-extrabold sm:text-2xl">{stats.gradedCount}</dd>
            </div>
            <div className="border-l border-white/10 px-3">
              <dt className="text-[11px] leading-4 text-slate-300 sm:text-xs sm:leading-5">Added in 14 days</dt>
              <dd className="mt-1 text-lg font-extrabold text-amber-300 sm:text-2xl">{stats.newCount}</dd>
            </div>
          </dl>
        </section>
      </div>

      {inventoryItems.length > 0 && (
        <div className="sticky top-[73px] z-20 border-y border-border bg-card/95 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-2 px-4 py-3 sm:gap-3 sm:px-6 md:grid-cols-[minmax(0,1fr)_180px_220px]">
            <div className="col-span-2 md:col-span-1">
              <label htmlFor="inventory-search" className="mb-1.5 block text-xs font-bold text-slate-600">Search cards</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <Input id="inventory-search" type="search" placeholder="Name, set, or card number" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} className="border-slate-300 bg-white pl-9 pr-11 [&::-webkit-search-cancel-button]:appearance-none" />
                {searchTerm && <button type="button" aria-label="Clear search" onClick={() => setSearchTerm("")} className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-r-xl text-slate-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"><X className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor="inventory-type" className="mb-1.5 block text-xs font-bold text-slate-600">Card type</label>
              <div className="relative">
                <select id="inventory-type" value={filterGraded} onChange={event => setFilterGraded(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                  <option value="all">All cards</option>
                  <option value="graded">Graded</option>
                  <option value="ungraded">Ungraded</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor="inventory-sort" className="mb-1.5 block text-xs font-bold text-slate-600">Sort by</label>
              <div className="relative">
                <select id="inventory-sort" value={sortBy} onChange={event => setSortBy(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                  <option value="name">Name: A to Z</option>
                  <option value="set">Set: A to Z</option>
                  <option value="priceAsc">Price: low to high</option>
                  <option value="price">Price: high to low</option>
                  <option value="dateAdded">Newest added</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6" aria-labelledby="browse-cards">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="browse-cards" className="text-xl font-extrabold text-slate-950">Browse cards</h2>
            <p className="mt-1 text-sm text-slate-600" role="status" aria-live="polite" aria-atomic="true">
              {hasFilters ? `${sortedItems.length} of ${inventoryItems.length} listings` : `${inventoryItems.length} listing${inventoryItems.length === 1 ? "" : "s"}`} · Prices in {currency}
            </p>
          </div>
          {hasFilters && <Button variant="outline" className="min-h-11" onClick={clearFilters}><X className="mr-1.5 h-4 w-4" aria-hidden="true" />Clear filters</Button>}
        </div>

        {sortedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
            <Search className="mx-auto mb-4 h-9 w-9 text-slate-400" aria-hidden="true" />
            <h3 className="text-lg font-extrabold text-slate-950">{inventoryItems.length ? "No matching cards" : "No cards listed yet"}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{inventoryItems.length ? "Try another name, set, or card number, or clear your filters." : "Check back later for cards from this seller."}</p>
            {hasFilters && <Button className="mt-5 min-h-11" onClick={clearFilters}>Show all cards</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {sortedItems.map(item => <InventoryCard key={item.entryId} item={item} currency={currency} roundUp={vendorRoundUpPrices} />)}
          </div>
        )}
      </section>

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onGoogleLogin={authHandlers?.onGoogleLogin}
        onEmailSignUp={authHandlers?.onEmailSignUp}
        onEmailLogin={authHandlers?.onEmailLogin}
        onPasswordReset={authHandlers?.onPasswordReset}
      />
    </div>
  );
}
