import { useState } from "react";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { X } from "lucide-react";

const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "SGC"];
const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4", "3", "2", "1"];

/**
 * Simplified modal for adding graded cards
 * Only asks for grading company and grade
 */
export function GradedCardModal({ isOpen, onClose, card, onSubmit, mode = "collector", target = "collection" }) {
  const [gradingCompany, setGradingCompany] = useState("PSA");
  const [grade, setGrade] = useState("10");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !card) return null;
  
  // Determine button text based on target
  const getButtonText = () => {
    if (target === 'trade') return 'Add to Trade';
    if (target === 'buy') return 'Add to Buy';
    return `Add to ${mode === "vendor" ? "Inventory" : "Collection"}`;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        card,
        gradingCompany,
        grade,
        isGraded: true,
      });
      onClose();
      // Reset form
      setGradingCompany("PSA");
      setGrade("10");
    } catch (error) {
      console.error("Error adding graded card:", error);
      alert("Failed to add graded card. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold">Add Graded Card</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {card.name} • {card.set} #{card.number}
            </p>
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
          {/* Grading Company */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Grading Company
            </label>
            <select
              value={gradingCompany}
              onChange={(e) => setGradingCompany(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              {GRADING_COMPANIES.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          {/* Grade */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Grade
            </label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Adding..." : getButtonText()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

