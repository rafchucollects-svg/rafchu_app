import { parseCardmarketEuro, safeCardmarketImage, safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
const text = el => (el?.innerText ?? el?.textContent ?? '').trim();
const langs = new Set(['English', 'Japanese', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Korean', 'T-Chinese', 'S-Chinese']);
const conditions = { '1': 'MT', '2': 'NM', '3': 'EX', '4': 'GD', '5': 'LP', '6': 'PL', '7': 'PO' };
export function readCardmarketPage(root, href) {
  const productUrl = safeCardmarketProduct(href);
  const title = text(root.querySelector('h1'));
  if (!productUrl || !root.querySelector('#FilterForm') || /verification|just a moment|access denied/i.test(title)) throw new Error('Open the exact Cardmarket product and complete any browser verification, then retry.');
  // The carousel also contains neighbouring cards. Only its centre slide is this product.
  const reference = root.querySelector('#mainContent .slideshow .slide:nth-child(2) .card-image img');
  const imageName = reference?.getAttribute('alt')?.trim();
  const productImageUrl = imageName && title.toLowerCase().startsWith(`${imageName.toLowerCase()} (`)
    ? safeCardmarketImage(reference.getAttribute('src')) : null;
  const form = root.querySelector('#FilterForm');
  const checkedLanguages = [...form.querySelectorAll('input[name^="language["]:checked')].map(el => text(el.parentElement.querySelector('label span:last-child')));
  const extra = name => form.querySelector(`select[name="extra[${name}]"]`)?.value;
  const reverse = extra('isReverseHolo');
  const filters = { language: checkedLanguages.length === 1 ? checkedLanguages[0] : null,
    condition: conditions[form.querySelector('select[name="minCondition"]')?.value] || null,
    finish: reverse === 'Y' ? 'reverse' : reverse === 'N' || reverse === undefined ? 'non-reverse' : null,
    firstEdition: extra('isFirstEd') === 'Y' ? true : extra('isFirstEd') === 'N' ? false : null };
  if (form.querySelector('input[name^="sellerCountry["]:checked, input[name^="sellerType["]:checked') || Number(form.querySelector('input[name="amount"]')?.value) > 0) throw new Error('Clear seller-location, seller-type, and quantity filters before capture.');
  if (extra('isSigned') !== 'N' || extra('isAltered') !== 'N') throw new Error('Set Signed and Altered to No before capturing raw cards.');
  if (!filters.language || !filters.condition || !filters.finish || filters.firstEdition === null) throw new Error('Choose one language, minimum condition, reverse status, and edition before capture.');
  const query = new URL(href).searchParams;
  const selectedLanguage = form.querySelector('input[name^="language["]:checked')?.value;
  if (query.get('language') !== selectedLanguage || query.get('minCondition') !== form.querySelector('select[name="minCondition"]')?.value ||
      query.get('isFirstEd') !== extra('isFirstEd') || query.get('isSigned') !== 'N' || query.get('isAltered') !== 'N' ||
      (reverse !== undefined && query.get('isReverseHolo') !== reverse)) throw new Error('Apply the filters on Cardmarket before capturing the offers.');
  const offers = [...root.querySelectorAll('.article-row')].map(row => {
    const attributes = [...row.querySelectorAll('.product-attributes [aria-label]')].map(el => el.getAttribute('aria-label'));
    const languages = attributes.filter(label => langs.has(label));
    const seller = row.querySelector('.seller-name a[href*="/Users/"]');
    const prices = [...row.querySelectorAll('.price-container, .mobile-offer-container .color-primary')].map(text).filter(Boolean).map(parseCardmarketEuro);
    if (!seller || !prices.length || prices.some(price => price == null || price !== prices[0])) throw new Error('An offer has an unreadable seller or EUR price.');
    const countryLabel = row.querySelector('[aria-label^="Item location:"]')?.getAttribute('aria-label') || '';
    const scan = safeCardmarketImage(row.querySelector('a[href^="https://marketplace-article-scans.s3.cardmarket.com/"]')?.href, 'seller');
    return { offerId: row.id, seller: text(seller), sellerUrl: new URL(seller.getAttribute('href'), productUrl).href,
      country: countryLabel.replace(/^Item location:\s*/, ''), sellerType: row.querySelector('.seller-name [aria-label="Powerseller"]') ? 'Powerseller' : row.querySelector('.seller-name [aria-label="Professional"]') ? 'Professional' : 'Private', condition: text(row.querySelector('.article-condition')),
      language: languages.length === 1 ? languages[0] : null, finish: attributes.includes('Reverse Holo') ? 'reverse' : 'non-reverse',
      firstEdition: attributes.includes('First Edition'), signed: attributes.some(label => /^(signed|autographed)$/i.test(label)),
      altered: attributes.some(label => /^altered(?: art)?$/i.test(label)), comments: text(row.querySelector('.product-comments')),
      price: prices[0], currency: 'EUR', scanUrl: scan,
      url: `${href.split('#')[0]}#${row.id}` };
  });
  const more = [...root.querySelectorAll('button')].find(el => /Show more results/i.test(text(el)));
  return { source: 'cardmarket-browser', currency: 'EUR', productUrl, productTitle: title, productImageUrl, filteredUrl: href,
    capturedAt: new Date().toISOString(), filters, offers, complete: !more, moreAvailable: Boolean(more) };
}
