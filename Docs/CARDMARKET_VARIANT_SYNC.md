# Cardmarket variant sync pilot

Implemented: separate Chrome companion 0.2.2, Inventory matching/review panel,
transactional application of individually chosen offers, and reference/seller
photo links. Live read-only capture passed for three representative products.
Hosting was deployed and the live panel was verified in Chrome. No production
inventory prices or product bindings were changed during testing.

## Inventory audit

Observed September 6, 2026 (America/Los_Angeles): 36 ungraded inventory entries,
eight with variant badges, representing seven distinct card/variant identities.
The badges are boolean fields, separate from rarity and generic API prices.

| Inventory card | Tag | Suggested Cardmarket filters |
| --- | --- | --- |
| Jolteon #8, EX Unseen Forces, LP | Reverse Holo | English, EX, reverse |
| Jolteon #7, EX Delta Species, NM | Reverse Holo | English, NM, reverse |
| Dark Vaporeon #9, Legendary Collection, MP | Reverse Holo | English, GD, reverse |
| Blastoise #4, Expedition Base Set, LP | Reverse Holo | English, EX, reverse |
| Shining Gyarados #65, Neo Revelation, MP (two entries) | Unlimited | English, GD, not first edition |
| Shining Steelix #112, Neo Destiny, HP | Unlimited | English, PL, not first edition |
| Charizard 1st Edition #103, Japanese Expedition, NM | 1st Edition | Japanese EC1 103 product, NM, first edition |

Language, product, reverse status, edition and condition require confirmation
before the first capture. The pilot reuses the existing app mapping extracted
unchanged into `src/utils/conditionMappings.js`: NM → NM, LP → EX, MP → GD,
HP → PL, DMG → PO. Users can review the Cardmarket condition suggestion.

Legendary Collection Mewtwo #29 and Crystal Guardians Charizard #4 did not have
Reverse Holo tags. A high manual price does not prove a printing; tags were not
inferred from price or modified. At the final live check, the
current Inventory showed nine tagged entries, including Mewtwo; this had changed
since the initial audit. The panel reads the latest tags. The Japanese Expedition
Charizard was stored as English, so the form explicitly proposes Japanese with a
conflict explanation and requires confirmation, preserving the stored language.
Stamped, sealed, signed, and Poké/Master Ball
variants need more precise matching and are not supported by this pilot.

## Why use the browser

The existing `functions/index.js` integration uses a third-party RapidAPI
service, not Cardmarket's official API. Its requests omit the inventory's variant
flags, while the selected generic 30-day/7-day/NM fields are adjusted with fixed
condition multipliers. That cannot reliably value vintage reverse or edition
variants. This companion instead captures rendered offers from confirmed public
product pages using the site's ordinary filters and Show more results button.
It does not use private APIs, credentials, purchases, or seller messages.

Relevant sources:

- [Official API access status](https://help.cardmarket.com/en/cardmarket-api): new applications are closed.
- [Pokémon identification guide](https://help.cardmarket.com/en/finding-and-listing-pokemon-cards): Japanese product routes and listing attributes.
- [Condition guide](https://help.cardmarket.com/en/CardCondition): Cardmarket's condition categories.
- [Public price guide/catalogue](https://news.cardmarket.com/en/DragonBallSuper/were-making-the-price-guide-and-product-catalogue-available-for-download): useful for product discovery, not proof of an individual offer's attributes.

## User flow

1. In Inventory, open **Cardmarket Sync**. Tagged ungraded cards are shown first;
   turn off the tag filter to show other ungraded entries.
2. Confirm and save the exact product URL, language, condition, reverse status,
   and first edition status. English and Japanese expansions remain distinct.
   Verified catalogue suggestions cover all nine currently tagged entries (eight
   distinct identities). Existing inventory links remain reviewable alternatives.
   **Suggest product links** searches additional cards, reads the expansion
   choices, applies the exact expansion, and ranks matching name/number results.
   English and Japanese routes are kept separate. Suggestions prefill editable
   URL fields; user edits and saved matches are preserved, and confirmation never
   carries over to a changed automatic suggestion.
3. Capture linked cards. The companion processes visible product pages serially.
   It waits for a product document, checks applied filters, loads remaining offers,
   and pauses on verification or incomplete/unreadable data. Open the existing
   reader using **Open Cardmarket reader**, complete browser verification, then
   **Resume capture**. Completed cards appear in the preview automatically and
   survive a later failure, cancellation, or Chrome worker restart. Resuming reuses
   the current filtered page; verification query tokens do not cause an incorrect
   timeout. Exact product and all requested filters are still checked. No bypass
   is attempted.
4. Review individual offers with EUR price excluding shipping, exact condition,
   language, reverse/edition, seller name, country, seller classification, comments,
   photo when available, and a filtered link to the offer. Professional/Powerseller
   and Private labels come from the rendered seller badges. The optional
   professional-only display filter also excludes hidden private choices from Apply.
5. Select one offer per card. Include becomes checked after selection and can be
   unchecked. No lowest, median, or historical sale value is preselected.
6. Apply the chosen prices. By default this stores a separate market estimate;
   manual selling prices remain. The explicit replacement checkbox must be selected
   to replace manual prices. Quantity, acquisition costs and other fields remain.

These are current asking prices, not completed sales or a 14-day maximum. The
review warns when there are fewer than five matching sellers and when the lowest
ask is less than half the third-lowest. Saved evidence includes the chosen offer
and seller type, capture timestamp, filters, product image URL, previous manual
prices and a per-seller comparison sample. No condition discount is applied again.

## Image behavior and current limitation

The reader captures the current product's centre carousel image, not adjacent
products. The UI labels it as a reference whose pictured variant may differ.
Seller-provided scan links are displayed beside the corresponding offer and open
full size. Existing inventory images are preserved.

During live testing, Cardmarket's image CDN returned **403 Request blocked** when
product images or scans were opened outside Cardmarket, while product-page images
were visible. Therefore image capture/link preservation is verified, but inline
rendering could not be verified against that CDN. The UI attempts inline display
and falls back to an explicit message plus the filtered Cardmarket product/offer
link. It does not proxy images or change request permissions to evade the block.

## Live evidence

Captured September 6, 2026, around 21:57 PDT, read-only:

| Product and exact filters | Captured / eligible | Eligible offers |
| --- | --- | --- |
| [Jolteon UF8](https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8), English EX reverse, not first edition | 9 / 2 | €100 Pokecraic, Professional, Ireland; €149.99 DRPOKE63, Private, Italy |
| [Charizard EC1 103](https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Expansion-Pack/Charizard-V2-EC1103), Japanese NM, first edition, non-reverse | 9 / 1 | €899.99 Jokerslair, Professional, Italy; “NM- little scratch under right wing” |
| [Dark Vaporeon LC9](https://www.cardmarket.com/en/Pokemon/Products/Singles/Legendary-Collection/Dark-Vaporeon-LC9), English GD reverse, not first edition | 12 / 2 | €250 T0ddynho, Private, Portugal; €318 edoreck, Private, Italy, seller scan available |

All three captures were complete and included a reference image URL. There were
18 seller scan URLs across the raw captured rows; most of these rows were excluded
for condition or grading. The raw-card filter excludes slab comments such as PSA,
BGS, CGC, Bgs9 and Global Grading. Cardmarket's minimum-condition filter includes
better conditions, so the app independently requires exact condition per offer.

All currently tagged identities have initial catalogue URL suggestions. Each still
requires first-match confirmation; suggestions never write inventory bindings.
Pagination is implemented with bounded waits and completeness checks; the three
live examples did not require pagination.

## Automatic URL lookup validation

Companion 0.2.1 and the updated app were deployed. Live Inventory review confirmed
prefilled, editable URLs for all nine currently tagged entries. Live companion
search (without using catalogue seeds in the search worker) resolved Blastoise #4
to Expedition Base Set / Blastoise-EX4 and Japanese Charizard #103 to Base Expansion
Pack / Charizard-V2-EC1103. The additional Arbok test stopped at Cardmarket's
security-verification page; the two completed results were preserved. No product
bindings or prices were written in these checks.

Cardmarket can redirect search to either a single product or an expansion's
catalogue. Both are supported. Expansion results are validated against their
heading and selected expansion, then candidates are matched by exact name and
collector number. Different numbers in the same set are excluded. Verification
is left for the user; results obtained before a stop remain available.

## Validation and files

- Full Vitest suite: 302 passing tests across 27 files, plus the subsequent expansion-redirect regression test.
- Production Vite build passed; focused ESLint passed.
- Reader tests cover seller classification, English/Japanese filters, missing
  reverse dropdowns, restricted/unapplied filters, malformed prices, current-card
  images, seller scans and filtered offer links.
- Core/transaction tests cover exact variants, stale/mismatched evidence, changed
  or removed inventory cards, concurrent field preservation, explicit offer choice,
  manual preservation/replacement and no second condition discount.
- Product lookup tests cover exact-set refinement, English/Japanese aliases,
  result galleries, single-product and expansion-catalogue redirects, pagination, and rejected wrong
  names/numbers/expansions. Component tests verify automatic prefill, preserved
  corrected URLs, saved-match priority and invalidated confirmations.
- Separate sample preview exercises the real component without live database writes.

Implementation: `src/components/CardmarketSyncPanel.jsx`,
`src/utils/cardmarketSync.js`, `src/utils/cardmarketCompanion.js`,
`companion/cardmarket/`. Build with `npm run build:cardmarket`; load
`public/cardmarket-companion` unpacked in Chrome. The full app build includes the
companion ZIP. `companion/cardmarket/capture.html` is a local read-only capture
checker, not a production inventory editor.

## Capture recovery — September 7, 2026

The user's nine confirmed bindings were visible in the live panel. Capture stopped
on the first product (Blastoise EX4) at Cardmarket's “Just a moment…” verification
page. The prior runner compared the entire URL, including query order/tokens,
timed out, and created a new tab on retry. It also saved the report only after
the full batch, and the panel required a separate click to display offers.

Companion 0.2.2 persists the capture queue, reader ID, next unfinished card, and
completed report after each card. It exposes a clear paused state, open-reader
and resume controls, and reuses a verified page with the same product/filters.
A new run can reuse an already open, identically filtered product page. User-owned
tabs are kept open after completion. Offer selections survive incoming results
within the same run; a new run clears selections. No prices apply automatically.

Runtime regression tests cover verification redirects, mismatched/duplicate
filters, partial-report persistence, resume after worker restart, existing-tab
reuse, cancellation, changed filters during capture, and load timeout. React
tests exercise automatic partial results, recovery controls, and selection
preservation/reset. Live end-to-end verification is deferred because the user
reported the challenge remains stuck on airplane Wi-Fi and will retry after
changing networks. No production inventory writes were made during this fix.

Validation: all 311 tests across 29 files passed; focused ESLint and JavaScript
syntax checks passed; the production build passed. Firebase Hosting deployment
completed successfully with companion 0.2.2 and app bundle index-B3ELv82p.js.
