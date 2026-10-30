# Local test-workspace repository

`storage.js` exports `pilotStore` and `createPilotStore(options)` for isolated checks. The stable database name is **`rafchu-weekend-test-v1`**, IndexedDB version 1. The candidate and recovery HTML must stay on the same origin to read the same saved work. Neither this repository nor its domain module imports Firebase or makes network requests.

This is persistent **practice data on one browser**, not a production stock ledger or cloud backup. Another device/origin cannot see it without an explicit portable archive import. Clearing browser data or losing the device can remove local work. The app does not silently fall back to memory when IndexedDB is unavailable, blocked, full or failing.

## Persistence and outcomes

Three stores hold workspaces, pending operations and original attachment Blobs. `submit()` first persists the exact pending operation. It then uses one read/write transaction across workspace and pending stores to read current state, apply the synchronous domain command, save all effects and record the committed outcome. IndexedDB serializes competing write transactions over those stores across tabs. No network, hashing or asynchronous domain work runs inside that transaction. All results are returned after transaction completion, with strict durability requested.

The operation shape is `{id, kind, createdAt, payload}`. IDs and timestamps are chosen once by the UI before its first submission. Exact replay returns the historical receipt without changing workspace state. Changed terms under the same ID fail. The saved operation's original input and receipt remain in `state.operations` after pending notification cleanup.

`submit(id, operation, {loseAcknowledgement:true})` deliberately throws `OUTCOME_UNKNOWN` **only after a committed transaction**. The pending record is committed and the receipt is retrievable. This is a reproducible local failure boundary, not a real network/provider failure simulation. `getOperation()` reads its durable receipt; `resolvePending()` removes only a pending item whose saved receipt exists. A missing result leaves the original intent available for retry and returns `null`.

A synchronous domain refusal before writes causes the transaction to abort. Only that known refusal may become `OPERATION_REJECTED`. A second transaction checks for a concurrent accepted result before marking the pending item `rejected` with `rejectionReason`; if another tab accepted it, the saved receipt wins. Quota/IndexedDB errors and lost acknowledgements are never relabelled rejection. The UI can preserve and revise rejected input into a **new** operation. `discardRejected()` removes only a definitely rejected intent with no saved receipt; unresolved and accepted operations cannot be discarded through it.

Drafts use an independent expected revision. `saveDraft(id,draft,null)` is create-only; updating requires the current draft revision. The return value includes its incremented revision. `deleteDraft()` also requires the expected revision. Completed drafts and their consumed-intent claims cannot be edited, reopened or deleted, so a new request ID cannot finalize a saved draft twice.

## API

| Method | Return / relevant behavior |
|---|---|
| `listWorkspaces()` | Summaries: ID, name, mode, revision, updatedAt, lot/deal counts. |
| `createWorkspace({name,seedDemo:false})` | New validated test state under a unique ID; never replaces another workspace. Demo opening facts are invented fixtures. |
| `getWorkspace(id)` | Full validated state. Missing or malformed data raises an error. |
| `submit(id,op,options)` | Historical receipt after atomic completion; pending intent is retained until acknowledged. |
| `savePending(id,op)` / `listPending(id)` | Pending records contain `workspaceId`, `id`, `operation`, status and createdAt; rejected records also carry rejection reason/time. |
| `getOperation(id,opId)` | Exact saved receipt or `null`. |
| `resolvePending(id,opId)` | Saved receipt and cleanup, or `null` while unresolved. |
| `discardRejected(id,opId)` | Deletes only a definitively rejected, unaccepted pending intent. |
| `saveDraft(id,draft,expectedRevision=null)` | Saved draft with its new revision. |
| `deleteDraft(id,draftId,expectedRevision)` | Revision-checked deletion of an unfinished draft only. |
| `addAsset(id,file)` | `{id,name,type,size,sha256}`; original bytes and metadata commit atomically. |
| `getAsset(id,assetId)` | Original Blob after size/hash verification. |
| `exportWorkspace(id)` | Complete JSON archive from one consistent IndexedDB snapshot. |
| `importWorkspace(archive)` | Full new state; accepts JSON text or an already parsed archive. Never overwrites an existing workspace. |
| `subscribe(callback)` | Returns unsubscribe; same-instance notifications plus BroadcastChannel notifications across tabs. Reopen/refresh remains authoritative if notifications are unavailable. |
| `close()` | Closes this repository's connections/subscriptions without deleting data. |

For UI file intake, reject files above 50 MiB **before** reading, and pass their raw text to `importWorkspace()` so whitespace also counts toward the limit. Do not claim an export is safely kept until the user has saved the downloaded file outside browser storage.

## Portable archive contract

The version 1 `rafchu-pilot-workspace` archive includes the complete test state, unresolved/committed/rejected pending intents and every referenced original asset as base64. A SHA-256 over canonical archive fields detects accidental alterations; each asset additionally has its independent SHA-256 and original size. Missing/duplicate/extra attachment members, invalid encodings, inconsistent metadata or missing referenced bytes stop export/import. There is no partial success.

Validation and hashing finish before the import write transaction opens. The new workspace and all pending/asset members are then added in one transaction. The outer workspace gets a fresh ID and an imported-copy label; lot, deal, operation, draft, note and asset IDs remain unchanged. Historical receipt workspace IDs and exact inputs are preserved. `provenance.sourceWorkspaceId` identifies the immediate source workspace. Pending and asset storage keys point to the new workspace. Reimport creates another explicitly separate test copy; it does not deduplicate business events across workspaces or merge anything into the old live app.

The domain validator checks relationship closure, original accepted inputs/receipts, stock quantities against accepted movements, deal/money/correction sources, completed-draft claims and note/asset references. This is stronger than checksum verification alone. It is **not** a cryptographic signature, authenticated business evidence, complete historical command replay, physical stock verification or a production account backup. An attacker who can rewrite the entire internally consistent archive and its hashes can fabricate practice data.

Limits are binary byte limits: 10 MiB per original asset, 50 MiB total serialized archive, 5 MiB JSON workspace, 1 MiB aggregate pending data, 256 KiB per operation/draft and 40 MiB aggregate base64 asset content. The last three limits reserve room for a complete archive. Excessive nesting/key counts, non-finite numbers, lossy JSON values and prototype-sensitive data are rejected. Working within these limits is not a measured iPhone memory guarantee.

## Verification boundary

`storage.test.js` checks archive roundtrip/byte equality with an independent SHA implementation, changed snapshot and original-byte rejection, missing/duplicate/truncated attachments, note/reference and pending consistency, fail-before-import behavior, unavailable persistence and oversized assets. It does not emulate IndexedDB. `fake-indexeddb` was unavailable in this checkout, and no dependency was added for this slice.

Real-browser acceptance must verify concurrent last-unit submissions, lost acknowledgement/recovery after source closure, accepted replay after later changes, actionable rejection with preserved input, draft revision conflict/completed-claim protection, archive import into a second workspace and original-byte retrieval. Actual quota exhaustion, browser eviction, physical iPhone picker/output and cross-device cloud continuation are not established by these pure tests. Report the coordinator's browser trace separately.
