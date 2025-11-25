import { useSearchParams, Navigate } from "react-router-dom";
import { SharedInventory } from "./SharedInventory";
import { SharedCollection } from "./SharedCollection";

/**
 * HomeWrapper - Handles routing for shared views via query parameters
 * - ?inventory={userId} -> SharedInventory
 * - ?collection={userId} -> SharedCollection
 * - Otherwise -> Redirect to Marketplace
 */

export function HomeWrapper() {
  const [searchParams] = useSearchParams();
  
  const inventoryId = searchParams.get("inventory");
  const collectionId = searchParams.get("collection");
  
  if (inventoryId) {
    return <SharedInventory />;
  }
  
  if (collectionId) {
    return <SharedCollection />;
  }
  
  // Default to Marketplace
  return <Navigate to="/collector/marketplace" replace />;
}

