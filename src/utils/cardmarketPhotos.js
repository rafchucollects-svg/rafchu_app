// Kept in the companion's local cache, never in saved inventory documents.
export const CARDMARKET_PHOTO_CACHE_LIMIT = 4_000_000;
export const CARDMARKET_PHOTO_LIMIT = 120_000;
export const CARDMARKET_PHOTOS_PER_PAGE = 40;

export function safeCardmarketPhotoData(value) {
  return typeof value === 'string' && value.length <= CARDMARKET_PHOTO_LIMIT &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}
