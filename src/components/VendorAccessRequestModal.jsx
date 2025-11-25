import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Store, Loader } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";

/**
 * Vendor Access Request Modal
 * Allows users to request vendor toolkit access from within the app
 */

export function VendorAccessRequestModal({ isOpen, onClose }) {
  const { user, db, userProfile, triggerQuickAddFeedback } = useApp();
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [instagram, setInstagram] = useState("");
  const [youtube, setYoutube] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user || !db) {
      alert("Please sign in to request vendor access");
      return;
    }

    if (!businessName.trim()) {
      alert("Please enter your business name");
      return;
    }

    setLoading(true);

    try {
      // Check if user already has a pending request
      const requestsRef = collection(db, "vendorAccessRequests");
      const q = query(requestsRef, where("userId", "==", user.uid), where("status", "==", "pending"));
      const existingRequests = await getDocs(q);

      if (!existingRequests.empty) {
        alert("You already have a pending request. Please wait for admin review.");
        setLoading(false);
        return;
      }

      // Create new request
      await addDoc(collection(db, "vendorAccessRequests"), {
        userId: user.uid,
        userEmail: user.email,
        userName: userProfile?.displayName || user.email,
        businessName: businessName.trim(),
        businessType: businessType.trim(),
        instagram: instagram.trim(),
        youtube: youtube.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
      });

      setSubmitted(true);
      triggerQuickAddFeedback("Vendor access request submitted!");
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setBusinessName("");
        setBusinessType("");
        setInstagram("");
        setYoutube("");
      }, 2000);
    } catch (error) {
      console.error("Error submitting request:", error);
      alert("Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <Card 
        className="max-w-xl w-full"
        onClick={(e) => e.stopPropagation()}
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-600 p-2 rounded-lg">
                <Store className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Request Vendor Access</h2>
                <p className="text-sm text-muted-foreground">Tell us about your business</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {submitted ? (
            <div className="py-8 text-center">
              <div className="bg-green-100 text-green-800 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
                <Store className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Request Submitted!</h3>
              <p className="text-muted-foreground">
                We'll review your request and get back to you soon.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g., Rafchu's Card Shop"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Business Type (optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g., Online Store, Local Shop, Marketplace Seller"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Instagram (optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g., @rafchucollects or instagram.com/rafchucollects"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  YouTube (optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g., @RafchuTCG or youtube.com/@RafchuTCG"
                  value={youtube}
                  onChange={(e) => setYoutube(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong> Your request will be reviewed by our admin team. 
                  You'll receive a notification once your request is processed.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

