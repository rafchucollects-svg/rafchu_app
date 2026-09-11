# Payment reconciliation

Vendor navigation → Accounting → Reconciliation (`/vendor/reconciliation`).

1. Choose one or more Wise **balance statement** and SumUp **transactions** CSVs together. The screen shows import progress and skips identical rows. Keep SumUp export currency consistent between uploads.
2. After import, the app automatically saves unique, exact, same-currency matches within three days, with no competing payment or app deal. Automatic matches keep the original app amounts. Ambiguous, discounted, combined, and FX cases stay in the review queue. Existing imports can be processed with **Match imported statements**; merely opening the page never writes records.
3. SumUp payout rows are grouped by currency and payout ID, using net **Payout** values rather than gross sale values. A unique Wise deposit matching that net total and settlement date is classified as an account transfer. Explicit transfer descriptions are also recognized. Size alone never identifies a transfer. Payout and unsuccessful SumUp rows are counted separately and never added as card sales.
4. Review one remaining payment at a time. Choose a recommended card deal or search for another. The payment amount is allocated across selected correctable sales in proportion to their original values, balanced to the cent. Differences up to one currency unit are labelled rounding up/down; larger decreases imply a discount and larger increases are sale price adjustments. The original total, adjustment and resulting amounts are shown before **Save and next** finalizes the review and records the explanation in the accountant report. Individual amounts can be overridden under an optional section. Fixed trade/purchase/consignment amounts remain unchanged. **Save progress** retains an unfinished draft; **Review later** moves to another payment without clearing it.
5. Split payments, multiple deals, and verified currency rates are available under an expandable section. Include every part before finalizing. Notes and receipt references are optional in the UI: the saved audit always includes the statement reference and explicitly says when no separate receipt was attached. This does not determine receipt or tax eligibility.
6. Counts distinguish automatic classifications, manual clearances, and remaining payments. Completed activity and the accountant PDF label automatic versus manual decisions. Import evidence stays immutable and all decisions survive reload. Source dates determine the fiscal period; complete groups can span periods.

## Correction boundaries

Ordinary same-currency sale prices can be corrected here. The correction is allocated proportionately across outgoing card prices, with the last line absorbing rounding; acquisition cost basis remains unchanged. Purchases, trades, consignment and foreign-currency deal totals must be corrected through a workflow that updates their dependent inventory/COGS/settlement records before reconciliation. A completely missing deal must first be recorded through the existing deal workflow; reconciliation does not remove stock a second time or invent a cost basis.

SumUp payouts, unsuccessful sales and cancellations remain in the immutable import evidence but are excluded from card matching. Wise deposits matched to SumUp payout batches and explicit account/currency transfers are automatically classified without changing the sales ledger. Expense, reimbursement and other classifications are accountant notes only: they do not post expenses or other income. Fees stay in the original source evidence; this feature does not automatically create fee expenses or infer tax eligibility.

Finalized records are immutable in this release. Corrections to a finalized review require a separate reversal/amendment workflow before any further changes; there is deliberately no history-overwrite or unlock button. A source payment and an app transaction can each belong to only one finalized group. Select all related split payments before finalizing; incremental partial reconciliation is not supported.

## Storage and safety

All collections are scoped to the authenticated owner:

- `reconciliation_sources/{uid}/entries`: immutable imported rows, raw CSV fields and filename. SHA-256 IDs include provider reference, currency, signed amount, original date, type/status and repeated-row occurrence. Reimporting the same export is idempotent; Wise reversals and multi-currency legs remain separate.
- `reconciliation_drafts/{uid}/entries/current`: one resumable review draft per user.
- `reconciliations/{uid}/entries`: append-only finalized groups, complete before/after snapshots and reviewer.
- `reconciliation_claims/{uid}/entries/{sourceId}`: immutable claim preventing source reuse.

Finalization reads current sources, claims and app records, checks the user's baseline, and atomically writes claims, history and corrected app records while clearing a matching saved draft. Unrelated saved drafts are preserved. Transactions with `reconciliationId` reject subsequent edits or deletion through security rules, including legacy transaction-log controls. The transaction log also disables these controls. These collections are not included in public projections.

The importer uses its own evidence collection; the older Tax Reporting → Bank importer remains separate. Do not mix Wise history and balance statements in this workflow. Re-exports with changed dates, formatting, amount or currency may represent the same economic movement and need human duplicate review. Suggested matches do not resolve missing receipts, inventory costs or tax treatment.

## Local validation and release

Use the README's demo emulator settings; never seed production. After running `scripts/seed-review-emulator.js`, run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-reconciliation-emulator.js
```

This adds synthetic split payments and a two-card discount example without replacing existing records. Unit tests cover parsing, matching, allocation and review validation. UI tests cover approval gating and conflicts; emulator tests cover privacy, import deduplication, stale records, concurrent finalization and immutable history.

**Release requires the updated Firestore rules as well as the frontend.** The main deployment workflow deploys rules first using the existing project service account; a rules deployment failure stops the Hosting release. Pull-request previews do not deploy production rules. No production migration or imported private business data is included.
