import { parseCardmarketEuro, safeCardmarketImage, safeCardmarketProduct } from '../../src/utils/cardmarketSync.js';
const text = el => (el?.innerText ?? el?.textContent ?? '').trim();
const langs = new Set(['English', 'Japanese', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Korean', 'T-Chinese', 'S-Chinese']);
const conditions = { '1': 'MT', '2': 'NM', '3': 'EX', '4': 'GD', '5': 'LP', '6': 'PL', '7': 'PO' };
function languageLabel(control) {
  const label = control.labels?.[0] || control.parentElement?.querySelector('label');
  const candidates = [text(label?.querySelector('span:last-child')), text(label), label?.getAttribute('aria-label'),
    ...[...(label?.querySelectorAll('[aria-label]') || [])].map(el => el.getAttribute('aria-label'))].filter(value => langs.has(value));
  const knownValue = { '1': 'English', '7': 'Japanese' }[control.value];
  if (new Set(candidates).size > 1 || (knownValue && candidates.some(value => value !== knownValue))) return null;
  return candidates[0] || knownValue || null;
}
const extraControl = (form, name) => form.querySelector(`select[name="extra[${name}]"]`) || form.querySelector(`input[type="hidden"][name="extra[${name}]"]`);

function productPage(root, href) {
  const productUrl = safeCardmarketProduct(href);
  const title = text(root.querySelector('h1'));
  if (!productUrl || !root.querySelector('#FilterForm') || /verification|just a moment|access denied/i.test(title)) throw new Error('Open the exact Cardmarket product and complete any browser verification, then retry.');
  // The carousel also contains neighbouring cards. Only its centre slide is this product.
  const reference = root.querySelector('#mainContent .slideshow .slide:nth-child(2) .card-image img');
  const imageName = reference?.getAttribute('alt')?.trim();
  const productImageUrl = imageName && title.toLowerCase().startsWith(`${imageName.toLowerCase()} (`)
    ? safeCardmarketImage(reference.getAttribute('src')) : null;
  return { productUrl, title, productImageUrl, form: root.querySelector('#FilterForm') };
}

function readOffers(root, href, productUrl) {
  return [...root.querySelectorAll('.article-row')].map(row => {
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
}

function commonCapture(root, href, page, offers) {
  const more = [...root.querySelectorAll('button')].find(el => /Show more results/i.test(text(el)));
  return { source: 'cardmarket-browser', currency: 'EUR', productUrl: page.productUrl, productTitle: page.title,
    productImageUrl: page.productImageUrl, filteredUrl: href, capturedAt: new Date().toISOString(),
    offers, complete: !more, moreAvailable: Boolean(more) };
}

export function readCardmarketPage(root, href) {
  const page = productPage(root, href);
  const { form, productUrl } = page;
  const query = new URL(href).searchParams;
  const checkedLanguages = [...form.querySelectorAll('input[name^="language["]:checked')].map(languageLabel);
  const extra = name => extraControl(form, name)?.value;
  // Modern products can omit edition controls entirely. A confirmed No request
  // can still be narrowed from individually tagged offers; never infer Yes.
  const edition = extra('isFirstEd') ?? (!form.querySelector('[name="extra[isFirstEd]"]') && query.getAll('isFirstEd').length === 1 && query.get('isFirstEd') === 'N' ? 'N' : undefined);
  const reverse = extra('isReverseHolo');
  const filters = { language: checkedLanguages.length === 1 ? checkedLanguages[0] : null,
    condition: conditions[form.querySelector('select[name="minCondition"]')?.value] || null,
    finish: reverse === 'Y' ? 'reverse' : reverse === 'N' || reverse === undefined ? 'non-reverse' : null,
    firstEdition: edition === 'Y' ? true : edition === 'N' ? false : null };
  if (form.querySelector('input[name^="sellerCountry["]:checked, input[name^="sellerType["]:checked') || Number(form.querySelector('input[name="amount"]')?.value) > 0) throw new Error('Clear seller-location, seller-type, and quantity filters before capture.');
  if (extra('isSigned') !== 'N' || extra('isAltered') !== 'N') throw new Error('Set Signed and Altered to No before capturing raw cards.');
  const missing = [!filters.language && 'one language', !filters.condition && 'minimum condition', !filters.finish && 'reverse status', filters.firstEdition === null && 'edition'].filter(Boolean);
  if (missing.length) throw new Error(`Cardmarket’s page did not expose a confirmed ${missing.join(', ')} filter. The saved Rafchu choices were kept; open the reader and check its applied filters.`);
  const selectedLanguage = form.querySelector('input[name^="language["]:checked')?.value;
  if (query.get('language') !== selectedLanguage || query.get('minCondition') !== form.querySelector('select[name="minCondition"]')?.value ||
      query.get('isFirstEd') !== edition || query.get('isSigned') !== 'N' || query.get('isAltered') !== 'N' ||
      (reverse !== undefined && query.get('isReverseHolo') !== reverse)) throw new Error('Apply the filters on Cardmarket before capturing the offers.');
  const offers = readOffers(root, href, productUrl);
  return { ...commonCapture(root, href, page, offers), filters };
}

// Discovery deliberately reads a wider offer set before the user confirms a
// printing. Record the controls that actually applied, never guessed coverage.
export function readCardmarketDiscoveryPage(root, href) {
  const page = productPage(root, href);
  const { form, productUrl } = page;
  const query = new URL(href).searchParams;
  const required = ['language', 'minCondition', 'isReverseHolo', 'isFirstEd', 'isSigned', 'isAltered'];
  if (required.some(name => query.getAll(name).length !== 1)) throw new Error('Apply the discovery filters on Cardmarket before reading offers.');
  if (form.querySelector('input[name^="sellerCountry["]:checked, input[name^="sellerType["]:checked') || Number(form.querySelector('input[name="amount"]')?.value) > 0) throw new Error('Clear seller-location, seller-type, and quantity filters before capture.');
  const languageControls = [...form.querySelectorAll('input[name^="language["]')];
  const conditionControl = form.querySelector('select[name="minCondition"]');
  if (!languageControls.length || !conditions[conditionControl?.value]) throw new Error('Cardmarket language or minimum-condition controls are missing or unreadable.');
  const selected = languageControls.filter(el => el.checked);
  const languages = selected.map(languageLabel);
  if (languages.some(language => !langs.has(language)) || (query.get('language') === '' ? selected.length > 0 : selected.length !== 1 || selected[0].value !== query.get('language')) || query.get('minCondition') !== conditionControl.value) throw new Error('Apply the discovery language and condition filters on Cardmarket before reading offers.');
  const extra = name => form.querySelector(`select[name="extra[${name}]"]`);
  if (extraControl(form, 'isSigned')?.value !== 'N' || extraControl(form, 'isAltered')?.value !== 'N' || query.get('isSigned') !== 'N' || query.get('isAltered') !== 'N') throw new Error('Set Signed and Altered to No before capturing raw cards.');
  const coverageChoice = (name, values, absent) => {
    const control = extra(name);
    const requested = query.get(name);
    if (!control) {
      const declared = form.querySelector(`[name="extra[${name}]"]`);
      const fixedNo = declared?.matches('input[type="hidden"][value="N"]');
      if (fixedNo && ['', 'N'].includes(requested)) return [values.N];
      if (!declared && ['', 'N'].includes(requested)) {
        // A complete, validated offer form can omit edition controls on modern
        // products. No edition control means no server-side edition narrowing;
        // retain broad coverage and check every offer after user confirmation.
        // Reverse remains conservative because its absence denotes a product
        // whose offer form does not provide a reverse variant.
        return absent ? [values.N] : null;
      }
      throw new Error('Cardmarket edition coverage is unknown. Open the product filters before reading offers.');
    }
    const actual = control.value;
    const fixedNo = actual === 'N' && [...control.options].every(option => option.value === 'N');
    if (!['', 'Y', 'N'].includes(actual) || (requested !== actual && !(requested === '' && fixedNo))) throw new Error('Apply the discovery reverse and edition filters on Cardmarket before reading offers.');
    return actual === '' ? null : [values[actual]];
  };
  const coverage = { languages: selected.length ? languages : null, minCondition: conditions[conditionControl.value],
    finishes: coverageChoice('isReverseHolo', { Y: 'reverse', N: 'non-reverse' }, true),
    editions: coverageChoice('isFirstEd', { Y: true, N: false }, false), signed: false, altered: false };
  return { ...commonCapture(root, href, page, readOffers(root, href, productUrl)), scope: 'product-preview', coverage };
}
