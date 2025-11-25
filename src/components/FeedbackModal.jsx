import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { CheckCircle, MessageSquare, Loader2, X } from "lucide-react";

export function FeedbackModal({ isOpen, onClose }) {
  const { user, db, userProfile, triggerQuickAddFeedback } = useApp();
  const [feedback, setFeedback] = useState("");
  const [category, setCategory] = useState("general");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user || !db) {
      alert("Please sign in to submit feedback");
      return;
    }

    if (!feedback.trim()) {
      alert("Please enter your feedback");
      return;
    }

    setLoading(true);

    try {
      await addDoc(collection(db, "feedback"), {
        userId: user.uid,
        userEmail: user.email,
        userName: userProfile?.displayName || user.email,
        feedback: feedback.trim(),
        category,
        status: "new",
        createdAt: serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
      });

      setSubmitted(true);
      triggerQuickAddFeedback("Thank you for your feedback!");
      
      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setFeedback("");
        setCategory("general");
      }, 2000);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
      setSubmitted(false);
      setFeedback("");
      setCategory("general");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" style={{
      WebkitOverflowScrolling: 'touch',
    }}>
      <Card className="max-w-md w-full relative" style={{
        WebkitOverflowScrolling: 'touch',
      }}>
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          disabled={loading}
        >
          <X className="h-5 w-5" />
        </button>

        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
            <MessageSquare className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Submit Feedback</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Help us improve Rafchu TCG! Share your thoughts, report bugs, or suggest new features.
          </p>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Feedback Received!</h3>
              <p className="text-muted-foreground">
                Thank you for helping us improve. We read every submission.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={loading}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="general">General Feedback</option>
                  <option value="bug">Bug Report</option>
                  <option value="feature">Feature Request</option>
                  <option value="ui">UI/UX Improvement</option>
                  <option value="pricing">Pricing Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Your Feedback <span className="text-red-500">*</span>
                </label>
                <textarea
                  placeholder="Tell us what's on your mind..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  required
                  disabled={loading}
                  rows={6}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {feedback.length} characters
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong> All feedback is reviewed by our team. 
                  For urgent issues, please contact us directly.
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Submit Feedback"
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

