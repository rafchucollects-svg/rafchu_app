import { CARDMARKET_PHOTO_CACHE_LIMIT } from '../../src/utils/cardmarketPhotos.js';

const LOCAL_QUOTA = 10_485_760;
const photoKeys = ['photoCache', 'previewPhotoCache'];
export const STORAGE_PHOTO_WARNING = 'Some local seller-photo previews were removed to make room. Listing prices are preserved; original seller-photo links remain available.';
const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export const companionStorageBytes = values => Object.entries(values).reduce((size, [key, value]) => size + new TextEncoder().encode(key).length + jsonBytes(value), 0);
export const isCompanionStorageFull = error => error?.code === 'storage-full' || /quota(?:_bytes)?[\s\S]*(?:exceed|full)|(?:exceed|full)[\s\S]*quota/i.test(error?.message || '');

// Photos are disposable; product/offer evidence is not. Budget both capture
// modes together and evict thumbnails before a checkpoint reaches Chrome's
// local quota. This also handles old installs with two independent 4 MB caches.
export async function writeCompanionStorage(api, patch, { photoWrite = false, reserveBytes = photoWrite ? 512_000 : 64_000 } = {}) {
  const previous = await api.storage.local.get(null);
  const next = { ...previous, ...patch };
  const write = { ...patch };
  for (const key of photoKeys) {
    if (next[key]?.images && typeof next[key].images === 'object') next[key] = { ...next[key], images: { ...next[key].images } };
  }
  const limit = LOCAL_QUOTA - reserveBytes;
  let size = companionStorageBytes(next);
  let photosSize = photoKeys.reduce((sum, key) => sum + (next[key]?.images ? jsonBytes(next[key].images) : 0), 0);
  let photosEvicted = false;
  const ordered = photoKeys.filter(key => next[key]?.images).sort((a, b) => (Date.parse(next[a].updatedAt) || 0) - (Date.parse(next[b].updatedAt) || 0));
  for (const key of ordered) {
    const cache = next[key];
    const entries = Object.keys(cache.images);
    let remaining = entries.length;
    for (const url of entries) {
      if (photosSize <= CARDMARKET_PHOTO_CACHE_LIMIT && size <= limit) break;
      if (!write[key] || write[key] !== cache) {
        const before = jsonBytes(cache);
        cache.warning = STORAGE_PHOTO_WARNING;
        size += jsonBytes(cache) - before;
      }
      const removed = jsonBytes(url) + 1 + jsonBytes(cache.images[url]) + (remaining > 1 ? 1 : 0);
      delete cache.images[url]; remaining--;
      size -= removed; photosSize -= removed; photosEvicted = true;
      write[key] = cache;
    }
  }
  // Warning metadata can add a few bytes. Recheck the actual serialized shape.
  if (companionStorageBytes(next) > limit) throw Object.assign(new Error('Local Cardmarket preview storage is full.'), { code: 'storage-full' });
  await api.storage.local.set(write);
  return { photosEvicted, photoCache: next.photoCache, previewPhotoCache: next.previewPhotoCache };
}
