import test from'node:test';import assert from'node:assert/strict';import{installMemberRpc}from'../src/member-rpc.mjs';

test('project RPC reserves entry through authority query and fails closed if config changes before binding',async()=>{
 let registration,release,entered,valid=true,binds=0;const querying=new Promise(resolve=>{entered=resolve;});const client={authStatus:()=>({authenticated:true}),projects:()=>{entered();return new Promise(resolve=>{release=resolve;});},selectProject:()=>{binds++;return{};}};
 const entry={client,status:{provider:'collaboration-remote',model:'server-agent'},operations:0,currentValid:()=>valid};const local={id:'local'},sessions={get:id=>id==='local'?local:undefined};
 installMemberRpc({connection:{fetch:{register:r=>{registration=r;return()=>{};}}}},{entry,sessions});
 const call=payload=>registration.fetch(new Request('http://127.0.0.1:19999/api/collaboration/member',{method:'POST',headers:{host:'127.0.0.1:19999',origin:'http://127.0.0.1:19999','content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'r',method:'collaboration/member',payload:{method:'project.select',payload}})})).then(r=>r.json());
 assert.equal((await call({localId:'foreign',projectId:'p'})).result.ok,false);
 const pending=call({localId:'local',projectId:'p'});await querying;assert.equal(entry.operations,1);valid=false;release([{id:'p',name:'P'}]);const result=await pending;assert.equal(result.result.ok,false);assert.equal(binds,0);assert.equal(entry.operations,0);
});
