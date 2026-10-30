# Rafchu weekend test candidate

This is a separate **persistent test workspace** for trying the new vendor workflow. It has no connection to live Firebase stock, money, authentication, Functions or Storage. Keep recording real show activity in [the current app](https://rafchu-tcg-app.web.app).

## Try a complete day

1. Choose **Start with example cards**, or start empty and add explicitly owned opening test stock. Opening stock does not record a purchase or payment.
2. In **Stock**, search the exact card, language and grade. Sell a chosen quantity, or use Buy/Trade. Enter the agreed EUR amount separately from money actually received or paid. Leave unknown unit cost blank.
3. Save an entire deal draft to resume it later. A completed draft cannot be completed again. This release supports completing the whole saved deal; partial completion of a larger draft is not yet supported.
4. In **Deals**, open an accepted result to record later money, a credit, a refund or a physical sale return. A credit and an actual refund are distinct. Stock is not received or sold again when later money is recorded.
5. In **Prices**, edit chosen asks without changing previous agreements. In **Records**, add an attributed note, optional supporting files and later links. Notes and files have no economic effect.
6. Download a workspace archive before leaving the session. It contains stock, accepted operations, unfinished drafts, pending outcomes, notes and original attachment bytes. Restoring creates another test workspace and preserves the original.

## Confirmation and recovery

Under Records, expand **Try the recovery rehearsal** and select **Simulate lost confirmation once**. Record a test sale, reload, and follow **Recovery**. The independent recovery page finds the original operation. Record a later test payment there, then return to the candidate. No second sale is required.

An unconfirmed operation blocks new stock/money operations until it is resolved. A definite rejected operation is labelled **Not saved** and retains its input for correction. Retry an unknown result using its original identity. Reopening the current live app never deletes candidate data, but the live app cannot read or continue these test deals.

## Storage and supported scope

- Saved on this browser and this URL, using a separate IndexedDB database. There is no automatic phone/laptop sync, server backup or cloud account in this build. Export and restore can move a test workspace between devices; the copies then evolve independently.
- Use test data only. A separate URL does not itself protect real transactions; real activation still needs a verified backend, physical-stock handoff and compatible recovery arrangement.
- Supported: explicitly owned stock, EUR agreements, sale/buy/trade quantities, cash/card/bank/other money facts, unknown or explicitly known unit basis, credits, sale returns, notes and attachments. It does not execute payments.
- Staged: consignment settlement, foreign-currency settlement, historical live-data import, selected partial-draft completion, accounting/provider integration and agent access.
- Story links to the retained live workflow. A new 25-photo batch repository, selected cross-device sync and the physical iPhone output flow are not delivered or claimed here. Existing live-origin Story drafts remain there.
- Archives are versioned and checksum-checked, with asset and relationship validation. They are portable test-workspace copies, not a full backup of the existing Rafchu account. Do not clear browser storage before keeping an archive. Attachment limits are 10 MB per file and 50 MB per archive.

## Source and release boundary

Branch: `codex/weekend-pilot-2026-10-31`. Verified base: `aab2d444a0a984dd04e992d7513ef424d00ad1c8`. Original React/Firebase source remains in the checkout. The candidate has separate entry points and build configuration; it does not load the original AppWrapper or providers.

`npm run test:pilot` runs the focused command/archive tests. `npm run build:pilot` produces `dist-pilot`, including a release manifest and independent recovery page. `node scripts/verify-pilot.mjs` checks the static package and produces file hashes. A production build rejects Firebase modules and known production endpoint identifiers. The candidate Hosting configuration contains only static Hosting and enforces `connect-src 'none'`. The inherited PR deployment is disabled for the candidate branch prefix.

The only intended deployment is a distinct preview channel using `firebase.pilot.json`, with Auth domain syncing disabled. Never deploy it to `live`, deploy `firebase.json`, or deploy candidate rules/Functions over the fallback project. The live baseline is Hosting version `4620bf7d904aff4e`; its Functions, rules and real records are preserved.

`pilot-qa.html` and `src/pilot/browser-checks.js` run the actual IndexedDB recovery/restore/concurrency sequence in an isolated randomly named local database. They are excluded from the delivered build. Desktop responsive checks are not physical iPhone acceptance.

## Verified for this release

On 30 October: 32 focused domain/storage tests passed, focused lint passed, and 23 connected checks used actual browser IndexedDB. These included lost confirmation, native transaction abort, exact retry, competing sales, later payments, credits/refunds, purchase/trade lineage, draft conflicts, archive restore with original attachment bytes, and refusal of corrupted archives. Visible UI checks covered reload recovery, later payment through the independent page, a saved buy draft resumed after reload, and correction of a stale last-card sale in a second tab. Desktop layouts were inspected at 390 px and 320 px; physical iPhone behavior remains unverified.
