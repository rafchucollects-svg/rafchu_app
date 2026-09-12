import { afterEach, expect, it, vi } from 'vitest';
import { sellerPhotosFromArchive } from '../../companion/cardmarket/photoArchive';
import { sellerPhotoSource } from '../../companion/cardmarket/photoReader';
import { captureSellerPhotos } from '../../companion/cardmarket/photoCapture';
import { filteredUrl } from '../../companion/cardmarket/capture';
import { CARDMARKET_PHOTO_CACHE_LIMIT, CARDMARKET_PHOTO_LIMIT, safeCardmarketPhotoData } from './cardmarketPhotos';

const source = 'https://marketplace-article-scans.s3.cardmarket.com/1001/1001.jpg';
const loaded = source + '?timestamp=2026-09-12%2021:18:37';
const other = 'https://marketplace-article-scans.s3.cardmarket.com/2002/2002.jpg';
const photo = 'data:image/jpeg;base64,aGVsbG8=';
const archive = parts => 'MIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n boundary="saved-page"\r\n\r\n' + parts.map(({ url, type = 'image/jpeg', body = 'aGVs\r\nbG8=', encoding = 'base64' }) => `--saved-page\r\nContent-Type: ${type}\r\nContent-Transfer-Encoding: ${encoding}\r\nContent-Location: ${url}\r\n\r\n${body}\r\n`).join('') + '--saved-page--\r\n';
afterEach(() => vi.restoreAllMocks());

it('extracts only requested seller images and excludes page HTML and unrelated resources', () => {
  const data = archive([{ url: loaded }, { url: other }, { url: 'https://www.cardmarket.com/account', type: 'text/html', body: 'private page content', encoding: 'quoted-printable' }]);
  expect([...sellerPhotosFromArchive(data, [{ sourceUrl: source, loadedUrl: loaded }])]).toEqual([[source, { type: 'image/jpeg', base64: 'aGVsbG8=' }]]);
  expect(sellerPhotosFromArchive(data, [{ sourceUrl: source, loadedUrl: 'https://evil.example/image.jpg' }]).size).toBe(0);
  expect(sellerPhotosFromArchive(archive([{ url: loaded, type: 'text/html' }]), [{ sourceUrl: source, loadedUrl: loaded }]).size).toBe(0);
  expect(sellerPhotosFromArchive(archive([{ url: loaded, body: '<script>bad</script>' }]), [{ sourceUrl: source, loadedUrl: loaded }]).size).toBe(0);
});

it('keeps Cardmarket’s actual preview URL but rejects another offer’s tooltip image', () => {
  document.body.innerHTML = `<a href="${source}"><span></span></a>`;
  const link = document.querySelector('a');
  link.querySelector('span').setAttribute('data-bs-original-title', `<img src="${loaded}" alt="scan">`);
  expect(sellerPhotoSource(link)).toEqual({ sourceUrl: source, loadedUrl: loaded });
  link.querySelector('span').setAttribute('data-bs-original-title', `<img src="${other}" alt="scan">`);
  expect(sellerPhotoSource(link)).toEqual({ sourceUrl: source, loadedUrl: source });
});

it('accepts only bounded JPEG previews for the app display', () => {
  expect(safeCardmarketPhotoData(photo)).toBe(photo);
  for (const value of ['data:text/html;base64,aGVsbG8=', 'data:image/svg+xml;base64,aGVsbG8=', 'javascript:alert(1)', photo + 'A'.repeat(CARDMARKET_PHOTO_LIMIT)]) expect(safeCardmarketPhotoData(value)).toBeNull();
});

const filters = { language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false };
const capture = () => ({ filteredUrl: filteredUrl({ productUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Card', ...filters }), filters, offers: [{ ...filters, signed: false, altered: false, scanUrl: source }] });
function browser(data) {
  return { tabs: { get: vi.fn(async () => ({ url: data.filteredUrl })), sendMessage: vi.fn(async (_id, request) => ({ ok: true, data: request.action === 'prepare-photos' ? [{ sourceUrl: source, loadedUrl: loaded }] : null })) }, pageCapture: { saveAsMHTML: vi.fn(async () => ({ size: 1000, text: async () => archive([{ url: loaded }]) })) } };
}

it('saves the displayed photo through Chrome and clears the reader’s preview tray', async () => {
  const data = capture(); const api = browser(data); const resize = vi.fn(async () => photo);
  expect(await captureSellerPhotos(api, 5, data, {}, () => false, resize)).toEqual({ photos: { [source]: photo }, warning: undefined });
  expect(api.pageCapture.saveAsMHTML).toHaveBeenCalledWith({ tabId: 5 });
  expect(api.tabs.sendMessage).toHaveBeenLastCalledWith(5, { channel: 'rafchu-cardmarket-reader', action: 'clear-photos' });
  expect(resize).toHaveBeenCalledWith({ type: 'image/jpeg', base64: 'aGVsbG8=' });
});

it('does not archive a changed tab, and photo failures keep existing previews usable', async () => {
  const data = capture(); const api = browser(data);
  api.tabs.get.mockResolvedValue({ url: 'https://example.com/private' });
  const result = await captureSellerPhotos(api, 5, data, { [other]: photo });
  expect(result.photos).toEqual({ [other]: photo });
  expect(result.warning).toMatch(/reader changed/);
  expect(api.pageCapture.saveAsMHTML).not.toHaveBeenCalled();
  const failed = browser(data); failed.pageCapture.saveAsMHTML.mockRejectedValue(new Error('Page capture permission unavailable.'));
  expect((await captureSellerPhotos(failed, 5, data)).warning).toContain('permission');
  expect(failed.tabs.sendMessage).toHaveBeenLastCalledWith(5, { channel: 'rafchu-cardmarket-reader', action: 'clear-photos' });
});

it('does not download duplicate previews or exceed the cache budget', async () => {
  const data = capture(); const api = browser(data);
  expect((await captureSellerPhotos(api, 5, data, { [source]: photo })).photos).toEqual({ [source]: photo });
  expect(api.pageCapture.saveAsMHTML).not.toHaveBeenCalled();
  const full = { [other]: 'x'.repeat(CARDMARKET_PHOTO_CACHE_LIMIT) };
  expect((await captureSellerPhotos(api, 5, data, full)).warning).toMatch(/cache is full/);
  expect(api.pageCapture.saveAsMHTML).not.toHaveBeenCalled();
});

it('keeps excluded conditions, languages, variants and graded listings out of the photo cache', async () => {
  const data = capture(); const eligible = data.offers[0];
  const excluded = [{ condition: 'NM' }, { language: 'Japanese' }, { finish: 'non-reverse' }, { firstEdition: true }, { signed: true }, { altered: true }, { comments: 'PSA 9 graded' }];
  data.offers.unshift(...excluded.map((changes, index) => ({ ...eligible, ...changes, scanUrl: `https://marketplace-article-scans.s3.cardmarket.com/${2000 + index}/${2000 + index}.jpg` })));
  const api = browser(data);
  await captureSellerPhotos(api, 5, data, {}, () => false, async () => photo);
  expect(api.tabs.sendMessage.mock.calls[0][1].sources).toEqual([source]);
});
