import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { X, MessageSquare } from "lucide-react";

/**
 * Modal for adding/editing comments on collection or inventory items
 */
export function CommentModal({ isOpen, onClose, onSave, currentComment = "", itemName = "" }) {
  const [comment, setComment] = useState(currentComment);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setComment(currentComment);
    }
  }, [isOpen, currentComment]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(comment);
      onClose();
    } catch (error) {
      console.error("Error saving comment:", error);
      alert("Failed to save comment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await onSave("");
      onClose();
    } catch (error) {
      console.error("Error clearing comment:", error);
      alert("Failed to clear comment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold">Add Comment</h2>
              {itemName && (
                <p className="text-sm text-muted-foreground mt-1">
                  {itemName}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add your notes here... (condition details, personal notes, etc.)"
              className="w-full px-3 py-2 border rounded-md min-h-[120px] resize-y"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              {comment.length}/500 characters
            </p>
          </div>

          <div className="flex gap-3">
            {currentComment && (
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isSaving}
                className="flex-1"
              >
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || comment.length > 500}
              className="flex-1"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

