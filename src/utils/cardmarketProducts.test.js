import { describe, expect, it } from 'vitest';
import { CARDMARKET_KNOWN_PRODUCTS, cardmarketSearchUrl, rankCardmarketProducts, suggestCardmarketProducts, sameCardmarketSet } from './cardmarketProducts';
import { readCardmarketProducts } from '../../companion/cardmarket/products';
import { findCardmarketProducts, productSearchState } from '../../companion/cardmarket/productSearch';
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
  it('finds untagged BW97 promos despite the inventory series prefix and compact promo number', () => {
    const eevee = { name: 'Eevee', set: 'Black & White BW Black Star Promos', number: 'BW97', language: 'English' };
    const productUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/BW-Black-Star-Promos/Eevee-V2-BWBW97';
    const candidate = { name: 'Eevee', set: 'BW Black Star Promos', code: 'BW', number: '97', productUrl };
    expect(new URL(cardmarketSearchUrl(eevee)).searchParams.get('searchString')).toBe('Eevee 97');
    expect(rankCardmarketProducts(eevee, [candidate])).toHaveLength(1);
    expect(rankCardmarketProducts(eevee, [{ ...candidate, number: '94' }, { ...candidate, set: 'BW Promos' }])).toEqual([]);
    expect(suggestCardmarketProducts(eevee)[0].productUrl).toBe(productUrl);
  });
  it.each([
    ['Reshiram & Charizard-GX', 'SM Black Star Promos', 'SM201', 'Reshiram & Charizard GX 201', 'Reshiram-Charizard-GX-V1-SM201'],
    ['Charizard & Braixen-GX', 'SM Black Star Promos', 'SM230', 'Charizard & Braixen GX 230', 'Charizard-Braixen-GX-SM230'],
    ['Latias-EX', 'Black & White Plasma Freeze', '112', 'Latias EX 112', 'Latias-EX-PLF112'],
    ['Mew ★ δ', 'EX Dragon Frontiers', '101', 'Mew Gold Star 101', 'Mew-Gold-Star-Delta-Species-DF101'],
    ['Umbreon', 'E-Card Aquapolis', 'H29', 'Umbreon 29', 'Umbreon-V1-AQH29'],
  ])('finds %s using Cardmarket names and verified catalogue links', (name, set, number, query, slug) => {
    const item = { name, set, number };
    expect(new URL(cardmarketSearchUrl(item)).searchParams.get('searchString')).toBe(query);
    expect(suggestCardmarketProducts(item)[0]?.productUrl).toContain(slug);
    expect(suggestCardmarketProducts({ ...item, number: '999' })).toEqual([]);
  });
  it('keeps Gold Star, GX, holo numbers and promo expansions distinct', () => {
    const mew = CARDMARKET_KNOWN_PRODUCTS.find(row => row.name.includes('Mew Gold Star'));
    expect(rankCardmarketProducts({ ...mew, name: 'Mew' }, [mew])).toEqual([]);
    const sm = CARDMARKET_KNOWN_PRODUCTS.find(row => row.number === 'SM201');
    expect(rankCardmarketProducts({ ...sm, name: 'Reshiram & Charizard' }, [sm])).toEqual([]);
    const umbreon = CARDMARKET_KNOWN_PRODUCTS.find(row => row.number === 'H29');
    expect(rankCardmarketProducts({ ...umbreon, number: '29' }, [umbreon])).toEqual([]);
    expect(sameCardmarketSet('SM Black Star Promos', 'SM Promos')).toBe(false);
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
it('refines BW promo searches to the exact expansion while retaining full-number checks', () => {
  searchFixture();
  document.querySelector('[name="idExpansion"]').insertAdjacentHTML('beforeend', '<option value="999">BW Black Star Promos</option><option value="998">BW Promos</option>');
  const eevee = { name: 'Eevee', set: 'Black & White BW Black Star Promos', number: 'BW97', language: 'English' };
  const result = readCardmarketProducts(document, cardmarketSearchUrl(eevee), eevee);
  expect(new URL(result.nextUrl).searchParams.get('idExpansion')).toBe('999');
  expect(new URL(result.nextUrl).searchParams.get('searchString')).toBe('Eevee 97');
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

it('retries a missed name by number in the actual expansion and checks the resulting identity', async () => {
  searchFixture();
  document.querySelector('.galleryBox').remove();
  const visits = [];
  const matches = await findCardmarketProducts(card, async href => {
    visits.push(href);
    if (new URL(href).searchParams.get('searchString') === '004') searchFixture();
    return readCardmarketProducts(document, href, card);
  });
  expect(matches).toMatchObject([{ productUrl: url }]);
  expect(visits).toHaveLength(3);
  expect(new URL(visits[2]).searchParams.get('idExpansion')).toBe('1536');
  expect(new URL(visits[2]).searchParams.get('idCategory')).toBe('51');
});

it('keeps a number-only query when following a grid link that needs refinement', () => {
  searchFixture();
  const result = readCardmarketProducts(document, 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=004', card);
  expect(new URL(result.nextUrl).searchParams.get('searchString')).toBe('004');
});

it('rejects a wrong collector number and bounds retries to number and name within the expansion', async () => {
  searchFixture();
  document.querySelector('h2').lastChild.textContent = 'Blastoise (EX 36)';
  const visits = [];
  expect(await findCardmarketProducts(card, async href => {
    visits.push(href);
    return readCardmarketProducts(document, href, card);
  })).toEqual([]);
  expect(visits).toHaveLength(4);
});

it('finds H29 by name when Cardmarket does not find its collector number', async () => {
  searchFixture();
  document.querySelector('[name="idExpansion"]').insertAdjacentHTML('beforeend', '<option value="1537">Aquapolis</option>');
  document.querySelector('.galleryBox').remove();
  const umbreon = { name: 'Umbreon', number: 'H29', set: 'E-Card Aquapolis' };
  const product = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Aquapolis/Umbreon-V1-AQH29';
  const visits = [];
  const matches = await findCardmarketProducts(umbreon, async href => {
    visits.push(href);
    if (new URL(href).searchParams.get('searchString') === 'Umbreon') document.querySelector('main').insertAdjacentHTML('beforeend', `<a class="galleryBox" href="${product}"><h2><span class="expansion-symbol" aria-label="Aquapolis"></span>Umbreon (AQ H29)</h2></a>`);
    return readCardmarketProducts(document, href, umbreon);
  });
  expect(matches).toMatchObject([{ productUrl: product, number: 'H29' }]);
  expect(visits.map(href => new URL(href).searchParams.get('searchString'))).toEqual(['Umbreon 29', 'Umbreon 29', '29', 'Umbreon']);
  expect(new URL(visits.at(-1)).searchParams.get('idExpansion')).toBe('1537');
});

it('collects multiple printings across pagination before deciding whether to retry', async () => {
  const other = url.replace('Blastoise-EX4', 'Blastoise-V2-EX4');
  const visits = [];
  const matches = await findCardmarketProducts(card, async href => {
    visits.push(href);
    return visits.length === 1
      ? { candidates: [candidate], nextUrl: search + '&site=2', fallbackUrl: search.replace('Blastoise+004', '004') }
      : { candidates: [{ ...candidate, productUrl: other }], nextUrl: null };
  });
  expect(matches).toHaveLength(2);
  expect(visits).toHaveLength(2);
});

it('never retries verification failures or follows unsafe or looping pagination', async () => {
  await expect(findCardmarketProducts(card, async () => { throw new Error('verification'); })).rejects.toThrow('verification');
  for (const nextUrl of ['https://evil.example/', cardmarketSearchUrl(card)]) {
    let reads = 0;
    await expect(findCardmarketProducts(card, async () => { reads++; return { candidates: [], nextUrl }; })).rejects.toMatchObject({ code: 'search-incomplete', message: expect.stringContaining('pagination') });
    expect(reads).toBe(1);
  }
});

it('classifies the page limit as a card-level incomplete search without accepting partial candidates', async () => {
  let reads = 0;
  await expect(findCardmarketProducts(card, async () => ({
    candidates: [candidate], nextUrl: `${search}&site=${++reads}`,
  }))).rejects.toMatchObject({ code: 'search-incomplete', message: expect.stringContaining('Too many search pages') });
  expect(reads).toBe(8);
});

it('resumes a paused fallback without rereading earlier search pages or losing candidates', async () => {
  const state = productSearchState(card);
  const fallbackUrl = search.replace('Blastoise+004', '004');
  await expect(findCardmarketProducts(card, async href => {
    if (href === fallbackUrl) throw new Error('verification');
    return { candidates: [{ ...candidate, number: '36' }], nextUrl: null, fallbackUrl };
  }, state)).rejects.toThrow('verification');
  const restored = JSON.parse(JSON.stringify(state));
  const visits = [];
  expect(await findCardmarketProducts(card, async href => {
    visits.push(href); return { candidates: [candidate], nextUrl: null };
  }, restored)).toMatchObject([{ productUrl: url }]);
  expect(visits).toEqual([fallbackUrl]);
});
