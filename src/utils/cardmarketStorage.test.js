import { beforeEach, expect, it, vi } from 'vitest';
import { companionStorageBytes, writeCompanionStorage, STORAGE_PHOTO_WARNING } from '../../companion/cardmarket/storage.js';
import { CARDMARKET_PHOTO_CACHE_LIMIT } from './cardmarketPhotos.js';

const quota = 10_485_760;
let stored, api;
beforeEach(() => {
  stored = {};
  api = { storage: { local: {
    get: vi.fn(async keys => keys === null ? structuredClone(stored) : Object.fromEntries([].concat(keys).filter(key => key in stored).map(key => [key, structuredClone(stored[key])]))),
    set: vi.fn(async patch => {
      const next = { ...stored, ...structuredClone(patch) };
      if (companionStorageBytes(next) > quota) throw new Error('QUOTA_BYTES quota exceeded');
      stored = next;
    }),
  } } };
});

it('budgets normal and discovery photos together while retaining all price evidence', async () => {
  stored = { report: { captures: [{ offers: [{ price: 100 }] }] }, products: { results: [{ previews: [{ offers: [{ price: 200 }] }] }] }, photoCache: { runId: 'normal', updatedAt: '2026-09-15T00:00:00Z', images: { old: 'a'.repeat(3_000_000) } } };
  const previewPhotoCache = { runId: 'preview', updatedAt: '2026-09-16T00:00:00Z', images: { current: 'b'.repeat(3_000_000) } };
  const result = await writeCompanionStorage(api, { previewPhotoCache }, { photoWrite: true });
  expect(result.photosEvicted).toBe(true);
  expect(result.photoCache.images).toEqual({});
  expect(result.previewPhotoCache.images).toEqual(previewPhotoCache.images);
  expect(stored.photoCache.warning).toBe(STORAGE_PHOTO_WARNING);
  expect(stored.report.captures[0].offers).toEqual([{ price: 100 }]);
  expect(stored.products.results[0].previews[0].offers).toEqual([{ price: 200 }]);
  expect(JSON.stringify(result.photoCache.images).length + JSON.stringify(result.previewPhotoCache.images).length).toBeLessThanOrEqual(CARDMARKET_PHOTO_CACHE_LIMIT);
  expect(api.storage.local.get).toHaveBeenCalledWith(null);
});

it('frees enough photo bytes for the checkpoint including the warning metadata at the boundary', async () => {
  stored = { report: { evidence: 'r'.repeat(10_000_000) }, previewPhotoCache: { runId: 'preview', images: { first: 'a'.repeat(600), second: 'b'.repeat(600), third: 'c'.repeat(600) } } };
  const targetSize = quota - 64_000 + 500;
  stored.report.evidence += 'r'.repeat(targetSize - companionStorageBytes(stored));
  const result = await writeCompanionStorage(api, { status: { state: 'paused' } });
  expect(Object.keys(result.previewPhotoCache.images)).toEqual(['third']);
  expect(stored.previewPhotoCache.warning).toBe(STORAGE_PHOTO_WARNING);
  expect(companionStorageBytes(stored)).toBeLessThanOrEqual(quota - 64_000);
  expect(stored.report.evidence).toHaveLength(10_000_000 + targetSize - companionStorageBytes({ report: { evidence: 'r'.repeat(10_000_000) }, previewPhotoCache: { runId: 'preview', images: { first: 'a'.repeat(600), second: 'b'.repeat(600), third: 'c'.repeat(600) } } }));
});

it('rejects an oversized new record before writing or deleting already saved evidence', async () => {
  stored = { products: { results: ['earlier'] } };
  await expect(writeCompanionStorage(api, { products: { results: ['x'.repeat(quota)] } })).rejects.toMatchObject({ code: 'storage-full' });
  expect(api.storage.local.set).not.toHaveBeenCalled();
  expect(stored.products.results).toEqual(['earlier']);
});

it('reserves more room on photo writes and never restores evicted thumbnails from the returned cache', async () => {
  stored = { report: { evidence: 'r'.repeat(9_500_000) } };
  const photoCache = { runId: 'normal', images: { first: 'a'.repeat(250_000), second: 'b'.repeat(250_000), third: 'c'.repeat(250_000) } };
  const result = await writeCompanionStorage(api, { photoCache }, { photoWrite: true });
  expect(result.photoCache.images).toEqual({ third: photoCache.images.third });
  expect(companionStorageBytes(stored)).toBeLessThanOrEqual(quota - 512_000);
  const again = await writeCompanionStorage(api, { photoCache: result.photoCache }, { photoWrite: true });
  expect(again.photoCache.images).toEqual(result.photoCache.images);
});
