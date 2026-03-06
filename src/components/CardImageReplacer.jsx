import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, Upload, Loader2, Check, ImageIcon, Link2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const CLOUD_FUNCTIONS_BASE =
  "https://us-central1-rafchu-tcg-app.cloudfunctions.net";

// ─── Helper: fetch an image URL as a blob for re-upload ───────────────────────

async function fetchImageAsBlob(url) {
  // Attempt 1: Direct fetch (works when server sends CORS headers)
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && blob.type.startsWith("image/")) return blob;
    }
  } catch (_) {
    // CORS blocked — try canvas
  }

  // Attempt 2: Load into <img crossOrigin> → draw to canvas → export blob
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas export failed"));
          },
          "image/png"
        );
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image from URL"));
    img.src = url;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * CardImageReplacer - Search API, paste a URL, or upload a custom image.
 *
 * Props:
 *   - item: the collection/inventory item to update
 *   - onImageUpdate: (entryId, newImageUrl) => void
 *   - onClose: () => void
 */
export function CardImageReplacer({ item, onImageUpdate, onClose }) {
  const { user } = useApp();
  const [tab, setTab] = useState("search"); // "search" | "url" | "upload"

  // Search state
  const [searchQuery, setSearchQuery] = useState(
    `${item?.name || ""} ${item?.number || ""}`.trim()
  );
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // URL state
  const [imageUrl, setImageUrl] = useState("");
  const [urlPreviewLoaded, setUrlPreviewLoaded] = useState(false);
  const [urlPreviewError, setUrlPreviewError] = useState(false);
  const [urlSaving, setUrlSaving] = useState(false);
  const [urlError, setUrlError] = useState("");

  // ─── Shared: upload blob to Firebase Storage ────────────────────────

  const uploadBlobToStorage = useCallback(
    async (blob, ext = "png") => {
      const storage = getStorage();
      const timestamp = Date.now();
      const safeName = (item.name || "card")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase();
      const filename = `${safeName}-${timestamp}.${ext}`;
      const storageRef = ref(storage, `card-images/${user.uid}/${filename}`);
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: blob.type || `image/${ext}`,
      });
      return getDownloadURL(snapshot.ref);
    },
    [item, user]
  );

  // ─── Search ─────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSelected(null);

    try {
      const q = encodeURIComponent(searchQuery.trim());

      // Search both CardMarket (English) and JustTCG (Japanese) in parallel
      const [cmRes, jpRes] = await Promise.all([
        fetch(`${CLOUD_FUNCTIONS_BASE}/searchCardMarket?q=${q}&maxResults=20`)
          .then((r) => (r.ok ? r.json() : { success: false }))
          .catch(() => ({ success: false })),
        fetch(`${CLOUD_FUNCTIONS_BASE}/searchJapaneseCards?q=${q}&limit=20`)
          .then((r) => (r.ok ? r.json() : { success: false }))
          .catch(() => ({ success: false })),
      ]);

      let cards = [];

      // CardMarket (English) results
      if (cmRes?.success && cmRes?.results) {
        cards = cmRes.results
          .map((raw) => {
            const d = raw?.data ?? raw;
            return {
              name: d?.name || "",
              number: String(d?.card_number ?? d?.collector_number ?? d?.number ?? ""),
              set: d?.episode?.name ?? d?.episode_name ?? d?.set_name ?? "",
              image: d?.image ?? d?.images?.[0] ?? "",
              id: d?.id ?? d?.card_id ?? "",
            };
          })
          .filter((c) => c.name && c.image);
      }

      // Japanese card results
      if (jpRes?.success && jpRes?.cards) {
        const jpCards = jpRes.cards
          .map((card) => ({
            name: card.name || "",
            number: String(card.number || ""),
            set: card.set || "",
            image: card.image || card.imageUrl || "",
            id: card.justTcgId || card.id || "",
            isJapanese: true,
          }))
          .filter((c) => c.name && c.image);
        cards = [...cards, ...jpCards];
      }

      setSearchResults(cards);
    } catch (err) {
      console.error("Image search failed:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const [saveError, setSaveError] = useState("");

  const handleSelectImage = useCallback(
    async (card) => {
      setSelected(card);
      setSaving(true);
      setSaveError("");
      try {
        await onImageUpdate(item.entryId, card.image);
        setSaved(true);
        setTimeout(() => onClose(), 1200);
      } catch (err) {
        console.error("Failed to save image:", err);
        setSaveError("Failed to save image. Please try again.");
        setSaving(false);
        setSelected(null);
      }
    },
    [item, onImageUpdate, onClose]
  );

  // ─── Upload ─────────────────────────────────────────────────────────

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file (JPG, PNG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be less than 5MB");
      return;
    }
    setUploadError("");
    setUploadFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setUploadPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleUploadAndSave = useCallback(async () => {
    if (!uploadFile || !user) return;
    setUploading(true);
    setUploadError("");
    try {
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const permanentUrl = await uploadBlobToStorage(uploadFile, ext);
      await onImageUpdate(item.entryId, permanentUrl);
      setSaved(true);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [uploadFile, user, item, onImageUpdate, onClose, uploadBlobToStorage]);

  // ─── URL ────────────────────────────────────────────────────────────

  const handleUrlPreview = useCallback(() => {
    if (!imageUrl.trim()) return;
    setUrlPreviewLoaded(false);
    setUrlPreviewError(false);
    setUrlError("");
    // The <img> tag will handle the preview via onLoad / onError
  }, [imageUrl]);

  const handleUrlSave = useCallback(async () => {
    if (!imageUrl.trim() || !user) return;
    setUrlSaving(true);
    setUrlError("");

    try {
      // Try to fetch and re-upload to Firebase Storage for permanence
      const blob = await fetchImageAsBlob(imageUrl.trim());
      const permanentUrl = await uploadBlobToStorage(blob, "png");
      await onImageUpdate(item.entryId, permanentUrl);
      setSaved(true);
      setTimeout(() => onClose(), 1200);
    } catch (fetchErr) {
      console.warn("Could not download image, saving URL directly:", fetchErr);
      // Fallback: save the original URL directly
      try {
        await onImageUpdate(item.entryId, imageUrl.trim());
        setSaved(true);
        setTimeout(() => onClose(), 1200);
      } catch (err) {
        setUrlError("Failed to save image. Please try again.");
      }
    } finally {
      setUrlSaving(false);
    }
  }, [imageUrl, user, item, onImageUpdate, onClose, uploadBlobToStorage]);

  if (!item) return null;

  const isValidUrl = imageUrl.trim().startsWith("http");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto rounded-2xl">
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">Replace Image</h2>
              <p className="text-sm text-muted-foreground truncate">
                {item.name} &middot; {item.set} &middot; #{item.number}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Success state */}
          {saved && (
            <div className="p-6 text-center">
              <Check className="h-10 w-10 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">Image Updated!</p>
            </div>
          )}

          {!saved && (
            <>
              {/* Tabs */}
              <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-lg">
                <button
                  className={`flex-1 py-2 px-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    tab === "search"
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTab("search")}
                >
                  <Search className="h-3.5 w-3.5 inline mr-1" />
                  Search
                </button>
                <button
                  className={`flex-1 py-2 px-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    tab === "url"
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTab("url")}
                >
                  <Link2 className="h-3.5 w-3.5 inline mr-1" />
                  From URL
                </button>
                <button
                  className={`flex-1 py-2 px-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                    tab === "upload"
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTab("upload")}
                >
                  <Upload className="h-3.5 w-3.5 inline mr-1" />
                  Upload
                </button>
              </div>

              {/* ─── Search Tab ─────────────────────────────── */}
              {tab === "search" && (
                <div>
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Search by name, number, or set..."
                      className="flex-1"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      size="sm"
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {searching && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Searching...</p>
                    </div>
                  )}

                  {!searching && searchResults.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto p-1">
                      {searchResults.map((card, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectImage(card)}
                          disabled={saving}
                          className={`relative group rounded-lg overflow-hidden border-2 transition-all hover:scale-105 hover:shadow-md ${
                            selected?.id === card.id
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-transparent hover:border-gray-300"
                          }`}
                        >
                          <img
                            src={card.image}
                            alt={card.name}
                            className="w-full aspect-[2.5/3.5] object-cover"
                            loading="lazy"
                          />
                          {card.isJapanese && (
                            <span className="absolute top-1 right-1 bg-red-600 text-white text-[8px] font-bold px-1 py-0.5 rounded shadow">
                              JP
                            </span>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                            <p className="text-[10px] text-white font-medium truncate">
                              {card.name}
                            </p>
                            <p className="text-[9px] text-white/70 truncate">
                              {card.set} #{card.number}
                            </p>
                          </div>
                          {saving && selected?.id === card.id && (
                            <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                              <Loader2 className="h-6 w-6 text-white animate-spin" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {!searching && searchResults.length === 0 && searchQuery && (
                    <div className="text-center py-8 text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">
                        No results yet. Hit search or try a different query.
                      </p>
                      <p className="text-xs mt-1">
                        Tip: try the card number (e.g., "SM166") or name + set
                      </p>
                    </div>
                  )}

                  {saveError && (
                    <p className="text-sm text-red-600 mt-2 text-center font-medium">
                      {saveError}
                    </p>
                  )}
                </div>
              )}

              {/* ─── URL Tab ────────────────────────────────── */}
              {tab === "url" && (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Paste a link to a card image from the web. The image will be
                    downloaded and stored permanently in your account so it
                    won't break if the original link goes down.
                  </p>

                  <div className="flex gap-2 mb-3">
                    <Input
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                        setUrlPreviewLoaded(false);
                        setUrlPreviewError(false);
                        setUrlError("");
                      }}
                      onKeyDown={(e) =>
                        e.key === "Enter" && isValidUrl && handleUrlPreview()
                      }
                      placeholder="https://example.com/card-image.jpg"
                      className="flex-1 text-sm"
                    />
                  </div>

                  {/* URL preview */}
                  {isValidUrl && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative">
                        <img
                          src={imageUrl.trim()}
                          alt="Preview"
                          className={`max-h-52 rounded-lg shadow-md object-contain transition-opacity ${
                            urlPreviewLoaded ? "opacity-100" : "opacity-0"
                          }`}
                          onLoad={() => {
                            setUrlPreviewLoaded(true);
                            setUrlPreviewError(false);
                          }}
                          onError={() => {
                            setUrlPreviewError(true);
                            setUrlPreviewLoaded(false);
                          }}
                        />
                        {!urlPreviewLoaded && !urlPreviewError && (
                          <div className="flex items-center justify-center h-32">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {urlPreviewError && (
                        <p className="text-sm text-red-600">
                          Could not load image from this URL. Please check the
                          link and try again.
                        </p>
                      )}

                      {urlPreviewLoaded && (
                        <Button
                          size="sm"
                          onClick={handleUrlSave}
                          disabled={urlSaving}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {urlSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Use This Image
                            </>
                          )}
                        </Button>
                      )}

                      {urlError && (
                        <p className="text-sm text-red-600">{urlError}</p>
                      )}
                    </div>
                  )}

                  {!isValidUrl && imageUrl.trim() && (
                    <p className="text-sm text-red-600 text-center">
                      Please enter a valid URL starting with http:// or https://
                    </p>
                  )}
                </div>
              )}

              {/* ─── Upload Tab ─────────────────────────────── */}
              {tab === "upload" && (
                <div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Can't find the card online? Upload your own image. It will
                    be stored in your account and used only for your collection.
                  </p>

                  {!uploadPreview ? (
                    <label
                      htmlFor="image-replace-upload"
                      className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <Upload className="h-8 w-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600 font-medium">
                        Click to select image
                      </span>
                      <span className="text-xs text-gray-400 mt-1">
                        JPG, PNG, WebP &middot; Max 5MB
                      </span>
                      <input
                        id="image-replace-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </label>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={uploadPreview}
                        alt="Preview"
                        className="h-48 rounded-lg shadow-md object-contain"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUploadFile(null);
                            setUploadPreview(null);
                          }}
                        >
                          Choose Different
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleUploadAndSave}
                          disabled={uploading}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {uploading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Use This Image
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <p className="text-sm text-red-600 mt-2 text-center">
                      {uploadError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CardImageReplacer;
