/* global __PILOT_RELEASE__ */
import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {pilotStore} from './storage.js';
import {formatMoney,parseMoney,getDealBalance} from './domain.js';
import './recovery.css';

const dateToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
export default function Recovery(){
  const [workspaces,setWorkspaces]=useState([]),[workspace,setWorkspace]=useState(null),[pending,setPending]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(()=>{try{return new URLSearchParams(location.search).get('workspace')||localStorage.getItem('rafchu-pilot-active-workspace')||'';}catch{return '';}});
  const selectedRef=useRef(selected),loadGeneration=useRef(0);
  const [paymentAttempt,setPaymentAttempt]=useState(null);
  const [dealId,setDealId]=useState(''),[amount,setAmount]=useState(''),[direction,setDirection]=useState('receive'),[method,setMethod]=useState('cash'),[occurredOn,setOccurredOn]=useState(dateToday),[note,setNote]=useState('');
  function selectWorkspace(id){selectedRef.current=id;setSelected(id);setWorkspace(null);setPending([]);setDealId('');setAmount('');setNote('');setPaymentAttempt(null);}
  async function refresh(id=selectedRef.current){
    const generation=++loadGeneration.current;
    const ws=await pilotStore.listWorkspaces();
    if(generation!==loadGeneration.current||id!==selectedRef.current)return;
    setWorkspaces(ws);
    const active=id||ws[0]?.id||'';
    if(!active){setWorkspace(null);setPending([]);return;}
    if(!id){selectedRef.current=active;setSelected(active);}
    try{localStorage.setItem('rafchu-pilot-active-workspace',active);}catch{/* IDB remains authoritative. */}
    const [state,queue]=await Promise.all([pilotStore.getWorkspace(active),pilotStore.listPending(active)]);
    if(generation!==loadGeneration.current||active!==selectedRef.current)return;
    setWorkspace(state);setPending(queue);
  }
  useEffect(()=>{refresh().catch(e=>setError(e.message));return pilotStore.subscribe(()=>{refresh().catch(e=>setError(e.message));});},[selected]);
  async function action(fn){if(busy)return;setBusy(true);setError('');setMessage('');try{await fn();await refresh();}catch(e){setError(e.message||'This action did not finish. Your saved workspace has not been cleared.');}finally{setBusy(false);}}
  async function resolve(item,retry=false){
    await action(async()=>{
      let receipt=await pilotStore.getOperation(selected,item.id);
      if(!receipt&&retry)receipt=await pilotStore.submit(selected,item.operation);
      if(receipt){await pilotStore.resolvePending(selected,item.id);if(item.id===paymentAttempt?.operationId){setPaymentAttempt(null);setAmount('');setNote('');setDealId('');}setMessage('Found saved operation '+receipt.operationId+'. Its stock and money effects occurred once.');}
      else setMessage('No saved result yet. Retry the original operation below; do not create a new sale.');
    });
  }
  const unresolved=pending.some(item=>item.status!=='rejected');
  async function recordMoney(event){event.preventDefault();if(paymentAttempt||unresolved||workspace?.id!==selected)return;await action(async()=>{
    const op={id:crypto.randomUUID(),kind:'payment',createdAt:new Date().toISOString(),payload:{dealId,amountMinor:parseMoney(amount),direction,method,occurredOn,note}};
    const workspaceId=workspace.id;let prepared=false;
    try{
      await pilotStore.savePending(workspaceId,op);prepared=true;setPaymentAttempt({workspaceId,operationId:op.id});
      const receipt=await pilotStore.submit(workspaceId,op);
      // Once a receipt is known, clear the form before any fallible cleanup/read.
      setAmount('');setNote('');setDealId('');setPaymentAttempt(null);setMessage('Payment recorded once: '+receipt.operationId);
      await pilotStore.resolvePending(workspaceId,op.id);
    }catch(error){
      if(!prepared||error.code==='OPERATION_REJECTED')setPaymentAttempt(null);
      if(prepared&&error.code!=='OPERATION_REJECTED')await refresh(workspaceId).catch(()=>{});
      throw error;
    }
  });}
  function download(archive){
    const blob=new Blob([JSON.stringify(archive)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='rafchu-test-'+selected+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  async function restore(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;await action(async()=>{
    if(file.size>50*1024*1024)throw Error('Archive is too large. Maximum file size is 50 MB.');
    const state=await pilotStore.importWorkspace(await file.text());selectWorkspace(state.id);setMessage('Archive opened in a separate test workspace. Existing workspaces were preserved.');
  });}
  const deals=Object.values(workspace?.deals||{}).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||b.id.localeCompare(a.id));
  return <main>
    <header><a href="./index.html" className="brand">RAFCHU <span>Recovery</span></a><a href="https://rafchu-tcg-app.web.app" target="_blank" rel="noreferrer">Current live app ↗</a></header>
    <div className="notice"><strong>Test records on this browser only.</strong> This page reads the same saved workspace as the candidate. It has no connection to your live inventory. Do not record real show transactions here.</div>
    <h1>Keep the saved result. Continue from it.</h1><p className="intro">A missing confirmation does not mean a sale failed. Find its original result before recording anything again.</p>
    {error&&<div role="alert" className="error">{error}</div>}{message&&<div role="status" className="message">{message}</div>}
    <section><label>Test workspace<select disabled={busy} value={selected} onChange={e=>selectWorkspace(e.target.value)}><option value="">Choose workspace</option>{workspaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label>{workspace&&<p>{workspace.name} · Revision {workspace.revision} · {deals.length} accepted deals</p>}</section>
    {!workspace?<section><h2>No saved test workspace</h2><p>Open the candidate to create a workspace, or restore a portable archive below.</p><a href="./index.html">Open candidate</a></section>:<>
      <section><h2>Unconfirmed operations</h2>{pending.length===0?<p>No operations are awaiting confirmation.</p>:pending.map(item=><article key={item.id}><h3>{item.operation?.kind||'Operation'}</h3><code>{item.id}</code><p>{item.status==='rejected'?`Not saved: ${item.rejectionReason||'The submitted operation was rejected.'}`:item.status==='committed'?'A saved result exists.':'Prepared locally; check the saved result before retrying.'}</p><div className="actions">{item.status==='rejected'?<><a href="./index.html?view=records">Review and edit rejected input</a><button disabled={busy} onClick={()=>action(()=>pilotStore.discardRejected(selected,item.id))}>Dismiss rejected attempt</button></>:<><button disabled={busy} onClick={()=>resolve(item)}>Find saved result</button><button disabled={busy} onClick={()=>resolve(item,true)}>Retry original operation</button></>}</div></article>)}</section>
      <section><h2>Record a later test payment</h2><p>Payment attaches to an existing deal. It never receives or sells stock again. A refund uses the opposite money direction.</p><form onSubmit={recordMoney}>
        <label>Accepted deal<select required value={dealId} onChange={e=>{const id=e.target.value;setDealId(id);setDirection(workspace.deals[id]?.direction||'receive');}}><option value="">Choose a deal</option>{deals.map(d=><option key={d.id} value={d.id}>{d.kind} · {formatMoney(d.agreedMinor)} · {d.counterparty||d.id.slice(0,8)}</option>)}</select></label>
        <div className="grid"><label>Amount in EUR<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="15.00"/></label><label>Money direction<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="receive">Received by me</option><option value="pay">Paid by me</option></select></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option><option value="other">Other</option></select></label><label>Payment date<input type="date" required value={occurredOn} onChange={e=>setOccurredOn(e.target.value)}/></label></div>
        <label>Note<input value={note} maxLength={4000} onChange={e=>setNote(e.target.value)}/></label>{paymentAttempt&&<p role="status">This payment has a saved operation identity. Resolve it above before starting another payment. Original operation: <code>{paymentAttempt.operationId}</code></p>}{unresolved&&<p>Resolve the unconfirmed operations above before recording new money.</p>}<button disabled={busy||!dealId||paymentAttempt||unresolved||workspace.id!==selected}>Record test payment</button>
      </form></section>
      <section><h2>Accepted deals</h2>{deals.length===0?<p>No accepted deals yet.</p>:deals.map(d=>{const b=getDealBalance(d);return <details key={d.id}><summary>{d.kind.toUpperCase()} · {formatMoney(d.agreedMinor)} · {d.occurredOn} · {d.counterparty||'No counterparty note'}</summary><p>Outstanding {b.direction==='pay'?'to pay':'to receive'}: <strong>{formatMoney(b.outstandingMinor)}</strong></p><p>Credit: {formatMoney(b.creditMinor)} · Actual received: {formatMoney(b.receivedMinor)} · Actual paid: {formatMoney(b.paidMinor)}</p><p>Original deal <code>{d.id}</code></p><p>Operation <code>{d.operationId}</code></p><h3>Outgoing</h3><ul>{d.outgoing.map((l,i)=><li key={i}>{l.quantity} × {l.name} — {l.set} {l.number} {l.language} {l.grade||l.condition}</li>)}</ul><h3>Incoming</h3><ul>{d.incoming.map((l,i)=><li key={i}>{l.quantity} × {l.name} — basis {l.basisMinor===null?'unknown':formatMoney(l.basisMinor)+'/unit'}</li>)}</ul><p>{d.note}</p></details>})}</section>
      <section><h2>Current test stock</h2><p>These quantities are current; an old receipt keeps its original quantities.</p><ul>{Object.values(workspace.lots).filter(l=>l.quantity>0).map(l=><li key={l.id}><strong>{l.quantity} × {l.name}</strong> · {l.set} {l.number} · {l.language} · {l.grade||l.condition} · Ask {formatMoney(l.askMinor)}</li>)}</ul></section>
    </>}
    <section><h2>Preserve this workspace</h2><p>A portable archive includes accepted operations, stock, drafts, notes and attached files. Restore creates another test workspace; it does not overwrite your saved day. Browser storage is local and may be removed by browser settings.</p><div className="actions"><button disabled={busy||!workspace} onClick={()=>action(async()=>{download(await pilotStore.exportWorkspace(selected));setMessage('Archive prepared. Keep the downloaded file outside the browser.');})}>Download complete archive</button><label className="file">Restore archive<input type="file" accept="application/json,.json" onChange={restore} disabled={busy}/></label></div></section>
    <footer>Test build {__PILOT_RELEASE__.version} · {__PILOT_RELEASE__.commit.slice(0,8)} · <a href="./index.html">Return to candidate</a></footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<Recovery/>);
