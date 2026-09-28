# Story Sale photo studio

Story Sale opens on **Your photos**. Uploading a JPEG, PNG or WebP keeps the user's composition and adds price labels to detected card positions. The existing inventory collage builder remains a secondary tab; switching tabs retains the photo draft and current collage session.

## Workflow

1. Upload or capture one or more photos (25 MB each, maximum 20 photos in a draft). Automatic scanning defaults on and explains that a reduced copy is sent to the existing authenticated `parseCardPhoto` callable. Manual editing works without a scanner response.
2. The existing scanner identifies up to 12 cards and their bounding rectangles. Each valid rectangle is retained independently. Missing rectangles receive a provisional placement that must be reviewed.
3. Inventory matching respects name, number, set, raw/slab state, grading company, grade, language and supplied variant/condition information. Ambiguous entries and conflicting or low-confidence observations require selection or manual pricing. No price is inferred from zero or missing values. Inventory selling-price precedence and rounding preferences apply when copying a price; manual story prices retain their cents.
4. Review the selected photo, change the matched inventory card or amount, drag labels, or use arrow keys. Missed cards can be added; false detections can be removed. Each label needs a positive valid price and a confirmed position before download.
5. Download a PNG in the original ratio (longest edge up to 2800 px) or fit the entire photo inside a 1080×1920 Story. Multiple ready photos download in one ZIP. Native sharing is offered where the browser supports it.

## State and rendering

- IndexedDB stores one draft per signed-in user on the current device and origin. Photo blobs, labels and chosen currency/format survive navigation and refresh. This is not cross-device cloud storage. Storage failure is shown beside the editor.
- The photo editor is keyed by account. Async scan results carry per-photo operation tokens; removed photos and cancelled scans cannot overwrite current edits. Scans run sequentially while uploads and manual edits remain available.
- The draft's currency stays fixed once photos exist, preventing later global preference changes from relabelling old numeric amounts. New empty drafts use the current account preferences.
- Preview and downloaded PNG use the same canvas renderer. Drag targets use the same geometry. Story backgrounds fit the source photo without cropping; original-format PNGs preserve transparency. Original uploaded files and inventory data are never rewritten.
- Batch ZIP files have flat UTF-8 names, duplicate-name suffixes and CRC32 checksums. No additional dependencies or backend changes are required.

## Verification and limits

Focused tests cover matching variants, price precedence/currencies, missing or malformed price values, partial detection geometry, preview/export layout, draft storage, archive records, and UI recovery from failed/cancelled scans. The local browser workflow uses controlled scanner responses and synthetic inventory with card-art test photos: upload, review, exact-cent PNG, Story sizing, draft restore and mobile layout are checked. Real AI recognition accuracy depends on photo readability and the existing configured card-scanning service; it is not established by mocked responses. HEIC files must be converted to JPEG/PNG/WebP. Drafts are browser-local and can be lost if site data is cleared.
