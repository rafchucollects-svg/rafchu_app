// @vitest-environment node
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import * as domain from './domain.js';
import { canonicalJSON, createPilotStore, STORAGE_LIMITS, validateArchive } from './storage.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const sign = archive => {
  const { sha256: _old, ...body } = archive;
  return { ...body, sha256: digest(canonicalJSON(body)) };
};
const archiveFor = (workspace = domain.seedDemoWorkspace(), pending = [], assets = []) => sign({
  format: 'rafchu-pilot-workspace', version: 1, exportedAt: '2026-10-30T12:00:00.000Z',
  sourceWorkspaceId: workspace.id, workspace, pending, assets,
});

function assetArchive() {
  const workspace = domain.seedDemoWorkspace();
  // Includes null, high-bit and CR/LF bytes; no text-only round-trip oracle.
  const bytes = Buffer.from([0, 255, 1, 128, 13, 10, 65]);
  const metadata = { id: 'asset-original', name: 'receipt.bin', type: 'application/octet-stream', size: bytes.length, sha256: digest(bytes) };
  workspace.assets[metadata.id] = metadata;
  const noted = domain.applyOperation(workspace, { id: 'late-note', kind: 'note', createdAt: '2026-10-30T12:00:00.000Z', payload: { id: 'note-original', text: 'Owner report, no payment proof.', assetIds: [metadata.id] } }).state;
  return { archive: archiveFor(noted, [], [{ ...metadata, dataBase64: bytes.toString('base64') }]), bytes };
}

describe('portable test-workspace validation', () => {
  it('retains exact accepted inputs/receipts and every unresolved pending intent', async () => {
    const workspace = domain.seedDemoWorkspace();
    const operation = { id: 'awaiting-ask', kind: 'ask', createdAt: '2026-10-30T12:00:00.000Z', payload: { lotId: 'demo-pikachu', askMinor: 3200 } };
    const pending = [{ workspaceId: workspace.id, id: operation.id, operation, status: 'prepared', createdAt: operation.createdAt }];
    const prepared = await validateArchive(JSON.stringify(archiveFor(workspace, pending)));
    expect(prepared.state).toEqual(workspace);
    expect(prepared.pending).toEqual(pending);
    expect(prepared.state.operations['demo-opening'].receipt.workspaceId).toBe('demo-weekend');
  });

  it('restores original binary bytes with independent SHA-256 validation', async () => {
    const { archive, bytes } = assetArchive();
    const prepared = await validateArchive(archive);
    const restored = Buffer.from(await prepared.assets[0].blob.arrayBuffer());
    expect(restored.equals(bytes)).toBe(true);
    expect(digest(restored)).toBe(archive.assets[0].sha256);
    expect(prepared.state.notes['note-original'].assetIds).toEqual(['asset-original']);
  });

  it('rejects an edited stock snapshot without a recomputed archive checksum', async () => {
    const archive = archiveFor();
    archive.workspace.lots['demo-pikachu'].quantity = 999;
    await expect(validateArchive(archive)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  });

  it('rejects changed original bytes even when the outer checksum is recomputed', async () => {
    const { archive } = assetArchive();
    archive.assets[0].dataBase64 = Buffer.from([1, 255, 1, 128, 13, 10, 65]).toString('base64');
    await expect(validateArchive(sign(archive))).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  });

  it('rejects missing, duplicated and wrong-sized attachment members', async () => {
    const { archive } = assetArchive();
    const missing = copy(archive); missing.assets = [];
    await expect(validateArchive(sign(missing))).rejects.toMatchObject({ code: 'INCOMPLETE_ARCHIVE' });
    const duplicate = copy(archive); duplicate.assets.push(copy(duplicate.assets[0]));
    await expect(validateArchive(sign(duplicate))).rejects.toThrow(/duplicate attachment/i);
    const truncated = copy(archive); truncated.assets[0].dataBase64 = Buffer.from([0]).toString('base64');
    await expect(validateArchive(sign(truncated))).rejects.toThrow(/wrong size/i);
  });

  it('rejects notes that refer to an absent attachment even with valid checksums', async () => {
    const { archive } = assetArchive();
    archive.workspace.notes['note-original'].assetIds = ['missing-asset'];
    const input = JSON.parse(archive.workspace.operations['late-note'].input);
    input.payload.assetIds = ['missing-asset'];
    archive.workspace.operations['late-note'].input = canonicalJSON(input);
    await expect(validateArchive(sign(archive))).rejects.toThrow(/attachment is missing/i);
  });

  it('rejects a committed pending entry without a saved result', async () => {
    const workspace = domain.seedDemoWorkspace();
    const operation = { id: 'unsaved', kind: 'ask', createdAt: '2026-10-30T12:00:00.000Z', payload: { lotId: 'demo-pikachu', askMinor: 3200 } };
    const pending = [{ workspaceId: workspace.id, id: operation.id, operation, status: 'committed', createdAt: operation.createdAt }];
    await expect(validateArchive(archiveFor(workspace, pending))).rejects.toThrow(/missing saved result/i);
  });

  it('rejects changed pending terms for an already saved operation', async () => {
    const workspace = domain.seedDemoWorkspace();
    const operation = JSON.parse(workspace.operations['demo-opening'].input);
    operation.payload.lots[0].quantity += 1;
    const pending = [{ workspaceId: workspace.id, id: operation.id, operation, status: 'committed', createdAt: operation.createdAt }];
    await expect(validateArchive(archiveFor(workspace, pending))).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
  });

  it('preserves a definite rejection without presenting it as an unknown commit', async () => {
    const workspace = domain.seedDemoWorkspace();
    const operation = { id: 'rejected-sale', kind: 'deal', createdAt: '2026-10-30T12:00:00.000Z', payload: { dealId: 'sale-too-many' } };
    const pending = [{ workspaceId: workspace.id, id: operation.id, operation, status: 'rejected', createdAt: operation.createdAt, rejectedAt: operation.createdAt, rejectionReason: 'Insufficient stock.' }];
    expect((await validateArchive(archiveFor(workspace, pending))).pending[0].status).toBe('rejected');
  });

  it('does not open IndexedDB or partially import a corrupt archive', async () => {
    let opens = 0;
    const store = createPilotStore({ domain, indexedDB: { open() { opens += 1; throw Error('Unexpected open'); } }, BroadcastChannel: null });
    const archive = archiveFor(); archive.workspace.name = 'Edited';
    await expect(store.importWorkspace(archive)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(opens).toBe(0);
  });

  it('rejects oversized attachment input before any database mutation', async () => {
    const store = createPilotStore({ domain, indexedDB: null, BroadcastChannel: null });
    await expect(store.addAsset('test-id', { size: STORAGE_LIMITS.assetBytes + 1, arrayBuffer() { throw Error('Must not read'); } })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('fails explicitly when IndexedDB is unavailable, without an in-memory fallback', async () => {
    const store = createPilotStore({ domain, indexedDB: null, BroadcastChannel: null });
    await expect(store.listWorkspaces()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    await expect(store.createWorkspace({ name: 'Should not exist' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });

  it('rejects non-JSON, prototype-sensitive and recursive data', () => {
    expect(() => canonicalJSON({ omitted: undefined })).toThrow();
    expect(() => canonicalJSON({ bad: Infinity })).toThrow();
    expect(() => canonicalJSON(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
    const cycle = {}; cycle.self = cycle;
    expect(() => canonicalJSON(cycle)).toThrow();
    expect(canonicalJSON({ b: [2, 1], a: 3 })).toBe('{"a":3,"b":[2,1]}');
  });
});
