# Rafchu CardLadder Companion

## Version 1.1.1 — trusted app pages

Capture reports are available only to the two Rafchu HTTPS sites in a top-level
tab. Localhost and embedded frames are rejected. The multicurrency capture and
review behavior from 1.1.0 is retained.

## Version 1.1.0 — multiple currencies

The reader supports all 13 currency choices currently shown by CardLadder:
USD, CAD, GBP, AUD, EUR, CNY, JPY, SGD, PHP, MXN, NZD, HKD and NOK.
Keep your preferred currency. The reader first visits Account, reads the rendered
Currency setting, then reads Inventory and its sales. It verifies the setting
again before saving the report. It never changes the account setting.

Both the companion and Rafchu app must be updated together. Version 1.1.0 emits
report schema 2 with an explicit capture currency; older Rafchu builds reject it
rather than interpreting non-USD amounts as USD. The updated app also accepts old
schema-1 USD reports. Reload an existing Rafchu tab after its app update.

Dollar and yen symbols are interpreted using the account setting, not guessed.
Prefix/suffix currency labels and grouped decimal-dot/decimal-comma prices are
supported. Unknown currencies, mismatched symbols, malformed prices, and a change
of account currency during capture fail without applying prices. Mixed-currency
reports are rejected before any inventory write. Do not change display currency
while a capture is running.

Sales, reference estimates and saved market prices retain their captured currency.
The preview labels currency codes, including USD/CAD/AUD, and shows the old value
in its stored currency. It omits a raw price difference across different currencies.
Inventory uses its existing FX conversion mechanism (live rates with fallback)
for display/totals, including the additional source currencies. This does not
rewrite the original sale evidence or manual selling-price overrides. New-card
purchase cost is entered in the explicitly displayed Rafchu inventory currency.


This companion reads **Inventory** in your signed-in CardLadder account, follows
each holding's linked PSA profile, loads individual sales newest first until the
two-week cutoff, and prepares an inventory sync report for Rafchu. It reads rendered
pages, not private APIs, session cookies, passwords, or browser storage belonging
to CardLadder. It does not change CardLadder values or holdings.

## Install

1. Run `npm run build:companion` in the Rafchu repository (the production build also does this).
2. Open Chrome's Extensions page (`chrome://extensions`), enable Developer mode,
   and choose **Load unpacked**.
3. Select `public/cardladder-companion` inside the repository. Alternatively,
   download `/cardladder-companion.zip` from Rafchu and extract it first.
4. Chrome will ask for access to CardLadder and the listed Rafchu/local app pages.
   Confirm this in Chrome yourself. Reload CardLadder and Rafchu after installation.
5. Sign in to CardLadder. Select Inventory and clear collection search/filters.
6. In Rafchu: Inventory → Import from CardLadder → **Sync Inventory**.
   The extension popup also has a Sync Inventory button.
7. When capture finishes, choose **Preview latest capture** and review/link cards.
   Each card shows its captured high immediately, alongside the current inventory
   price when linked. Eligible rows start checked except flagged highs; uncheck any row to exclude it
   from this save, or use Select all / Deselect all. Unresolved matches still need
   a link or an explicit Add as new choice before they can apply.
   For a missing card, choose **Add as new — I checked that it is missing**,
   confirm quantity (defaults to one), and optionally enter purchase cost per
   card in the inventory currency shown beside the input. Then apply the selected price updates and additions.

The reader opens a separate visible tab and closes it when finished. CardLadder
pauses its filter-dialog transition in a never-activated background tab. Keep
Chrome running and leave the reader tab visible during capture.

For a read-only installation check before signing into Rafchu, run `npm run dev
-- --host 127.0.0.1 --port 5173` and open
`http://127.0.0.1:5173/companion/cardladder/capture.html` in Chrome. This development
page starts captures and displays their results without applying inventory prices.

## Automatic operation

- Enable **Capture daily** in the extension popup to collect once per day while
  Chrome is running. This opens the visible reader tab. Chrome may defer alarms
  while the computer is asleep.
- Enable **Automatically apply fresh captures** in Rafchu to apply fresh reports
  (including the latest capture) while the signed-in app is open. This preference is per Rafchu account and
  browser origin. Leaving the app closed still allows capture; reopen it within
  24 hours to apply the report, or run a fresh capture.
- The capture schedule and automatic application are separate, opt-in controls.
- Opening a manual preview turns automatic application off on this browser origin
  so your selections control the save. Close the preview and enable automatic
  updates again when ready. Selections apply to this save, not future captures.
- Automatic application updates existing cards only. New cards require an
  explicit selection in the preview; after adding them, later captures can
  update their prices automatically.
- Restart an interrupted capture using Sync Inventory. Partial reader failures
  never replace a card's value; a collection-loading failure discards the new run.
- The extension popup can download the last report as JSON for manual upload.

## Matching and valuation

**Certificate numbers are ignored.** CardLadder can copy them from the example
sale when adding a card, so they are not reliable holding identifiers.

Initial matching requires the same card name, set, year, card number, variation,
language, grading company, and grade. Ambiguous or differently named cards need
a one-time explicit link in the preview. Successful links remember CardLadder's
collection-entry ID and both card identities, and become invalid if either card
identity changes. Distinct cards in the same grade are never fuzzy-matched.

The estimate is the maximum **individual** qualifying sale, not the chart high,
daily average, current value, or an active asking price. Auctions, fixed-price
sales, and accepted offers are included. Verified and unverified results are
included; verification status is retained on the selected sale. Titles must
explicitly match the name, card number, grader, and grade. Bundles, conflicting
grades, and special grading labels are excluded. These conservative title checks
can exclude genuine sales with incomplete titles; the preview reports eligible
counts rather than claiming universal market coverage.

Dates use a fixed UTC capture date. The inclusive calendar bounds are capture
date minus 14 days through capture date, matching CardLadder's displayed two-week
window (e.g. August 23 through September 6). CardLadder does not expose a sale time
on these pages, so this is not a precise rolling 336-hour interval.

Prices are read in the currency selected in CardLadder Account → Display Settings.
The reader records that currency on every sale and provider value. Abbreviated
or malformed prices are rejected. Prices remain per card; inventory quantity
is applied by Rafchu.

No eligible sales: keep the previous value. Failed, stale, incomplete, unmatched,
or ambiguous results: keep the previous value. Manual selling-price overrides,
purchase costs, quantities, and inventory membership remain unchanged. Existing
CSV imports preserve the recorded high and its evidence for an unchanged grade.

## Adding missing cards

The app can add selected, completely captured PSA holdings directly, including
into an empty inventory. Each new card receives its name, set, number, variation,
grader, grade, and eligible highest-sale price. No qualifying sale means the
estimated price stays unset until a later capture finds one. The current reader
does not capture ownership quantity or purchase cost: confirm quantity and
optionally enter cost. Unknown costs remain unset;
certificate numbers are never imported.

Known holding IDs and exact card identities are checked against the latest
inventory inside the saving transaction, preventing duplicate additions on retry
or when another tab added a card after preview. Different naming conventions can
still require an explicit link: check existing inventory before selecting Add as
new. Existing quantities, purchase costs, and selling-price overrides are preserved.

## Reference images and unusual sales

Companion 1.0.4 captures the displayed card thumbnail URL from CardLadder's image
CDN. Rafchu displays the thumbnail and uses it for new cards or empty image fields;
existing images stay unchanged. Selected cards without sales can still receive a
missing image. These are externally hosted reference photos, not permanent copies:
CardLadder can change or remove them. They may depict a sample slab and its cert,
not your physical copy; they never supply a certificate identifier for matching.
Older captures have no image URLs; run a fresh capture with companion 1.0.4.

The preview shows the mean, median, and sample standard deviation of the same
eligible, deduplicated 14-day sales used for valuation. At least five sales are
required to flag potential anomalies. A sale is flagged above 3 standard
deviations from the mean or an absolute modified z-score above 3.5 (median/MAD).
If MAD is zero, the explicitly labeled fallback flags a deviation of at least 25%
from the repeated median. Five sales and the 25% fallback are product heuristics.
See [NIST's outlier guidance](https://itl.nist.gov/div898/handbook/eda/section3/eda35h.htm)
for modified z-scores and the masking limitations of ordinary z-scores.

High and low flags include dates, amounts, and source links. Fewer than five sales
shows insufficient data; no flag is not proof of a fair price. Flags do not prove
a bad sale: rarity, premiums, timing, or reporting issues can explain variation.
If the highest sale is flagged, its row starts unchecked and automatic pricing
skips it. The highest unflagged sale is displayed for comparison; checking the row
explicitly still applies the original highest sale, with the anomaly recorded.
Select all explicitly selects flagged rows too. The applied record retains a
summary of the statistics and high/low anomaly counts.

## Scope and reliability

Version 1 supports **numeric PSA grades** and holdings with a linked PSA profile.
BGS/CGC/SGC, AUTH grades, and missing profiles are reported as skipped. Support
requires validating their profile navigation and label distinctions first.
Collection limit: 1,000 holdings. Per-card scan limit: 10,000 sales. Import report
limit: 50,000 sale records and 8 MB. Reports expire after 24 hours. Page layout
changes, sign-in expiration, or loading stalls surface errors rather than values.

Version 1.0.2 passed an installed, signed-in live capture of all **31 Inventory
holdings**, with **0 reader failures**. The fixed window was August 24 through
September 7, 2026 (UTC); 23 holdings had eligible sales and 8 had none. No inventory
prices were applied. Captured evidence included Lugia V PSA 10 at $1,525 on
August 29 and Pikachu with Grey Felt Hat PSA 10 at $3,250 on August 25.
Run ID: `fcdaec95-ce87-41af-a612-f1d9501206e3`.

All 270 automated tests and the production build passed. Coverage includes checked
and unchecked updates, automatic-save cancellation during manual review, reviewed
additions to empty inventories, duplicate prevention, unknown costs, price
selection, certificate-independent matching, import transactions, waiting for new
documents during navigation, and keeping the date window fixed across midnight.
The reader opens visibly because CardLadder pauses filter-dialog transitions in
a never-activated background tab. Future site changes can still require updates.

## Architecture / API options

The extension provides a small local message API (`status`, `start`, `cancel`,
`report`) to allowlisted Rafchu origins. No public CardLadder proxy is deployed.
The app validates the report and applies prices plus explicitly reviewed additions
in a Firestore transaction against the current user's latest Inventory document.
A stored run ID prevents duplicate automatic application, deterministic holding
IDs prevent repeated additions, and older captures cannot replace newer ones.

Alternative provider research (September 6, 2026):

- [Pokémon Price Tracker](https://www.pokemonpricetracker.com/api-reference)
  offers multi-grader eBay data, but does not expose your CardLadder collection.
- [The Card API](https://www.thecardapi.com/docs) documents individual sales,
  grader/grade/date filters and pagination. Its results are its own dataset;
  coverage and a plan allowing a 14-day lookback need validation before use.
- eBay's Marketplace Insights documentation redirects to restricted access.
  The public Browse API should not be treated as completed-sale history.

We can later serve our normalized, imported data through our own authenticated
API, but creating an API does not itself grant access to CardLadder's database.


## Optional CardLadder Value when there are no sales

The companion reads the exact rendered Inventory `Value` field in the captured
display currency as a provider estimate, independently of sale evidence. The preview offers it only
after a complete capture with zero qualifying sales. Each `Use CardLadder Value`
checkbox starts unchecked. Selecting all rows does not opt into these estimates;
each estimate requires a separate choice and its row must also be included.

The transaction validates that choice again and records `cardladder-value`
provenance, with no invented high-sale record. Automatic updates never use this
fallback. Skipping it preserves the existing market estimate. All manual
selling-price overrides and their currencies stay unchanged even when updating
a market estimate; the preview displays the active manual price separately.
Explicit new-card additions can use this fallback, too. Older captures without
the field require a fresh capture. CSV reimports preserve an accepted estimate
for the same card identity.

Image capture now checks lazy-loaded `data-src` as well as rendered `src`, and
accepts the observed CardLadder CloudFront host, eBay image paths, and the
CardLadder Firebase Storage bucket. Other image hosts are rejected.

## Historical installed 1.0.4 acceptance check

The installed Chrome extension completed run
`adc44c64-de07-4ecc-8754-c550d45518ed` (captured September 7, 2026 UTC):
31/31 holdings complete, 31 reference image URLs, 31 USD CardLadder Values,
23 holdings with qualifying sales and 8 without. All eight no-sale holdings had
an estimate and image, including Mew Gold Star PSA 5 at $4,230 and Shining
Charizard PSA 4 at $6,519. Seven proposed highs were flagged for review.
No live inventory updates were applied. The isolated sample preview confirmed
fallback opt-in, Select all leaving fallback choices unchecked, and preservation
of an active EUR manual selling-price override. Hosting was deployed and its
entry bundle matched the production build (`index-BkwQbmRw.js`).


Security update: release builds only expose the bridge to the two Rafchu HTTPS origins. Localhost is no longer trusted automatically: an unrelated local development server must not be able to read your capture reports. If maintaining a local development build, add only its exact origin to the background allowlist and its host to a separate development manifest. Never distribute that development manifest. Reload the extension after installing this update.
