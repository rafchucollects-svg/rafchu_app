import { expect, it } from 'vitest';
import { readCardmarketPage } from '../../companion/cardmarket/dom';
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
