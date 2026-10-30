// A deliberately separate, browser-local TEST repository. No Firebase imports.
export const STORAGE_LIMITS = Object.freeze({
  assetBytes: 10 * 1024 * 1024,
  archiveBytes: 50 * 1024 * 1024,
  workspaceBytes: 5 * 1024 * 1024,
  pendingBytes: 1024 * 1024,
  operationBytes: 256 * 1024,
  encodedAssetBytes: 40 * 1024 * 1024,
});

const DATABASE_NAME = 'rafchu-weekend-test-v1';
const FORMAT = 'rafchu-pilot-workspace';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const encoder = new TextEncoder();

export class PilotStorageError extends Error {
  constructor(message, code = 'STORAGE_ERROR', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PilotStorageError';
    this.code = code;
  }
}

function fail(message, code = 'INVALID_DATA') {
  throw new PilotStorageError(message, code);
}

const hasControl = value => [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

function safeId(value, label = 'ID') {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 ||
      FORBIDDEN_KEYS.has(value) || Object.hasOwn(Object.prototype, value) || hasControl(value)) fail(`${label} is invalid.`);
  return value;
}

// Plain JSON only: reject lossy serialization, cycles, exotic prototypes and
// prototype keys before accepting an archive or operation from another source.
export function canonicalJSON(value) {
  const ancestors = new Set();
  let visited = 0;
  const visit = (item, depth) => {
    if (++visited > 200000 || depth > 64) fail('This workspace is too complex to save safely.');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || ancestors.has(item)) fail('Only complete, finite JSON values can be saved.');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
      fail('Unsupported object in workspace data.');
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      result = Array.from(item, entry => visit(entry, depth + 1));
    } else {
      result = {};
      for (const key of Object.keys(item).sort()) {
        if (FORBIDDEN_KEYS.has(key)) fail('Unsafe field name in workspace data.');
        result[key] = visit(item[key], depth + 1);
      }
    }
    ancestors.delete(item);
    return result;
  };
  return JSON.stringify(visit(value, 0));
}

function jsonCopy(value, maxBytes = STORAGE_LIMITS.workspaceBytes) {
  const json = canonicalJSON(value);
  if (encoder.encode(json).byteLength > maxBytes) fail('This workspace exceeds the local test storage limit.', 'LIMIT_EXCEEDED');
  return JSON.parse(json);
}

function browserError(error) {
  if (error instanceof PilotStorageError) return error;
  if (error?.name === 'QuotaExceededError') return new PilotStorageError(
    'Browser storage is full. The previous saved workspace is unchanged. Export it before freeing space.', 'QUOTA_EXCEEDED', error);
  return new PilotStorageError('The browser could not save or open this test workspace. Your last completed save is preserved.', 'STORAGE_ERROR', error);
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('Secure browser hashing is unavailable. Open this app over HTTPS or localhost.', 'HASH_UNAVAILABLE');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function uniqueId(prefix) {
  if (!globalThis.crypto?.randomUUID) fail('Secure browser IDs are unavailable. Open this app over HTTPS or localhost.', 'ID_UNAVAILABLE');
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

function base64ToBytes(value, expectedSize) {
  if (typeof value !== 'string' || value.length > Math.ceil(STORAGE_LIMITS.assetBytes / 3) * 4 ||
      value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    fail('An archive attachment has invalid base64 bytes.');
  let binary;
  try { binary = atob(value); } catch { fail('An archive attachment cannot be decoded.'); }
  if (binary.length !== expectedSize) fail('An archive attachment is incomplete or has the wrong size.');
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (bytesToBase64(bytes) !== value) fail('An archive attachment uses a noncanonical encoding.');
  return bytes;
}

function metadataValid(asset) {
  safeId(asset?.id, 'Attachment ID');
  if (typeof asset.name !== 'string' || !asset.name || asset.name.length > 255 || hasControl(asset.name) ||
      typeof asset.type !== 'string' || asset.type.length > 255 || hasControl(asset.type) ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > STORAGE_LIMITS.assetBytes ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)) fail('Invalid attachment metadata.');
}

function assertWorkspace(state, domain) {
  const copy = jsonCopy(state);
  if (copy.mode !== 'test' || copy.schemaVersion !== 1) fail('Only version 1 test workspaces are supported.');
  domain.validateWorkspace(copy);
  safeId(copy.id, 'Workspace ID');
  for (const map of ['lots', 'deals', 'operations', 'drafts', 'notes', 'assets'])
    for (const id of Object.keys(copy[map])) safeId(id, `${map} ID`);
  let encodedBytes = 0;
  for (const [id, asset] of Object.entries(copy.assets || {})) {
    metadataValid(asset);
    if (id !== asset.id) fail('Attachment identity does not match its stored key.');
    encodedBytes += Math.ceil(asset.size / 3) * 4;
  }
  if (encodedBytes > STORAGE_LIMITS.encodedAssetBytes) fail('This workspace has too many attachment bytes for a safe archive.', 'LIMIT_EXCEEDED');
  return copy;
}

function operationCopy(operation) {
  const copy = jsonCopy(operation, STORAGE_LIMITS.operationBytes);
  safeId(copy.id, 'Operation ID');
  if (Object.keys(copy).some(key => !['id', 'kind', 'createdAt', 'payload'].includes(key)) ||
      typeof copy.kind !== 'string' || typeof copy.createdAt !== 'string' || !copy.payload || typeof copy.payload !== 'object' || Array.isArray(copy.payload))
    fail('A pending operation needs its ID, kind, timestamp and payload.');
  return copy;
}

function sameAcceptedInput(entry, operation) {
  if (!entry) return;
  let original;
  try { original = typeof entry.input === 'string' ? JSON.parse(entry.input) : entry.input; }
  catch { fail('The saved operation has an unreadable input record.'); }
  if (canonicalJSON(original) !== canonicalJSON(operation)) fail('This operation ID already belongs to different saved terms.', 'OPERATION_CONFLICT');
}

function pendingValid(records, state) {
  if (!Array.isArray(records)) fail('The archive pending-operation list is invalid.');
  jsonCopy(records, STORAGE_LIMITS.pendingBytes);
  const seen = new Set();
  return records.map(record => {
    const operation = operationCopy(record.operation);
    if (record.id !== operation.id || record.workspaceId !== state.id || seen.has(record.id) ||
        !['prepared', 'committed', 'rejected'].includes(record.status) || typeof record.createdAt !== 'string')
      fail('The archive contains an invalid or duplicate pending operation.');
    seen.add(record.id);
    const accepted = state.operations[record.id];
    sameAcceptedInput(accepted, operation);
    if (record.status === 'committed' && !accepted) fail('A pending operation claims a missing saved result.');
    if (record.status === 'rejected' && (accepted || typeof record.rejectionReason !== 'string' || record.rejectionReason.length > 1000))
      fail('A rejected pending operation has inconsistent outcome metadata.');
    return { ...record, operation };
  });
}

/** Validate all archive bytes before opening a write transaction. */
export async function validateArchive(archive, domainOverride) {
  const domain = domainOverride || await import('./domain.js');
  // Bound the raw string too: whitespace must not bypass the file-size limit.
  if (typeof archive === 'string') {
    if (encoder.encode(archive).byteLength > STORAGE_LIMITS.archiveBytes) fail('The archive exceeds 50 MB.', 'LIMIT_EXCEEDED');
    try { archive = JSON.parse(archive); } catch { fail('This file is not a readable JSON archive.'); }
  }
  const copy = jsonCopy(archive, STORAGE_LIMITS.archiveBytes);
  if (copy.format !== FORMAT || copy.version !== 1 || typeof copy.exportedAt !== 'string' ||
      !/^[a-f0-9]{64}$/.test(copy.sha256) || !Array.isArray(copy.assets)) fail('This is not a supported Rafchu test-workspace archive.');
  const { sha256: expected, ...body } = copy;
  if (await sha256(encoder.encode(canonicalJSON(body))) !== expected) fail('The archive checksum does not match. Nothing was imported.', 'CHECKSUM_MISMATCH');
  const state = assertWorkspace(copy.workspace, domain);
  if (copy.sourceWorkspaceId !== state.id) fail('The archive workspace identity is inconsistent.');
  const pending = pendingValid(copy.pending, state);
  const seen = new Set();
  const assets = [];
  for (const encoded of copy.assets) {
    metadataValid(encoded);
    if (seen.has(encoded.id)) fail('The archive contains duplicate attachment IDs.');
    seen.add(encoded.id);
    const { dataBase64, ...metadata } = encoded;
    if (canonicalJSON(metadata) !== canonicalJSON(state.assets[metadata.id] || null)) fail('The archive attachment list does not match the workspace.');
    const bytes = base64ToBytes(dataBase64, metadata.size);
    if (await sha256(bytes) !== metadata.sha256) fail('An attachment checksum does not match. Nothing was imported.', 'CHECKSUM_MISMATCH');
    assets.push({ ...metadata, blob: new Blob([bytes], { type: metadata.type }) });
  }
  if (seen.size !== Object.keys(state.assets).length) fail('The archive is missing attachment bytes. Nothing was imported.', 'INCOMPLETE_ARCHIVE');
  return { state, pending, assets };
}

export function createPilotStore(options = {}) {
  const databaseName = options.databaseName || DATABASE_NAME;
  let databasePromise;
  let domainPromise;
  let channel;
  const listeners = new Set();
  const getDomain = () => domainPromise ||= Promise.resolve(options.domain || import('./domain.js'));
  const ensureChannel = () => {
    if (channel) return;
    const Channel = options.BroadcastChannel === undefined ? globalThis.BroadcastChannel : options.BroadcastChannel;
    if (!Channel) return;
    try {
      channel = new Channel(`${databaseName}:changes`);
      channel.onmessage = event => {
        if (!event.data || typeof event.data.workspaceId !== 'string') return;
        for (const listener of listeners) { try { listener(event.data); } catch { /* Subscriber isolation. */ } }
      };
    } catch { /* Reopen still reads authoritative local storage. */ }
  };
  const notify = workspaceId => {
    ensureChannel();
    const event = { workspaceId, changedAt: Date.now() };
    for (const listener of listeners) { try { listener(event); } catch { /* A UI subscriber cannot change commit success. */ } }
    try { channel?.postMessage(event); } catch { /* Cross-tab notification is best effort; persisted data is authoritative. */ }
  };
  const open = () => {
    if (databasePromise) return databasePromise;
    const factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
    if (!factory) return Promise.reject(new PilotStorageError('This browser does not provide persistent IndexedDB storage. No temporary workspace was created.', 'STORAGE_UNAVAILABLE'));
    databasePromise = new Promise((resolve, reject) => {
      let request;
      let settled = false;
      try { request = factory.open(databaseName, 1); } catch (error) { reject(browserError(error)); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'id' });
        for (const name of ['pending', 'assets']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: ['workspaceId', 'id'] }).createIndex('workspaceId', 'workspaceId');
        }
      };
      request.onerror = () => { settled = true; reject(browserError(request.error)); };
      request.onblocked = () => { settled = true; reject(new PilotStorageError('Close other pilot tabs before upgrading this local workspace.', 'STORAGE_BLOCKED')); };
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = undefined; };
        resolve(db);
      };
    }).catch(error => { databasePromise = undefined; throw error; });
    return databasePromise;
  };
  const transact = async (stores, mode, body) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      let result;
      let failure;
      try { tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
      catch (error) { reject(browserError(error)); return; }
      const abort = error => {
        failure = error;
        try { tx.abort(); } catch { reject(browserError(error)); }
      };
      const read = (request, callback) => {
        request.onsuccess = () => { try { callback(request.result); } catch (error) { abort(error); } };
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(browserError(failure || tx.error));
      tx.onerror = () => { /* The abort handler reports the original failure. */ };
      try { body({ tx, read, finish: value => { result = value; }, abort }); }
      catch (error) { abort(error); }
    });
  };
  const withState = (id, mode, callback, stores = ['workspaces']) => {
    safeId(id, 'Workspace ID');
    return transact(stores, mode, context => context.read(context.tx.objectStore('workspaces').get(id), state => {
      if (!state) fail('This local test workspace could not be found.', 'WORKSPACE_NOT_FOUND');
      callback(state, context);
    }));
  };
  const putState = (state, domain, tx) => {
    const checked = assertWorkspace(state, domain);
    tx.objectStore('workspaces').put(checked);
    return checked;
  };

  return {
    async listWorkspaces() {
      return transact(['workspaces'], 'readonly', ({ tx, read, finish }) => read(tx.objectStore('workspaces').getAll(), rows => finish(rows.map(state => ({
        id: state.id, name: state.name, mode: state.mode, revision: state.revision,
        updatedAt: state.updatedAt || null, lotCount: Object.keys(state.lots).length, dealCount: Object.keys(state.deals).length,
      })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.name.localeCompare(b.name)))));
    },
    async createWorkspace({ name = 'Weekend practice', seedDemo = false } = {}) {
      const domain = await getDomain();
      const id = uniqueId('test');
      const state = assertWorkspace({ ...(seedDemo ? domain.seedDemoWorkspace() : domain.createWorkspace({ id, name })), id, name, mode: 'test', updatedAt: new Date().toISOString() }, domain);
      await transact(['workspaces'], 'readwrite', ({ tx, finish }) => { tx.objectStore('workspaces').add(state); finish(state); });
      notify(id);
      return state;
    },
    async getWorkspace(id) {
      const domain = await getDomain();
      return withState(id, 'readonly', (state, { finish }) => finish(assertWorkspace(state, domain)));
    },
    async savePending(id, operation) {
      const op = operationCopy(operation);
      const result = await withState(id, 'readwrite', (state, { tx, read, finish }) => {
        sameAcceptedInput(state.operations[op.id], op);
        const store = tx.objectStore('pending');
        read(store.index('workspaceId').getAll(id), records => {
          const previous = records.find(record => record.id === op.id);
          if (previous && canonicalJSON(previous.operation) !== canonicalJSON(op)) fail('Pending operation terms changed. Recover its outcome before starting a new operation.', 'OPERATION_CONFLICT');
          const record = previous || { workspaceId: id, id: op.id, operation: op, status: state.operations[op.id] ? 'committed' : 'prepared', createdAt: new Date().toISOString() };
          jsonCopy([...records.filter(row => row.id !== op.id), record], STORAGE_LIMITS.pendingBytes);
          store.put(record);
          finish(record);
        });
      }, ['workspaces', 'pending']);
      notify(id);
      return result;
    },
    async submit(id, operation, { loseAcknowledgement = false } = {}) {
      const domain = await getDomain();
      const op = operationCopy(operation);
      await this.savePending(id, op);
      let receipt;
      try {
        receipt = await withState(id, 'readwrite', (state, { tx, read, finish }) => {
          const pending = tx.objectStore('pending');
          read(pending.get([id, op.id]), record => {
            if (!record || canonicalJSON(record.operation) !== canonicalJSON(op)) fail('The saved pending operation is missing or changed.', 'OPERATION_CONFLICT');
            assertWorkspace(state, domain);
            let result;
            try { result = domain.applyOperation(state, op); }
            catch (error) {
              // This synchronous refusal occurs before any write is queued.
              // Existing accepted results are never reclassified as rejected.
              if (state.operations[op.id]) throw error;
              throw new PilotStorageError(error.message || 'The operation was rejected without saving effects.', 'OPERATION_REJECTED', error);
            }
            if (result.state !== state) putState({ ...result.state, updatedAt: new Date().toISOString() }, domain, tx);
            const committed = { ...record, status: 'committed' };
            delete committed.rejectionReason;
            delete committed.rejectedAt;
            pending.put(committed);
            finish(result.receipt);
          });
        }, ['workspaces', 'pending']);
      } catch (error) {
        if (error.code !== 'OPERATION_REJECTED') throw error;
        // Check again in a serialized transaction: another tab could have
        // accepted this exact operation after this attempt was aborted.
        receipt = await withState(id, 'readwrite', (state, { tx, read, finish }) => {
          const accepted = state.operations[op.id];
          sameAcceptedInput(accepted, op);
          if (accepted) { finish(accepted.receipt); return; }
          const pending = tx.objectStore('pending');
          read(pending.get([id, op.id]), record => {
            if (record && canonicalJSON(record.operation) === canonicalJSON(op)) {
              pending.put({ ...record, status: 'rejected', rejectionReason: error.message.slice(0, 1000), rejectedAt: new Date().toISOString() });
            }
            finish(null);
          });
        }, ['workspaces', 'pending']);
        notify(id);
        if (!receipt) throw error;
      }
      notify(id);
      if (loseAcknowledgement) {
        const error = new PilotStorageError('The result acknowledgement was interrupted. Recover this saved operation before recording it again.', 'OUTCOME_UNKNOWN');
        error.operationId = op.id;
        error.workspaceId = id;
        throw error;
      }
      return receipt;
    },
    async getOperation(id, operationId) {
      safeId(operationId, 'Operation ID');
      return withState(id, 'readonly', (state, { finish }) => finish(state.operations[operationId]?.receipt || null));
    },
    async listPending(id) {
      return withState(id, 'readonly', (_state, { tx, read, finish }) => read(tx.objectStore('pending').index('workspaceId').getAll(id), finish), ['workspaces', 'pending']);
    },
    async resolvePending(id, operationId) {
      safeId(operationId, 'Operation ID');
      const receipt = await withState(id, 'readwrite', (state, { tx, finish }) => {
        const saved = state.operations[operationId]?.receipt || null;
        if (saved) tx.objectStore('pending').delete([id, operationId]);
        finish(saved);
      }, ['workspaces', 'pending']);
      if (receipt) notify(id);
      return receipt;
    },
    async discardRejected(id, operationId) {
      safeId(operationId, 'Operation ID');
      await withState(id, 'readwrite', (state, { tx, read }) => {
        if (state.operations[operationId]) fail('This operation was saved. Recover its receipt instead of discarding it.', 'OPERATION_CONFLICT');
        const pending = tx.objectStore('pending');
        read(pending.get([id, operationId]), record => {
          if (!record || record.status !== 'rejected') fail('Only a definitely rejected operation can be discarded. Recover unresolved outcomes first.', 'OPERATION_CONFLICT');
          pending.delete([id, operationId]);
        });
      }, ['workspaces', 'pending']);
      notify(id);
    },
    async saveDraft(id, draft, expectedRevision = null) {
      const domain = await getDomain();
      const input = jsonCopy(draft, STORAGE_LIMITS.operationBytes);
      safeId(input.id, 'Draft ID');
      const saved = await withState(id, 'readwrite', (state, { tx, finish }) => {
        const previous = state.drafts[input.id];
        if (previous?.status === 'completed' || previous?.completedBy) fail('This draft has already been completed. Its saved claim cannot be changed; create a new draft for new business.', 'DRAFT_COMPLETED');
        if ((previous ? previous.revision : null) !== expectedRevision) fail('This draft changed in another tab. Reopen the latest draft before saving.', 'DRAFT_CONFLICT');
        const next = { ...input, revision: (previous?.revision || 0) + 1, updatedAt: new Date().toISOString() };
        putState({ ...state, revision: state.revision + 1, updatedAt: next.updatedAt, drafts: { ...state.drafts, [input.id]: next } }, domain, tx);
        finish(next);
      });
      notify(id);
      return saved;
    },
    async deleteDraft(id, draftId, expectedRevision) {
      const domain = await getDomain();
      safeId(draftId, 'Draft ID');
      await withState(id, 'readwrite', (state, { tx }) => {
        const previous = state.drafts[draftId];
        if (previous?.status === 'completed' || previous?.completedBy) fail('A completed draft is retained with its saved deal and cannot be deleted.', 'DRAFT_COMPLETED');
        if (!previous || previous.revision !== expectedRevision) fail('This draft changed or was removed. Reopen the workspace before deleting it.', 'DRAFT_CONFLICT');
        const drafts = { ...state.drafts };
        delete drafts[draftId];
        putState({ ...state, drafts, revision: state.revision + 1, updatedAt: new Date().toISOString() }, domain, tx);
      });
      notify(id);
    },
    async addAsset(id, file) {
      const domain = await getDomain();
      if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1 || file.size > STORAGE_LIMITS.assetBytes)
        fail('Choose a nonempty attachment no larger than 10 MB.', 'LIMIT_EXCEEDED');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length !== file.size) fail('The attachment could not be read completely.');
      const metadata = { id: uniqueId('asset'), name: file.name || 'attachment', type: file.type || 'application/octet-stream', size: bytes.length, sha256: await sha256(bytes) };
      metadataValid(metadata);
      const blob = new Blob([bytes], { type: metadata.type });
      await withState(id, 'readwrite', (state, { tx }) => {
        putState({ ...state, assets: { ...state.assets, [metadata.id]: metadata }, revision: state.revision + 1, updatedAt: new Date().toISOString() }, domain, tx);
        tx.objectStore('assets').add({ workspaceId: id, ...metadata, blob });
      }, ['workspaces', 'assets']);
      notify(id);
      return metadata;
    },
    async getAsset(id, assetId) {
      safeId(assetId, 'Attachment ID');
      const record = await withState(id, 'readonly', (state, { tx, read, finish }) => {
        const metadata = state.assets[assetId];
        if (!metadata) fail('This attachment is not part of the workspace.', 'ASSET_NOT_FOUND');
        read(tx.objectStore('assets').get([id, assetId]), asset => {
          if (!asset?.blob || asset.blob.size !== metadata.size || asset.sha256 !== metadata.sha256) fail('The original attachment bytes are missing or inconsistent.', 'INCOMPLETE_ASSET');
          finish(asset);
        });
      }, ['workspaces', 'assets']);
      if (await sha256(await record.blob.arrayBuffer()) !== record.sha256) fail('The original attachment checksum does not match.', 'CHECKSUM_MISMATCH');
      return record.blob;
    },
    async exportWorkspace(id) {
      const domain = await getDomain();
      const snapshot = await withState(id, 'readonly', (state, { tx, read, finish }) => {
        read(tx.objectStore('pending').index('workspaceId').getAll(id), pending => {
          read(tx.objectStore('assets').index('workspaceId').getAll(id), assets => finish({ state, pending, assets }));
        });
      }, ['workspaces', 'pending', 'assets']);
      const workspace = assertWorkspace(snapshot.state, domain);
      const pending = pendingValid(snapshot.pending, workspace);
      const assets = [];
      for (const metadata of Object.values(workspace.assets).sort((a, b) => a.id.localeCompare(b.id))) {
        const stored = snapshot.assets.find(asset => asset.id === metadata.id);
        if (!stored?.blob || stored.blob.size !== metadata.size) fail('An original attachment is missing. A complete archive cannot be produced.', 'INCOMPLETE_ARCHIVE');
        const bytes = new Uint8Array(await stored.blob.arrayBuffer());
        if (await sha256(bytes) !== metadata.sha256) fail('An attachment checksum failed. A complete archive cannot be produced.', 'CHECKSUM_MISMATCH');
        assets.push({ ...metadata, dataBase64: bytesToBase64(bytes) });
      }
      if (snapshot.assets.length !== assets.length) fail('Unlinked attachment bytes were found; export stopped to avoid silently omitting them.', 'INCOMPLETE_ARCHIVE');
      const body = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), sourceWorkspaceId: workspace.id, workspace, pending, assets };
      const archive = { ...body, sha256: await sha256(encoder.encode(canonicalJSON(body))) };
      jsonCopy(archive, STORAGE_LIMITS.archiveBytes);
      return archive;
    },
    async importWorkspace(archive) {
      const domain = await getDomain();
      const prepared = await validateArchive(archive, domain);
      const id = uniqueId('imported-test');
      const state = assertWorkspace({ ...prepared.state, id, name: `${prepared.state.name.slice(0, 150)} (imported copy)`, updatedAt: new Date().toISOString(), provenance: {
        ...(prepared.state.provenance || {}), sourceWorkspaceId: prepared.state.id, importedAt: new Date().toISOString(),
      } }, domain);
      await transact(['workspaces', 'pending', 'assets'], 'readwrite', ({ tx }) => {
        tx.objectStore('workspaces').add(state);
        for (const record of prepared.pending) tx.objectStore('pending').add({ ...record, workspaceId: id });
        for (const asset of prepared.assets) tx.objectStore('assets').add({ ...asset, workspaceId: id });
      });
      notify(id);
      return state;
    },
    subscribe(callback) {
      if (typeof callback !== 'function') fail('A subscription needs a callback.');
      ensureChannel();
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },
    async close() {
      channel?.close();
      channel = undefined;
      listeners.clear();
      const db = await databasePromise?.catch(() => null);
      db?.close();
      databasePromise = undefined;
    },
  };
}

export const pilotStore = createPilotStore();
