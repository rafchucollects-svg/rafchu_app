import { describe, expect, it } from 'vitest';
import { CARDMARKET_KNOWN_PRODUCTS, cardmarketSearchUrl, rankCardmarketProducts, suggestCardmarketProducts } from './cardmarketProducts';
import { readCardmarketProducts } from '../../companion/cardmarket/products';
const card = { name: 'Blastoise', set: 'Expedition Base Set', number: '004/165', language: 'English' };
const url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Blastoise-EX4';
const search = 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Blastoise+004&searchMode=v2&idCategory=51&idExpansion=1536';
const candidate = { name: 'Blastoise', set: 'Expedition Base Set', number: '4', productUrl: url };
describe('Cardmarket product suggestions', () => {
  it('prefills every audited tagged identity from verified catalogue links', () => {
    for (const product of CARDMARKET_KNOWN_PRODUCTS) expect(suggestCardmarketProducts({ ...product, set: product.language === 'Japanese' ? 'Japanese Expedition' : product.set })[0]?.productUrl).toBe(product.productUrl);
    expect(suggestCardmarketProducts(card)[0].productUrl).toBe(url);
    expect(suggestCardmarketProducts({name:'Jolteon',set:'Delta Species',number:'7'})[0].productUrl).toContain('Jolteon-Delta-Species-DS7');
  });
  it('matches exact identity and rejects same-name cards from other expansions or numbers', () => {
    const wrong = [{ ...candidate, set: 'Base Set' }, { ...candidate, number: '36' }, { ...candidate, name: 'Dark Blastoise' }, { ...candidate, productUrl: 'javascript:alert(1)' }, { ...candidate, language: 'Japanese' }];
    expect(rankCardmarketProducts(card, [...wrong, candidate])).toEqual([expect.objectContaining({ productUrl: url })]);
    expect(rankCardmarketProducts({...card,set:'Japanese Expedition'}, [candidate])).toHaveLength(0);
    expect(cardmarketSearchUrl({name:'Charizard 1st Edition',number:'103/128'})).toContain('searchString=Charizard+103');
  });
  it('keeps existing links as reviewable alternatives without treating them as exact matches', () => {
    const old = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Base-Set/Blastoise-BS2';
    expect(suggestCardmarketProducts({...card,links:{cardmarket:old}}).map(row=>row.productUrl)).toEqual([url,old]);
  });
});
function searchFixture() {
  document.body.innerHTML = `<main><h1>Search Results</h1><form id="SearchResultForm"><select name="idExpansion"><option value="0">All</option><option value="1536">Expedition Base Set</option><option value="5021">Base Expansion Pack</option></select><select name="idCategory"><option value="0">All</option><option value="51">Singles</option></select></form><a class="galleryBox" href="${url}"><h2><span class="expansion-symbol" aria-label="Expedition Base Set"></span>Blastoise (EX 4)</h2></a></main>`;
}
it('reads the actual expansion option and refines broad searches before choosing a product', () => {
  searchFixture();
  const result = readCardmarketProducts(document,cardmarketSearchUrl(card),card);
  expect(result.candidates).toEqual([]);
  expect(new URL(result.nextUrl).searchParams.get('idExpansion')).toBe('1536');
  expect(new URL(readCardmarketProducts(document,cardmarketSearchUrl(card),{...card,set:'Japanese Expedition'}).nextUrl).searchParams.get('idExpansion')).toBe('5021');
  expect(() => readCardmarketProducts(document,search,{...card,set:'Unknown'})).toThrow(/expansion/);
});
it('reads gallery results and only follows actual search pagination links', () => {
  searchFixture();
  expect(readCardmarketProducts(document,search,card)).toMatchObject({ candidates:[candidate],nextUrl:null });
  document.querySelector('main').insertAdjacentHTML('beforeend', `<a aria-label="Next page" href="${search}&site=2">Next</a>`);
  expect(readCardmarketProducts(document,search,card).nextUrl).toContain('site=2');
  document.querySelector('[aria-label="Next page"]').href = 'https://evil.example/';
  expect(readCardmarketProducts(document,search,card).nextUrl).toBeNull();
});
it('handles search redirects to one product and never treats a verification screen as a match', () => {
  document.body.innerHTML = '<h1>Blastoise (EX 4) Expedition Base Set - Singles</h1><form id="FilterForm"></form>';
  expect(readCardmarketProducts(document,url,card)).toMatchObject({candidates:[candidate],nextUrl:null});
  document.body.innerHTML = '<h1>Performing security verification</h1>';
  expect(() => readCardmarketProducts(document,search,card)).toThrow(/verification/);
});
it('handles search redirects to the expansion catalogue without repeatedly refining the same search', () => {
  searchFixture();
  document.querySelector('h1').textContent = 'Expedition Base Set Singles';
  document.querySelector('[name="idExpansion"]').value = '1536';
  document.querySelector('[name="idCategory"]').value = '51';
  const expansion = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set?searchString=Blastoise+4';
  expect(readCardmarketProducts(document,expansion,card)).toMatchObject({candidates:[candidate],nextUrl:null});
  document.querySelector('[name="idExpansion"]').value = '5021';
  expect(readCardmarketProducts(document,expansion,card)).toMatchObject({candidates:[],nextUrl:expect.stringContaining('idExpansion=1536')});
});
