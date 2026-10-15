import test from 'node:test';
import assert from 'node:assert/strict';
import {installMemberRpc} from '../src/member-rpc.mjs';

test('member GUI RPC keeps token/proof private, trusts loopback only and project selection validated',async()=>{
  let registration,selected;
  const client={authStatus:()=>({authenticated:true}),verifyAuthStatus:async()=>({authenticated:true,account:'alice',expiresAt:100,serviceId:'s'}),
    beginLogin:async()=>({requestId:'r',loginUrl:'https://login.example.test/collaboration/login/r'}),
    completeLogin:async()=>({authenticated:true,account:'alice'}),logout:async()=>({authenticated:false}),
    projects:async()=>[{id:'p',name:'Project'}],selectedProject:()=>null,mapping:()=>undefined,
    selectProject:(id,p)=>{selected=[id,p];return {localId:id,projectId:p};},legacyHistory:async()=>({events:[]})};
  const ctx={connection:{fetch:{register:r=>{registration=r;return ()=>{};}}}};
  const local={id:'local'};installMemberRpc(ctx,{client,status:{state:'configured'},sessions:{list:()=>[{id:'local',header:{title:'Local'}}],get:id=>id==='local'?local:undefined}});
  const call=async(method,payload={},host='127.0.0.1:19387',origin='http://127.0.0.1:19387')=>registration.fetch(new Request(`http://${host}${registration.path}`,{
    method:'POST',headers:{host,origin,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'id',method:'collaboration/member',payload:{method,payload}})}));
  const state=await(await call('status')).json();assert.equal(state.result.value.account,'alice');assert.ok(!JSON.stringify(state).includes('token'));
  assert.equal((await call('status',{},'evil.example','https://evil.example')).status,403);
  assert.equal((await call('status',{},'127.0.0.1:19387','http://127.0.0.1:4000')).status,403);
  assert.equal((await call('status',{},'127.0.0.1:19387','http://user:password@127.0.0.1:19387')).status,403);
  const bad=await(await call('project.select',{localId:'local',projectId:'other'})).json();assert.equal(bad.result.ok,false);
  const good=await(await call('project.select',{localId:'local',projectId:'p'})).json();assert.equal(good.result.ok,true);assert.deepEqual(selected,['local','p']);
  const extra=await(await call('login.claim',{token:'caller supplied'})).json();assert.equal(extra.result.ok,false);
});
