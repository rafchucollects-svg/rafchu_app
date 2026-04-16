import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { VendorAccessGuard } from "./components/VendorAccessGuard";
import { HomeWrapper } from "./pages/HomeWrapper";

/**
 * Application Router Configuration
 *
 * Pages are lazy-loaded with React.lazy() so each route ships as its own
 * chunk. Each route element is wrapped in a Suspense + ErrorBoundary so a
 * failure or slow load on one page doesn't affect the rest of the app.
 *
 * HomeWrapper and Layout stay eager because they're part of the shell.
 */

// Named-export lazy loader helper (all page components use named exports)
const lazyPage = (loader, exportName) =>
  lazy(() => loader().then((m) => ({ default: m[exportName] })));

// Lazy-loaded pages
const UserProfile = lazyPage(() => import("./pages/UserProfile"), "UserProfile");
const Admin = lazyPage(() => import("./pages/Admin"), "Admin");
const AdminImageReview = lazyPage(() => import("./pages/AdminImageReview"), "AdminImageReview");
const CardSearch = lazyPage(() => import("./pages/CardSearch"), "CardSearch");
const UnifiedCardSearch = lazyPage(() => import("./pages/UnifiedCardSearch"), "UnifiedCardSearch");
const MyCollection = lazyPage(() => import("./pages/MyCollection"), "MyCollection");
const Wishlist = lazyPage(() => import("./pages/Wishlist"), "Wishlist");
const CollectionInsights = lazyPage(() => import("./pages/CollectionInsights"), "CollectionInsights");
const TradeBinder = lazyPage(() => import("./pages/TradeBinder"), "TradeBinder");
const Marketplace = lazyPage(() => import("./pages/Marketplace"), "Marketplace");
const VendorProfile = lazyPage(() => import("./pages/VendorProfile"), "VendorProfile");
const Messages = lazyPage(() => import("./pages/Messages"), "Messages");
const MyInventory = lazyPage(() => import("./pages/MyInventory"), "MyInventory");
const InventoryInsights = lazyPage(() => import("./pages/InventoryInsights"), "InventoryInsights");
const WishlistInsights = lazyPage(() => import("./pages/WishlistInsights"), "WishlistInsights");
const TradeCalculator = lazyPage(() => import("./pages/TradeCalculator"), "TradeCalculator");
const BuyCalculator = lazyPage(() => import("./pages/BuyCalculator"), "BuyCalculator");
const TransactionLog = lazyPage(() => import("./pages/TransactionLog"), "TransactionLog");
const TransactionSummary = lazyPage(() => import("./pages/TransactionSummary"), "TransactionSummary");
const TaxReporting = lazyPage(() => import("./pages/TaxReporting"), "TaxReporting");
const ExpenseTracker = lazyPage(() => import("./pages/ExpenseTracker"), "ExpenseTracker");
const SharedTradeOffer = lazyPage(() => import("./pages/SharedTradeOffer"), "SharedTradeOffer");
const StorySaleGenerator = lazyPage(() => import("./pages/StorySaleGenerator"), "StorySaleGenerator");

// Minimal loading UI shown while a route chunk is fetched
function RouteLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

// Wrap each lazy route in its own ErrorBoundary + Suspense so a failure or
// slow load on one page doesn't nuke the shell or the other routes.
function Route({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function createAppRouter(authHandlers) {
  const { onGoogleLogin, onEmailSignUp, onEmailLogin, onPasswordReset, onLogout } = authHandlers;

  return createBrowserRouter([
    {
      path: "/",
      element: (
        <Layout
          onGoogleLogin={onGoogleLogin}
          onEmailSignUp={onEmailSignUp}
          onEmailLogin={onEmailLogin}
          onPasswordReset={onPasswordReset}
          onLogout={onLogout}
        />
      ),
      errorElement: (
        <ErrorBoundary>
          <div className="min-h-screen flex items-center justify-center">
            <p>Something went wrong. Please try refreshing the page.</p>
          </div>
        </ErrorBoundary>
      ),
      children: [
        {
          index: true,
          element: <HomeWrapper />,
        },
        // Home route (for shared views)
        {
          path: "home",
          element: <HomeWrapper />,
        },
        // Shared Trade Offer (public view)
        {
          path: "trade-offer",
          element: <Route><SharedTradeOffer /></Route>,
        },
        // My User Routes
        {
          path: "user",
          children: [
            {
              path: "profile",
              element: <Route><UserProfile /></Route>,
            },
            {
              index: true,
              element: <Navigate to="/user/profile" replace />,
            },
          ],
        },
        // Admin Routes
        {
          path: "admin",
          element: <Route><Admin /></Route>,
        },
        {
          path: "admin/image-reviews",
          element: <Route><AdminImageReview /></Route>,
        },
        // Unified Card Search
        {
          path: "search",
          element: <Route><UnifiedCardSearch /></Route>,
        },
        // Collector Toolkit Routes
        {
          path: "collector",
          children: [
            {
              path: "search",
              element: <Route><CardSearch mode="collector" /></Route>,
            },
            {
              path: "collection",
              element: <Route><MyCollection /></Route>,
            },
            {
              path: "wishlist",
              element: <Route><Wishlist /></Route>,
            },
            {
              path: "insights",
              element: <Route><CollectionInsights /></Route>,
            },
            {
              path: "trade-binder",
              element: <Route><TradeBinder /></Route>,
            },
            {
              path: "marketplace",
              element: <Route><Marketplace /></Route>,
            },
            {
              path: "vendor-profile",
              element: <Route><VendorProfile /></Route>,
            },
            {
              path: "messages",
              element: <Route><Messages /></Route>,
            },
            {
              index: true,
              element: <Navigate to="/collector/search" replace />,
            },
          ],
        },
        // Vendor Toolkit Routes (Protected)
        {
          path: "vendor",
          children: [
            {
              path: "search",
              element: <Route><VendorAccessGuard><CardSearch mode="vendor" /></VendorAccessGuard></Route>,
            },
            {
              path: "inventory",
              element: <Route><VendorAccessGuard><MyInventory /></VendorAccessGuard></Route>,
            },
            {
              path: "insights",
              element: <Route><VendorAccessGuard><InventoryInsights /></VendorAccessGuard></Route>,
            },
            {
              path: "wishlist-insights",
              element: <Route><VendorAccessGuard><WishlistInsights /></VendorAccessGuard></Route>,
            },
            {
              path: "trade-calculator",
              element: <Route><VendorAccessGuard><TradeCalculator /></VendorAccessGuard></Route>,
            },
            {
              path: "buy-calculator",
              element: <Route><VendorAccessGuard><BuyCalculator /></VendorAccessGuard></Route>,
            },
            {
              path: "transaction-log",
              element: <Route><VendorAccessGuard><TransactionLog /></VendorAccessGuard></Route>,
            },
            {
              path: "transaction-summary",
              element: <Route><VendorAccessGuard><TransactionSummary /></VendorAccessGuard></Route>,
            },
            {
              path: "tax-reporting",
              element: <Route><VendorAccessGuard><TaxReporting /></VendorAccessGuard></Route>,
            },
            {
              path: "expenses",
              element: <Route><VendorAccessGuard><ExpenseTracker /></VendorAccessGuard></Route>,
            },
            {
              path: "story-sale",
              element: <Route><VendorAccessGuard><StorySaleGenerator /></VendorAccessGuard></Route>,
            },
            {
              index: true,
              element: <Navigate to="/vendor/search" replace />,
            },
          ],
        },
        // Catch-all redirect
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },
  ]);
}

export function AppRouter(authHandlers) {
  const router = createAppRouter(authHandlers);
  return <RouterProvider router={router} />;
}
