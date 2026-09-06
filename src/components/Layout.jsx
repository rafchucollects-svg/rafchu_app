import { hasVendorAccess as canUseVendorTools } from "@/utils/vendorAccess";
import { createElement, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  FileText,
  Heart,
  Image,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { OnboardingModal } from "./OnboardingModal";
import { VendorAccessRequestModal } from "./VendorAccessRequestModal";
import { FeedbackModal } from "./FeedbackModal";
import { LoginModal } from "./LoginModal";

const collectorNavigation = [
  { label: "Card search", to: "/search", icon: Search },
  { label: "My collection", to: "/collector/collection", icon: Package },
  { label: "Wishlist", to: "/collector/wishlist", icon: Heart },
  { label: "Marketplace", to: "/collector/marketplace", icon: ShoppingBag },
  { label: "Trade binder", to: "/collector/trade-binder", icon: Package },
  { label: "Insights", to: "/collector/insights", icon: TrendingUp },
];

const connectionNavigation = [
  { label: "Messages", to: "/collector/messages", icon: MessageCircle },
];

const vendorNavigation = [
  { label: "Inventory", to: "/vendor/inventory", icon: Store },
  { label: "Vendor insights", to: "/vendor/insights", icon: TrendingUp },
  { label: "Wishlist insights", to: "/vendor/wishlist-insights", icon: Heart },
  { label: "Deal calculator", to: "/vendor/deal-calculator", icon: Sparkles },
  { label: "Transaction log", to: "/vendor/transaction-log", icon: Receipt },
  { label: "Transaction summary", to: "/vendor/transaction-summary", icon: FileText },
  { label: "Expenses", to: "/vendor/expenses", icon: Receipt },
  { label: "Tax reporting", to: "/vendor/tax-reporting", icon: FileText },
  { label: "Story sale", to: "/vendor/story-sale", icon: Image },
];

export function Layout({ onGoogleLogin, onEmailSignUp, onEmailLogin, onPasswordReset, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(true);
  const [vendorCtaDismissed, setVendorCtaDismissed] = useState(false);
  const {
    user,
    userProfile,
    needsOnboarding,
    setNeedsOnboarding,
    setUserProfile,
    quickAddFeedback,
    vendorRequestModalOpen,
    setVendorRequestModalOpen,
    feedbackModalOpen,
    setFeedbackModalOpen,
    setCurrentPath,
    marketSource,
    currency,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [saveState, setSaveState] = useState("");
  useEffect(() => {
    const update = event => setSaveState(event.detail);
    const shortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); navigate("/search"); }
    };
    window.addEventListener("rafchu:save-state", update);
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("rafchu:save-state", update); window.removeEventListener("keydown", shortcut); };
  }, [navigate]);

  const isSharedView = location.search.includes("inventory=") || location.search.includes("collection=");
  const hasVendorAccess = canUseVendorTools(userProfile);

  useEffect(() => {
    if (setCurrentPath) setCurrentPath(location.pathname);
    setDrawerOpen(false);
  }, [location.pathname, setCurrentPath]);

  useEffect(() => {
    setComingSoonVisible(localStorage.getItem("comingSoonBannerDismissed") !== "true");
    setVendorCtaDismissed(localStorage.getItem("vendorCtaDismissed") === "true");
  }, []);

  useEffect(() => {
    const openLogin = () => setLoginModalOpen(true);
    window.addEventListener("rafchu:open-login", openLogin);
    return () => window.removeEventListener("rafchu:open-login", openLogin);
  }, []);

  const dismissComingSoon = () => {
    setComingSoonVisible(false);
    localStorage.setItem("comingSoonBannerDismissed", "true");
  };

  const dismissVendorCta = () => {
    setVendorCtaDismissed(true);
    localStorage.setItem("vendorCtaDismissed", "true");
  };

  const isActive = (path) => {
    if (path === "/search") return location.pathname === path || location.pathname === "/collector/search";
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const handleOnboardingComplete = (profile) => {
    setUserProfile(profile);
    setNeedsOnboarding(false);
  };

  const renderNavGroup = (label, items) => (
    <div className="space-y-1">
      <div className="px-3 pb-1 pt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      {items.map(({ label: itemLabel, to, icon }) => (
        <Link
          key={to}
          to={to}
          className={`group flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-all ${
            isActive(to)
              ? "border-amber-300/80 bg-amber-100/80 text-foreground shadow-sm"
              : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
          }`}
        >
          {createElement(icon, { className: `h-[18px] w-[18px] ${isActive(to) ? "text-amber-700" : "group-hover:text-foreground"}` })}
          <span>{itemLabel}</span>
          {isActive(to) && <ChevronRight className="ml-auto h-4 w-4 text-amber-700" />}
        </Link>
      ))}
    </div>
  );

  const navigationContent = (
    <>
      {renderNavGroup("Collect", collectorNavigation)}
      {renderNavGroup("Connect", connectionNavigation)}

      {hasVendorAccess && <>
        {renderNavGroup("Inventory", vendorNavigation.slice(0,3))}
        {renderNavGroup("Deals", vendorNavigation.slice(3,6))}
        {renderNavGroup("Accounting", vendorNavigation.slice(6,8))}
        {renderNavGroup("Share", vendorNavigation.slice(8))}
      </>}

      {!hasVendorAccess && !vendorCtaDismissed && (
        <div className="relative mx-1 mt-5 shrink-0 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <button
            onClick={dismissVendorCta}
            className="absolute right-2 top-2 rounded-lg p-1 text-emerald-800 hover:bg-emerald-100"
            aria-label="Dismiss vendor invitation"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-white shadow-sm">
            <Store className="h-4 w-4" />
          </div>
          <h3 className="pr-5 text-sm font-extrabold">Selling cards too?</h3>
          <p className="mt-1 text-xs leading-5 text-emerald-800">Unlock inventory, deal, and transaction tools.</p>
          <button
            onClick={() => {
              setDrawerOpen(false);
              setVendorRequestModalOpen(true);
            }}
            className="mt-3 w-full rounded-xl bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-900"
          >
            Request vendor access
          </button>
        </div>
      )}

      {comingSoonVisible && (
        <div className="relative mx-1 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <button
            onClick={dismissComingSoon}
            className="absolute right-2 top-2 rounded-lg p-1 text-amber-800 hover:bg-amber-100"
            aria-label="Dismiss coming soon note"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <Sparkles className="h-4 w-4 text-amber-700" />
            Find your exact printing
          </div>
          <p className="mt-2 pr-2 text-[11px] leading-4 text-amber-800">Search English and Japanese cards. Check the set, number, condition, and grade before adding.</p>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {user && needsOnboarding && (
        <OnboardingModal user={user} onComplete={handleOnboardingComplete} />
      )}

      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-xl">
        <div className="grid h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 lg:grid-cols-[224px_minmax(260px,620px)_minmax(220px,1fr)] lg:px-6">
          <div className="flex items-center gap-3">
            {!isSharedView && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Rafchu home">
              <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-slate-950 bg-amber-300 shadow-[3px_3px_0_#0f172a]">
                <img
                  src="/rafchu-logo.png"
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              </div>
              <div className="hidden min-w-0 sm:block">
                <div className="truncate text-lg font-extrabold tracking-[-0.04em]">Rafchu</div>
                <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Card command center</div>
              </div>
            </Link>
          </div>

          {!isSharedView ? (
            <Link
              to="/search"
              className="hidden h-11 items-center gap-3 rounded-xl border border-border bg-muted/70 px-4 text-sm text-muted-foreground shadow-inner transition hover:border-amber-300 hover:bg-card md:flex"
            >
              <Search className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">Search cards, sets, and numbers…</span>
              <span className="rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-bold">⌘ K</span>
            </Link>
          ) : <div />}

          <div className="flex items-center justify-end gap-2">
            <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{saveState}</span>
            {!isSharedView && (
              <div className="hidden rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground xl:block">
                {(marketSource === "tcg" ? "TCGPlayer" : "CardMarket")} · {currency || "USD"}
              </div>
            )}
            {!isSharedView && user && (
              <>
                <Link to="/collector/messages" aria-label="Messages">
                  <Button variant="ghost" size="icon"><MessageCircle className="h-4 w-4" /></Button>
                </Link>
                <Link to="/user/profile" aria-label="Profile and settings">
                  <Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
                </Link>
              </>
            )}
            {!isSharedView && (user ? (
              <Button variant="outline" size="sm" onClick={onLogout} aria-label="Sign out">
                <LogOut className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setLoginModalOpen(true)} className="bg-slate-950 text-white hover:bg-slate-800">
                <LogIn className="mr-1.5 h-4 w-4" /> Sign in
              </Button>
            ))}
          </div>
        </div>
      </header>

      {isSharedView ? (
        <main><Outlet /></main>
      ) : (
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] flex-col overflow-y-auto border-r border-border/80 bg-card px-4 pb-5 lg:flex">
            {navigationContent}
            <div className="mt-auto space-y-1 pt-5">
              <Link to="/user/profile" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <User className="h-[18px] w-[18px]" /> Profile & settings
              </Link>
              <button
                onClick={() => setFeedbackModalOpen(true)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <MessageCircle className="h-[18px] w-[18px]" /> Send feedback
              </button>
            </div>
          </aside>

          <main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
            <Outlet />
          </main>
        </div>
      )}

      {!isSharedView && (
        <nav className="fixed inset-x-3 bottom-3 z-20 grid h-16 grid-cols-4 rounded-2xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl lg:hidden" aria-label="Primary navigation">
          {(hasVendorAccess ? [
            { label: "Inventory", to: "/vendor/inventory", icon: Store },
            { label: "Deals", to: "/vendor/deal-calculator", icon: Sparkles },
            { label: "Search", to: "/search", icon: Search },
            { label: "Expenses", to: "/vendor/expenses", icon: Receipt },
          ] : [
            { label: "Search", to: "/search", icon: Search },
            { label: "Collection", to: "/collector/collection", icon: Package },
            { label: "Market", to: "/collector/marketplace", icon: ShoppingBag },
            { label: "Messages", to: "/collector/messages", icon: MessageCircle },
          ]).map(({ label, to, icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition ${isActive(to) ? "bg-amber-100 text-amber-950" : "text-muted-foreground"}`}
            >
              {createElement(icon, { className: "h-[18px] w-[18px]" })}{label}
            </Link>
          ))}
        </nav>
      )}

      <AnimatePresence>
        {drawerOpen && (
          <>
            <Motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
            />
            <Motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 27, stiffness: 240 }}
              className="fixed inset-y-0 left-0 z-50 w-[300px] overflow-y-auto border-r border-border bg-card px-4 pb-6 shadow-2xl lg:hidden"
            >
              <div className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b bg-card">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl border-2 border-slate-950 bg-amber-300 text-lg font-black shadow-[2px_2px_0_#0f172a]">ϟ</div>
                  <div><div className="font-extrabold">Rafchu</div><div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Navigation</div></div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></Button>
              </div>
              {navigationContent}
              <div className="mt-5 border-t pt-4">
                <button onClick={() => setFeedbackModalOpen(true)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
                  <MessageCircle className="h-[18px] w-[18px]" /> Send feedback
                </button>
              </div>
            </Motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {quickAddFeedback && (
          <Motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="fixed bottom-24 right-4 z-50 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl lg:bottom-5"
          >
            {quickAddFeedback}
          </Motion.div>
        )}
      </AnimatePresence>

      <VendorAccessRequestModal isOpen={vendorRequestModalOpen} onClose={() => setVendorRequestModalOpen(false)} />
      <FeedbackModal isOpen={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} />
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onGoogleLogin={onGoogleLogin}
        onEmailSignUp={onEmailSignUp}
        onEmailLogin={onEmailLogin}
        onPasswordReset={onPasswordReset}
      />
    </div>
  );
}
