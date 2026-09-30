# Story Sale photo studio

Story Sale opens on **Your photos**. Uploading a JPEG, PNG or WebP keeps the user's composition and adds price labels to detected card positions. The existing inventory collage builder remains a secondary tab; switching tabs retains the photo draft and current collage session.

## Workflow

1. Upload or capture one or more photos (25 MB each, maximum 20 photos in a draft). Automatic scanning defaults on and explains that a reduced copy is sent to the existing authenticated `parseCardPhoto` callable. Manual editing works without a scanner response.
2. The existing scanner identifies up to 12 cards and their bounding rectangles. Each valid rectangle is retained independently. Missing rectangles receive a provisional placement that must be reviewed.
3. Inventory matching immediately applies the best plausible inventory price. Names and collector numbers identify candidates; set, language, condition and variant rank them. Slabs with matching name, number, grade and grading company can match confidently even when the set is unreadable. Ambiguous or low-confidence matches still get a suggested price, marked as editable. Explicit number, grade, grading company and raw/slab contradictions prevent automatic selection. No positive inventory price or compatible match means manual pricing is still needed.
4. Review the selected photo, change the matched inventory card or amount, drag labels, or use arrow keys. Confirming an applied price is optional. Only missing/invalid prices and provisional positions block download. Missed cards can be added; false detections can be removed.
5. Download a PNG in the original ratio (longest edge up to 2800 px) or fit the entire photo inside a 1080×1920 Story. Multiple ready photos download in one ZIP. Native sharing is offered where the browser supports it.

Prices use whole currency units throughout the photo editor, preview and export, including secondary currencies. Inventory selling-price precedence and the account's round-up preference apply when copying prices. Otherwise prices round to the nearest whole unit; positive sub-unit prices display as 1. Decimal manual entries round when leaving the price field. Inventory prices themselves are never changed.

Raw-card labels include a colored Cardmarket condition badge by default (M / NM / EX / GD / LP / PL / PO), taken from the matched inventory entry. The condition can be corrected per label, or all badges hidden in Label style. Unknown or missing conditions are not invented, and graded cards do not display raw condition badges. Stored inventory LP maps to Cardmarket EX; the explicit Cardmarket Light Played condition displays LP. Badges reserve space above the price and stay inside the draggable label.

## State and rendering

- IndexedDB stores one draft per signed-in user on the current device and origin. Photo blobs, labels and chosen currency/format survive navigation and refresh. This is not cross-device cloud storage. Storage failure is shown beside the editor.
- The photo editor is keyed by account. Async scan results carry per-photo operation tokens; removed photos and cancelled scans cannot overwrite current edits. Scans run sequentially while uploads and manual edits remain available.
- The draft's currency stays fixed once photos exist, preventing later global preference changes from relabelling old numeric amounts. New empty drafts use the current account preferences.
- Older drafts restore with whole-unit prices and inventory conditions. Previously unpriced, unselected detections are matched again when inventory becomes available; existing entered prices are preserved apart from rounding. Clearing a price in the new editor does not trigger automatic refilling.
- Preview and downloaded PNG use the same canvas renderer. Drag targets use the same geometry. Story backgrounds fit the source photo without cropping; original-format PNGs preserve transparency. Original uploaded files and inventory data are never rewritten.
- Batch ZIP files have flat UTF-8 names, duplicate-name suffixes and CRC32 checksums. No additional dependencies or backend changes are required.

## Verification and limits

Focused tests cover automatic matching with incomplete or ambiguous metadata, slab conflicts, whole-unit price precedence/currencies, raw condition mapping and corrections, badge geometry, draft migration, archive records, and UI recovery from failed/cancelled scans. The local browser workflow uses controlled scanner responses and synthetic inventory with card-art test photos: upload, automatic pricing, condition badges, PNG output, Story sizing, draft restore and mobile layout are checked. Real AI recognition accuracy depends on photo readability and the existing configured card-scanning service; it is not established by mocked responses. HEIC files must be converted to JPEG/PNG/WebP. Drafts are browser-local and can be lost if site data is cleared.
