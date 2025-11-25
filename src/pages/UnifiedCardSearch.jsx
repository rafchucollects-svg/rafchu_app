import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Store } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { CardSearch } from "./CardSearch";

/**
 * Unified Card Search Page
 * Shows a single card search with mode selector for users with vendor access
 */

export function UnifiedCardSearch() {
  const { userProfile } = useApp();
  const [mode, setMode] = useState("collector");
  
  // Check if user has vendor access
  const hasVendorAccess = userProfile?.vendorAccess?.enabled || userProfile?.isVendor;
  
  // If user doesn't have vendor access, always use collector mode
  useEffect(() => {
    if (!hasVendorAccess && mode === "vendor") {
      setMode("collector");
    }
  }, [hasVendorAccess, mode]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Mode Selector - Only show if user has vendor access */}
      {hasVendorAccess && (
        <Card className="rounded-2xl p-2 shadow mb-4">
          <CardContent className="p-0">
            <div className="flex gap-2">
              <Button
                onClick={() => setMode("collector")}
                variant={mode === "collector" ? "default" : "outline"}
                className={`flex-1 flex items-center justify-center gap-2 transition-all ${
                  mode === "collector" 
                    ? "bg-purple-600 hover:bg-purple-700 text-white" 
                    : "hover:bg-purple-50"
                }`}
              >
                <Package className="h-4 w-4" />
                <span className="font-semibold">Collector Mode</span>
              </Button>
              <Button
                onClick={() => setMode("vendor")}
                variant={mode === "vendor" ? "default" : "outline"}
                className={`flex-1 flex items-center justify-center gap-2 transition-all ${
                  mode === "vendor" 
                    ? "bg-green-600 hover:bg-green-700 text-white" 
                    : "hover:bg-green-50"
                }`}
              >
                <Store className="h-4 w-4" />
                <span className="font-semibold">Vendor Mode</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Card Search Component */}
      <CardSearch mode={mode} />
    </div>
  );
}










