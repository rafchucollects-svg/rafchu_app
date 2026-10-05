import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardmarketMatchForm } from './CardmarketSyncPanel';
import { createCardmarketBinding } from '../utils/cardmarketSync';

const item = { entryId:'test-arbok',name:'Arbok',set:'Expedition Base Set',number:'3',language:'English',condition:'LP',isReverseHolo:true,isUnlimited:true };
const suggestion = {name:'Arbok',set:'Expedition Base Set',number:'3',productUrl:'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Arbok-EX3'};
const correction = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Arbok-V2-EX3';
let root, host;
beforeEach(()=>{localStorage.clear();globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});
const render = (props={}) => act(()=>root.render(<CardmarketMatchForm item={item} onSave={()=>{}} busy={false} {...props}/>));
const input = () => host.querySelector('input[type="url"]');
function typeUrl(value){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input(),value);input().dispatchEvent(new Event('input',{bubbles:true}));});}
it('fills a lookup suggestion automatically without saving or confirming it',()=>{
 const save=vi.fn();render({onSave:save});expect(input().value).toBe('');
 render({candidates:[suggestion],onSave:save});expect(input().value).toBe(suggestion.productUrl);
 expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
 expect(host.querySelector('button').disabled).toBe(true);expect(save).not.toHaveBeenCalled();
});
it('clears an old no-match warning when an exact catalogue suggestion is available',()=>{
 const lookupError='No exact name, expansion and number match found.';
 render({lookupError});expect(host.textContent).toContain(lookupError);
 render({item:{...item,name:'Charizard & Braixen-GX',set:'SM Black Star Promos',number:'SM230'},lookupError});
 expect(input().value).toContain('Charizard-Braixen-GX-SM230');
 expect(host.textContent).not.toContain(lookupError);
 expect(host.querySelector('button').disabled).toBe(true);
});
it('keeps a user-corrected URL when new lookup results arrive and saves that exact correction',()=>{
 const save=vi.fn();render({candidates:[suggestion],onSave:save});typeUrl(correction);
 render({candidates:[{...suggestion,productUrl:suggestion.productUrl+'?new=1'}],onSave:save});expect(input().value).toBe(correction);
 act(()=>host.querySelector('input[type="checkbox"]').click());act(()=>host.querySelector('button').click());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({productUrl:correction,confirmed:true,finish:'reverse',firstEdition:false}));
});
it('keeps saved matches ahead of suggestions and requires review again if an automatic suggestion changes',()=>{
 const binding=createCardmarketBinding(item,{productUrl:correction,language:'English',condition:'EX',finish:'reverse',firstEdition:false,confirmed:true});
 render({item:{...item,cardmarketBinding:binding},candidates:[suggestion]});expect(input().value).toBe(correction);
 render({candidates:[suggestion]});act(()=>host.querySelector('input[type="checkbox"]').click());
 render({candidates:[{...suggestion,productUrl:correction}]});expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);expect(host.querySelector('button').disabled).toBe(true);
});

const unmatched = { entryId: 'hungry-snorlax', name: 'Hungry Snorlax', set: 'Unknown Set', number: '143', language: 'English', condition: 'NM', overridePrice: 400 };
const manualUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Unnumbered-Promos/Hungry-Snorlax';
const choose = (label, value) => act(() => {
 const field = [...host.querySelectorAll('label')].find(el => el.textContent.startsWith(label)).querySelector('select');
 field.value = value; field.dispatchEvent(new Event('change', { bubbles: true }));
});

it('retains a manually entered no-match URL and printing choices after closing and reopening, without confirming or saving it', () => {
 const save = vi.fn(); const props = { item: unmatched, draftOwner: 'owner', onSave: save, lookupError: 'No unique expansion match in Cardmarket search.' };
 render(props); typeUrl(manualUrl); choose('Reverse holo', 'non-reverse'); choose('First edition', 'false');
 act(() => host.querySelector('input[type="checkbox"]').click());
 act(() => root.render(null)); render(props);
 expect(input().value).toBe(manualUrl);
 expect([...host.querySelectorAll('select')].map(el => el.value)).toEqual(['English', 'NM', 'non-reverse', 'false']);
 expect(host.querySelector('input[type="checkbox"]').checked).toBe(false);
 expect(host.querySelector('button').disabled).toBe(true);
 expect(host.textContent).toContain('Draft saved in this browser');
 expect(save).not.toHaveBeenCalled();
 act(() => host.querySelector('input[type="checkbox"]').click()); act(() => host.querySelector('button').click());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({ productUrl: manualUrl, finish: 'non-reverse', firstEdition: false, confirmed: true }));
});

it('explains each missing printing choice beside Save and distinguishes a URL draft from a saved match', () => {
 render({ item: unmatched, draftOwner: 'owner' }); typeUrl(manualUrl);
 expect(host.textContent).toContain('To save this match: choose reverse holo, choose first edition, check the confirmation box.');
 choose('Reverse holo', 'non-reverse'); choose('First edition', 'false');
 expect(host.textContent).toContain('To save this match: check the confirmation box.');
 act(() => host.querySelector('input[type="checkbox"]').click());
 expect(host.textContent).not.toContain('To save this match:');
 expect(host.querySelector('button').disabled).toBe(false);
});

it('explains invalid product URLs and retains edits when browser storage is unavailable', () => {
 const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
 try {
  render({ item: unmatched, draftOwner: 'owner' }); typeUrl('https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Snorlax');
  expect(input().value).toContain('/Products/Search');
  expect(host.textContent).toContain('Paste an English Cardmarket Pokémon single-product URL');
  expect(host.textContent).toContain('This browser could not keep your draft');
  expect(host.querySelector('button').disabled).toBe(true);
 } finally { write.mockRestore(); }
});

const checkbox = label => [...host.querySelectorAll('label')].find(el => el.textContent.startsWith(label)).querySelector('input[type="checkbox"]');
it('requires a separate language correction before saving a Japanese match for an English-tagged manual card', () => {
 const save = vi.fn(); render({ item: unmatched, draftOwner: 'owner', onSave: save });
 typeUrl(manualUrl); choose('Card language', 'Japanese'); choose('Reverse holo', 'non-reverse'); choose('First edition', 'false');
 expect(host.textContent).toContain('Your inventory tags this card as English');
 act(() => checkbox('I checked the product').click());
 expect(host.querySelector('button').disabled).toBe(true);
 expect(host.textContent).toContain('confirm the inventory language correction');
 act(() => checkbox('Update inventory language to Japanese').click());
 expect(checkbox('I checked the product').checked).toBe(false);
 act(() => checkbox('I checked the product').click());
 act(() => host.querySelector('button').click());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({ language: 'Japanese', updateInventoryLanguage: true, productUrl: manualUrl, confirmed: true }));
 expect(unmatched.language).toBe('English');
});

it('remembers the Japanese draft without retaining inventory-correction consent after reopening', () => {
 const props = { item: unmatched, draftOwner: 'owner' }; render(props);
 typeUrl(manualUrl); choose('Card language', 'Japanese'); choose('Reverse holo', 'non-reverse'); choose('First edition', 'false');
 act(() => checkbox('Update inventory language to Japanese').click());
 act(() => checkbox('I checked the product').click());
 act(() => root.render(null)); render(props);
 expect(checkbox('Update inventory language to Japanese').checked).toBe(false);
 expect(checkbox('I checked the product').checked).toBe(false);
 expect(host.querySelector('button').disabled).toBe(true);
 act(() => checkbox('Update inventory language to Japanese').click());
 choose('Card language', 'English'); choose('Card language', 'Japanese');
 expect(checkbox('Update inventory language to Japanese').checked).toBe(false);
});
