import { readCardmarketPage, readCardmarketDiscoveryPage } from './dom.js';
import { sameDiscoveryPage } from '../../src/utils/cardmarketDiscovery.js';
import { readCardmarketProducts } from './products.js';
import { prepareCardmarketPhotos, clearCardmarketPhotos } from './photoReader.js';
import { sameCapturePage } from './capture.js';
import { cardmarketReaderState } from './readerState.js';
import { readCardmarketPagination } from './offerPagination.js';
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
    const expectedUrl = preview ? message.filteredUrl : location.href;
    const samePage = preview ? sameDiscoveryPage : sameCapturePage;
    const pageFailure = message => Object.assign(new Error(message), { code: 'preview-incomplete' });
    const read = () => {
      if (!samePage(location.href, expectedUrl)) throw new Error('The Cardmarket reader changed during listing capture.');
      const state = cardmarketReaderState(document);
      if (!state.ok && ['verification', 'server-error'].includes(state.reason)) throw Object.assign(new Error(
        state.reason === 'verification' ? 'Cardmarket verification interrupted listing capture. Open the reader and resume after it clears.'
          : 'Cardmarket returned a temporary server error while reading listings. Resume to retry this product.'), { code: state.reason });
      const next = preview ? readCardmarketDiscoveryPage(document, location.href) : readCardmarketPage(document, location.href);
      if (result && JSON.stringify(preview ? next.coverage : next.filters) !== JSON.stringify(preview ? result.coverage : result.filters)) throw new Error('Cardmarket offer filters changed during listing capture.');
      return next;
    };
    const checkLimit = () => {
      if (readCardmarketPagination(document).limitReached) throw pageFailure('Cardmarket only shows the first 300 offers. Narrow the filters before capture.');
      if (result.offers.length > 1000 || (!result.complete && result.offers.length >= 1000)) {
        if (preview) result.offers = result.offers.slice(0, 1000);
        throw pageFailure('More than 1,000 offers. Narrow the filters before capture.');
      }
    };
    const rows = () => JSON.stringify(result.offers);
    const moreButton = () => readCardmarketPagination(document).button;
    async function readyForNextPage(previousRows = null) {
      const initialRows = rows();
      const pendingResponse = previousRows !== null || readCardmarketPagination(document).loading;
      let previous = JSON.stringify([initialRows, result.complete]);
      let stablePolls = 0;
      for (let attempt = 0; attempt < 40; attempt++) {
        await pause(400);
        if (cancelled) throw new Error('Capture stopped.');
        chrome.runtime.sendMessage({ channel: 'rafchu-cardmarket-progress' }).catch(() => {});
        result = read(); checkLimit();
        const currentRows = rows();
        const current = JSON.stringify([currentRows, result.complete]);
        const stable = current === previous;
        stablePolls = stable ? stablePolls + 1 : 0;
        previous = current;
        // AJAX can append rows before re-enabling its button. Wait for a stable
        // snapshot and ready button; never click twice while that load settles.
        // After a click or an initially disabled button, disappearance alone
        // is not completion: require new offers or Cardmarket's explicit end.
        // Final rows can arrive in batches while the button is absent. Require
        // 1.6 seconds of unchanged offers before accepting that terminal state.
        const pagination = readCardmarketPagination(document);
        if (stablePolls >= 4 && result.complete && (!pendingResponse || pagination.exhausted || currentRows !== (previousRows ?? initialRows))) return null;
        const button = moreButton();
        if (stable && button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' &&
            (previousRows === null || currentRows !== previousRows)) return button;
      }
      throw pageFailure(previousRows === null
        ? 'The next offer page did not become ready. Cardmarket may still be loading; retry the capture.'
        : 'Cardmarket did not load the next offer page completely. Current prices were preserved.');
    }
    try {
      result = read(); checkLimit();
      // The user's choice needs the actual offer list, not an estimated aggregate.
      for (let page = 0; !result.complete && page < 20;) {
        if (cancelled) throw new Error('Capture stopped.');
        const more = await readyForNextPage();
        if (!more) break;
        const before = rows();
        // Recheck after awaiting readiness: cancellation or a page update can
        // be delivered before this continuation runs.
        if (cancelled) throw new Error('Capture stopped.');
        result = read(); checkLimit();
        if (result.complete) { await readyForNextPage(before); continue; }
        if (rows() !== before || more !== moreButton() || more.disabled || more.getAttribute('aria-disabled') === 'true') continue;
        more.click(); page++;
        await readyForNextPage(before);
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
