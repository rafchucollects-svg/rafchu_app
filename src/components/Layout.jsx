import { useState, useEffect } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, LogIn, LogOut, Home, User, Package, Store, ShoppingBag, MessageCircle, Settings, ChevronDown, ChevronRight, X, Sparkles, Search } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { OnboardingModal } from "./OnboardingModal";
import { VendorAccessRequestModal } from "./VendorAccessRequestModal";
import { FeedbackModal } from "./FeedbackModal";
import { LoginModal } from "./LoginModal";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Layout component with hamburger navigation drawer
 * Shows route structure for My User, Collector Toolkit, and Vendor Toolkit
 */

export function Layout({ onGoogleLogin, onEmailSignUp, onEmailLogin, onPasswordReset, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [comingSoonBannerVisible, setComingSoonBannerVisible] = useState(true);
  const [vendorCtaDismissed, setVendorCtaDismissed] = useState(false);
  const { user, userProfile, needsOnboarding, setNeedsOnboarding, setUserProfile, quickAddFeedback, vendorRequestModalOpen, setVendorRequestModalOpen, feedbackModalOpen, setFeedbackModalOpen } = useApp();
  const location = useLocation();
  
  // Load dismissed state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('comingSoonBannerDismissed');
    if (dismissed === 'true') {
      setComingSoonBannerVisible(false);
    }
    const vendorCtaDismissedState = localStorage.getItem('vendorCtaDismissed');
    if (vendorCtaDismissedState === 'true') {
      setVendorCtaDismissed(true);
    }
  }, []);
  
  const dismissComingSoonBanner = () => {
    setComingSoonBannerVisible(false);
    localStorage.setItem('comingSoonBannerDismissed', 'true');
  };
  
  const dismissVendorCta = () => {
    setVendorCtaDismissed(true);
    localStorage.setItem('vendorCtaDismissed', 'true');
  };
  
  const handleOnboardingComplete = (profile) => {
    setUserProfile(profile);
    setNeedsOnboarding(false);
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Onboarding Modal */}
      {user && needsOnboarding && (
        <OnboardingModal user={user} onComplete={handleOnboardingComplete} />
      )}
      
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" style={{
        /* Safari-specific fixes for sticky positioning */
        WebkitBackdropFilter: 'blur(8px)',
        backdropFilter: 'blur(8px)',
      }}>
        <div className="flex h-14 items-center px-4 gap-3">
          {/* Hide menu on shared views */}
          {!location.search.includes('inventory=') && !location.search.includes('collection=') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          
          <Link to="/" className="flex items-center gap-2">
            <img 
              src="/rafchu-logo.png" 
              alt="Logo" 
              className="h-8 w-8 rounded-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="font-bold text-xl">Rafchu Marketplace</span>
          </Link>

          <div className="flex-1" />

          {/* Quick access buttons - Hidden on shared views */}
          {!location.search.includes('inventory=') && !location.search.includes('collection=') && user && (
            <div className="flex items-center gap-2">
              <Link to="/user/profile">
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Profile & Settings</span>
                </Button>
              </Link>
              <Link to="/collector/messages">
                <Button variant="ghost" size="sm">
                  <MessageCircle className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Messages</span>
                </Button>
              </Link>
            </div>
          )}

          {/* Auth buttons - Hidden on shared views */}
          {!location.search.includes('inventory=') && !location.search.includes('collection=') && (
            <>
              {user ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground hidden md:inline">
                    {user.displayName || user.email}
                  </span>
                  <Button variant="outline" size="sm" onClick={onLogout}>
                    <LogOut className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </Button>
                </div>
              ) : (
                <Button variant="default" size="sm" onClick={() => setLoginModalOpen(true)}>
                  <LogIn className="h-4 w-4 mr-1" />
                  Sign In
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Navigation Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-background border-r shadow-xl overflow-y-auto"
            >
              <div className="p-4 flex flex-col gap-2">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b mb-2">
                  <h2 className="text-lg font-bold">Navigation</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDrawerOpen(false)}
                  >
                    ✕
                  </Button>
                </div>

                {/* Marketplace */}
                <Link
                  to="/collector/marketplace"
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors ${
                    isActive('/collector/marketplace') ? 'bg-accent font-medium' : ''
                  }`}
                >
                  <ShoppingBag className="h-5 w-5" />
                  <span className="text-base">Marketplace</span>
                </Link>

                {/* Card Search */}
                <Link
                  to="/search"
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors ${
                    isActive('/search') ? 'bg-accent font-medium' : ''
                  }`}
                >
                  <Search className="h-5 w-5" />
                  <span className="text-base">Card Search</span>
                </Link>

                {/* My User Section */}
                <div>
                  <button
                    onClick={() => setExpandedSection(expandedSection === 'user' ? null : 'user')}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors ${
                      isActive('/user') ? 'bg-accent font-medium' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5" />
                      <span className="text-base">My User</span>
                    </div>
                    {expandedSection === 'user' ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedSection === 'user' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-8 pt-1 flex flex-col gap-1">
                          <Link
                            to="/user/profile"
                            onClick={() => setDrawerOpen(false)}
                            className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                              isActive('/user/profile') ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            Profile & Settings
                          </Link>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Collector Toolkit Section */}
                <div>
                  <button
                    onClick={() => setExpandedSection(expandedSection === 'collector' ? null : 'collector')}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors ${
                      isActive('/collector') ? 'bg-accent font-medium' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-purple-600" />
                      <span className="text-base">Collector Toolkit</span>
                    </div>
                    {expandedSection === 'collector' ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedSection === 'collector' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-8 pt-1 flex flex-col gap-1">
                          <Link
                            to="/collector/collection"
                            onClick={() => setDrawerOpen(false)}
                            className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                              isActive('/collector/collection') ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            My Collection
                          </Link>
                          <Link
                            to="/collector/wishlist"
                            onClick={() => setDrawerOpen(false)}
                            className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                              isActive('/collector/wishlist') ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            Wishlist
                          </Link>
                          <Link
                            to="/collector/messages"
                            onClick={() => setDrawerOpen(false)}
                            className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                              isActive('/collector/messages') ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            Messages
                          </Link>
                          <Link
                            to="/collector/insights"
                            onClick={() => setDrawerOpen(false)}
                            className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                              isActive('/collector/insights') ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            Collection Insights
                          </Link>
                          {/* Trade Binder - Hidden until functionality is built out
                          <Link
                            to="/collector/trade-binder"
                            onClick={() => setDrawerOpen(false)}
                            className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                              isActive('/collector/trade-binder') ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            Trade Binder
                          </Link>
                          */}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Vendor Toolkit Section - Only shown when vendor access is enabled */}
                {(userProfile?.vendorAccess?.enabled || userProfile?.isVendor) && (
                  <div>
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'vendor' ? null : 'vendor')}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors ${
                        isActive('/vendor') ? 'bg-accent font-medium' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Store className="h-5 w-5 text-green-600" />
                        <span className="text-base">Vendor Toolkit</span>
                        {userProfile?.vendorAccess?.tier && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                            {userProfile.vendorAccess.tier.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {expandedSection === 'vendor' ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <AnimatePresence>
                      {expandedSection === 'vendor' && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-8 pt-1 flex flex-col gap-1">
                            <Link
                              to="/vendor/inventory"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/inventory') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              My Inventory
                            </Link>
                            <Link
                              to="/vendor/insights"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/insights') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              Inventory Insights
                            </Link>
                            <Link
                              to="/vendor/wishlist-insights"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/wishlist-insights') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              Wishlist Insights
                            </Link>
                            <Link
                              to="/vendor/trade-calculator"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/trade-calculator') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              Trade Calculator
                            </Link>
                            <Link
                              to="/vendor/buy-calculator"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/buy-calculator') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              Buy Calculator
                            </Link>
                            <Link
                              to="/vendor/transaction-log"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/transaction-log') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              Transaction Log
                            </Link>
                            <Link
                              to="/vendor/transaction-summary"
                              onClick={() => setDrawerOpen(false)}
                              className={`px-4 py-2 rounded-lg hover:bg-accent text-sm ${
                                isActive('/vendor/transaction-summary') ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              Transaction Summary
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Vendor Toolkit Promotion - Only show if user doesn't have vendor access */}
                {!userProfile?.vendorAccess?.enabled && !userProfile?.isVendor && !vendorCtaDismissed && (
                  <div className="mt-6 pt-4 border-t">
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 relative">
                      <button
                        onClick={dismissVendorCta}
                        className="absolute top-2 right-2 p-1 hover:bg-green-200 rounded-full transition-colors"
                        aria-label="Dismiss"
                      >
                        <X className="h-4 w-4 text-green-700" />
                      </button>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="bg-green-600 p-2 rounded-lg">
                          <Store className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-green-900 text-sm">Upgrade to Vendor Toolkit</h3>
                          <p className="text-xs text-green-700 mt-1">
                            Manage inventory, track sales, and grow your business
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setDrawerOpen(false);
                          setVendorRequestModalOpen(true);
                        }}
                        className="block w-full bg-green-600 hover:bg-green-700 text-white text-center py-2 px-3 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Request Early Access
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit Feedback - Always Visible */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      setFeedbackModalOpen(true);
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors w-full"
                  >
                    <MessageCircle className="h-5 w-5" />
                    <span className="font-medium">Submit Feedback</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick Add Feedback Toast */}
      <AnimatePresence>
        {quickAddFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg"
          >
            {quickAddFeedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vendor Access Request Modal */}
      <VendorAccessRequestModal 
        isOpen={vendorRequestModalOpen} 
        onClose={() => setVendorRequestModalOpen(false)} 
      />

      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={feedbackModalOpen} 
        onClose={() => setFeedbackModalOpen(false)} 
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onGoogleLogin={onGoogleLogin}
        onEmailSignUp={onEmailSignUp}
        onEmailLogin={onEmailLogin}
        onPasswordReset={onPasswordReset}
      />

      {/* Coming Soon Banner */}
      {comingSoonBannerVisible && (
        <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white py-3 px-4 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1">
              <Sparkles className="h-5 w-5 flex-shrink-0" />
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="font-semibold">Coming Soon:</span>
                <span>Japanese Cards • Graded Cards • Sealed Products</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 h-8"
                onClick={() => setFeedbackModalOpen(true)}
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Submit Feedback
              </Button>
              <button
                onClick={dismissComingSoonBanner}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

