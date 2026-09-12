import { readCardmarketPage } from './dom.js';
import { readCardmarketProducts } from './products.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let reading = false;
let cancelled = false;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.channel !== 'rafchu-cardmarket-reader') return;
  if (message.action === 'cancel') { cancelled = true; respond({ ok: true }); return; }
  if (message.action === 'ping') {
    // A verification document can finish loading before the actual product arrives.
    const ok = Boolean(document.querySelector(message.mode === 'products' ? '#SearchResultForm, #FilterForm' : '#FilterForm') && document.querySelector('h1'));
    respond({ ok, ...(!ok && /just a moment|security verification|verify (?:you are|that you are) human|access denied/i.test(`${document.title} ${document.body?.innerText || ''}`) ? { reason: 'verification' } : {}) });
    return;
  }
  if (message.action === 'products') {
    try { respond({ ok: true, data: readCardmarketProducts(document, location.href, message.task) }); }
    catch (error) { respond({ ok: false, error: error.message }); }
    return;
  }
  if (message.action !== 'capture') return;
  if (reading) { respond({ ok: false, error: 'A capture is already running.' }); return; }
  reading = true; cancelled = false;
  (async () => {
    try {
      let result = readCardmarketPage(document, location.href);
      // The user's choice needs the actual offer list, not an estimated aggregate.
      for (let page = 0; !result.complete && page < 20; page++) {
        if (cancelled) throw new Error('Capture stopped.');
        if (result.offers.length >= 1000) throw new Error('More than 1,000 offers. Narrow the filters before capture.');
        const before = result.offers.map(offer => offer.offerId).join(',');
        const more = [...document.querySelectorAll('button')].find(el => /Show more results/i.test(el.textContent));
        if (!more || more.disabled) throw new Error('The next offer page is unavailable. Retry the capture.');
        more.click();
        let changed = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          await pause(400);
          if (cancelled) throw new Error('Capture stopped.');
          chrome.runtime.sendMessage({ channel: 'rafchu-cardmarket-progress' }).catch(() => {});
          result = readCardmarketPage(document, location.href);
          if (result.complete || result.offers.map(offer => offer.offerId).join(',') !== before) { changed = true; break; }
        }
        if (!changed) throw new Error('Cardmarket did not load the next offer page. Current prices were preserved.');
      }
      if (!result.complete) throw new Error('Offer capture reached its page limit. Narrow the filters.');
      respond({ ok: true, data: result });
    } catch (error) { respond({ ok: false, error: error.message }); }
    finally { reading = false; }
  })();
  return true;
});
