import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  Upload,
  Camera,
  Plus,
  Trash2,
  Download,
  Check,
  Loader2,
  Move,
  Image as ImageIcon,
  AlertCircle,
  RotateCcw,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoryPhotoQuickReview } from "./StoryPhotoQuickReview";
import { StoryPhotoSaveDialog } from "./StoryPhotoSaveDialog";
import {
  runStoryPhotoScan,
  MAX_STORY_SCAN_ATTEMPTS,
} from "@/utils/storyPhotoScan";
import { useApp } from "@/contexts/AppContext";
import { convertCurrency } from "@/utils/cardHelpers";
import {
  formatStoryPrice,
  getInventoryKey,
  getStoryPrice,
  matchPhotoCard,
  parseStoryPrice,
  roundStoryPrice,
  isStoryGraded,
} from "@/utils/storyPhotoMatching";
import {
  prepareStoryPhoto,
  getPhotoLayout,
  getPhotoLabelGeometry,
  positionPhotoLabels,
  exportStoryPhoto,
} from "@/utils/storyPhotoMedia";
import { createStoryPhotoArchive } from "@/utils/storyPhotoArchive";
import { loadStoryDraft, saveStoryDraft } from "@/utils/storyPhotoDraft";
import {
  getStoryConditionBadge,
  STORY_CONDITION_OPTIONS,
} from "@/utils/storyPhotoCondition";
import "./PhotoStoryStudio.css";

const MAX_PHOTOS = 20;
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isReady = (photo) =>
  photo?.status === "review" &&
  photo.labels.length > 0 &&
  photo.labels.every(
    (label) =>
      !label.needsPositionReview && parseStoryPrice(label.price) !== null,
  );
const errorMessage = (error, attempts = 1) =>
  /resource-exhausted|quota/i.test(`${error?.code} ${error?.message}`)
    ? "Photo scanning is temporarily busy. Try again, or add prices yourself below."
    : `${attempts > 1 ? `We tried scanning this photo ${attempts} times.` : "This photo could not be scanned."} Retry, or choose a card or enter a price yourself below.`;
const priceText = (price) =>
  roundStoryPrice(price) == null ? "" : String(roundStoryPrice(price));
const itemDescription = (item) =>
  [
    item.set,
    item.number && `#${item.number}`,
    isStoryGraded(item)
      ? `${item.gradingCompany || item.grader || ""} ${item.grade || ""}`
      : item.condition,
    item.variant,
    item.language,
  ]
    .filter(Boolean)
    .join(" · ");

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const cardLabelFields = (item, detected = {}) => {
  const card = item || detected;
  const isGraded = isStoryGraded(card);
  return {
    isGraded,
    condition: isGraded ? "" : item?.condition || "",
    gradingCompany: isGraded ? card.gradingCompany || card.grader || "" : "",
    grade: isGraded ? card.grade || "" : "",
  };
};
const labelCardFields = (label, inventory) => {
  const item = inventory.find(
    (entry, index) => getInventoryKey(entry, index) === label.itemKey,
  );
  const defaults = cardLabelFields(item, label.detected);
  const isGraded = hasOwn(label, "isGraded")
    ? label.isGraded
    : defaults.isGraded;
  return {
    ...defaults,
    isGraded,
    condition: isGraded
      ? ""
      : hasOwn(label, "condition")
        ? label.condition
        : defaults.condition,
    grade: label.grade ?? defaults.grade,
    gradingCompany: label.gradingCompany ?? defaults.gradingCompany,
  };
};

export function PhotoStoryStudio() {
  const {
    user,
    collectionItems = [],
    currency = "EUR",
    secondaryCurrency,
    roundUpPrices = false,
    marketSource,
  } = useApp();
  const [photos, setPhotos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [settings, setSettings] = useState({
    format: "original",
    labelScale: 1,
    labelColor: "#ffffff",
    labelBackground: "#15803d",
    currency,
    secondaryCurrency,
    includeSecondary: false,
    showCondition: true,
  });
  const [autoScan, setAutoScan] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveBatch, setSaveBatch] = useState(null);
  const [omittedPhotoIds, setOmittedPhotoIds] = useState(() => new Set());
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [renderedPreview, setRenderedPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const stage = useRef(null);
  const mounted = useRef(false);
  const photoRef = useRef(photos);
  const jobs = useRef(new Map());
  const uploadLock = useRef(false);
  const exportLock = useRef(false);
  const urls = useRef(new Set());
  const saveChain = useRef(Promise.resolve());
  const drag = useRef(null);
  const latestDraft = useRef(null);
  const saveTimer = useRef(null);
  const matchingContext = useRef(null);
  photoRef.current = photos;

  const createUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const activeJobs = jobs.current;
    const ownedUrls = urls.current;
    loadStoryDraft(user?.uid)
      .then((draft) => {
        if (cancelled || !draft) return;
        const restored = (Array.isArray(draft.photos) ? draft.photos : [])
          .filter(
            (photo) =>
              photo?.blob instanceof Blob &&
              Number(photo.width) > 0 &&
              Number(photo.height) > 0 &&
              Array.isArray(photo.labels),
          )
          .slice(0, MAX_PHOTOS)
          .map((photo) => ({
            ...photo,
            url: createUrl(photo.blob),
            status: "review",
            labels: photo.labels.map((label) => ({
              ...label,
              price:
                parseStoryPrice(label.price) == null
                  ? label.price
                  : priceText(label.price),
            })),
          }));
        setPhotos(restored);
        setActiveId(draft.activeId || restored[0]?.id || null);
        if (draft.settings)
          setSettings((previous) => ({ ...previous, ...draft.settings }));
        if (restored.length)
          setNotice("Your saved photo draft is ready to continue.");
      })
      .catch(() => {
        if (!cancelled)
          setSaveState(
            "Draft storage unavailable. Keep this tab open until you download.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      activeJobs.forEach((controller) => controller.abort());
      activeJobs.clear();
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.clear();
      clearTimeout(saveTimer.current);
      if (latestDraft.current && user?.uid) {
        const snapshot = latestDraft.current;
        saveChain.current = saveChain.current
          .catch(() => {})
          .then(() => saveStoryDraft(user.uid, snapshot))
          .catch(() => {});
      }
    };
  }, [user?.uid, createUrl]);

  useEffect(() => {
    if (loading || !user?.uid) return;
    setSaveState("Saving draft…");
    const snapshot = { photos, activeId, settings };
    latestDraft.current = snapshot;
    let current = true;
    saveTimer.current = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => {})
        .then(() => saveStoryDraft(user.uid, snapshot))
        .then(() => {
          if (mounted.current && current)
            setSaveState(photos.length ? "Draft saved on this device" : "");
        })
        .catch(() => {
          if (mounted.current && current)
            setSaveState(
              "Draft could not be saved. Keep this tab open until you download.",
            );
        });
    }, 400);
    return () => {
      current = false;
      clearTimeout(saveTimer.current);
    };
  }, [photos, activeId, settings, loading, user?.uid]);

  useEffect(() => {
    if (!loading && photos.length === 0 && !uploading)
      setSettings((previous) => ({ ...previous, currency, secondaryCurrency }));
  }, [currency, secondaryCurrency, loading, photos.length, uploading]);

  const inventory = useMemo(
    () =>
      collectionItems.filter(
        (item) =>
          !item.excludeFromSale &&
          (item.quantity == null || Number(item.quantity) > 0),
      ),
    [collectionItems],
  );
  // Upgrade existing drafts once inventory is available. Preserve every entered
  // price; only previously unpriced detections receive the new suggested match.
  useEffect(() => {
    if (loading || inventory.length === 0) return;
    setPhotos((previous) => {
      let changed = false;
      const next = previous.map((photo) => ({
        ...photo,
        labels: photo.labels.map((label) => {
          if (hasOwn(label, "priceSource")) return label;
          changed = true;
          const item = inventory.find(
            (entry, index) => getInventoryKey(entry, index) === label.itemKey,
          );
          if (parseStoryPrice(label.price) == null && item) {
            const price = getStoryPrice(
              item,
              settings.currency,
              roundUpPrices,
              marketSource,
            );
            if (price != null)
              return {
                ...label,
                ...labelCardFields(label, inventory),
                price: priceText(price),
                priceSource: "inventory",
                reason:
                  "Applied this card’s inventory price. You can adjust it below.",
              };
          }
          if (parseStoryPrice(label.price) == null && !item && label.detected) {
            const match = matchPhotoCard(label.detected, inventory, {
              currency: settings.currency,
              roundUp: roundUpPrices,
              marketSource,
            });
            if (match.item && match.price != null)
              return {
                ...label,
                ...cardLabelFields(match.item, label.detected),
                name: match.item.name,
                price: priceText(match.price),
                priceSource: "inventory",
                reason: match.reason,
                itemKey: getInventoryKey(
                  match.item,
                  inventory.indexOf(match.item),
                ),
                confirmed: match.confident && !label.needsPositionReview,
              };
          }
          return {
            ...label,
            ...labelCardFields(label, inventory),
            priceSource: item ? "inventory" : "manual",
          };
        }),
      }));
      return changed ? next : previous;
    });
  }, [inventory, loading, settings.currency, roundUpPrices, marketSource]);

  matchingContext.current = {
    inventory,
    currency: settings.currency,
    roundUp: roundUpPrices,
    marketSource,
  };
  const active =
    photos.find((photo) => photo.id === activeId) || photos[0] || null;
  const selected =
    active?.labels.find((label) => label.id === selectedId) ||
    active?.labels.find(
      (label) => !label.confirmed || label.needsPositionReview,
    ) ||
    active?.labels[0] ||
    null;
  const updatePhoto = useCallback(
    (id, update) =>
      setPhotos((previous) =>
        previous.map((photo) =>
          photo.id === id
            ? {
                ...photo,
                ...(typeof update === "function" ? update(photo) : update),
              }
            : photo,
        ),
      ),
    [],
  );
  const updateLabel = (id, update) =>
    updatePhoto(active.id, (photo) => ({
      labels: photo.labels.map((label) =>
        label.id === id ? { ...label, ...update } : label,
      ),
    }));

  const scanPhoto = useCallback(
    async (photo) => {
      if (!user || jobs.current.has(photo.id)) return;
      const controller = new AbortController();
      let attempts = 0;
      jobs.current.set(photo.id, controller);
      updatePhoto(photo.id, { status: "scanning", error: "", scanAttempt: 1 });
      try {
        const prepared = photo.scanBase64
          ? photo
          : await prepareStoryPhoto(
              new File([photo.blob], photo.name, { type: photo.blob.type }),
            );
        if (jobs.current.get(photo.id) !== controller || !mounted.current)
          return;
        const callable = httpsCallable(getFunctions(), "parseCardPhoto", {
          timeout: 70000,
        });
        const detected = await runStoryPhotoScan(
          async () => {
            const response = await callable({
              imageBase64: prepared.scanBase64,
              mimeType: prepared.scanMimeType,
            });
            const cards = Array.isArray(response.data?.cards)
              ? response.data.cards
                  .filter(
                    (card) =>
                      card &&
                      typeof card === "object" &&
                      (card.name ||
                        card.cardName ||
                        card.collectorNumber ||
                        card.number),
                  )
                  .slice(0, 12)
              : [];
            if (!cards.length)
              throw Object.assign(new Error("No cards detected"), {
                code: "story/no-cards",
              });
            return cards;
          },
          {
            signal: controller.signal,
            onAttempt: ({ attempt }) => {
              attempts = attempt;
              if (jobs.current.get(photo.id) === controller && mounted.current)
                updatePhoto(photo.id, { scanAttempt: attempt });
            },
          },
        );
        if (jobs.current.get(photo.id) !== controller || !mounted.current)
          return;
        const positions = positionPhotoLabels(detected);
        const labels = detected.map((card, index) => {
          const current = matchingContext.current;
          const match = matchPhotoCard(card, current.inventory, current);
          return {
            id: makeId(),
            name: match.item?.name || card.name || `Card ${index + 1}`,
            detected: card,
            ...cardLabelFields(match.item, card),
            priceSource: match.item ? "inventory" : null,
            ...positions[index],
            price: priceText(match.price),
            itemKey: match.item
              ? getInventoryKey(
                  match.item,
                  current.inventory.indexOf(match.item),
                )
              : null,
            reason: match.reason,
            confirmed:
              match.confident &&
              match.price != null &&
              !positions[index].needsPositionReview,
          };
        });
        updatePhoto(photo.id, {
          status: "review",
          labels,
          error: "",
          scanBase64: undefined,
          scanMimeType: undefined,
        });
      } catch (error) {
        if (
          jobs.current.get(photo.id) === controller &&
          mounted.current &&
          error.name !== "AbortError"
        )
          updatePhoto(photo.id, {
            status: "review",
            error: errorMessage(error, attempts),
          });
      } finally {
        if (jobs.current.get(photo.id) === controller)
          jobs.current.delete(photo.id);
      }
    },
    [user, updatePhoto],
  );

  useEffect(() => {
    if (photos.some((photo) => photo.status === "scanning")) return;
    const next = photos.find((photo) => photo.status === "queued");
    if (next) scanPhoto(next);
  }, [photos, scanPhoto]);

  const addFiles = async (files) => {
    if (uploadLock.current || loading) return;
    uploadLock.current = true;
    setUploading(true);
    setNotice("");
    const available = Math.max(0, MAX_PHOTOS - photoRef.current.length);
    const batch = Array.from(files).slice(0, available);
    const errors =
      Array.from(files).length > available
        ? [`Keep each batch to ${MAX_PHOTOS} photos. Extra files were skipped.`]
        : [];
    for (const file of batch) {
      try {
        const prepared = await prepareStoryPhoto(file);
        if (!mounted.current) break;
        const photo = {
          ...prepared,
          url: createUrl(prepared.blob),
          status: autoScan ? "queued" : "review",
          labels: [],
          error: "",
        };
        setPhotos((previous) => [...previous, photo]);
        setActiveId((previous) => previous || photo.id);
      } catch (error) {
        errors.push(
          `${file.name}: ${error.message || "Could not open this photo."}`,
        );
      }
    }
    uploadLock.current = false;
    if (mounted.current) {
      setUploading(false);
      if (errors.length) setNotice(errors.join(" "));
    }
  };

  const removePhoto = (photo) => {
    jobs.current.get(photo.id)?.abort();
    jobs.current.delete(photo.id);
    setPhotos((previous) => previous.filter((entry) => entry.id !== photo.id));
    if (active?.id === photo.id) {
      setActiveId(photos.find((entry) => entry.id !== photo.id)?.id || null);
      setSelectedId(null);
    }
    URL.revokeObjectURL(photo.url);
    urls.current.delete(photo.url);
  };
  const addLabel = (item = null) => {
    if (!active) return;
    const price = item
      ? getStoryPrice(item, settings.currency, roundUpPrices, marketSource)
      : null;
    const id = makeId();
    const label = {
      id,
      name: item?.name || "Custom price",
      ...cardLabelFields(item),
      priceSource: item ? "inventory" : "manual",
      price: priceText(price),
      x: 0.5,
      y: Math.min(0.86, 0.58 + (active.labels.length % 4) * 0.08),
      width: 0.25,
      confirmed: false,
      needsPositionReview: true,
      itemKey: item ? getInventoryKey(item, inventory.indexOf(item)) : null,
      reason: "Position this label on the right card, then confirm.",
    };
    updatePhoto(active.id, (photo) => ({ labels: [...photo.labels, label] }));
    setSelectedId(id);
    setSearch("");
  };
  const chooseItem = (item) => {
    const price = getStoryPrice(
      item,
      settings.currency,
      roundUpPrices,
      marketSource,
    );
    if (!selected) {
      addLabel(item);
      return;
    }
    updateLabel(selected.id, {
      name: item.name,
      ...cardLabelFields(item),
      priceSource: "inventory",
      price: priceText(price),
      itemKey: getInventoryKey(item, inventory.indexOf(item)),
      confirmed: false,
      reason:
        "Inventory price and card details applied. You can change them below.",
    });
    setSearch("");
  };
  const labelForExport = (label) => ({
    ...label,
    ...labelCardFields(label, inventory),
    price: priceText(label.price),
    priceText:
      parseStoryPrice(label.price) == null
        ? ""
        : formatStoryPrice(parseStoryPrice(label.price), settings.currency),
    secondaryText:
      settings.includeSecondary &&
      settings.secondaryCurrency &&
      settings.secondaryCurrency !== settings.currency &&
      parseStoryPrice(label.price) != null
        ? formatStoryPrice(
            convertCurrency(
              parseStoryPrice(label.price),
              settings.secondaryCurrency,
              settings.currency,
            ),
            settings.secondaryCurrency,
          )
        : "",
  });
  const previewPhoto = useMemo(
    () =>
      active && {
        ...active,
        labels: active.labels.map((label) => ({
          ...label,
          ...labelCardFields(label, inventory),
          price: priceText(label.price),
          priceText:
            parseStoryPrice(label.price) == null
              ? "Set price"
              : formatStoryPrice(
                  parseStoryPrice(label.price),
                  settings.currency,
                ),
          secondaryText:
            settings.includeSecondary &&
            settings.secondaryCurrency &&
            settings.secondaryCurrency !== settings.currency &&
            parseStoryPrice(label.price) != null
              ? formatStoryPrice(
                  convertCurrency(
                    parseStoryPrice(label.price),
                    settings.secondaryCurrency,
                    settings.currency,
                  ),
                  settings.secondaryCurrency,
                )
              : "",
        })),
      },
    [active, settings, inventory],
  );
  useEffect(() => {
    if (!previewPhoto) {
      setRenderedPreview(null);
      return;
    }
    let cancelled = false;
    let previewUrl = null;
    const timer = setTimeout(() => {
      exportStoryPhoto(previewPhoto, settings, { maxDimension: 1000 })
        .then((blob) => {
          if (cancelled) return;
          previewUrl = URL.createObjectURL(blob);
          setRenderedPreview({ photoId: previewPhoto.id, url: previewUrl });
          setPreviewError("");
        })
        .catch(() => {
          if (!cancelled)
            setPreviewError(
              "Preview could not be rendered. Try another photo or refresh this draft.",
            );
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewPhoto, settings]);
  const layout =
    active && getPhotoLayout(active.width, active.height, settings.format);
  const searchResults = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return inventory
      .filter((item) =>
        terms.every((term) =>
          `${item.name} ${itemDescription(item)}`.toLowerCase().includes(term),
        ),
      )
      .slice(0, 12);
  }, [search, inventory]);
  const suggestedMatches =
    selected?.detected && !selected.confirmed
      ? matchPhotoCard(selected.detected, inventory, {
          currency: settings.currency,
          roundUp: roundUpPrices,
          marketSource,
        }).candidates.slice(0, 4)
      : [];
  const needsReview =
    active?.labels.filter(
      (label) =>
        !label.confirmed ||
        label.needsPositionReview ||
        parseStoryPrice(label.price) == null,
    ).length || 0;
  const readyCount = photos.filter(isReady).length;
  const selectedPhotos = photos.filter(
    (photo) => !omittedPhotoIds.has(photo.id),
  );
  const selectedReadyPhotos = selectedPhotos.filter(isReady);
  const activeIndex = photos.findIndex((photo) => photo.id === active?.id);
  const selectPhoto = (id) => {
    setActiveId(id);
    setSelectedId(null);
    setSearch("");
  };
  const nextPhoto = () => {
    if (activeIndex < photos.length - 1)
      selectPhoto(photos[activeIndex + 1].id);
    else setNotice("This photo is ready to save.");
  };
  const confirmLabel = (id) => {
    const index = active.labels.findIndex((label) => label.id === id);
    const label = active.labels[index];
    if (
      !label ||
      parseStoryPrice(label.price) == null ||
      active.status !== "review"
    )
      return;
    updateLabel(id, {
      confirmed: true,
      needsPositionReview: false,
      price: priceText(label.price),
      reason: "Price and placement checked by you.",
    });
    const unfinished = active.labels.find(
      (entry) =>
        entry.id !== id &&
        (entry.needsPositionReview || parseStoryPrice(entry.price) === null),
    );
    if (index < active.labels.length - 1)
      setSelectedId(active.labels[index + 1].id);
    else if (unfinished) {
      setSelectedId(unfinished.id);
      setNotice(
        "Check the remaining price or placement before saving this photo.",
      );
    } else nextPhoto();
  };
  const confirmPhoto = () => {
    if (
      !active?.labels.length ||
      active.status !== "review" ||
      active.labels.some((label) => parseStoryPrice(label.price) == null)
    )
      return;
    updatePhoto(active.id, (photo) => ({
      labels: photo.labels.map((label) => ({
        ...label,
        confirmed: true,
        needsPositionReview: false,
        price: priceText(label.price),
        reason: "Price and placement checked by you.",
      })),
    }));
    nextPhoto();
  };
  const openSave = (batch) => {
    if (!batch.length || batch.some((photo) => !isReady(photo))) return;
    setSaveBatch({
      photos: batch.map((photo) => ({
        ...photo,
        labels: photo.labels.map(labelForExport),
      })),
      settings: { ...settings },
    });
  };
  const selectedCard = selected ? labelCardFields(selected, inventory) : null;
  const selectedCondition = selectedCard
    ? STORY_CONDITION_OPTIONS.find(
        (option) =>
          getStoryConditionBadge(option.value) ===
          getStoryConditionBadge(selectedCard.condition),
      )?.value || ""
    : "";

  const moveFromPointer = (event, label) => {
    if (!stage.current || !layout) return;
    const bounds = stage.current.getBoundingClientRect();
    const x =
      (((event.clientX - bounds.left) / bounds.width) * layout.width -
        layout.imageX) /
      layout.imageWidth;
    const y =
      (((event.clientY - bounds.top) / bounds.height) * layout.height -
        layout.imageY) /
      layout.imageHeight;
    updateLabel(label.id, {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      needsPositionReview: false,
    });
  };
  const download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }, 30000);
  };
  const exportPhotos = async (batch) => {
    if (
      exportLock.current ||
      !batch.length ||
      batch.some((photo) => !isReady(photo))
    )
      return;
    exportLock.current = true;
    setExporting(true);
    setNotice("");
    try {
      const files = [];
      for (const photo of batch) {
        const blob = await exportStoryPhoto(
          { ...photo, labels: photo.labels.map(labelForExport) },
          settings,
        );
        const filename = `${
          photo.name
            .replace(/\.[^.]+$/, "")
            .replace(/[^\p{L}\p{N} _-]/gu, "")
            .slice(0, 70) || "story"
        }-prices.png`;
        files.push(new File([blob], filename, { type: "image/png" }));
      }
      if (files.length > 1)
        download(await createStoryPhotoArchive(files), "rafchu-story-sale.zip");
      else files.forEach((file) => download(file, file.name));
      if (mounted.current)
        setNotice(
          `${files.length === 1 ? "Photo" : `${files.length} photos`} ready. Check your downloads.`,
        );
    } catch (error) {
      if (mounted.current && error.name !== "AbortError")
        setNotice(
          "Could not export your photo. Your draft is still here; please try again.",
        );
    } finally {
      exportLock.current = false;
      if (mounted.current) setExporting(false);
    }
  };

  if (loading)
    return (
      <div className="photo-studio-loading" role="status">
        <Loader2 className="animate-spin" /> Opening your photo studio…
      </div>
    );
  return (
    <div className={`photo-studio ${photos.length ? "has-photos" : ""}`}>
      <header className="photo-studio-hero">
        <div>
          <p className="photo-studio-eyebrow">RAFCHU · STORY SALE</p>
          <h1>
            Your photos.
            <br />
            <span>Priced and ready to post.</span>
          </h1>
          <p>
            Upload your card photos. We’ll find the cards, match your inventory
            prices, and place the labels. You make the final adjustments.
          </p>
        </div>
        <ol className="photo-studio-steps">
          <li>
            <span>1</span> Upload photos
          </li>
          <li>
            <span>2</span> Review prices & placement
          </li>
          <li>
            <span>3</span> Download or share
          </li>
        </ol>
      </header>
      <div className="photo-studio-status">
        <span>{saveState || "Your original photos stay untouched"}</span>
        <span>
          {settings.currency} prices
          {settings.includeSecondary && settings.secondaryCurrency
            ? ` + ${settings.secondaryCurrency}`
            : ""}
        </span>
      </div>
      {notice && (
        <div className="photo-studio-notice" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      <section
        className={`photo-studio-upload ${dragOver ? "is-dragging" : ""} ${photos.length ? "has-photos" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFiles(event.dataTransfer.files);
        }}
        aria-label="Upload your photos"
      >
        <div className="photo-studio-upload-copy">
          <div className="photo-studio-upload-icon">
            <Upload size={24} />
          </div>
          <div>
            <h2>
              {photos.length
                ? "Add another photo"
                : "Start with your own photos"}
            </h2>
            <p>Drop JPG, PNG or WebP photos here · up to 25 MB each</p>
          </div>
        </div>
        <div className="photo-studio-upload-actions">
          <Button
            disabled={uploading || photos.length >= MAX_PHOTOS}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}{" "}
            {uploading ? "Processing photos…" : "Choose photos"}
          </Button>
          <Button
            variant="outline"
            disabled={uploading || photos.length >= MAX_PHOTOS}
            onClick={() => cameraInput.current?.click()}
            aria-label="Take a photo"
          >
            <Camera size={18} />
          </Button>
        </div>
        <input
          ref={fileInput}
          className="sr-only"
          aria-label="Choose photo files"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          className="sr-only"
          aria-label="Camera photo"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="photo-studio-scan-choice">
          <label>
            <input
              type="checkbox"
              checked={autoScan}
              onChange={(event) => setAutoScan(event.target.checked)}
            />{" "}
            Find cards and place prices automatically
          </label>
          <p>
            Automatic matching sends a reduced copy to Rafchu’s card scanner.
            You can also add prices yourself.
          </p>
        </div>
      </section>
      {!photos.length && (
        <div className="photo-studio-empty">
          <ImageIcon size={36} />
          <h2>The picture is yours. We add the prices.</h2>
          <p>
            Tabletop layouts, single cards and slabs all work. Keep cards
            readable, with up to 12 per photo. We apply the best matching
            inventory prices automatically. You can correct any match afterward.
          </p>
          <p>
            No inventory match? Add a custom price. No photo crops or
            replacement artwork.
          </p>
        </div>
      )}
      {!!photos.length && (
        <>
          <div className="photo-studio-batch-bar">
            <div>
              <label>
                <input
                  type="checkbox"
                  aria-label="Select all photos"
                  checked={selectedPhotos.length === photos.length}
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selectedPhotos.length > 0 &&
                        selectedPhotos.length < photos.length;
                  }}
                  onChange={(event) =>
                    setOmittedPhotoIds(
                      event.target.checked
                        ? new Set()
                        : new Set(photos.map((photo) => photo.id)),
                    )
                  }
                />
                Select all
              </label>
              <span>
                {selectedPhotos.length} selected · {selectedReadyPhotos.length}{" "}
                ready to save
              </span>
            </div>
            <Button
              disabled={!selectedReadyPhotos.length || exporting}
              onClick={() => openSave(selectedReadyPhotos)}
            >
              <Download size={16} /> Save selected ({selectedReadyPhotos.length}
              )
            </Button>
          </div>
          {selectedPhotos.length > selectedReadyPhotos.length && (
            <p className="photo-studio-batch-hint">
              {selectedPhotos.length - selectedReadyPhotos.length} selected
              photo(s) still need scanning, prices or placement. Only the{" "}
              {selectedReadyPhotos.length} ready photos will be included.
            </p>
          )}
          <nav className="photo-studio-filmstrip" aria-label="Your sale photos">
            {photos.map((photo, index) => (
              <div className="photo-studio-thumb" key={photo.id}>
                <button
                  aria-label={`Edit photo ${index + 1}: ${photo.name}`}
                  aria-pressed={active?.id === photo.id}
                  onClick={() => selectPhoto(photo.id)}
                >
                  <img src={photo.url} alt="" />
                  <span>{index + 1}</span>
                  <small>
                    {photo.status === "scanning"
                      ? `Scanning ${photo.scanAttempt || 1}/${MAX_STORY_SCAN_ATTEMPTS}`
                      : photo.status === "queued"
                        ? "Queued"
                        : isReady(photo)
                          ? "Ready"
                          : "Review"}
                  </small>
                </button>
                <label className="photo-studio-thumb-select">
                  <input
                    type="checkbox"
                    aria-label={`Select photo ${index + 1}: ${photo.name}`}
                    checked={!omittedPhotoIds.has(photo.id)}
                    onChange={(event) =>
                      setOmittedPhotoIds((previous) => {
                        const next = new Set(previous);
                        if (event.target.checked) next.delete(photo.id);
                        else next.add(photo.id);
                        return next;
                      })
                    }
                  />
                  <span className="sr-only">Select photo {index + 1}</span>
                </label>
              </div>
            ))}
          </nav>
          {active && (
            <div className="photo-studio-workspace">
              <section className="photo-studio-preview-panel">
                <div className="photo-studio-panel-heading">
                  <div>
                    <h2>{active.name}</h2>
                    <p>
                      {active.labels.length} price label
                      {active.labels.length === 1 ? "" : "s"} ·{" "}
                      {active.status === "scanning"
                        ? "Finding cards…"
                        : active.status === "queued"
                          ? "Waiting to scan…"
                          : needsReview
                            ? `${needsReview} to review`
                            : active.labels.length
                              ? "Ready to download"
                              : "Add a price to begin"}
                    </p>
                  </div>
                  <button
                    className="photo-studio-icon-button"
                    aria-label="Remove current photo"
                    onClick={() => removePhoto(active)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="photo-studio-preview-background">
                  <div
                    ref={stage}
                    className="photo-studio-canvas"
                    data-testid="photo-preview"
                    style={{
                      aspectRatio: `${layout.width} / ${layout.height}`,
                      maxWidth: `min(${settings.format === "story" ? 380 : 680}px, calc(55svh * ${layout.width / layout.height}))`,
                      background: settings.backgroundColor || "#0f172a",
                    }}
                  >
                    <img
                      src={active.url}
                      alt={`Your uploaded photo: ${active.name}`}
                      draggable="false"
                      style={{
                        position: "absolute",
                        visibility:
                          renderedPreview?.photoId === active.id
                            ? "hidden"
                            : "visible",
                        left: `${(layout.imageX / layout.width) * 100}%`,
                        top: `${(layout.imageY / layout.height) * 100}%`,
                        width: `${(layout.imageWidth / layout.width) * 100}%`,
                        height: `${(layout.imageHeight / layout.height) * 100}%`,
                      }}
                    />
                    {renderedPreview?.photoId === active.id && (
                      <img
                        className="photo-studio-rendered"
                        src={renderedPreview.url}
                        alt="Price photo export preview"
                        draggable="false"
                      />
                    )}
                    {previewPhoto.labels.map((label, index) => {
                      const box = getPhotoLabelGeometry(
                        label,
                        previewPhoto,
                        settings,
                      );
                      return (
                        <button
                          key={label.id}
                          className={`photo-studio-price ${selected?.id === label.id ? "is-selected" : ""} ${!label.confirmed ? "needs-review" : ""}`}
                          aria-label={`Move price label ${index + 1}: ${label.name}`}
                          style={{
                            left: `${(box.x / layout.width) * 100}%`,
                            top: `${(box.y / layout.height) * 100}%`,
                            width: `${(box.width / layout.width) * 100}%`,
                            height: `${(box.height / layout.height) * 100}%`,
                            color: settings.labelColor,
                            background: "transparent",
                            borderRadius: `${((box.width * 0.055) / layout.width) * 100}cqw`,
                          }}
                          onClick={() => setSelectedId(label.id)}
                          onPointerDown={(event) => {
                            setSelectedId(label.id);
                            drag.current = label.id;
                            event.currentTarget.setPointerCapture?.(
                              event.pointerId,
                            );
                            event.preventDefault();
                          }}
                          onPointerMove={(event) => {
                            if (drag.current === label.id)
                              moveFromPointer(event, label);
                          }}
                          onPointerUp={() => {
                            drag.current = null;
                          }}
                          onPointerCancel={() => {
                            drag.current = null;
                          }}
                          onKeyDown={(event) => {
                            const directions = {
                              ArrowLeft: [-0.01, 0],
                              ArrowRight: [0.01, 0],
                              ArrowUp: [0, -0.01],
                              ArrowDown: [0, 0.01],
                            };
                            if (directions[event.key]) {
                              event.preventDefault();
                              const [dx, dy] = directions[event.key];
                              updateLabel(label.id, {
                                x: Math.max(0, Math.min(1, label.x + dx)),
                                y: Math.max(0, Math.min(1, label.y + dy)),
                                needsPositionReview: false,
                              });
                            }
                          }}
                        >
                          <span className="sr-only">{label.priceText}</span>
                        </button>
                      );
                    })}
                    {["scanning", "queued"].includes(active.status) && (
                      <div className="photo-studio-scanning" role="status">
                        <Loader2 className="animate-spin" size={28} />
                        <strong>
                          {active.status === "queued"
                            ? "Waiting to scan…"
                            : active.scanAttempt > 1
                              ? `Trying again · attempt ${active.scanAttempt} of ${MAX_STORY_SCAN_ATTEMPTS}`
                              : "Finding cards & prices…"}
                        </strong>
                        <span>
                          We retry temporary failures automatically, up to{" "}
                          {MAX_STORY_SCAN_ATTEMPTS} attempts.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            jobs.current.get(active.id)?.abort();
                            jobs.current.delete(active.id);
                            updatePhoto(active.id, { status: "review" });
                          }}
                        >
                          Continue manually
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {previewError && (
                  <p className="photo-studio-error" role="alert">
                    {previewError}
                  </p>
                )}
                <p className="photo-studio-canvas-help">
                  <Move size={14} /> Drag a price onto its card. Use arrow keys
                  for fine adjustments.
                </p>
                <StoryPhotoQuickReview
                  photo={active}
                  selectedLabel={selected}
                  currency={settings.currency}
                  selectedCondition={selectedCondition}
                  isGraded={selectedCard?.isGraded}
                  onSelectLabel={setSelectedId}
                  onUpdateLabel={updateLabel}
                  onConfirmLabel={confirmLabel}
                  onConfirmPhoto={confirmPhoto}
                  onPreviousPhoto={() =>
                    activeIndex > 0 && selectPhoto(photos[activeIndex - 1].id)
                  }
                  onNextPhoto={nextPhoto}
                  photoIndex={activeIndex}
                  photoCount={photos.length}
                  disabled={active.status !== "review"}
                />
                <div className="photo-studio-format">
                  <label>
                    Export size
                    <select
                      aria-label="Export size"
                      value={settings.format}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          format: event.target.value,
                        }))
                      }
                    >
                      <option value="original">Original photo ratio</option>
                      <option value="story">
                        Instagram Story · 1080 × 1920
                      </option>
                    </select>
                  </label>
                  <p>
                    {settings.format === "story"
                      ? "Your whole photo fits inside the story, without cropping."
                      : "Keeps your composition. Longest edge up to 2800 px."}
                  </p>
                </div>
              </section>
              <aside className="photo-studio-editor">
                <div className="photo-studio-panel-heading">
                  <div>
                    <h2>Prices & placement</h2>
                    <p>Prices applied for you. Change any label.</p>
                  </div>
                  <span className="photo-studio-count">
                    {
                      active.labels.filter(
                        (label) =>
                          !label.needsPositionReview &&
                          parseStoryPrice(label.price) != null,
                      ).length
                    }
                    /{active.labels.length}
                  </span>
                </div>
                {active.error && (
                  <div className="photo-studio-error" role="alert">
                    <AlertCircle size={18} />
                    <span>{active.error}</span>
                  </div>
                )}
                {active.status === "review" && !active.labels.length && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => scanPhoto(active)}
                  >
                    <RotateCcw size={16} />{" "}
                    {active.error
                      ? "Retry automatic matching"
                      : "Find cards & prices"}
                  </Button>
                )}
                <div
                  className="photo-studio-label-list"
                  aria-label="Price labels"
                >
                  {active.labels.map((label, index) => (
                    <button
                      key={label.id}
                      aria-pressed={selected?.id === label.id}
                      onClick={() => {
                        setSelectedId(label.id);
                        setSearch("");
                      }}
                    >
                      <span
                        className={`photo-studio-label-index ${label.confirmed && !label.needsPositionReview ? "is-confirmed" : ""}`}
                      >
                        {label.confirmed && !label.needsPositionReview ? (
                          <Check size={14} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span>
                        <strong>{label.name}</strong>
                        <small>
                          {label.confirmed && !label.needsPositionReview
                            ? label.priceSource === "inventory"
                              ? "Inventory price applied"
                              : "Checked"
                            : label.needsPositionReview
                              ? "Check placement"
                              : parseStoryPrice(label.price) != null
                                ? "Suggested price · editable"
                                : "Add a price"}
                        </small>
                      </span>
                      <b>
                        {parseStoryPrice(label.price) == null
                          ? "Set price"
                          : formatStoryPrice(
                              parseStoryPrice(label.price),
                              settings.currency,
                            )}
                      </b>
                    </button>
                  ))}
                </div>
                {selected && (
                  <section
                    className="photo-studio-label-editor"
                    aria-label="Selected price label"
                  >
                    <div className="photo-studio-label-title">
                      <strong>
                        Edit label {active.labels.indexOf(selected) + 1}
                      </strong>
                      <button
                        aria-label="Remove selected price label"
                        className="photo-studio-icon-button"
                        onClick={() => {
                          updatePhoto(active.id, (photo) => ({
                            labels: photo.labels.filter(
                              (label) => label.id !== selected.id,
                            ),
                          }));
                          setSelectedId(null);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <label>
                      Card or label name
                      <input
                        aria-label="Label name"
                        value={selected.name}
                        onChange={(event) =>
                          updateLabel(selected.id, {
                            name: event.target.value,
                            confirmed: false,
                          })
                        }
                      />
                    </label>
                    <label>
                      Price ({settings.currency})
                      <input
                        aria-label="Label price"
                        inputMode="decimal"
                        placeholder="e.g. 125"
                        value={selected.price}
                        onChange={(event) =>
                          updateLabel(selected.id, {
                            price: event.target.value,
                            priceSource: "manual",
                            confirmed: false,
                          })
                        }
                        onBlur={() => {
                          if (parseStoryPrice(selected.price) != null)
                            updateLabel(selected.id, {
                              price: priceText(selected.price),
                            });
                        }}
                      />
                    </label>
                    <p className="photo-studio-match-reason">
                      Prices use whole {settings.currency} amounts. Decimal
                      entries are rounded to the nearest whole unit.
                    </p>
                    {selectedCard?.isGraded ? (
                      <p className="photo-studio-match-reason">
                        Graded card ·{" "}
                        {[selectedCard.gradingCompany, selectedCard.grade]
                          .filter(Boolean)
                          .join(" ") || "Slab"}
                      </p>
                    ) : (
                      <label>
                        Raw card condition
                        <select
                          aria-label="Card condition"
                          value={selectedCondition}
                          onChange={(event) =>
                            updateLabel(selected.id, {
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
                        <span className="photo-studio-condition-hint">
                          {settings.showCondition === false
                            ? "Condition badges are hidden. Turn them on in Label style to include this condition."
                            : selectedCondition
                              ? `The ${getStoryConditionBadge(selectedCard.condition)} badge is included on this raw card.`
                              : "Choose a condition to add its badge. Inventory matches use your saved condition."}
                        </span>
                      </label>
                    )}
                    {parseStoryPrice(selected.price) == null && (
                      <p className="photo-studio-field-error">
                        Enter a price greater than zero to include this label.
                      </p>
                    )}
                    <p className="photo-studio-match-reason">
                      {selected.reason}
                    </p>
                    {selected.needsPositionReview && (
                      <label className="photo-studio-check-position">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() =>
                            updateLabel(selected.id, {
                              needsPositionReview: false,
                            })
                          }
                        />{" "}
                        This label is on the correct card
                      </label>
                    )}
                    <p className="photo-studio-match-reason">
                      Checking a filled label is optional; you can download and
                      correct it at any time.
                    </p>
                    <Button
                      className="w-full"
                      disabled={
                        parseStoryPrice(selected.price) == null ||
                        selected.needsPositionReview ||
                        ["scanning", "queued"].includes(active.status)
                      }
                      onClick={() =>
                        updateLabel(selected.id, {
                          confirmed: true,
                          reason:
                            "Match, price and placement confirmed by you.",
                        })
                      }
                    >
                      <Check size={16} />{" "}
                      {selected.confirmed ? "Confirmed" : "Confirm this label"}
                    </Button>
                  </section>
                )}
                {!!suggestedMatches.length && (
                  <section className="photo-studio-suggestions">
                    <h3>Possible inventory matches</h3>
                    <div className="photo-studio-results">
                      {suggestedMatches.map(({ item, price }, index) => (
                        <button
                          key={getInventoryKey(item, index)}
                          onClick={() => chooseItem(item)}
                        >
                          <span>
                            <strong>{item.name}</strong>
                            <small>{itemDescription(item)}</small>
                          </span>
                          <b>
                            {price == null
                              ? "No price"
                              : formatStoryPrice(price, settings.currency)}
                          </b>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <section className="photo-studio-find">
                  <label htmlFor="story-inventory-search">
                    <Search size={15} />{" "}
                    {selected
                      ? "Match selected label to inventory"
                      : "Find a card in your inventory"}
                  </label>
                  <input
                    id="story-inventory-search"
                    placeholder="Search name, set or card number"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    disabled={["scanning", "queued"].includes(active.status)}
                  />
                  {search.trim() && (
                    <div className="photo-studio-results">
                      {searchResults.length ? (
                        searchResults.map((item, index) => (
                          <button
                            key={getInventoryKey(item, index)}
                            onClick={() => chooseItem(item)}
                          >
                            <span>
                              <strong>{item.name}</strong>
                              <small>{itemDescription(item)}</small>
                            </span>
                            <b>
                              {getStoryPrice(
                                item,
                                settings.currency,
                                roundUpPrices,
                                marketSource,
                              ) == null
                                ? "No price"
                                : formatStoryPrice(
                                    getStoryPrice(
                                      item,
                                      settings.currency,
                                      roundUpPrices,
                                      marketSource,
                                    ),
                                    settings.currency,
                                  )}
                            </b>
                          </button>
                        ))
                      ) : (
                        <p>
                          No matching inventory cards. You can enter a custom
                          price.
                        </p>
                      )}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={["scanning", "queued"].includes(active.status)}
                    onClick={() => addLabel()}
                  >
                    <Plus size={16} /> Add a price label
                  </Button>
                  <p>
                    Story prices only affect these photos. Your inventory prices
                    stay as saved.
                  </p>
                </section>
                <details className="photo-studio-style">
                  <summary>
                    Label style <ChevronRight size={16} />
                  </summary>
                  <label>
                    Size
                    <input
                      aria-label="Label size"
                      type="range"
                      min="0.6"
                      max="1.6"
                      step="0.05"
                      value={settings.labelScale}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          labelScale: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Label color
                    <select
                      aria-label="Label color"
                      value={settings.labelBackground}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          labelBackground: event.target.value,
                        }))
                      }
                    >
                      <option value="#15803d">Rafchu green</option>
                      <option value="#111827">Ink</option>
                      <option value="#1d4ed8">Blue</option>
                      <option value="#9f1239">Berry</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.showCondition !== false}
                      onChange={(event) =>
                        setSettings((previous) => ({
                          ...previous,
                          showCondition: event.target.checked,
                        }))
                      }
                    />
                    Show condition badges on raw cards
                  </label>
                  {settings.secondaryCurrency &&
                    settings.secondaryCurrency !== settings.currency && (
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.includeSecondary}
                          onChange={(event) =>
                            setSettings((previous) => ({
                              ...previous,
                              includeSecondary: event.target.checked,
                            }))
                          }
                        />{" "}
                        Show {settings.secondaryCurrency} too
                      </label>
                    )}
                </details>
              </aside>
            </div>
          )}
          <footer className="photo-studio-export">
            <div>
              <strong>
                {readyCount} of {photos.length} photos ready
              </strong>
              <p>
                {active && !isReady(active)
                  ? "Add any missing prices and check provisional positions before downloading."
                  : needsReview
                    ? "Suggested prices are already applied. Check them before posting, or download now."
                    : "Your photo and prices will export just as previewed."}
              </p>
            </div>
            <div>
              <Button
                variant="outline"
                className="photo-studio-desktop-export"
                disabled={!isReady(active) || exporting}
                onClick={() => exportPhotos([active])}
              >
                {exporting ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Download size={16} />
                )}{" "}
                Download photo
              </Button>
              <Button
                disabled={!selectedReadyPhotos.length || exporting}
                onClick={() => openSave(selectedReadyPhotos)}
              >
                Save selected ({selectedReadyPhotos.length})
              </Button>
              {selectedReadyPhotos.length > 1 && (
                <Button
                  variant="outline"
                  className="photo-studio-desktop-export"
                  disabled={exporting}
                  onClick={() => exportPhotos(selectedReadyPhotos)}
                >
                  Download ZIP ({selectedReadyPhotos.length})
                </Button>
              )}
            </div>
          </footer>
        </>
      )}
      {saveBatch && (
        <StoryPhotoSaveDialog
          photos={saveBatch.photos}
          settings={saveBatch.settings}
          onClose={() => setSaveBatch(null)}
          onDownload={download}
        />
      )}
    </div>
  );
}
