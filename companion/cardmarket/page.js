import { readCardmarketPage, readCardmarketDiscoveryPage } from './dom.js';
import { sameDiscoveryPage } from '../../src/utils/cardmarketDiscovery.js';
import { readCardmarketProducts } from './products.js';
import { prepareCardmarketPhotos, clearCardmarketPhotos } from './photoReader.js';
import { sameCapturePage } from './capture.js';
import { cardmarketReaderState } from './readerState.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let reading = false;
let cancelled = false;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.channel !== 'rafchu-cardmarket-reader') return;
  if (message.action === 'clear-photos') { clearCardmarketPhotos(); respond({ ok: true }); return; }
  if (message.action === 'prepare-photos') {
    const samePage = message.scope === 'product-preview' ? sameDiscoveryPage : sameCapturePage;
    if (!samePage(location.href, message.filteredUrl) || !Array.isArray(message.sources)) { respond({ ok: false }); return; }
    prepareCardmarketPhotos(document, message.sources, () => cancelled).then(data => respond({ ok: true, data }), () => respond({ ok: false }));
    return true;
  }
  if (message.action === 'cancel') { cancelled = true; respond({ ok: true }); return; }
  if (message.action === 'ping') {
    // A verification document can finish loading before the actual product arrives.
    respond(cardmarketReaderState(document, message.mode));
    return;
  }
  if (message.action === 'products') {
    try { respond({ ok: true, data: readCardmarketProducts(document, location.href, message.task) }); }
    catch (error) { respond({ ok: false, error: error.message, code: error.code }); }
    return;
  }
  if (!['capture', 'capture-preview'].includes(message.action)) return;
  const preview = message.action === 'capture-preview';
  if (reading) { respond({ ok: false, error: 'A capture is already running.' }); return; }
  reading = true; cancelled = false;
  (async () => {
    let result;
    const pageFailure = message => Object.assign(new Error(message), { code: 'preview-incomplete' });
    const read = () => {
      if (!preview) return readCardmarketPage(document, location.href);
      if (!sameDiscoveryPage(location.href, message.filteredUrl)) throw new Error('The Cardmarket reader changed during listing discovery.');
      const state = cardmarketReaderState(document);
      if (!state.ok && ['verification', 'server-error'].includes(state.reason)) throw Object.assign(new Error(
        state.reason === 'verification' ? 'Cardmarket verification interrupted listing capture. Open the reader and resume after it clears.'
          : 'Cardmarket returned a temporary server error while reading listings. Resume to retry this product.'), { code: state.reason });
      const next = readCardmarketDiscoveryPage(document, location.href);
      if (result && JSON.stringify(next.coverage) !== JSON.stringify(result.coverage)) throw new Error('Cardmarket offer filters changed during listing discovery.');
      return next;
    };
    try {
      result = read();
      if (preview && result.offers.length > 1000) { result.offers = result.offers.slice(0, 1000); throw pageFailure('More than 1,000 offers. Narrow the filters before capture.'); }
      // The user's choice needs the actual offer list, not an estimated aggregate.
      for (let page = 0; !result.complete && page < 20; page++) {
        if (cancelled) throw new Error('Capture stopped.');
        if (result.offers.length >= 1000) throw pageFailure('More than 1,000 offers. Narrow the filters before capture.');
        const before = result.offers.map(offer => offer.offerId).join(',');
        const more = [...document.querySelectorAll('button')].find(el => /Show more results/i.test(el.textContent));
        if (!more || more.disabled) throw pageFailure('The next offer page is unavailable. Retry the capture.');
        more.click();
        let changed = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          await pause(400);
          if (cancelled) throw new Error('Capture stopped.');
          chrome.runtime.sendMessage({ channel: 'rafchu-cardmarket-progress' }).catch(() => {});
          result = read();
          if (preview && result.offers.length > 1000) { result.offers = result.offers.slice(0, 1000); throw pageFailure('More than 1,000 offers. Narrow the filters before capture.'); }
          if (result.complete || result.offers.map(offer => offer.offerId).join(',') !== before) { changed = true; break; }
        }
        if (!changed) throw pageFailure('Cardmarket did not load the next offer page. Current prices were preserved.');
      }
      if (!result.complete) throw pageFailure('Offer capture reached its page limit. Narrow the filters.');
      respond({ ok: true, data: result });
    } catch (error) {
      if (preview && !cancelled && result && error.code === 'preview-incomplete' && sameDiscoveryPage(location.href, message.filteredUrl)) {
        respond({ ok: true, data: { ...result, offers: result.offers.slice(0, 1000), complete: false, moreAvailable: true, error: error.message, errorCode: error.code } });
      } else respond({ ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    finally { reading = false; }
  })();
  return true;
});
