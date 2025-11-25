import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { VendorAccessGuard } from "./components/VendorAccessGuard";
import { HomeWrapper } from "./pages/HomeWrapper";
import { UserProfile } from "./pages/UserProfile";
import { Admin } from "./pages/Admin";
import { AdminImageReview } from "./pages/AdminImageReview";
import { CardSearch } from "./pages/CardSearch";
import { UnifiedCardSearch } from "./pages/UnifiedCardSearch";
import { MyCollection } from "./pages/MyCollection";
import { Wishlist } from "./pages/Wishlist";
import { CollectionInsights } from "./pages/CollectionInsights";
import { TradeBinder } from "./pages/TradeBinder";
import { Marketplace } from "./pages/Marketplace";
import { VendorProfile } from "./pages/VendorProfile";
import { Messages } from "./pages/Messages";
import { MyInventory } from "./pages/MyInventory";
import { InventoryInsights } from "./pages/InventoryInsights";
import { WishlistInsights } from "./pages/WishlistInsights";
import { TradeCalculator } from "./pages/TradeCalculator";
import { BuyCalculator } from "./pages/BuyCalculator";
import { TransactionLog } from "./pages/TransactionLog";
import { TransactionSummary } from "./pages/TransactionSummary";

/**
 * Application Router Configuration
 * Defines all routes for the app with nested routing
 */

export function createAppRouter(authHandlers) {
  const { onGoogleLogin, onEmailSignUp, onEmailLogin, onPasswordReset, onLogout } = authHandlers;
  
  return createBrowserRouter([
    {
      path: "/",
      element: <Layout 
        onGoogleLogin={onGoogleLogin}
        onEmailSignUp={onEmailSignUp}
        onEmailLogin={onEmailLogin}
        onPasswordReset={onPasswordReset}
        onLogout={onLogout} 
      />,
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
        // My User Routes
        {
          path: "user",
          children: [
            {
              path: "profile",
              element: <UserProfile />,
            },
            {
              index: true,
              element: <Navigate to="/user/profile" replace />,
            },
          ],
        },
        // Admin Route
        {
          path: "admin",
          element: <Admin />,
        },
        {
          path: "admin/image-reviews",
          element: <AdminImageReview />,
        },
        // Unified Card Search
        {
          path: "search",
          element: <UnifiedCardSearch />,
        },
        // Collector Toolkit Routes
        {
          path: "collector",
          children: [
            {
              path: "search",
              element: <CardSearch mode="collector" />,
            },
            {
              path: "collection",
              element: <MyCollection />,
            },
            {
              path: "wishlist",
              element: <Wishlist />,
            },
            {
              path: "insights",
              element: <CollectionInsights />,
            },
            {
              path: "trade-binder",
              element: <TradeBinder />,
            },
            {
              path: "marketplace",
              element: <Marketplace />,
            },
            {
              path: "vendor-profile",
              element: <VendorProfile />,
            },
            {
              path: "messages",
              element: <Messages />,
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
              element: <VendorAccessGuard><CardSearch mode="vendor" /></VendorAccessGuard>,
            },
            {
              path: "inventory",
              element: <VendorAccessGuard><MyInventory /></VendorAccessGuard>,
            },
            {
              path: "insights",
              element: <VendorAccessGuard><InventoryInsights /></VendorAccessGuard>,
            },
            {
              path: "wishlist-insights",
              element: <VendorAccessGuard><WishlistInsights /></VendorAccessGuard>,
            },
            {
              path: "trade-calculator",
              element: <VendorAccessGuard><TradeCalculator /></VendorAccessGuard>,
            },
            {
              path: "buy-calculator",
              element: <VendorAccessGuard><BuyCalculator /></VendorAccessGuard>,
            },
            {
              path: "transaction-log",
              element: <VendorAccessGuard><TransactionLog /></VendorAccessGuard>,
            },
            {
              path: "transaction-summary",
              element: <VendorAccessGuard><TransactionSummary /></VendorAccessGuard>,
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

