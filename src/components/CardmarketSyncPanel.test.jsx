import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardmarketMatchForm } from './CardmarketSyncPanel';
import { createCardmarketBinding } from '../utils/cardmarketSync';

const item = { entryId:'test-arbok',name:'Arbok',set:'Expedition Base Set',number:'3',language:'English',condition:'LP',isReverseHolo:true,isUnlimited:true };
const suggestion = {name:'Arbok',set:'Expedition Base Set',number:'3',productUrl:'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Arbok-EX3'};
const correction = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Expedition-Base-Set/Arbok-V2-EX3';
let root, host;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
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
