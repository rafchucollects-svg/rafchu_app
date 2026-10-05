import { useId } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseStoryPrice, roundStoryPrice } from "@/utils/storyPhotoMatching";
import { STORY_CONDITION_OPTIONS } from "@/utils/storyPhotoCondition";
import "./StoryPhotoQuickReview.css";

export function StoryPhotoQuickReview({
  photo,
  selectedLabel,
  currency = "EUR",
  selectedCondition = "",
  isGraded,
  onSelectLabel,
  onUpdateLabel,
  onConfirmLabel,
  onConfirmPhoto,
  onPreviousPhoto,
  onNextPhoto,
  photoIndex = 0,
  photoCount = 1,
  disabled = false,
}) {
  const helpId = useId();
  const labels = photo?.labels || [];
  const label = selectedLabel || labels[0] || null;
  const labelIndex = label
    ? labels.findIndex((entry) => entry.id === label.id)
    : -1;
  const busy = disabled || ["scanning", "queued"].includes(photo?.status);
  const validPrice = label && parseStoryPrice(label.price) !== null;
  const allPriced =
    labels.length > 0 &&
    labels.every((entry) => parseStoryPrice(entry.price) !== null);
  const graded = isGraded ?? label?.isGraded ?? false;
  const grading =
    label &&
    [
      label.gradingCompany || label.detected?.gradingCompany,
      label.grade || label.detected?.grade,
    ]
      .filter(Boolean)
      .join(" ");

  const normalizePrice = () => {
    const rounded = roundStoryPrice(label.price);
    if (rounded !== null && String(rounded) !== String(label.price)) {
      onUpdateLabel(label.id, {
        price: String(rounded),
        priceSource: "manual",
        confirmed: false,
      });
    }
  };

  return (
    <section className="story-quick-review" aria-label="Quick photo review">
      <nav
        className="story-quick-review-photo-nav"
        aria-label="Photo navigation"
      >
        <button
          type="button"
          className="story-quick-review-nav-button"
          aria-label="Previous photo"
          disabled={busy || photoIndex <= 0}
          onClick={onPreviousPhoto}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span>Previous</span>
        </button>
        <strong>
          Photo {Math.min(photoIndex + 1, photoCount)} of {photoCount}
        </strong>
        <button
          type="button"
          className="story-quick-review-nav-button"
          aria-label="Next photo"
          disabled={busy || photoIndex >= photoCount - 1}
          onClick={onNextPhoto}
        >
          <span>Next</span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>

      {label ? (
        <>
          <div className="story-quick-review-card-nav">
            <button
              type="button"
              className="story-quick-review-nav-button story-quick-review-card-arrow"
              aria-label="Previous card"
              disabled={busy || labelIndex <= 0}
              onClick={() => onSelectLabel(labels[labelIndex - 1].id)}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <div className="story-quick-review-card-title" aria-live="polite">
              <span>
                Card {labelIndex + 1} of {labels.length}
              </span>
              <strong>{label.name || "Card"}</strong>
            </div>
            <button
              type="button"
              className="story-quick-review-nav-button story-quick-review-card-arrow"
              aria-label="Next card"
              disabled={busy || labelIndex >= labels.length - 1}
              onClick={() => onSelectLabel(labels[labelIndex + 1].id)}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="story-quick-review-fields">
            <label>
              Price ({currency})
              <input
                aria-label="Quick price"
                aria-invalid={!validPrice}
                aria-describedby={helpId}
                inputMode="decimal"
                value={label.price ?? ""}
                placeholder="e.g. 125"
                disabled={busy}
                onChange={(event) =>
                  onUpdateLabel(label.id, {
                    price: event.target.value,
                    priceSource: "manual",
                    confirmed: false,
                  })
                }
                onBlur={normalizePrice}
              />
            </label>
            {graded ? (
              <div className="story-quick-review-grade">
                <span>Graded card</span>
                <strong>{grading || "Slab"}</strong>
              </div>
            ) : (
              <label>
                Condition
                <select
                  aria-label="Quick condition"
                  value={selectedCondition}
                  disabled={busy}
                  onChange={(event) =>
                    onUpdateLabel(label.id, {
                      condition: event.target.value,
                      isGraded: false,
                      confirmed: false,
                    })
                  }
                >
                  <option value="">Not set</option>
                  {STORY_CONDITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p
            id={helpId}
            className={
              validPrice
                ? "story-quick-review-price-help"
                : "story-quick-review-error"
            }
          >
            {validPrice
              ? "Prices round to whole amounts."
              : "Enter a price greater than zero."}
          </p>
          <div className="story-quick-review-actions">
            <Button
              className="story-quick-review-action"
              disabled={busy || !validPrice}
              onClick={() => onConfirmLabel(label.id)}
            >
              <Check size={17} aria-hidden="true" /> Confirm &amp; next
            </Button>
            <Button
              variant="outline"
              className="story-quick-review-action"
              disabled={busy || !allPriced}
              onClick={onConfirmPhoto}
            >
              Confirm photo &amp; next
              <ChevronRight size={17} aria-hidden="true" />
            </Button>
          </div>
          <p className="story-quick-review-help">
            Confirming accepts the displayed prices and label positions. You can
            also download without confirming.
          </p>
        </>
      ) : (
        <p className="story-quick-review-empty">
          {busy
            ? "Cards will appear here when the scan finishes."
            : "Scan this photo or add a price label to start."}
        </p>
      )}
    </section>
  );
}
