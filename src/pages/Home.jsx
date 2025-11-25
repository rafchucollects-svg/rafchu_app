import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Store, User, ArrowRight } from "lucide-react";
import { useApp } from "@/contexts/AppContext";

/**
 * Home / Landing Page
 * Provides quick access to all three main sections
 */

export function Home() {
  const { user } = useApp();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-4xl font-bold mb-4">Welcome to PokéValue</h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-md">
          Your complete solution for Pokémon TCG card valuation, collection management,
          and vendor tools.
        </p>
        <p className="text-sm text-muted-foreground">
          Please sign in using the button in the top right to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user.displayName || 'Trainer'}!</h1>
        <p className="text-muted-foreground">
          Choose a toolkit to get started with card management and valuation.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* My User */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold">My User</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Manage your profile, sharing settings, and account preferences.
            </p>
            <Link to="/user/profile">
              <Button variant="outline" className="w-full">
                Go to Profile
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Collector Toolkit */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Package className="h-6 w-6 text-purple-600" />
              </div>
              <h2 className="text-xl font-bold">Collector Toolkit</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Track your collection, manage wishlists, and organize trade binders.
            </p>
            <Link to="/collector/search">
              <Button variant="outline" className="w-full">
                Open Toolkit
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Vendor Toolkit */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Store className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-xl font-bold">Vendor Toolkit</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Manage inventory, calculate trades, track transactions, and more.
            </p>
            <Link to="/vendor/search">
              <Button variant="outline" className="w-full">
                Open Toolkit
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardContent className="p-6">
          <h3 className="font-bold mb-2">Quick Start Guide</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• <strong>Card Search:</strong> Find any Pokémon card and view real-time pricing from CardMarket</li>
            <li>• <strong>Collections & Inventory:</strong> Track cards you own with condition tracking and custom pricing</li>
            <li>• <strong>Wishlists:</strong> Keep track of cards you want to acquire</li>
            <li>• <strong>Trade Calculator:</strong> Calculate fair trade values with customizable percentages</li>
            <li>• <strong>Buy Calculator:</strong> Make purchase offers and track acquisitions</li>
            <li>• <strong>Insights:</strong> Analyze your collection value, rarity distribution, and trends</li>
            <li>• <strong>Transaction Logs:</strong> Keep detailed records of all trades and purchases</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

