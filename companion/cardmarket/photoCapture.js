import { safeCardmarketImage } from '../../src/utils/cardmarketSync.js';
import { CARDMARKET_PHOTO_CACHE_LIMIT, CARDMARKET_PHOTO_LIMIT, CARDMARKET_PHOTOS_PER_PAGE, safeCardmarketPhotoData } from '../../src/utils/cardmarketPhotos.js';
import { sameCapturePage } from './capture.js';
import { sellerPhotosFromArchive } from './photoArchive.js';

export async function cardmarketPhotoThumbnail({ type, base64 }) {
  const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type }));
  try {
    if (!image.width || !image.height || image.width * image.height > 20_000_000) return null;
    for (const edge of [900, 600, 400]) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      if (blob.size > CARDMARKET_PHOTO_LIMIT * 0.7) continue;
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (const byte of buffer) binary += String.fromCharCode(byte);
      const data = safeCardmarketPhotoData(`data:image/jpeg;base64,${btoa(binary)}`);
      if (data) return data;
    }
    return null;
  } finally { image.close(); }
}

export async function captureSellerPhotos(api, tabId, capture, existing = {}, cancelled = () => false, resize = cardmarketPhotoThumbnail) {
  const photos = { ...existing };
  let used = Object.entries(photos).reduce((size, [url, data]) => size + url.length + data.length, 0);
  if (!api.pageCapture?.saveAsMHTML) return { photos, warning: 'Update or reload the companion to save seller-photo previews.' };
  const sources = [...new Set(capture.offers.map(offer => safeCardmarketImage(offer.scanUrl, 'seller')).filter(Boolean))]
    .filter(url => !photos[url]).slice(0, CARDMARKET_PHOTOS_PER_PAGE);
  if (!sources.length) return { photos };
  if (used >= CARDMARKET_PHOTO_CACHE_LIMIT - CARDMARKET_PHOTO_LIMIT) return { photos, warning: 'The local photo preview cache is full. Original listing links are still available.' };
  let warning;
  try {
    if (!sameCapturePage((await api.tabs.get(tabId)).url, capture.filteredUrl)) throw new Error('The Cardmarket reader changed before photos were saved.');
    const prepared = await api.tabs.sendMessage(tabId, { channel: 'rafchu-cardmarket-reader', action: 'prepare-photos', sources, filteredUrl: capture.filteredUrl });
    if (!prepared?.ok || !Array.isArray(prepared.data)) throw new Error('Seller-photo previews could not be loaded.');
    const requested = prepared.data.filter(photo => sources.includes(photo.sourceUrl) && safeCardmarketImage(photo.loadedUrl, 'seller'));
    if (cancelled() || !requested.length) return { photos, warning: 'Some seller photos could not be loaded on Cardmarket. Original listing links are still available.' };
    if (!sameCapturePage((await api.tabs.get(tabId)).url, capture.filteredUrl)) throw new Error('The Cardmarket reader changed before photos were saved.');
    const archive = await api.pageCapture.saveAsMHTML({ tabId });
    if (!archive || archive.size > 25_000_000 || cancelled()) throw new Error('Seller-photo capture was interrupted or too large.');
    if (!sameCapturePage((await api.tabs.get(tabId)).url, capture.filteredUrl)) throw new Error('The Cardmarket reader changed while photos were saved.');
    const images = sellerPhotosFromArchive(await archive.text(), requested);
    for (const [source, image] of images) {
      if (cancelled()) break;
      const data = await resize(image).catch(() => null);
      if (!safeCardmarketPhotoData(data) || used + source.length + data.length > CARDMARKET_PHOTO_CACHE_LIMIT) continue;
      photos[source] = data; used += source.length + data.length;
    }
    if (sources.some(source => !photos[source])) warning = 'Some seller photos are unavailable. Original listing links are still available.';
  } catch (error) { warning = error.message; }
  finally { await api.tabs.sendMessage(tabId, { channel: 'rafchu-cardmarket-reader', action: 'clear-photos' }).catch(() => {}); }
  return { photos, warning };
}
