import { safeCardmarketImage } from '../../src/utils/cardmarketSync.js';

const headers = text => Object.fromEntries(text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).flatMap(line => {
  const colon = line.indexOf(':');
  return colon > 0 ? [[line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()]] : [];
}));

// Read only the exact raster resources loaded for this capture. The page HTML,
// other resources and the archive itself are never stored or sent to Rafchu.
export function sellerPhotosFromArchive(archive, requested) {
  if (typeof archive !== 'string' || archive.length > 25_000_000) throw new Error('The Cardmarket page is too large to save photos.');
  const top = headers(archive.split(/\r?\n\r?\n/, 1)[0]);
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(top['content-type'] || '');
  if (!boundary) throw new Error('Chrome did not return a readable photo archive.');
  const allowed = new Map(requested.flatMap(row => {
    const source = safeCardmarketImage(row.sourceUrl, 'seller');
    const loaded = safeCardmarketImage(row.loadedUrl, 'seller');
    return source && loaded ? [[loaded, source]] : [];
  }));
  const result = new Map();
  for (const part of archive.split(`--${boundary[1] || boundary[2]}`).slice(1)) {
    const separator = /\r?\n\r?\n/.exec(part);
    if (!separator) continue;
    const info = headers(part.slice(0, separator.index));
    const location = safeCardmarketImage(info['content-location'], 'seller');
    const source = location && allowed.get(location);
    const type = info['content-type']?.split(';')[0].toLowerCase();
    if (!source || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || info['content-transfer-encoding']?.toLowerCase() !== 'base64') continue;
    const base64 = part.slice(separator.index + separator[0].length).replace(/\s/g, '');
    if (!base64 || base64.length > 3_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) continue;
    result.set(source, { type, base64 });
  }
  return result;
}
