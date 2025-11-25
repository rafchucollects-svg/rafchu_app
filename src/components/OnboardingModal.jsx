import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserCircle, MapPin } from "lucide-react";

/**
 * Onboarding Modal for First-Time Users
 * Collects username and country information
 */

// European countries (for CardMarket default)
const EUROPEAN_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", 
  "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", 
  "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", 
  "CH", "GB", "AL", "AD", "AM", "BY", "BA", "GE", "MD", "MC", 
  "ME", "MK", "RU", "SM", "RS", "UA", "VA"
]);

// All countries worldwide
const ALL_COUNTRIES = [
  // Europe
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "GB", name: "United Kingdom" },
  // Americas
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "VE", name: "Venezuela" },
  // Asia
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "PH", name: "Philippines" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "TW", name: "Taiwan" },
  { code: "HK", name: "Hong Kong" },
  // Oceania
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  // Middle East
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  // Africa
  { code: "ZA", name: "South Africa" },
  { code: "EG", name: "Egypt" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  // Other
  { code: "OTHER", name: "Other" },
];

export function OnboardingModal({ user, onComplete }) {
  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("");
  const [isVendor, setIsVendor] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    if (!country) {
      setError("Please select your country");
      return;
    }

    setLoading(true);

    try {
      // Save user profile to Firestore
      const { doc, setDoc } = await import("firebase/firestore");
      const { getFirestore } = await import("firebase/firestore");
      const db = getFirestore();
      
      // Determine default market source based on country
      const isEuropeanCountry = EUROPEAN_COUNTRY_CODES.has(country);
      const defaultMarketSource = isEuropeanCountry ? "cardmarket" : "tcg";
      
      const userProfile = {
        username: username.trim(),
        country,
        isVendor,
        onboardingCompleted: true,
        createdAt: Date.now(),
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      };

      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, userProfile);
      
      // Set default market source in collector_collections if they're a collector
      const collectorRef = doc(db, "collector_collections", user.uid);
      await setDoc(collectorRef, { 
        marketSource: defaultMarketSource,
        currency: isEuropeanCountry ? "EUR" : "USD" 
      }, { merge: true });

      onComplete(userProfile);
    } catch (err) {
      console.error("Failed to save user profile:", err);
      setError("Failed to save profile. Please try again.");
      setLoading(false);
    }
  }, [username, country, isVendor, user, onComplete]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" style={{
      WebkitOverflowScrolling: 'touch',
    }}>
      <Card className="max-w-md w-full" style={{
        WebkitOverflowScrolling: 'touch',
      }}>
        <CardContent className="p-6">
          <div className="mb-6 text-center">
            <div className="flex justify-center mb-4">
              <UserCircle className="h-16 w-16 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to PokeApp!</h2>
            <p className="text-muted-foreground">
              Let's set up your profile to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-semibold mb-2">
                Username *
              </label>
              <Input
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                disabled={loading}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be visible to other users
              </p>
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-semibold mb-2">
                Country *
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select your country</option>
                  {ALL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Available worldwide 🌍
              </p>
            </div>

            {/* Vendor Toggle */}
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <input
                type="checkbox"
                id="isVendor"
                checked={isVendor}
                onChange={(e) => setIsVendor(e.target.checked)}
                disabled={loading}
                className="h-4 w-4"
              />
              <label htmlFor="isVendor" className="text-sm font-medium cursor-pointer flex-1">
                I'm a vendor/seller
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Setting up..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export { ALL_COUNTRIES, EUROPEAN_COUNTRY_CODES };

