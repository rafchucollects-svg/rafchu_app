# Test pilot domain contract

`domain.js` is a pure EUR-only engine for persistent test workspaces. Workspaces can contain invented examples or a separately authorized private copy of current inventory with source provenance. It has no Firebase, network, authentication, storage or system-clock side effects. Its validation and replay behavior do not make browser-local storage a real-transaction service. The storage adapter must durably retain a pending operation before submission and serialize competing commits against the latest saved workspace.

## Exports

- `createWorkspace({id?, name?} = {})` returns `{schemaVersion:1,id,name,mode:'test',revision:0,lots:{},deals:{},operations:{},drafts:{},notes:{},assets:{}}`.
- `seedDemoWorkspace()` returns a valid workspace with two explicitly invented stock lots and its opening-operation receipt. It is not owner inventory.
- `applyOperation(state, {id,kind,createdAt,payload})` returns `{state,receipt}`. It validates the input, produces a separate new state, and never changes the supplied state on success or failure. Exact replay returns the current state unchanged and a copy of the original historical receipt.
- `validateWorkspace(state)` returns `true` or throws a specific error. Storage uses it before persistence and import.
- `parseMoney(text)` accepts nonnegative plain decimal strings using `.` or `,`, at most two decimal places, and returns exact safe integer cents. No exponents, signs, currency symbols, grouping separators or rounding.
- `formatMoney(cents)` renders a signed safe integer amount as `€12.34` or `−€0.01`.
- `getDealBalance(deal)` returns `{agreedMinor,creditMinor,receivedMinor,paidMinor,outstandingMinor,direction}`.

IDs are nonempty bounded strings using letters, digits, `.`, `_`, `:`, `-`, with reserved prototype names refused. `createdAt` is a valid UTC ISO timestamp; business/payment dates are genuine `YYYY-MM-DD` dates. Known amounts and quantities must be safe integers; positive quantities identify physical units. Currency is always EUR. Only stock classified `owned` is admitted. A private inventory copy may retain the existing live app's classification with `ownershipBasis:'live-app-classification'`; this records its source and does not assert fresh ownership verification.

## State records

Lots keep `id,name,set,number,language,condition,grade,quantity,askMinor,basisMinor,ownership,currency,lineage`. `quantity` is current available stock, including zero. `basisMinor` is **known acquisition basis per unit in EUR cents**, or `null` when unknown/unallocated. It is never inferred from ask, market estimate, purchase total or trade cash. Stock records are retained after depletion.

`askMinor` may be `null` for an unknown asking price in opening stock, incoming stock and saved drafts. Zero remains an explicitly known zero ask. Neither an agreement amount nor acquisition basis fills an unknown ask. A deal still requires its own explicit agreed amount. The `ask` command accepts known nonnegative safe integer cents or an explicit `null` to deliberately clear an ask. An omitted amount is rejected, never turned into zero. Render an unknown ask explicitly instead of passing it to `formatMoney()` or presenting it as a zero-valued quote. Exact replay preserves the original clear-price intent and its receipt.

Optional lot metadata is preserved without adding defaults to older records:

| Field | Meaning and admission |
|---|---|
| `excludedFromSale` | Optional boolean. `true` blocks outgoing stock in sales and trades, including during archive consistency validation. The copied row remains visible/preserved. |
| `identityDetails` | Optional text, at most 500 characters, for variant, edition, finish or other identity details. |
| `sourceEntryId` | Optional nonempty text, at most 500 characters, without control characters. It preserves the original entry reference and is not constrained to the normalized lot-ID format. |
| `ownershipBasis` | If present, exactly `live-app-classification`. This identifies an inherited classification, not independent title verification. |

These fields remain in incoming lots, historical outgoing snapshots and physically returned lots. Their accepted source values are part of immutable identity validation. A return retains the sold snapshot's ask and metadata even if the remaining source lot's ask later changes. Private source document bytes, mapping rules and capture timestamps belong in the separately validated archive/provenance; no owner inventory belongs in public fixtures or a hosted bundle.

Deals keep `id,kind,currency,agreedMinor,direction,occurredOn,counterparty,note,outgoing,incoming,payments,credits,returns,operationId,createdAt`. The stock arrays contain stable snapshots; outgoing quantities are the selected quantities, incoming snapshots describe the received lots. The original agreement stays unchanged. Current asking prices and later facts do not edit it.

Payments are `{id,amountMinor,direction,method,occurredOn,note,operationId,createdAt}`. Both customer and supplier receipts/payments/refunds use actual direction `receive` or `pay`. A payment is a fact, not an automatically inferred settlement status.

Credits are `{id,amountMinor,reason,operationId,createdAt}`. They reduce the agreement amount due and cannot cumulatively exceed it. They neither move stock nor invent a refund. Returns contain `{id,lines:[{lotId,quantity,returnLotId}],creditMinor,reason,operationId,createdAt}` and apply only to sale quantities. Each creates a distinct returned stock lot with original unit basis and lineage.

Receipts are `{workspaceId,operationId,kind,revision,createdAt,dealId?,lotIds?,noteId?}`. `operations[id]` stores `{input,receipt}`, where `input` is canonical JSON for the complete submitted ID, kind, timestamp and payload. Object property order does not matter; changed values, optional-field presence, array order or timestamp do matter. Retry the persisted operation exactly. A conflicting reused ID throws and directs recovery of the original operation.

An imported workspace may receive a new outer `state.id` and `state.provenance`; its historical receipts retain their original `workspaceId`. Current stock and revision are read from current state, never substituted into an old receipt.

## Operations

| Kind | Payload and behavior |
|---|---|
| `opening` | `{lots:[{id,name,set?,number?,language?,condition?,grade?,quantity,askMinor,basisMinor?,ownership:'owned',...optional lot metadata}]}`. Creates declared opening test stock, with `askMinor:null` permitted; creates no historical purchase agreement or spending. |
| `ask` | `{lotId,askMinor}`. Changes only the current ask to known safe integer cents or explicitly clears it with `null`. |
| `deal` | `{dealId,kind:'sale'|'buy'|'trade',outgoing:[{lotId,quantity}],incoming:[lot input],agreedMinor,direction,paymentMinor?,method?,occurredOn,counterparty?,note?,draftId?,draftRevision?}`. Atomically accepts stock legs, agreement, optional actual initial money and receipt. Sale receives money; buy pays; trade specifies cash direction. Incoming IDs can be supplied or derive from operation ID and line index. Zero cash is supported; no payment is invented for zero/omitted initial money. |
| `payment` | `{dealId,amountMinor,direction,method,occurredOn,note?}`. Appends actual positive money. Full excess money is preserved, not clipped. Methods: cash/card/bank/other. |
| `credit` | `{dealId,amountMinor,reason}`. Appends a positive financial credit. |
| `return` | `{dealId,lines:[{lotId,quantity}],creditMinor?,reason}`. Sale-only physical return bounded by original sold quantity minus earlier returns. Creates new returned stock. Optional credit is recorded separately; actual refund requires a payment operation. |
| `note` | `{id?,dealId?,text,assetIds?:[]}`. Adds an attributable owner report with no financial/stock effect. Can stand alone with no attachment. Referenced assets must already exist; the store verifies their bytes. |

Each outgoing lot may appear once per deal and must not be excluded from sale. Each incoming lot ID is new. Unknown or insufficient stock, unsupported direction/currency, invalid date, duplicate identity or a late validation failure preserves the complete original state.

For a receive agreement, outstanding = agreement − credits − received + paid. For a pay agreement, outstanding = agreement − credits − paid + received. Negative outstanding is an explicit excess/owed-back balance; it is not silently discarded. The engine does not decide accounting/tax treatment, issue an invoice or calculate definitive profit.

## Saved drafts

The first pilot supports **whole saved-deal completion**, not selected partial completion. A draft is `{id,revision,status:'open',payload:<complete deal payload>,...storage metadata}`. If a deal supplies `draftId` and `draftRevision`, both must match the current draft, and submitted business terms must exactly match its payload (excluding those two draft references). The engine atomically marks it `completed`, preserves the original payload, sets `completedBy`/`completedDealId`, and increments its revision. A second operation ID cannot consume it again.

Changed or partial terms are rejected with the draft intact. The UI can create a separate deliberate draft first; it must not promise automatic remainder preservation or proportional cash allocation. Drafts never reserve physical stock. Storage may save ordinary open-draft metadata but cannot remove/reopen a consumed draft claim.

Saved drafts require a recognized status and a structurally valid deal payload so they can be safely rendered and reopened. Empty selections, zero draft quantities, an unfinished incoming name, an empty event date, or a stale outgoing lot reference are allowed while drafting. Completion still checks all business requirements against current stock. Invalid scalar types, missing stock arrays, negative/fractional amounts or quantities, and unsupported currency/ownership are refused on save and import.

## Validation and evidence limits

Import validation checks canonical operation/receipt correspondence, accepted source links, entity existence, immutable agreement/identity/unit basis, payment/credit/return relationships, completed-draft claims, current asks, and quantity conservation from opening/acquisition/return through outgoing movements. It also checks asset descriptors and linked note membership. Invalid/missing money or stock is rejected instead of treated as zero.

This is internal consistency checking, not an authenticated signature or full re-execution of every historical command. A coherent invented archive is still invented data. It does not establish business truth, owner title, independent payment evidence, cloud durability, device portability or production authorization. Asset metadata does not prove its bytes exist: storage performs bounded byte/hash verification. Transactions between separate workspace copies cannot be merged by adding totals or replaying unknown operations.

Focused tests cover lost acknowledgement and exact replay after later activity, conflicting IDs, stale final-unit competition, whole-draft consumption, buy/supplier follow-up, trade/acquired resale, partial/later money, credits/refunds, overpayment, bounded physical returns, sparse notes, exact money/date admission and malformed archive links. Run only this relevant suite with `node node_modules/vitest/vitest.mjs run src/pilot/domain.test.js`; it is separate from the historical baseline.
