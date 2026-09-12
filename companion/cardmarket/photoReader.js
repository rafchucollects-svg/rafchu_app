import { safeCardmarketImage } from '../../src/utils/cardmarketSync.js';
import { CARDMARKET_PHOTOS_PER_PAGE } from '../../src/utils/cardmarketPhotos.js';

let tray;
export function clearCardmarketPhotos() { tray?.remove(); tray = null; }

export function sellerPhotoSource(link) {
  const sourceUrl = safeCardmarketImage(link?.href, 'seller');
  if (!sourceUrl) return null;
  const source = new URL(sourceUrl);
  for (const node of [link, ...link.querySelectorAll('[title], [aria-label], [data-bs-original-title]')]) {
    for (const name of ['data-bs-original-title', 'title', 'aria-label']) {
      const match = /<img\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1/i.exec(node.getAttribute(name) || '');
      const candidate = match && safeCardmarketImage(match[2].replace(/&amp;/g, '&'), 'seller');
      if (!candidate) continue;
      const path = new URL(candidate).pathname;
      if (path === source.pathname || path === source.pathname.replace(/(\.[^.]+)$/, 't$1')) return { sourceUrl, loadedUrl: candidate };
    }
  }
  return { sourceUrl, loadedUrl: sourceUrl };
}

export async function prepareCardmarketPhotos(root, sources, cancelled = () => false) {
  clearCardmarketPhotos();
  const requested = new Set(sources.map(url => safeCardmarketImage(url, 'seller')).filter(Boolean));
  const photos = new Map();
  for (const link of root.querySelectorAll('.article-row a[href^="https://marketplace-article-scans.s3.cardmarket.com/"]')) {
    const photo = sellerPhotoSource(link);
    if (photo && requested.has(photo.sourceUrl)) photos.set(photo.sourceUrl, photo);
  }
  tray = root.createElement('aside');
  tray.setAttribute('aria-label', 'Saving seller photos for Rafchu');
  const label = root.createElement('p'); label.textContent = 'Rafchu is saving seller-photo previews for this browser…'; tray.append(label);
  root.body.append(tray);
  const loaded = [];
  const rows = [...photos.values()].slice(0, CARDMARKET_PHOTOS_PER_PAGE);
  // Normal image loads on the actual Cardmarket page retain its normal origin.
  // Do not spoof request headers or fetch blocked images from another server.
  for (let index = 0; index < rows.length && !cancelled(); index += 4) {
    await Promise.all(rows.slice(index, index + 4).map(photo => new Promise(resolve => {
      const img = root.createElement('img'); img.alt = 'Seller photo for Rafchu preview'; img.width = 96;
      const finish = ok => { clearTimeout(timer); img.onload = null; img.onerror = null; if (ok && !cancelled()) loaded.push(photo); resolve(); };
      const timer = setTimeout(() => finish(false), 6000);
      img.onload = () => finish(img.naturalWidth > 0); img.onerror = () => finish(false);
      tray?.append(img); img.src = photo.loadedUrl;
    })));
  }
  return loaded;
}
