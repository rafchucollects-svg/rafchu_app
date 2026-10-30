import {createPilotStore,canonicalJSON} from './storage.js';
import {getDealBalance} from './domain.js';
const button=document.getElementById('run'),output=document.getElementById('result');
const day='2026-10-31',createdAt='2026-10-31T08:00:00.000Z';
const op=(id,kind,payload)=>({id,kind,createdAt,payload});
const money=(dealId,amountMinor,direction='receive')=>({dealId,amountMinor,direction,method:'cash',occurredOn:day,note:'Invented test payment'});
const lot=(id,name,quantity)=>({id,name,set:'QA set',number:'1',language:'Japanese',grade:'',condition:'NM',quantity,askMinor:3000,basisMinor:null,ownership:'owned'});
const deal=(dealId,kind,outgoing,incoming,agreedMinor,direction,paymentMinor=0)=>({dealId,kind,outgoing,incoming,agreedMinor,direction,paymentMinor,method:'cash',occurredOn:day,counterparty:'Invented DM counterparty',note:'Synthetic browser test'});
// Test-only adapter around actual browser IndexedDB: abort one transaction
// immediately after a workspace put was queued, while retaining native IDB.
function abortOneWorkspacePut(){let armed=true;return {open(...args){const request=indexedDB.open(...args);return new Proxy(request,{set(t,k,v){t[k]=v;return true;},get(t,k){
  if(k!=='result'){const v=t[k];return typeof v==='function'?v.bind(t):v;}
  const db=t.result;return new Proxy(db,{set(d,key,value){d[key]=value;return true;},get(d,key){
    if(key!=='transaction'){const v=d[key];return typeof v==='function'?v.bind(d):v;}
    return (...txArgs)=>{const tx=d.transaction(...txArgs);return new Proxy(tx,{set(t2,k2,v){t2[k2]=v;return true;},get(t2,k2){
      if(k2!=='objectStore'){const v=t2[k2];return typeof v==='function'?v.bind(t2):v;}
      return name=>{const store=t2.objectStore(name);return new Proxy(store,{get(s,k3){
        if(k3==='put'&&name==='workspaces')return value=>{const saved=s.put(value);if(armed){armed=false;t2.abort();}return saved;};
        const v=s[k3];return typeof v==='function'?v.bind(s):v;
      }});};
    }});};
  }});
}});}};}
button.addEventListener('click',async()=>{
  button.disabled=true;const results=[];const databaseName='rafchu-qa-'+crypto.randomUUID();let first,second;
  const check=(name,condition,detail={})=>{results.push({name,passed:Boolean(condition),...detail});if(!condition)throw Error(name);};
  const reject=async(fn,expected)=>{try{await fn();return false;}catch(error){return expected?error.code===expected:true;}};
  try{
    first=createPilotStore({databaseName});second=createPilotStore({databaseName});
    const initial=await first.createWorkspace({name:'Isolated connected vendor day'}),id=initial.id;
    await first.submit(id,op('opening','opening',{lots:[lot('a','Pikachu exact lot A',3)]}));
    const sale=op('sale-one','deal',deal('sale-one','sale',[{lotId:'a',quantity:1}],[],2500,'receive',1000));
    check('Lost acknowledgement is reported as unknown',await reject(()=>first.submit(id,sale,{loseAcknowledgement:true}),'OUTCOME_UNKNOWN'));
    await first.close();
    const saved=await second.getOperation(id,sale.id);check('Second repository finds original saved receipt',saved.operationId===sale.id);
    const before=await second.getWorkspace(id);check('One sale consumes one of three units',before.lots.a.quantity===2&&Object.keys(before.deals).length===1);
    const replay=await second.submit(id,sale);check('Exact replay returns immutable original receipt',canonicalJSON(replay)===canonicalJSON(saved));
    check('Changed payload under same ID is rejected',await reject(()=>second.submit(id,{...sale,payload:{...sale.payload,agreedMinor:2600}})));
    await second.resolvePending(id,sale.id);
    const abortStore=createPilotStore({databaseName,indexedDB:abortOneWorkspacePut()}),preAbort=await second.getWorkspace(id),ask=op('aborted-ask','ask',{lotId:'a',askMinor:3500});
    check('Native IDB abort after queued workspace write is surfaced',await reject(()=>abortStore.submit(id,ask)));
    check('Aborted transaction retains previous stock receipt and ask',canonicalJSON(await second.getWorkspace(id))===canonicalJSON(preAbort)&&!(await second.getOperation(id,ask.id)));
    await second.submit(id,ask);await second.resolvePending(id,ask.id);await abortStore.close();
    check('Prepared operation retries once after real IDB abort',(await second.getWorkspace(id)).lots.a.askMinor===3500);
    await second.submit(id,op('later-money','payment',money('sale-one',1500)));
    await second.submit(id,op('credit','credit',{dealId:'sale-one',amountMinor:500,reason:'Invented partial credit'}));
    await second.submit(id,op('refund','payment',money('sale-one',500,'pay')));
    const attachmentText='Hypothetical Instagram DM. Fixture only. Agreed EUR25; money is a separately reported fact.';
    const asset=await second.addAsset(id,new File([attachmentText],'hypothetical-dm.txt',{type:'text/plain'}));
    await second.submit(id,op('late-note','note',{text:'Later invented support',dealId:'sale-one',assetIds:[asset.id]}));
    let state=await second.getWorkspace(id),balance=getDealBalance(state.deals['sale-one']);
    check('Later receipt credit refund and note do not repeat stock',state.lots.a.quantity===2&&balance.agreedMinor===2500&&balance.receivedMinor===2500&&balance.paidMinor===500&&balance.creditMinor===500&&balance.outstandingMinor===0);
    await second.submit(id,op('buy','deal',deal('buy','buy',[],[lot('b','Received purchase B',2)],6000,'pay',2000)));
    await second.submit(id,op('supplier-later','payment',money('buy',4000,'pay')));
    await second.submit(id,op('sell-b','deal',deal('sell-b','sale',[{lotId:'b',quantity:1}],[],4000,'receive',4000)));
    state=await second.getWorkspace(id);check('Buy later supplier payment and resale retain unknown basis',state.lots.b.quantity===1&&state.lots.b.basisMinor===null&&getDealBalance(state.deals.buy).outstandingMinor===0);
    await second.submit(id,op('trade','deal',deal('trade','trade',[{lotId:'a',quantity:1}],[lot('c','Received trade C',2)],1000,'receive',500)));
    await second.submit(id,op('trade-later','payment',money('trade',500)));
    state=await second.getWorkspace(id);check('Trade preserves both quantities and independent cash',state.lots.a.quantity===1&&state.lots.c.quantity===2&&state.lots.c.lineage.dealId==='trade'&&getDealBalance(state.deals.trade).outstandingMinor===0);
    first=createPilotStore({databaseName});
    const contenders=await Promise.allSettled([first.submit(id,op('race-a','deal',deal('race-a','sale',[{lotId:'a',quantity:1}],[],3000,'receive'))),second.submit(id,op('race-b','deal',deal('race-b','sale',[{lotId:'a',quantity:1}],[],3000,'receive')))]);
    state=await second.getWorkspace(id);check('Two simultaneous repository instances cannot sell final unit twice',contenders.filter(x=>x.status==='fulfilled').length===1&&state.lots.a.quantity===0&&['race-a','race-b'].filter(key=>state.deals[key]).length===1);
    const loser=contenders.find(x=>x.status==='rejected');check('Availability rejection is definite and actionable',loser.reason.code==='OPERATION_REJECTED');
    const rejected=(await second.listPending(id)).find(x=>x.status==='rejected');check('Rejected original input is retained',rejected?.operation.payload.outgoing[0].lotId==='a');
    await second.submit(id,op('physical-return','return',{dealId:'sale-one',lines:[{lotId:'a',quantity:1}],creditMinor:0,reason:'Invented physical return after credit'}));
    check('Excess return is refused',await reject(()=>second.submit(id,op('excess-return','return',{dealId:'sale-one',lines:[{lotId:'a',quantity:1}],creditMinor:0,reason:'Too many'})),'OPERATION_REJECTED'));
    const draftPayload=deal('draft-buy','buy',[],[lot('d','Draft D',1)],2000,'pay');
    const draft=await second.saveDraft(id,{id:'draft-d',status:'open',payload:draftPayload},null);
    check('Concurrent stale draft save is refused',await reject(()=>first.saveDraft(id,{...draft,payload:{...draft.payload,note:'stale'}},null),'DRAFT_CONFLICT'));
    const archive=await second.exportWorkspace(id),original=await second.getWorkspace(id);
    const imported=await first.importWorkspace(JSON.stringify(archive));
    check('Restore creates separate workspace and preserves exact accepted day',imported.id!==id&&canonicalJSON(imported.deals)===canonicalJSON(original.deals)&&canonicalJSON(imported.lots)===canonicalJSON(original.lots)&&canonicalJSON(imported.operations)===canonicalJSON(original.operations)&&canonicalJSON(imported.notes)===canonicalJSON(original.notes)&&canonicalJSON(imported.drafts)===canonicalJSON(original.drafts));
    check('Original attachment bytes survive restore',await(await first.getAsset(imported.id,asset.id)).text()===attachmentText);
    check('Pending and rejected outcomes survive restore',(await first.listPending(imported.id)).length===(await second.listPending(id)).length);
    const importedReceipt=await first.submit(imported.id,sale);check('Recovered original sale after restore is still exact replay',canonicalJSON(importedReceipt)===canonicalJSON(saved));
    const corrupted=structuredClone(archive);corrupted.workspace.lots.a.quantity=99;
    check('Corrupted archive cannot overwrite accepted data',await reject(()=>first.importWorkspace(corrupted),'CHECKSUM_MISMATCH'));
    const stillOriginal=await second.getWorkspace(id);check('Original workspace remains unchanged after restore and corrupt input',canonicalJSON(stillOriginal)===canonicalJSON(original));
    check('No final profit is manufactured from unknown cost',original.lots.b.basisMinor===null&&original.deals['sell-b'].outgoing[0].basisMinor===null);
    output.textContent=JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),databaseName,tests:results.length,results,sourceWorkspaceId:id,restoredWorkspaceId:imported.id,limits:'Real browser IndexedDB with two repository instances, not a cloud, physical-phone, real-transaction or cross-device result.'},null,2);
  }catch(error){output.textContent=JSON.stringify({status:'failed',checkedAt:new Date().toISOString(),databaseName,error:error.message,code:error.code,results},null,2);}
  finally{await first?.close();await second?.close();button.disabled=false;}
});
