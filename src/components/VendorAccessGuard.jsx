import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Crown, CheckCircle, XCircle } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

/**
 * Vendor Access Guard
 * Protects vendor-only routes and shows upgrade prompts
 */

export function VendorAccessGuard({ children }) {
  const { user, userProfile } = useApp();
  const navigate = useNavigate();

  // If no user, redirect to home
  useEffect(() => {
    if (!user) {
      navigate("/");
    }
  }, [user, navigate]);

  if (!user) {
    return null;
  }

  // Wait for userProfile to load
  if (userProfile === null || userProfile === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user has vendor access
  const hasVendorAccess = userProfile?.vendorAccess?.enabled || userProfile?.isVendor;
  const subscriptionStatus = userProfile?.vendorAccess?.status || "none";

  // If user has access, render children
  if (hasVendorAccess && subscriptionStatus === "active") {
    return children;
  }
  
  // Also allow if isVendor is true (backward compatibility)
  if (userProfile?.isVendor) {
    return children;
  }

  // Show upgrade prompt
  return (
    <div className="max-w-4xl mx-auto py-8">
      <Card className="border-2 border-primary/20">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Vendor Toolkit Access Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-muted-foreground">
            The Vendor Toolkit is a premium feature designed for card sellers and shop owners.
            Upgrade your account to unlock powerful inventory and sales management tools.
          </p>

          {/* Feature List */}
          <div className="bg-muted/30 rounded-lg p-6 space-y-3">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-600" />
              Vendor Toolkit Includes:
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Full inventory management with unlimited items</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Advanced insights and analytics</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Trade & buy calculators</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Transaction logging and reporting</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Wishlist insights to see what customers want</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Shareable inventory for customers</span>
              </div>
            </div>
          </div>

          {/* Current Status */}
          {subscriptionStatus === "expired" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">Subscription Expired</p>
                <p className="text-sm text-red-700">Your vendor access has expired. Renew to continue using vendor features.</p>
              </div>
            </div>
          )}

          {/* Contact Info */}
          <div className="text-center space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">Contact us to get vendor access:</p>
              <p className="font-mono bg-muted px-4 py-2 rounded inline-block">
                {user.email}
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => navigate("/collector/search")}
              >
                Go to Card Search
              </Button>
              <Button
                variant="default"
                onClick={() => window.location.href = `mailto:support@rafchu.com?subject=Vendor Access Request&body=User ID: ${user.uid}%0AEmail: ${user.email}%0A%0AI would like to request vendor access.`}
              >
                Contact Us
              </Button>
            </div>
          </div>

          {/* Pricing Preview (Optional) */}
          <div className="border-t pt-6 text-center text-sm text-muted-foreground">
            <p>Vendor Toolkit pricing starts at $19.99/month</p>
            <p className="text-xs mt-1">Payment processing coming soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

