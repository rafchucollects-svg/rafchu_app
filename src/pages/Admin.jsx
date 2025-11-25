import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Shield, UserCheck, UserX, Search, Save, Image, CheckCircle, XCircle } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { collection, getDocs, doc, setDoc, updateDoc, query, limit, where, serverTimestamp, deleteDoc } from "firebase/firestore";
import { getStorage, ref, deleteObject } from "firebase/storage";

/**
 * Admin Panel
 * Manage user access and vendor permissions
 * ONLY accessible by admin users
 */

const ADMIN_EMAILS = [
  "rafchucollects@gmail.com", // Add your admin email here
  // Add more admin emails as needed
];

export function Admin() {
  const { user, db, triggerQuickAddFeedback, invalidateCommunityImagesCache } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [accessForm, setAccessForm] = useState({
    enabled: false,
    tier: "basic",
    status: "active"
  });
  const [vendorRequests, setVendorRequests] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [imageSubmissions, setImageSubmissions] = useState([]);
  const [activeTab, setActiveTab] = useState("users"); // "users", "requests", "feedback", or "images"

  // Check if current user is admin
  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  // Load users from Firestore
  useEffect(() => {
    if (!isAdmin || !db) return;

    const loadUsers = async () => {
      try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, limit(100));
        const snapshot = await getDocs(q);
        
        const usersList = [];
        snapshot.forEach((doc) => {
          usersList.push({
            uid: doc.id,
            ...doc.data()
          });
        });
        
        // Sort by email in JavaScript
        usersList.sort((a, b) => {
          const emailA = (a.email || "").toLowerCase();
          const emailB = (b.email || "").toLowerCase();
          return emailA.localeCompare(emailB);
        });
        
        setUsers(usersList);
      } catch (error) {
        console.error("Failed to load users:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, [isAdmin, db]);

  // Load vendor access requests
  useEffect(() => {
    if (!isAdmin || !db) return;

    const loadRequests = async () => {
      try {
        const requestsRef = collection(db, "vendorAccessRequests");
        const q = query(requestsRef, where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        
        const requestsList = [];
        snapshot.forEach((docSnap) => {
          requestsList.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });
        
        // Sort by createdAt in JavaScript (most recent first)
        requestsList.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        
        setVendorRequests(requestsList);
      } catch (error) {
        console.error("Error loading requests:", error);
      }
    };

    loadRequests();
  }, [isAdmin, db]);

  // Load feedback submissions
  useEffect(() => {
    if (!isAdmin || !db) return;

    const loadFeedback = async () => {
      try {
        const feedbackRef = collection(db, "feedback");
        const snapshot = await getDocs(feedbackRef);
        
        const feedbackListData = [];
        snapshot.forEach((docSnap) => {
          feedbackListData.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });
        
        // Sort by createdAt in JavaScript (most recent first)
        feedbackListData.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        
        setFeedbackList(feedbackListData);
      } catch (error) {
        console.error("Error loading feedback:", error);
      }
    };

    loadFeedback();
  }, [isAdmin, db]);

  // Load community image submissions
  useEffect(() => {
    if (!isAdmin || !db) return;

    const loadImageSubmissions = async () => {
      try {
        const submissionsRef = collection(db, "communityImageSubmissions");
        const q = query(submissionsRef, where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        
        const submissionsList = [];
        snapshot.forEach((docSnap) => {
          submissionsList.push({
            id: docSnap.id,
            ...docSnap.data()
          });
        });
        
        // Sort by createdAt (most recent first)
        submissionsList.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        
        setImageSubmissions(submissionsList);
      } catch (error) {
        console.error("Error loading image submissions:", error);
      }
    };

    loadImageSubmissions();
  }, [isAdmin, db]);

  // Approve vendor request
  const handleApproveRequest = async (request) => {
    if (!db || !user) return;

    try {
      // Update user's vendor access
      const userRef = doc(db, "users", request.userId);
      const vendorAccess = {
        enabled: true,
        tier: "pro",
        status: "active",
        grantedAt: new Date().toISOString(),
        grantedBy: user.uid
      };
      await setDoc(userRef, { vendorAccess, isVendor: true }, { merge: true });

      // Update request status
      const requestRef = doc(db, "vendorAccessRequests", request.id);
      await updateDoc(requestRef, {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid
      });

      // Update local users list to reflect the change
      setUsers(users.map(u => 
        u.uid === request.userId 
          ? { ...u, vendorAccess, isVendor: true }
          : u
      ));

      // Remove from pending list
      setVendorRequests(vendorRequests.filter(r => r.id !== request.id));
      
      // Auto-select the approved user to show their updated status
      const approvedUser = users.find(u => u.uid === request.userId);
      if (approvedUser) {
        setSelectedUser({ ...approvedUser, vendorAccess, isVendor: true });
        setAccessForm({
          enabled: true,
          tier: "pro",
          status: "active"
        });
      }
      
      // Switch to Manage Users tab to show the update
      setActiveTab("users");
      
      triggerQuickAddFeedback("Request approved! User now has Pro vendor access.");
    } catch (error) {
      console.error("Error approving request:", error);
      alert("Failed to approve request");
    }
  };

  // Deny vendor request
  const handleDenyRequest = async (request) => {
    if (!db || !user) return;

    try {
      const requestRef = doc(db, "vendorAccessRequests", request.id);
      await updateDoc(requestRef, {
        status: "denied",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid
      });

      // Remove from pending list
      setVendorRequests(vendorRequests.filter(r => r.id !== request.id));
      
      triggerQuickAddFeedback("Request denied.");
    } catch (error) {
      console.error("Error denying request:", error);
      alert("Failed to deny request");
    }
  };

  // Mark feedback as reviewed
  const handleMarkFeedbackReviewed = async (feedbackId) => {
    if (!db || !user) return;

    try {
      const feedbackRef = doc(db, "feedback", feedbackId);
      await updateDoc(feedbackRef, {
        status: "reviewed",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid
      });

      // Update local state
      setFeedbackList(feedbackList.map(f => 
        f.id === feedbackId 
          ? { ...f, status: "reviewed", reviewedAt: new Date(), reviewedBy: user.uid }
          : f
      ));
      
      triggerQuickAddFeedback("Feedback marked as reviewed.");
    } catch (error) {
      console.error("Error updating feedback:", error);
      alert("Failed to update feedback");
    }
  };

  // Delete feedback
  const handleDeleteFeedback = async (feedbackId) => {
    if (!db || !user) return;
    
    // Delete directly without confirmation

    try {
      const feedbackRef = doc(db, "feedback", feedbackId);
      await updateDoc(feedbackRef, {
        status: "deleted",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid
      });

      // Remove from local state
      setFeedbackList(feedbackList.filter(f => f.id !== feedbackId));
      
      triggerQuickAddFeedback("Feedback deleted.");
    } catch (error) {
      console.error("Error deleting feedback:", error);
      alert("Failed to delete feedback");
    }
  };

  // Approve image submission
  const handleApproveImage = async (submission) => {
    if (!db || !user) return;

    try {
      console.log('Approving image:', submission);
      
      // Prepare approved document data (don't include undefined fields)
      const approvedData = {
        cardId: submission.cardId || 'unknown',
        cardName: submission.cardName || 'Unknown Card',
        imageUrl: submission.imageUrl || '',
        uploadedBy: submission.userId || submission.submittedBy || 'unknown',
        uploadedByEmail: submission.userEmail || submission.submittedByEmail || 'unknown',
        approvedAt: serverTimestamp(),
        approvedBy: user.uid
      };
      
      // Only include submittedAt if it exists
      if (submission.createdAt) {
        approvedData.submittedAt = submission.createdAt;
      } else if (submission.submittedAt) {
        approvedData.submittedAt = submission.submittedAt;
      }
      
      // Add to approved images collection first
      const approvedRef = doc(db, "approvedCommunityImages", submission.id);
      await setDoc(approvedRef, approvedData);

      // Update submission status
      const submissionRef = doc(db, "communityImageSubmissions", submission.id);
      await updateDoc(submissionRef, {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid
      });

      // Remove from pending list
      setImageSubmissions(imageSubmissions.filter(s => s.id !== submission.id));
      
      // Invalidate community images cache so new image shows up immediately
      if (invalidateCommunityImagesCache) {
        await invalidateCommunityImagesCache();
      }
      
      triggerQuickAddFeedback("Image approved!");
      
    } catch (error) {
      console.error("Error approving image:", error);
      alert(`Failed to approve image: ${error.message}`);
    }
  };

  // Reject image submission
  const handleRejectImage = async (submission) => {
    if (!db || !user) return;

    try {
      console.log('Rejecting image:', submission);
      
      // Delete image from storage
      // Extract storage path from URL (e.g., https://firebasestorage.../community-images%2Fpending%2Ffile.jpg -> community-images/pending/file.jpg)
      if (submission.imageUrl) {
        try {
          const storage = getStorage();
          // Get the path from the URL
          const urlParts = submission.imageUrl.split('/o/')[1];
          if (urlParts) {
            const storagePath = decodeURIComponent(urlParts.split('?')[0]);
            const imageRef = ref(storage, storagePath);
            await deleteObject(imageRef);
            console.log('Deleted image from storage:', storagePath);
          }
        } catch (storageError) {
          console.error('Error deleting from storage (continuing anyway):', storageError);
          // Continue even if storage deletion fails
        }
      }

      // Delete submission record
      await deleteDoc(doc(db, "communityImageSubmissions", submission.id));

      // Remove from list
      setImageSubmissions(imageSubmissions.filter(s => s.id !== submission.id));
      triggerQuickAddFeedback("Image rejected and deleted");
      
    } catch (error) {
      console.error("Error rejecting image:", error);
      alert(`Failed to reject image: ${error.message}`);
    }
  };

  // Grant/update vendor access
  const handleUpdateAccess = async () => {
    if (!selectedUser || !db) return;

    try {
      const userRef = doc(db, "users", selectedUser.uid);
      const vendorAccess = {
        enabled: accessForm.enabled,
        tier: accessForm.tier,
        status: accessForm.status,
        grantedAt: new Date().toISOString(),
        grantedBy: user.uid
      };

      await setDoc(userRef, { vendorAccess }, { merge: true });
      
      // Update local state
      setUsers(users.map(u => 
        u.uid === selectedUser.uid 
          ? { ...u, vendorAccess }
          : u
      ));
      
      alert("Vendor access updated successfully!");
      setSelectedUser(null);
    } catch (error) {
      console.error("Failed to update access:", error);
      alert("Failed to update access. Check console for details.");
    }
  };

  // Filter users
  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.uid?.includes(searchTerm)
  );

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Card>
          <CardContent className="p-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Please sign in to access the admin panel.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Card className="border-red-200">
          <CardContent className="p-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-red-600" />
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Manage vendor access and permissions</p>
          </div>
        </div>
        {vendorRequests.length > 0 && (
          <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
            {vendorRequests.length} Pending Request{vendorRequests.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 font-semibold transition-colors ${
            activeTab === "users"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Manage Users
        </button>
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-2 font-semibold transition-colors relative ${
            activeTab === "requests"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Vendor Requests
          {vendorRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {vendorRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("feedback")}
          className={`px-4 py-2 font-semibold transition-colors relative ${
            activeTab === "feedback"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Feedback
          {feedbackList.filter(f => f.status === "new").length > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {feedbackList.filter(f => f.status === "new").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("images")}
          className={`px-4 py-2 font-semibold transition-colors relative ${
            activeTab === "images"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Image className="h-4 w-4 inline mr-2" />
          Images
          {imageSubmissions.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {imageSubmissions.length}
            </span>
          )}
        </button>
      </div>

      {/* Vendor Requests Tab */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          {vendorRequests.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <UserCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Pending Requests</h3>
                <p className="text-muted-foreground">All vendor access requests have been processed.</p>
              </CardContent>
            </Card>
          ) : (
            vendorRequests.map((request) => (
              <Card key={request.id} className="border-l-4 border-l-yellow-500">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold">{request.userName}</h3>
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-semibold">
                          PENDING
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{request.userEmail}</p>
                      
                      <div className="space-y-2 mb-4">
                        <div>
                          <span className="text-sm font-semibold">Business: </span>
                          <span className="text-sm">{request.businessName}</span>
                        </div>
                        {request.businessType && (
                          <div>
                            <span className="text-sm font-semibold">Type: </span>
                            <span className="text-sm">{request.businessType}</span>
                          </div>
                        )}
                        {request.instagram && (
                          <div>
                            <span className="text-sm font-semibold">Instagram: </span>
                            <a href={request.instagram.startsWith('http') ? request.instagram : `https://instagram.com/${request.instagram.replace('@', '')}`} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="text-sm text-blue-600 hover:underline">
                              {request.instagram}
                            </a>
                          </div>
                        )}
                        {request.youtube && (
                          <div>
                            <span className="text-sm font-semibold">YouTube: </span>
                            <a href={request.youtube.startsWith('http') ? request.youtube : `https://youtube.com/${request.youtube.replace('@', '')}`} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="text-sm text-blue-600 hover:underline">
                              {request.youtube}
                            </a>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground pt-2">
                          Submitted: {request.createdAt?.toDate?.()?.toLocaleString() || "Unknown"}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApproveRequest(request)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleDenyRequest(request)}
                          variant="destructive"
                        >
                          <UserX className="h-4 w-4 mr-2" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Manage Users Tab */}
      {activeTab === "users" && (
        <div className="grid gap-6 md:grid-cols-2">
        {/* User List */}
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <div className="pt-4">
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No users found</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredUsers.map((u) => (
                  <button
                    key={u.uid}
                    onClick={() => {
                      setSelectedUser(u);
                      setAccessForm({
                        enabled: u.vendorAccess?.enabled || false,
                        tier: u.vendorAccess?.tier || "basic",
                        status: u.vendorAccess?.status || "active"
                      });
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedUser?.uid === u.uid
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{u.displayName || u.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                      {u.vendorAccess?.enabled ? (
                        <UserCheck className="h-4 w-4 text-green-600 flex-shrink-0 ml-2" />
                      ) : (
                        <UserX className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Access Control */}
        <Card>
          <CardHeader>
            <CardTitle>Vendor Access Control</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedUser ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Selected User</h3>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="font-medium">{selectedUser.displayName || "No name"}</div>
                    <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                    <div className="text-xs text-muted-foreground mt-1">ID: {selectedUser.uid}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Vendor Access</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={accessForm.enabled}
                        onChange={(e) => setAccessForm({ ...accessForm, enabled: e.target.checked })}
                        className="h-5 w-5"
                      />
                      <span className="text-sm">{accessForm.enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </div>

                  {accessForm.enabled && (
                    <>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Subscription Tier</label>
                        <Select
                          value={accessForm.tier}
                          onChange={(e) => setAccessForm({ ...accessForm, tier: e.target.value })}
                        >
                          <option value="basic">Basic ($19.99/mo)</option>
                          <option value="pro">Pro ($49.99/mo)</option>
                          <option value="lifetime">Lifetime</option>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Status</label>
                        <Select
                          value={accessForm.status}
                          onChange={(e) => setAccessForm({ ...accessForm, status: e.target.value })}
                        >
                          <option value="active">Active</option>
                          <option value="trial">Trial</option>
                          <option value="expired">Expired</option>
                          <option value="cancelled">Cancelled</option>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                <Button
                  onClick={handleUpdateAccess}
                  className="w-full"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>

                {selectedUser.vendorAccess && (
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    <p>Last updated: {selectedUser.vendorAccess.grantedAt || "Never"}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Select a user to manage their vendor access</p>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}

      {/* Feedback Tab */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          {feedbackList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No feedback submissions yet.</p>
              </CardContent>
            </Card>
          ) : (
            feedbackList.map((feedback) => (
              <Card key={feedback.id} className={feedback.status === "new" ? "border-blue-500" : ""}>
                <CardContent className="py-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{feedback.userName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            feedback.category === "bug" ? "bg-red-100 text-red-700" :
                            feedback.category === "feature" ? "bg-green-100 text-green-700" :
                            feedback.category === "ui" ? "bg-purple-100 text-purple-700" :
                            feedback.category === "pricing" ? "bg-orange-100 text-orange-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {feedback.category === "bug" ? "🐛 Bug" :
                             feedback.category === "feature" ? "✨ Feature" :
                             feedback.category === "ui" ? "🎨 UI/UX" :
                             feedback.category === "pricing" ? "💰 Pricing" :
                             feedback.category === "general" ? "💬 General" :
                             "📝 Other"}
                          </span>
                          {feedback.status === "new" && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {feedback.userEmail} • {feedback.createdAt?.toDate?.()?.toLocaleString() || "Unknown date"}
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{feedback.feedback}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      {feedback.status === "new" && (
                        <Button
                          onClick={() => handleMarkFeedbackReviewed(feedback.id)}
                          size="sm"
                          variant="outline"
                        >
                          Mark as Reviewed
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDeleteFeedback(feedback.id)}
                        size="sm"
                        variant="destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Community Images Tab */}
      {activeTab === "images" && (
        <div className="space-y-4">
          {imageSubmissions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Image className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-1">No pending image submissions</p>
                <p className="text-sm text-muted-foreground">All community image submissions have been reviewed.</p>
              </CardContent>
            </Card>
          ) : (
            imageSubmissions.map((submission) => (
              <Card key={submission.id} className="border-purple-500">
                <CardContent className="py-4">
                  <div className="flex gap-4">
                    {/* Image Preview */}
                    <div className="flex-shrink-0">
                      <img
                        src={submission.imageUrl}
                        alt={submission.cardName}
                        className="w-32 h-44 object-contain rounded-lg border-2 border-purple-200"
                      />
                    </div>
                    
                    {/* Submission Details */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-semibold text-lg">{submission.cardName || 'Unknown Card'}</h3>
                        <p className="text-sm text-muted-foreground">
                          Card ID: {submission.cardId || 'Not provided'}
                        </p>
                      </div>
                      
                      <div className="text-sm space-y-1">
                        <p>
                          <span className="font-medium">Submitted by:</span> {submission.userEmail || submission.userId || 'Unknown user'}
                        </p>
                        <p>
                          <span className="font-medium">Submitted on:</span>{" "}
                          {submission.createdAt?.toDate?.()?.toLocaleString() || "Unknown date"}
                        </p>
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => handleApproveImage(submission)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleRejectImage(submission)}
                          size="sm"
                          variant="destructive"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

