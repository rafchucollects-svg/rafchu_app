import { useCallback, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User as UserIcon, Store, Settings, Instagram, Youtube, Upload, Camera, CheckCircle, XCircle, X } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { SUPPORTED_CURRENCIES } from "@/utils/cardHelpers";
import { setDoc, doc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * User Profile & Settings Page
 * Manages user profile, sharing settings, and data export
 */

export function UserProfile() {
  const {
    user,
    db,
    marketSource,
    setMarketSource,
    currency,
    setCurrency,
    secondaryCurrency,
    setSecondaryCurrency,
    triggerQuickAddFeedback,
    userProfile,
    setUserProfile,
    setVendorRequestModalOpen,
  } = useApp();

  const [instagramUrl, setInstagramUrl] = useState(userProfile?.socialLinks?.instagram || "");
  const [youtubeUrl, setYoutubeUrl] = useState(userProfile?.socialLinks?.youtube || "");
  const [vendorCtaDismissed, setVendorCtaDismissed] = useState(() => {
    return localStorage.getItem('vendorCtaDismissed') === 'true';
  });
  
  const dismissVendorCta = () => {
    setVendorCtaDismissed(true);
    localStorage.setItem('vendorCtaDismissed', 'true');
  };
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Vendor default percentages
  const [defaultTradePct, setDefaultTradePct] = useState(userProfile?.defaultTradePct || 90);
  const [defaultBuyPct, setDefaultBuyPct] = useState(userProfile?.defaultBuyPct || 70);

  const handleProfilePictureUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);
      
      // Upload to Firebase Storage
      const storage = getStorage();
      const storageRef = ref(storage, `profile-pictures/${user.uid}`);
      await uploadBytes(storageRef, file);
      
      // Get download URL
      const photoURL = await getDownloadURL(storageRef);
      
      // Update user profile
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { photoURL }, { merge: true });
      
      setUserProfile(prev => ({ ...prev, photoURL }));
      triggerQuickAddFeedback('Profile picture updated!');
    } catch (error) {
      console.error('Failed to upload profile picture:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [user, db, setUserProfile, triggerQuickAddFeedback]);

  const handleSocialLinkSave = useCallback(async (platform, url) => {
    if (!user || !db) return;
    try {
      const ref = doc(db, "users", user.uid);
      await setDoc(ref, { 
        socialLinks: {
          ...userProfile?.socialLinks,
          [platform]: url.trim()
        }
      }, { merge: true });
      
      setUserProfile(prev => ({
        ...prev,
        socialLinks: {
          ...prev?.socialLinks,
          [platform]: url.trim()
        }
      }));
      
      triggerQuickAddFeedback(`${platform} link ${url.trim() ? 'saved' : 'removed'}`);
    } catch (err) {
      console.error(`Failed to update ${platform} link`, err);
      alert(`Failed to update ${platform} link`);
    }
  }, [user, db, userProfile, setUserProfile, triggerQuickAddFeedback]);

  const handleMarketSourceChange = useCallback(async (source) => {
    if (!user || !db) return;
    setMarketSource(source);
    try {
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { marketSource: source }, { merge: true });
      triggerQuickAddFeedback(`Market source changed to ${source === "tcg" ? "TCGplayer" : "CardMarket"}`);
    } catch (err) {
      console.error("Failed to update market source", err);
      alert(`Failed to update market source: ${err?.message ?? "Please try again."}`);
    }
  }, [user, db, setMarketSource, triggerQuickAddFeedback]);

  const handleCurrencyChange = useCallback(async (newCurrency) => {
    if (!user || !db) return;
    setCurrency(newCurrency);
    try {
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { currency: newCurrency }, { merge: true });
      const currencyName = SUPPORTED_CURRENCIES.find(c => c.code === newCurrency)?.name || newCurrency;
      triggerQuickAddFeedback(`Currency changed to ${currencyName}`);
    } catch (err) {
      console.error("Failed to update currency", err);
      alert(`Failed to update currency: ${err?.message ?? "Please try again."}`);
    }
  }, [user, db, setCurrency, triggerQuickAddFeedback]);

  const handleSecondaryCurrencyChange = useCallback(async (newCurrency) => {
    if (!user || !db) return;
    setSecondaryCurrency(newCurrency);
    try {
      const ref = doc(db, "collector_collections", user.uid);
      await setDoc(ref, { secondaryCurrency: newCurrency }, { merge: true });
      if (newCurrency) {
        const currencyName = SUPPORTED_CURRENCIES.find(c => c.code === newCurrency)?.name || newCurrency;
        triggerQuickAddFeedback(`Secondary currency set to ${currencyName}`);
      } else {
        triggerQuickAddFeedback(`Secondary currency disabled`);
      }
    } catch (err) {
      console.error("Failed to update secondary currency", err);
      alert(`Failed to update secondary currency: ${err?.message ?? "Please try again."}`);
    }
  }, [user, db, setSecondaryCurrency, triggerQuickAddFeedback]);

  const handleDefaultPercentagesSave = useCallback(async () => {
    if (!user || !db) return;

    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        defaultTradePct,
        defaultBuyPct,
      }, { merge: true });

      setUserProfile(prev => ({
        ...prev,
        defaultTradePct,
        defaultBuyPct,
      }));

      triggerQuickAddFeedback("Default percentages saved");
    } catch (err) {
      console.error("Failed to save default percentages", err);
      alert(`Failed to save: ${err?.message ?? "Please try again."}`);
    }
  }, [user, db, defaultTradePct, defaultBuyPct, setUserProfile, triggerQuickAddFeedback]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <UserIcon className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Sign In Required</h1>
        <p className="text-muted-foreground">
          Please sign in to access your profile and settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Profile & Settings</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Info */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Profile Information
            </h2>
            
            <div className="space-y-3">
              {/* Profile Picture - Vendors Only */}
              {userProfile?.vendorAccess?.enabled && (
                <div className="pb-3 border-b">
                  <label className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3">
                    <Camera className="h-4 w-4" />
                    Profile Picture
                  </label>
                  <div className="flex items-center gap-4">
                    {(userProfile?.photoURL || user.photoURL) ? (
                      <img
                        src={userProfile?.photoURL || user.photoURL}
                        alt="Profile"
                        className="h-20 w-20 rounded-full object-cover border-2 border-primary"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                        <UserIcon className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePictureUpload}
                        className="hidden"
                      />
                      <Button
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {uploading ? 'Uploading...' : 'Upload Photo'}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Max 5MB • JPG, PNG, GIF
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Display Name</label>
                <div className="text-base">{user.displayName || "—"}</div>
              </div>
              
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Email</label>
                <div className="text-base">{user.email}</div>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground">User ID</label>
                <div className="text-xs font-mono text-muted-foreground">{user.uid}</div>
              </div>

              {/* Vendor Access Status (Read-Only) */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Vendor Toolkit Access
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Premium feature for card sellers and shop owners
                    </p>
                  </div>
                </div>
                {userProfile?.vendorAccess?.enabled ? (
                  <div className="p-3 rounded-lg border bg-green-50 border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-green-900 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Vendor Access Active
                        </div>
                        <div className="text-xs text-green-700 mt-1">
                          Tier: {userProfile.vendorAccess.tier?.toUpperCase() || "BASIC"} • 
                          Status: {userProfile.vendorAccess.status?.toUpperCase() || "ACTIVE"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Collector Account
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Contact us to request vendor access
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vendor Toolkit Promotion - Only show if user doesn't have vendor access */}
        {!userProfile?.vendorAccess?.enabled && !userProfile?.isVendor && !vendorCtaDismissed && (
          <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 relative">
            <button
              onClick={dismissVendorCta}
              className="absolute top-3 right-3 p-1 hover:bg-green-200 rounded-full transition-colors z-10"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4 text-green-700" />
            </button>
            <CardContent className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="bg-green-600 p-3 rounded-xl flex-shrink-0">
                  <Store className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-green-900 mb-2">
                    Unlock the Vendor Toolkit
                  </h2>
                  <p className="text-sm text-green-700">
                    Take your card business to the next level with professional tools designed for sellers and shop owners.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 mb-5">
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-green-900">Unlimited inventory management</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-green-900">Advanced analytics & insights</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-green-900">Trade & buy calculators</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-green-900">Transaction logging & reporting</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  size="default"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setVendorRequestModalOpen(true)}
                >
                  Request Early Access
                </Button>
                <Button 
                  variant="outline" 
                  size="default"
                  className="flex-1 border-green-600 text-green-700 hover:bg-green-100"
                  asChild
                >
                  <a href="/vendor/search">
                    Learn More
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Collection Settings */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Collection Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-muted-foreground block mb-2">
                  Market Source for Collection Value
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={marketSource === "tcg" ? "default" : "outline"}
                    onClick={() => handleMarketSourceChange("tcg")}
                    className="flex-1"
                  >
                    TCGplayer
                  </Button>
                  <Button
                    size="sm"
                    variant={marketSource === "cardmarket" ? "default" : "outline"}
                    onClick={() => handleMarketSourceChange("cardmarket")}
                    className="flex-1"
                  >
                    CardMarket
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This determines which market's prices are shown in your collection
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground block mb-2">
                  Display Currency
                </label>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={currency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                >
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  All prices will be displayed in this currency
                </p>
              </div>

              {/* Secondary Currency - Vendor Only */}
              {userProfile?.vendorAccess?.enabled && (
                <div>
                  <label className="text-sm font-semibold text-muted-foreground block mb-2">
                    Secondary Currency (Optional)
                  </label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={secondaryCurrency || ""}
                    onChange={(e) => handleSecondaryCurrencyChange(e.target.value || null)}
                  >
                    <option value="">None</option>
                    {SUPPORTED_CURRENCIES.filter(c => c.code !== currency).map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Show prices in two currencies (useful for international shows)
                  </p>
                </div>
              )}

              {/* Vendor Default Percentages */}
              {userProfile?.vendorAccess?.enabled && (
                <>
                  <div className="border-t pt-4">
                    <label className="text-sm font-semibold text-muted-foreground block mb-2">
                      Default Trade Percentage
                    </label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="40"
                        max="120"
                        value={defaultTradePct}
                        onChange={(e) => setDefaultTradePct(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Default percentage for trade calculator (40-120%)
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-muted-foreground block mb-2">
                      Default Buy Percentage
                    </label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="40"
                        max="120"
                        value={defaultBuyPct}
                        onChange={(e) => setDefaultBuyPct(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Default percentage for buy calculator (40-120%)
                    </p>
                  </div>

                  <Button
                    onClick={handleDefaultPercentagesSave}
                    className="w-full"
                  >
                    Save Default Percentages
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Social Links - Vendors Only */}
        {userProfile?.vendorAccess?.enabled && (
          <Card className="md:col-span-2">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Store className="h-5 w-5" />
                Social Media Links
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your social media accounts to display on your vendor profile
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Instagram */}
                <div>
                  <label className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </label>
                  <Input
                    placeholder="https://instagram.com/yourprofile"
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    onBlur={() => handleSocialLinkSave('instagram', instagramUrl)}
                    className="w-full"
                  />
                </div>

                {/* YouTube */}
                <div>
                  <label className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                    <Youtube className="h-4 w-4" />
                    YouTube
                  </label>
                  <Input
                    placeholder="https://youtube.com/@yourchannel"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onBlur={() => handleSocialLinkSave('youtube', youtubeUrl)}
                    className="w-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tips & Info */}
        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-4">Tips & Information</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Use the <strong>Collector Toolkit</strong> to manage your personal collection and wishlists</li>
              <li>• Use the <strong>Vendor Toolkit</strong> to manage inventory, calculate trades, and track transactions</li>
              <li>• Enable sharing to generate public links to your collection</li>
              <li>• Export your data regularly to keep offline backups</li>
              <li>• Your data is securely stored in Firebase and synced across devices</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

