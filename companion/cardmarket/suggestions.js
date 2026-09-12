import { cardmarketRequest } from '../../src/utils/cardmarketCompanion.js';
import { cardmarketInventoryKey } from '../../src/utils/cardmarketSync.js';
const tasks = [
 {entryId:'search-blastoise',name:'Blastoise',set:'Expedition Base Set',number:'4',language:'English'},
 {entryId:'search-charizard',name:'Charizard 1st Edition',set:'Japanese Expedition',number:'103',language:'Japanese'},
 {entryId:'search-arbok',name:'Arbok',set:'Expedition Base Set',number:'3',language:'English'},
].map(item=>({...item,inventoryKey:cardmarketInventoryKey(item)}));
const $ = id=>document.getElementById(id); let shown=null, pending=false;
async function refresh(){if(pending)return;pending=true;try { const state=await cardmarketRequest('status'); $('status').textContent=`${state.version} · ${state.status?.message || 'Ready'}`; $('start').disabled=!state.capabilities?.includes('product-suggestions') || state.status?.state==='running'; if(state.productRunId && state.productRunId!==shown && state.status?.state!=='running'){const data=await cardmarketRequest('products'); $('metadata').textContent=JSON.stringify(data,null,2); $('results').replaceChildren(...data.results.map(row=>{const tr=document.createElement('tr'); const name=document.createElement('td'); name.textContent=tasks.find(t=>t.entryId===row.entryId)?.name || row.entryId; const matches=document.createElement('td'); for(const c of row.candidates){const a=document.createElement('a'); a.href=c.productUrl;a.textContent=`${c.name} · ${c.set} · #${c.number}`;matches.append(a,document.createElement('br'));} if(row.error) matches.append(row.error);tr.append(name,matches);return tr;}));shown=data.runId;}}catch(error){$('error').textContent=error.message;}finally{pending=false;}}
$('start').onclick=async()=>{try{await cardmarketRequest('suggest',tasks);$('error').textContent='';await refresh();}catch(error){$('error').textContent=error.message;}};
$('stop').onclick=()=>cardmarketRequest('cancel');
void refresh();setInterval(refresh,3000);
