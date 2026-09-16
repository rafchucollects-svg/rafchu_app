import { expect, it } from 'vitest';
import { readCardmarketPage, readCardmarketDiscoveryPage } from '../../companion/cardmarket/dom';
const product = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/EX-Unseen-Forces/Jolteon-UF8';
const filtered = product + '?language=1&minCondition=3&isReverseHolo=Y&isSigned=N&isFirstEd=N&isAltered=N';
function fixture({ japanese = false, sellerType = 'Professional', reverse = true } = {}) {
  const extra = (name, value) => `<select name="extra[${name}]"><option value="${value}">${value}</option></select>`;
  document.body.innerHTML = `<h1>Jolteon (UF 8) EX Unseen Forces - Singles</h1><form id="FilterForm"><div><input type="checkbox" name="language[${japanese ? 7 : 1}]" value="${japanese ? 7 : 1}" checked><label><span>${japanese ? 'Japanese' : 'English'}</span></label></div><select name="minCondition"><option value="3">Excellent</option></select>${reverse ? extra('isReverseHolo','Y') : ''}${extra('isSigned','N')}${extra('isFirstEd','N')}${extra('isAltered','N')}</form><div class="article-row" id="articleRow1001"><span class="seller-name"><a href="/en/Pokemon/Users/Pokecraic">Pokecraic</a>${sellerType === 'Private' ? '' : `<span aria-label="${sellerType}"></span>`}</span><span aria-label="Item location: Ireland"></span><div class="product-attributes"><a class="article-condition">EX</a><span aria-label="${japanese ? 'Japanese' : 'English'}"></span>${reverse ? '<span aria-label="Reverse Holo"></span>' : ''}</div><div class="product-comments">EX</div><div class="price-container">100,00 €</div></div>`;
}
it('reads exact offer identity, condition, reverse status, EUR price and seller classification', () => {
  for (const sellerType of ['Professional', 'Powerseller', 'Private']) {
    fixture({ sellerType });
    expect(readCardmarketPage(document, filtered)).toMatchObject({ complete: true, filters: { language: 'English', condition: 'EX', finish: 'reverse', firstEdition: false }, offers: [{ offerId: 'articleRow1001', price: 100, sellerType, country: 'Ireland', condition: 'EX', signed: false, altered: false }] });
  }
});
it('handles Japanese product pages with no reverse dropdown and cannot mark unread pages complete', () => {
  fixture({ japanese: true, reverse: false });
  expect(readCardmarketPage(document, filtered.replace('language=1','language=7').replace('isReverseHolo=Y','isReverseHolo=N'))).toMatchObject({ filters: { language: 'Japanese', finish: 'non-reverse' } });
  const button = document.createElement('button'); button.textContent = 'Show more results'; document.body.append(button);
  expect(readCardmarketPage(document, filtered.replace('language=1','language=7'))).toMatchObject({ complete: false, moreAvailable: true });
  document.body.innerHTML = '<h1>Performing security verification</h1>';
  expect(() => readCardmarketPage(document, filtered)).toThrow(/verification/);
});
it('rejects unapplied filters, malformed prices and restricted seller filters', () => {
  fixture(); expect(() => readCardmarketPage(document, product)).toThrow(/Apply/);
  fixture(); document.querySelector('.price-container').textContent = '100 USD'; expect(() => readCardmarketPage(document, filtered)).toThrow(/EUR/);
  fixture(); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'sellerCountry[1]'; checkbox.checked = true; document.querySelector('form').append(checkbox); expect(() => readCardmarketPage(document, filtered)).toThrow(/Clear/);
});

it('captures this product’s reference image and the seller’s scan without using neighbouring cards', () => {
  fixture();
  document.body.insertAdjacentHTML('beforeend', '<div id="mainContent"><div class="slideshow"><div class="slide"><div class="card-image"><img alt="Houndoom" src="https://product-images.s3.cardmarket.com/51/UF/276653/276653.jpg"></div></div><div class="slide"><div class="card-image"><img alt="Jolteon " src="https://product-images.s3.cardmarket.com/51/UF/276654/276654.jpg"></div></div></div></div>');
  document.querySelector('.article-row').insertAdjacentHTML('beforeend', '<a href="https://marketplace-article-scans.s3.cardmarket.com/1001/1001.jpg">Photo</a>');
  expect(readCardmarketPage(document, filtered)).toMatchObject({ productImageUrl: 'https://product-images.s3.cardmarket.com/51/UF/276654/276654.jpg', offers: [{ scanUrl: 'https://marketplace-article-scans.s3.cardmarket.com/1001/1001.jpg', url: filtered + '#articleRow1001' }] });
  document.querySelector('.slide:nth-child(2) img').alt = 'Wrong card';
  expect(readCardmarketPage(document, filtered).productImageUrl).toBeNull();
  document.querySelector('.slide:nth-child(2)').remove();
  expect(readCardmarketPage(document, filtered).productImageUrl).toBeNull();
});

const discovery = product + '?language=&minCondition=3&isReverseHolo=&isSigned=N&isFirstEd=&isAltered=N';
function discoveryFixture() {
  fixture();
  document.querySelector('[name="language[1]"]').checked = false;
  for (const name of ['isReverseHolo', 'isFirstEd']) document.querySelector(`[name="extra[${name}]"]`).innerHTML = '<option value="">All</option><option value="Y">Yes</option><option value="N">No</option>';
}
it('records broad discovery coverage without treating it as a confirmed-filter capture', () => {
  discoveryFixture();
  const result = readCardmarketDiscoveryPage(document, discovery);
  expect(result).toMatchObject({ scope: 'product-preview', coverage: { languages: null, minCondition: 'EX', finishes: null, editions: null, signed: false, altered: false }, complete: true, offers: [{ language: 'English', condition: 'EX', finish: 'reverse', price: 100 }] });
  expect(result.filters).toBeUndefined();
  expect(() => readCardmarketPage(document, discovery)).toThrow(/one language.*reverse status.*edition/);
  document.querySelector('[name="language[1]"]').checked = true;
  expect(readCardmarketDiscoveryPage(document, discovery.replace('language=', 'language=1')).coverage.languages).toEqual(['English']);
});
it('requires real language and condition controls and applied filters for discovery', () => {
  for (const name of ['language[1]', 'minCondition']) {
    discoveryFixture(); document.querySelector(`[name="${name}"]`).remove();
    expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/controls are missing/);
  }
  discoveryFixture(); document.querySelector('[name="language[1]"]').checked = true;
  expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/Apply/);
  discoveryFixture(); document.querySelector('[name="extra[isFirstEd]"]').value = 'Y';
  expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/Apply/);
  discoveryFixture();
  expect(() => readCardmarketDiscoveryPage(document, discovery + '&minCondition=7')).toThrow(/Apply/);
  expect(() => readCardmarketDiscoveryPage(document, discovery.replace('minCondition=3', 'minCondition=7'))).toThrow(/Apply/);
});
it('records an unfiltered edition offer set when Cardmarket omits the edition control', () => {
  discoveryFixture(); document.querySelector('[name="extra[isReverseHolo]"]').remove();
  expect(readCardmarketDiscoveryPage(document, discovery).coverage.finishes).toEqual(['non-reverse']);
  document.querySelector('[name="extra[isFirstEd]"]').remove();
  expect(readCardmarketDiscoveryPage(document, discovery).coverage.editions).toBeNull();
  expect(() => readCardmarketDiscoveryPage(document, discovery.replace('isFirstEd=', 'isFirstEd=Y'))).toThrow(/edition coverage is unknown/);
  document.querySelector('form').insertAdjacentHTML('beforeend', '<input type="hidden" name="extra[isFirstEd]" value="N">');
  expect(readCardmarketDiscoveryPage(document, discovery).coverage.editions).toEqual([false]);
  discoveryFixture(); document.querySelector('[name="extra[isFirstEd]"]').innerHTML = '<option value="N">No</option>';
  expect(readCardmarketDiscoveryPage(document, discovery).coverage.editions).toEqual([false]);
});
it('rejects restricted sellers and signed or altered filters before broad discovery', () => {
  for (const control of ['<input type="checkbox" name="sellerCountry[1]" checked>', '<input type="checkbox" name="sellerType[1]" checked>', '<input name="amount" value="2">']) {
    discoveryFixture(); document.querySelector('form').insertAdjacentHTML('beforeend', control);
    expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/Clear/);
  }
  for (const name of ['isSigned', 'isAltered']) {
    discoveryFixture(); document.querySelector(`[name="extra[${name}]"]`).remove();
    expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/Signed and Altered/);
  }
});

it('reads an explicit hidden non-first-edition filter on a modern product', () => {
  fixture();
  document.querySelector('h1').textContent = "Ethan's Ho-Oh ex (DRI 230) Destined Rivals - Singles";
  document.querySelector('[name="extra[isFirstEd]"]').outerHTML = '<input type="hidden" name="extra[isFirstEd]" value="N">';
  const modern = filtered.replace('EX-Unseen-Forces/Jolteon-UF8', 'Destined-Rivals/Ethans-Ho-Oh-ex-V3-DRI230');
  expect(readCardmarketPage(document, modern)).toMatchObject({ filters: { firstEdition: false }, complete: true });
  expect(() => readCardmarketPage(document, modern.replace('isFirstEd=N', 'isFirstEd=Y'))).toThrow(/Apply/);
  document.querySelector('[name="extra[isFirstEd]"]').remove();
  expect(readCardmarketPage(document, modern).filters.firstEdition).toBe(false);
  expect(() => readCardmarketPage(document, modern.replace('isFirstEd=N', 'isFirstEd=Y'))).toThrow(/confirmed edition filter/);
});

it('reads language controls with an icon-only label without guessing unsupported languages', () => {
  fixture(); document.querySelector('label').innerHTML = '<span aria-label="English"></span>';
  expect(readCardmarketPage(document, filtered).filters.language).toBe('English');
  document.querySelector('label').innerHTML = '';
  expect(readCardmarketPage(document, filtered).filters.language).toBe('English');
  document.querySelector('label').innerHTML = '<span aria-label="Japanese"></span>';
  expect(() => readCardmarketPage(document, filtered)).toThrow(/confirmed one language/);
});

it('reads the confirmed No-edition request when modern product pages omit variant controls', () => {
  fixture({ reverse: false });
  document.querySelector('[name="extra[isFirstEd]"]').remove();
  const modern = filtered.replace('EX-Unseen-Forces/Jolteon-UF8', 'Destined-Rivals/Ethans-Ho-Oh-ex-V3-DRI230').replace('isReverseHolo=Y', 'isReverseHolo=N');
  const result = readCardmarketPage(document, modern);
  expect(result.filters).toMatchObject({ finish: 'non-reverse', firstEdition: false });
  // Rendering a first-edition offer never changes the requested filter or its
  // independent attributes; downstream matching still excludes that offer.
  document.querySelector('.product-attributes').insertAdjacentHTML('beforeend', '<span aria-label="First Edition"></span>');
  expect(readCardmarketPage(document, modern)).toMatchObject({ filters: { firstEdition: false }, offers: [{ firstEdition: true }] });
  expect(() => readCardmarketPage(document, modern.replace('isFirstEd=N', 'isFirstEd=Y'))).toThrow(/edition filter/);
  expect(() => readCardmarketPage(document, modern.replace('&isFirstEd=N', ''))).toThrow(/edition filter/);
});

it('rejects a malformed existing edition control rather than calling it unrestricted', () => {
  discoveryFixture();
  document.querySelector('[name="extra[isFirstEd]"]').outerHTML = '<input type="hidden" name="extra[isFirstEd]" value="unknown">';
  expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/edition coverage is unknown/);
  discoveryFixture();
  document.querySelector('[name="extra[isFirstEd]"]').innerHTML = '<option value="unknown">Unknown</option>';
  expect(() => readCardmarketDiscoveryPage(document, discovery)).toThrow(/Apply/);
});
