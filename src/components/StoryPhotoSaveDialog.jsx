import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  Download,
  Images,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import { exportStoryPhoto } from "@/utils/storyPhotoMedia";
import { createStoryPhotoArchive } from "@/utils/storyPhotoArchive";
import "./StoryPhotoSaveDialog.css";

function photoFilename(photo, index, usedNames) {
  const basename = String(photo.name || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    .replace(/\.[^.]*$/, "");
  const characters = Array.from(basename.normalize("NFC"), (character) =>
    character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ? "_"
      : character,
  );
  let stem =
    characters
      .slice(0, 80)
      .join("")
      .replace(/[<>:"|?*]/g, "_")
      .replace(/^[. ]+|[. ]+$/g, "") || `photo-${index + 1}`;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))
    stem = `rafchu-${stem}`;
  let name = `${stem}-story.png`;
  for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix += 1)
    name = `${stem}-story (${suffix}).png`;
  usedNames.add(name.toLowerCase());
  return name;
}

function supportsFileSharing(files) {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files }) === true
    );
  } catch {
    return false;
  }
}

export function StoryPhotoSaveDialog({
  photos,
  settings,
  onClose,
  onDownload,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const closeRef = useRef(onClose);
  const generation = useRef(0);
  const shareLock = useRef(false);
  const downloadLock = useRef(false);
  const archive = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [prepared, setPrepared] = useState(null);
  const [preparationError, setPreparationError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const count = photos.length;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const close = useCallback(() => {
    generation.current += 1;
    closeRef.current();
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    const focusable = () =>
      [
        ...dialogRef.current.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (element) =>
          !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        const active = document.activeElement;
        if (!elements.length) {
          event.preventDefault();
          titleRef.current?.focus();
        } else if (
          event.shiftKey &&
          (active === first || !elements.includes(active))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (active === last || !elements.includes(active))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onFocus = (event) => {
      if (!dialogRef.current?.contains(event.target)) titleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [close]);

  useEffect(() => {
    const job = ++generation.current;
    let cancelled = false;
    const current = () => !cancelled && generation.current === job;
    archive.current = null;
    shareLock.current = false;
    downloadLock.current = false;
    setCompleted(0);
    setPrepared(null);
    setPreparationError("");
    setActionError("");
    setMessage("");
    setSharing(false);
    setDownloading(false);

    const prepare = async () => {
      try {
        if (!photos.length || photos.length > 20)
          throw new Error("Choose between 1 and 20 photos to save.");
        const files = [];
        const names = new Set();
        for (const [index, photo] of photos.entries()) {
          if (!current()) return;
          const blob = await exportStoryPhoto(photo, settings);
          if (!current()) return;
          if (!(blob instanceof Blob) || !blob.size)
            throw new Error(`Could not prepare photo ${index + 1}. Try again.`);
          files.push(
            new File([blob], photoFilename(photo, index, names), {
              type: "image/png",
            }),
          );
          setCompleted(files.length);
        }
        if (current())
          setPrepared({ files, canShare: supportsFileSharing(files) });
      } catch (error) {
        if (current())
          setPreparationError(
            error?.message || "The images could not be prepared. Try again.",
          );
      }
    };
    void prepare();
    return () => {
      cancelled = true;
      if (generation.current === job) generation.current += 1;
    };
  }, [photos, settings, attempt]);

  const share = () => {
    if (!prepared?.canShare || shareLock.current || downloadLock.current)
      return;
    const job = generation.current;
    shareLock.current = true;
    const failed = (error) => {
      if (generation.current !== job) return;
      if (error?.name !== "AbortError")
        setActionError(
          "The share menu could not open these images. Try again, or use the download below.",
        );
    };
    try {
      setActionError("");
      setMessage("");
      // Files are already rendered. Call directly within this click, before any
      // asynchronous work, to retain the phone's transient user activation.
      const result = navigator.share({ files: prepared.files });
      setSharing(true);
      Promise.resolve(result)
        .then(() => {
          if (generation.current === job)
            setMessage(
              "Check Photos if you chose Save Images or Save to Photos in the share menu.",
            );
        })
        .catch(failed)
        .finally(() => {
          if (generation.current === job) {
            shareLock.current = false;
            setSharing(false);
          }
        });
    } catch (error) {
      shareLock.current = false;
      failed(error);
    }
  };

  const download = async () => {
    if (!prepared || shareLock.current || downloadLock.current) return;
    const job = generation.current;
    downloadLock.current = true;
    setDownloading(true);
    setActionError("");
    setMessage("");
    try {
      if (prepared.files.length === 1) {
        await onDownload(prepared.files[0], prepared.files[0].name);
      } else {
        const blob =
          archive.current || (await createStoryPhotoArchive(prepared.files));
        if (generation.current !== job) return;
        archive.current = blob;
        await onDownload(
          blob,
          `rafchu-story-sale-${prepared.files.length}-photos.zip`,
        );
      }
      if (generation.current === job)
        setMessage("Download requested. Check your browser’s downloads.");
    } catch {
      if (generation.current === job)
        setActionError(
          "The download could not start. Try again, or save a smaller group of photos.",
        );
    } finally {
      if (generation.current === job) {
        downloadLock.current = false;
        setDownloading(false);
      }
    }
  };

  const ready = Boolean(prepared);
  const busy = sharing || downloading;
  const downloadLabel =
    count === 1 ? "Download image" : `Download ZIP (${count})`;

  return createPortal(
    <div
      className="story-photo-save-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="story-photo-save-dialog"
      >
        <header className="story-photo-save-header">
          <div>
            <p className="story-photo-save-eyebrow">STORY SALE</p>
            <h2 id={titleId} ref={titleRef} tabIndex={-1}>
              Save your photos
            </h2>
          </div>
          <button
            type="button"
            className="story-photo-save-close"
            aria-label="Close save photos"
            onClick={close}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <p id={descriptionId} className="story-photo-save-description">
          {count === 1 ? "Your photo" : `All ${count} photos`}, with your prices
          and labels.
        </p>

        <div
          className="story-photo-save-summary"
          aria-busy={!ready && !preparationError}
        >
          <span
            className={`story-photo-save-icon${preparationError ? " has-error" : ""}`}
            aria-hidden="true"
          >
            {preparationError ? (
              <AlertCircle size={28} />
            ) : ready ? (
              <Images size={28} />
            ) : (
              <Loader2 size={28} className="story-photo-save-spinner" />
            )}
          </span>
          <div role="status" aria-live="polite" aria-atomic="true">
            <strong>
              {preparationError
                ? "Preparation paused"
                : ready
                  ? `${count} ${count === 1 ? "photo" : "photos"} ready`
                  : `Preparing photo ${Math.min(completed + 1, Math.max(count, 1))} of ${count}`}
            </strong>
            <p>
              {ready
                ? "Full-quality PNG images"
                : preparationError
                  ? "Your edits are still here."
                  : "Keep this window open while the labels are added."}
            </p>
          </div>
          {ready && (
            <Check
              className="story-photo-save-ready"
              size={21}
              aria-hidden="true"
            />
          )}
        </div>

        {!ready && !preparationError && (
          <progress
            className="story-photo-save-progress"
            aria-label="Preparing images"
            max={Math.max(count, 1)}
            value={completed}
          />
        )}
        {preparationError && (
          <div className="story-photo-save-error" role="alert">
            <p>{preparationError}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try preparing again
            </button>
          </div>
        )}

        {prepared?.canShare && (
          <div className="story-photo-save-native">
            <button
              type="button"
              className="story-photo-save-primary"
              onClick={share}
              disabled={busy}
            >
              {sharing ? (
                <Loader2
                  size={19}
                  className="story-photo-save-spinner"
                  aria-hidden="true"
                />
              ) : (
                <Share2 size={19} aria-hidden="true" />
              )}
              {sharing ? "Share menu open…" : "Save to Photos / Share"}
            </button>
            <p>
              In your phone’s share menu, choose <strong>Save Images</strong> or{" "}
              <strong>Save to Photos</strong> when available.
            </p>
          </div>
        )}

        {prepared && !prepared.canShare && (
          <p className="story-photo-save-unsupported">
            Your browser cannot share{" "}
            {count === 1 ? "this image" : "these images together"}.{" "}
            {count === 1
              ? "Download the image instead."
              : "Download a ZIP containing all the images, then open it to save them."}
          </p>
        )}

        {actionError && (
          <p className="story-photo-save-error" role="alert">
            {actionError}
          </p>
        )}
        {message && (
          <p className="story-photo-save-message" role="status">
            {message}
          </p>
        )}

        <div className="story-photo-save-download">
          <button
            type="button"
            className={
              prepared?.canShare
                ? "story-photo-save-secondary"
                : "story-photo-save-primary"
            }
            onClick={download}
            disabled={!ready || busy}
          >
            {downloading ? (
              <Loader2
                size={19}
                className="story-photo-save-spinner"
                aria-hidden="true"
              />
            ) : (
              <Download size={19} aria-hidden="true" />
            )}
            {downloading ? "Preparing download…" : downloadLabel}
          </button>
          <p>
            {count === 1
              ? "Download the PNG image to this device."
              : "One download with all your PNG images."}
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
