# Rafchu Cardmarket Companion 0.3.8

Build with `npm run build:cardmarket`. In Chrome Extensions, Load unpacked:
`public/cardmarket-companion` (this folder contains manifest.json).
After updating or reloading the extension, refresh Rafchu and any existing
Cardmarket reader tab so both pages connect to the new companion version.
This separate pilot preserves the working CardLadder companion installation.
It reads public Cardmarket Pokémon product pages. No cookies, credentials,
private APIs, purchases, seller messages, or Cardmarket inventory writes.

In Rafchu Inventory, open Cardmarket Sync. All manually priced ungraded singles
are shown by default, including ordinary cards and BW promos without variant tags.
Graded and sealed entries are excluded. Uncheck Show manually priced singles only
to include other ungraded singles. The summary shows linked cards and cards that
still need a product match; capture and price application use the displayed scope.
Verified catalogue links and existing
inventory links are suggested automatically. Click Find links and listings to search
Cardmarket for unmatched cards and capture their listing previews in the same run;
the companion selects the matching expansion and
checks names and full collector numbers, including Japanese expansion aliases and
Black & White BW promo names. Compact promo numbers such as BW97 use the numeric
part for searching, while exact matching still checks the full promo number.
Review the suggested URL or replace it. Your edited URLs and saved matches take
precedence over later suggestions. Finding a link never confirms or saves a match.
Confirm the product and its exact
language, condition, reverse status and edition for each ungraded card. Your
existing TCGplayer → Cardmarket condition mapping supplies the suggested condition.
The matching offers from a complete, current preview become available immediately
after confirmation, without another capture. Use Refresh listings for matched cards
when fresh data is needed. Completed offers appear automatically as each card finishes.
You can also use Review latest offers to reopen them. Choose an individual offer and
leave Include checked. Professional/Powerseller/Private labels and country are
shown. The product reference image is shown with a warning that the pictured
variant may differ. Seller-provided scans appear beside their offers and can be
enlarged inside Rafchu. Image URLs stay with the pricing evidence; existing inventory
images are preserved. A Professional and Powerseller only display filter is available.

Manual selling prices remain unless the user checks the explicit replacement
option. There is no automatic pricing, guessed variant match, or invented sale
history. Estimates are EUR asking prices excluding shipping. No matching offers
means no update. The chosen offer's evidence and seller type are retained.

Cardmarket may display a verification screen. Complete it in the visible reader
tab using Open Cardmarket reader, then click Resume capture in Rafchu. The queue
pauses with a clear message and keeps completed cards. Resuming reuses the same
reader tab without navigating away from a completed verification. A Chrome worker
restart also preserves the queue. Stop capture cancels the remaining cards while
keeping completed offers available. No verification bypass is attempted.
Reports expire after 24 hours. Changes to an inventory card's tags, language,
condition, name, set, number or grading invalidate the old product binding.
Sealed, signed, stamped and Poké/Master Ball variants need more precise support
and are held for review in this pilot.


Security update: release builds only expose the bridge to the two Rafchu HTTPS origins. Localhost is no longer trusted automatically: an unrelated local development server must not be able to read your capture reports. If maintaining a local development build, add only its exact origin to the background allowlist and its host to a separate development manifest. Never distribute that development manifest. Reload the extension after installing this update.


## Seller photos in 0.3.0

After updating the companion, refresh Rafchu and the Cardmarket reader, then
capture the linked cards again. Earlier reports contain links only.

Chrome’s `pageCapture` permission saves already-loaded images from the confirmed
Cardmarket reader. The companion temporarily loads the exact seller scan previews
on that page and reads their raster resources from Chrome’s MHTML result. The
page archive, HTML and unrelated resources are discarded. No headers are forged,
no login/verification is bypassed, and no external image proxy is used.

JPEG previews are stored in a separate local cache for the capture, capped at
4 MB total and 120 KB per encoded preview, with up to 40 new previews per product.
The cache is replaced on a new run and is only returned for the matching report
for 24 hours. Prices remain usable if a photo cannot load or the cache is full.
Photos are never included in an inventory/Firestore save and are not synced to
other devices. Original listing links remain available.

The price action says **Save market estimates** by default. To change manual
selling prices too, select **Also replace my manual selling prices**; the button
then says **Update selling prices**. Saving, success and failure feedback appears
next to that button. Failed saves keep the selected offers available for retry.

Version 0.3.1 captures photos only for offers eligible under the same condition, language, variant and raw-card checks used by the review panel. Excluded listings do not consume the preview cache.

## Product lookup in 0.3.3

Search normalizes EX/GX suffixes and the Gold Star symbol and recognises E-Card
expansion prefixes. If the name query misses, it retries once by card number
within the expansion selected from Cardmarket's actual options. Full names,
expansions and collector numbers still have to match; no product is auto-confirmed.
Verified catalogue links include SM201, SM230, Mew Gold Star, Latias EX 112 and
Umbreon H29. Multiple suggestions remain reviewable printing choices.
Completed searches appear as each card finishes and survive a worker interruption.
An unknown expansion reports an error for that card and lets later cards run;
verification or unreadable pages still stop the search and keep partial results.
Retry Suggest product links after completing verification. Permissions are unchanged.

## Search recovery in 0.3.4

Product searches now pause at verification. Open Cardmarket reader, complete
verification, then use Resume product search. The same reader and unfinished
search page are reused, including after a Chrome worker restart. Completed
cards and earlier pages are retained. Stop search clears the pending queue.
If both the full name/number query and the number query miss, search retries
by name within the same expansion; full collector numbers still have to match.
The verified catalogue also includes Pikachu & Zekrom GX from Team Up #33.
Retries keep earlier exact suggestions for unchanged inventory identities for
24 hours. A failed lookup cannot erase a recent valid suggestion.


## Recovery fixes in 0.3.5

Temporary server-error pages (including 503 and 524) receive one ordinary reload
after a short delay. If that retry fails, the task pauses with the error code
and keeps earlier results. Resume can retry that failed page again. Verification
pages are never reloaded automatically: the companion observes the same reader
for up to 40 seconds, continuing if the check clears. If it needs your input,
complete it in the reader and use Resume. Both product search and offer capture
use this recovery behavior. Lost readiness replies are bounded.

An invalid or looping search page marks that card for review and continues to
the next card instead of retaining a queue that can never resume. Partial search
results are not accepted as a finished match; prior exact links are kept. The
completion message distinguishes available suggestions from cards needing review.
Permissions and explicit match/price confirmation are unchanged.

## Combined discovery in 0.3.6

One search now saves both suggested product links and listing previews. Each
printing has its own preview and progress is saved before visiting its listings.
Confirming a product and its filters selects matching offers from that local
capture; it does not run the reader again. Alternative printings never share
prices. Seller-photo previews stay in this browser, within the shared 4 MB photo budget.
No match or price is saved automatically.

Preview coverage records the filters actually available on Cardmarket. Listings
are checked individually again against the confirmed language, condition, finish
and edition. Stale, incomplete, changed-card or incompatible previews cannot be
used for pricing. A failed retry keeps an earlier complete current preview.
Verification pauses at the exact product; resume and worker restart keep the
unfinished printing and previously captured links/listings.

Modern product pages such as Ethan's Ho-Oh can omit edition/reverse controls.
The companion accepts the explicit non-first-edition request on these pages
and still checks each listing, instead of asking for a control Cardmarket hides.
Temporary server-error detection is also corrected. Permissions are unchanged.

## Pagination and storage recovery in 0.3.7

Cardmarket can append offers before its Show more button is ready again. The
reader waits for the rows and button to settle before requesting the next page,
instead of treating that brief disabled state as a capture failure. Waiting is
bounded and still responds to cancellation, navigation and verification.

Listing previews are stored once. The resumable job keeps its queue and progress
without duplicating the offers, and older saved jobs remain compatible.
Search and confirmed-capture photos share a 4 MB budget. Older thumbnails can
be discarded to leave room for listings and recovery status; their original
seller-photo links remain available. Saved reports and offer evidence are kept.
If a new preview cannot fit, that product gets a clear storage warning and the
queue continues. A failed save retains the last durable checkpoint instead of
repeating the same oversized write. No additional permissions are required.

## Completed offer pages and recovery in 0.3.8

Cardmarket hides and disables its Show more button when the last offer page has
loaded. The reader now recognizes that completed state, including Ethan’s Ho-Oh
ex, and does not wait for a hidden button. A visible 300-article limit notice
still means the capture is incomplete; narrow the confirmed filters before retrying.

A pagination failure retries the confirmed product once from a fresh page. If it
still fails, the queue records the card for review and continues to the remaining
products. Completed captures and current inventory prices are preserved. Verification
and changed product/filter pages still pause for attention. After the queue finishes,
Retry failed cards captures only the affected products and retains successful
results. Reload the existing extension, refresh Rafchu and the Cardmarket reader,
then Resume capture to continue a paused 0.3.7 queue.
