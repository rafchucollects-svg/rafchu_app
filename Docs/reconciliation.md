# Payment reconciliation

Vendor navigation → Accounting → Reconciliation (`/vendor/reconciliation`).

1. Import Wise **balance statement** CSVs and SumUp transactions CSVs. Confirm the export currency for SumUp files without a Currency column. Use consistent export formats/currencies when reimporting.
2. Select the payments belonging to a deal. Suggestions rank nearby existing app transactions and combinations of up to three by amount, date, card names, counterparty and reference. These are local heuristics, not an external AI service or a probability estimate. Manually select up to eight app deals and eight payments when needed.
3. Review the suggested deal or choose another. Review currency must match the app deals. For foreign source currencies, enter a verified conversion rate and document its origin in the explanation. Trades match their signed monetary consideration, not their card market value.
4. Explain discounts, split payments or entry mistakes. Add a receipt/reference or an explanation of the available evidence when no receipt exists. Save an unfinished draft, or approve once the final app amounts equal the selected payment amounts.
5. Export the accountant package from Tax Reporting. Its reconciliation appendix includes original source amounts/currencies, reviewer, review date, before/after app values, conversion rates, explanation and evidence. Unresolved movements are listed separately and are not added to revenue automatically. Source dates determine the fiscal period; complete groups can span periods.

## Correction boundaries

Ordinary same-currency sale prices can be corrected here. The correction is allocated proportionately across outgoing card prices, with the last line absorbing rounding; acquisition cost basis remains unchanged. Purchases, trades, consignment and foreign-currency deal totals must be corrected through a workflow that updates their dependent inventory/COGS/settlement records before reconciliation. A completely missing deal must first be recorded through the existing deal workflow; reconciliation does not remove stock a second time or invent a cost basis.

SumUp payouts, unsuccessful sales and cancellations remain in the immutable import evidence but are excluded from card matching. Wise descriptions identifying SumUp payouts or currency/balance transfers require non-card classification. Expense, reimbursement and other classifications are accountant notes only: they do not post expenses or other income. Fees stay in the original source evidence; this feature does not automatically create fee expenses or infer tax eligibility.

Finalized records are immutable in this release. Corrections to a finalized review require a separate reversal/amendment workflow before any further changes; there is deliberately no history-overwrite or unlock button. A source payment and an app transaction can each belong to only one finalized group. Select all related split payments before finalizing; incremental partial reconciliation is not supported.

## Storage and safety

All collections are scoped to the authenticated owner:

- `reconciliation_sources/{uid}/entries`: immutable imported rows, raw CSV fields and filename. SHA-256 IDs include provider reference, currency, signed amount, original date, type/status and repeated-row occurrence. Reimporting the same export is idempotent; Wise reversals and multi-currency legs remain separate.
- `reconciliation_drafts/{uid}/entries/current`: one resumable review draft per user.
- `reconciliations/{uid}/entries`: append-only finalized groups, complete before/after snapshots and reviewer.
- `reconciliation_claims/{uid}/entries/{sourceId}`: immutable claim preventing source reuse.

Finalization reads current sources, claims and app records, checks the user's baseline, and atomically writes claims, history and corrected app records. Transactions with `reconciliationId` reject subsequent edits or deletion through security rules, including legacy transaction-log controls. The transaction log also disables these controls. These collections are not included in public projections.

The importer uses its own evidence collection; the older Tax Reporting → Bank importer remains separate. Do not mix Wise history and balance statements in this workflow. Re-exports with changed dates, formatting, amount or currency may represent the same economic movement and need human duplicate review. Suggested matches do not resolve missing receipts, inventory costs or tax treatment.

## Local validation and release

Use the README's demo emulator settings; never seed production. After running `scripts/seed-review-emulator.js`, run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-reconciliation-emulator.js
```

This adds synthetic split payments and a two-card discount example without replacing existing records. Unit tests cover parsing, matching, allocation and review validation. UI tests cover approval gating and conflicts; emulator tests cover privacy, import deduplication, stale records, concurrent finalization and immutable history.

**Release requires the updated Firestore rules as well as the frontend.** The main deployment workflow deploys rules first using the existing project service account; a rules deployment failure stops the Hosting release. Pull-request previews do not deploy production rules. No production migration or imported private business data is included.
